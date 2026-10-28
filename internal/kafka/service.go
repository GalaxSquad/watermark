package kafka

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"watermark-01/internal/config"
	"watermark-01/internal/kafkautil"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	// connectionTimeout is the maximum duration for a new cluster connection attempt.
	connectionTimeout = 10 * time.Second

	// warmPingTimeout is the fast health check timeout when reusing a pooled cluster client.
	warmPingTimeout = 2 * time.Second

	// inactiveClusterTTL is how long a background (non-active) cluster client stays warm
	// in the pool after its last activity before being automatically closed.
	inactiveClusterTTL = 15 * time.Minute

	// activeClusterTTL is how long the currently active cluster stays connected with zero
	// operations (and no active Live Tail) before auto-disconnecting to free resources.
	activeClusterTTL = 30 * time.Minute

	// reaperInterval is how often the background reaper checks for idle cluster clients.
	reaperInterval = 1 * time.Minute
)

// clusterConn holds a warm Kafka client, admin wrapper, and metadata cache for a single cluster profile.
type clusterConn struct {
	profileID string
	client    *kgo.Client
	admin     *kadm.Client
	baseOpts  []kgo.Opt
	cache     *adminCache
	readOnly  bool
	lastUsed  atomic.Int64 // UnixNano timestamp of last activity
}

func (c *clusterConn) touch() {
	c.lastUsed.Store(time.Now().UnixNano())
}

func (c *clusterConn) idleDuration() time.Duration {
	ns := c.lastUsed.Load()
	if ns == 0 {
		return 0
	}
	return time.Since(time.Unix(0, ns))
}

func (c *clusterConn) close() {
	if c.cache != nil {
		c.cache.invalidate()
	}
	if c.client != nil {
		c.client.Close()
	}
}

// KafkaService manages per-cluster Kafka connection pooling, idle TTL eviction,
// and all Kafka operations. All public methods are exposed to the frontend via Wails bindings.
type KafkaService struct {
	configSvc     *config.ConfigService
	pool          map[string]*clusterConn // warm clients indexed by cluster profileID
	client        *kgo.Client             // active cluster's client
	admin         *kadm.Client            // active cluster's admin client
	mu            sync.RWMutex
	connected     bool
	readOnly      bool           // true when the active cluster profile has read-only mode enabled
	activeProfile string
	ctx           context.Context
	reaperCancel  context.CancelFunc
	baseOpts      []kgo.Opt      // active cluster's broker + auth/TLS opts
	cache         *adminCache    // active cluster's short-TTL metadata cache
	activeTail    *liveTailState // current live-tail session (at most one)
	activeTailMu  sync.Mutex     // guards activeTail
	browseMu      sync.Mutex     // serializes browse/consume operations on k.client
}

// NewKafkaService creates a new KafkaService with an empty per-cluster connection pool.
func NewKafkaService(configSvc *config.ConfigService) *KafkaService {
	return &KafkaService{
		configSvc: configSvc,
		pool:      make(map[string]*clusterConn),
		cache:     newAdminCache(defaultCacheTTL),
	}
}

// SetContext sets the Wails runtime context and starts the background idle-TTL reaper.
func (k *KafkaService) SetContext(ctx context.Context) {
	k.mu.Lock()
	if k.reaperCancel != nil {
		k.reaperCancel()
	}
	k.ctx = ctx
	reaperCtx, cancel := context.WithCancel(ctx)
	k.reaperCancel = cancel
	k.mu.Unlock()

	go k.runIdleReaper(reaperCtx)
}

// setActiveConnLocked binds the active service pointers to the given pooled connection.
// Caller must hold k.mu.Lock().
func (k *KafkaService) setActiveConnLocked(conn *clusterConn) {
	conn.touch()
	k.client = conn.client
	k.admin = conn.admin
	k.baseOpts = conn.baseOpts
	k.cache = conn.cache
	k.readOnly = conn.readOnly
	k.connected = true
	k.activeProfile = conn.profileID
}

// clearActiveConnLocked resets the active service pointers to disconnected state.
// Caller must hold k.mu.Lock().
func (k *KafkaService) clearActiveConnLocked() {
	k.client = nil
	k.admin = nil
	k.baseOpts = nil
	k.cache = newAdminCache(defaultCacheTTL)
	k.connected = false
	k.readOnly = false
	k.activeProfile = ""
}

// Connect switches to or establishes a connection to the Kafka cluster identified by profileID.
// If a warm client already exists in the per-cluster pool and passes a fast health check,
// it is reused immediately while keeping previously used clusters warm in the pool until their TTL expires.
func (k *KafkaService) Connect(profileID string) error {
	// Stop any active live-tail from the previous cluster before switching
	k.StopLiveTail()

	k.mu.Lock()
	defer k.mu.Unlock()

	profile, err := k.configSvc.GetCluster(profileID)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}

	// Already connected to this exact cluster — just refresh readOnly and activity timestamp
	if k.connected && k.activeProfile == profileID {
		if conn, ok := k.pool[profileID]; ok {
			conn.readOnly = profile.ReadOnly
			k.setActiveConnLocked(conn)
			return nil
		}
	}

	// Fast path: reuse warm pooled client for this cluster if still healthy
	if conn, ok := k.pool[profileID]; ok {
		if conn.idleDuration() <= inactiveClusterTTL {
			pingCtx, cancel := context.WithTimeout(k.getCtx(), warmPingTimeout)
			pingErr := conn.client.Ping(pingCtx)
			cancel()
			if pingErr == nil {
				conn.readOnly = profile.ReadOnly
				k.setActiveConnLocked(conn)
				return nil
			}
		}
		// Pooled client expired or failed ping — close and recreate below
		delete(k.pool, profileID)
		go conn.close()
	}

	password, err := k.configSvc.GetDecryptedPassword(profileID)
	if err != nil {
		return fmt.Errorf("connect: decrypt password: %w", err)
	}

	opts, err := k.buildClientOpts(profile, password)
	if err != nil {
		return fmt.Errorf("connect: build opts: %w", err)
	}

	// Initialize direct consumer state with an empty partition map so
	// ConsumeMessages can dynamically attach/detach partitions via
	// AddConsumePartitions / PurgeTopicsFromConsuming on the warm client
	// without dial/TLS/SASL handshake overhead per fetch.
	clientOpts := append(append([]kgo.Opt{}, opts...), kgo.ConsumePartitions(map[string]map[int32]kgo.Offset{}))
	client, err := kgo.NewClient(clientOpts...)
	if err != nil {
		return fmt.Errorf("connect: new client: %w", err)
	}

	// Ping with timeout to verify connectivity — prevents hanging on unreachable brokers
	connectCtx, cancel := context.WithTimeout(k.getCtx(), connectionTimeout)
	defer cancel()

	if err := client.Ping(connectCtx); err != nil {
		client.Close()
		if connectCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("connection timed out after %s — cluster unreachable", connectionTimeout)
		}
		// Hint for AWS auth failures
		if profile.SecurityProtocol == "AWS_MSK_IAM" {
			return fmt.Errorf("AWS MSK IAM auth failed: %w — verify AWS credentials and IAM policy", err)
		}
		return fmt.Errorf("connect: ping failed: %w", err)
	}

	conn := &clusterConn{
		profileID: profileID,
		client:    client,
		admin:     kadm.NewClient(client),
		baseOpts:  opts,
		cache:     newAdminCache(defaultCacheTTL),
		readOnly:  profile.ReadOnly,
	}
	k.pool[profileID] = conn
	k.setActiveConnLocked(conn)

	return nil
}

// Disconnect explicitly closes and removes the currently active Kafka cluster connection.
// Stops any active live-tail first to prevent goroutines from using a closed client.
func (k *KafkaService) Disconnect() error {
	// Stop live-tail BEFORE acquiring the write lock to avoid deadlock
	// (StopLiveTail uses activeTailMu, not k.mu)
	k.StopLiveTail()

	k.mu.Lock()
	defer k.mu.Unlock()

	if !k.connected {
		return nil
	}

	activeID := k.activeProfile
	if conn, ok := k.pool[activeID]; ok {
		delete(k.pool, activeID)
		conn.close()
	} else if k.client != nil {
		k.cache.invalidate()
		k.client.Close()
	}

	k.clearActiveConnLocked()
	return nil
}

// DisconnectCluster explicitly closes and evicts a specific cluster from the connection pool.
// Used when disconnecting, editing credentials, or deleting a cluster profile.
func (k *KafkaService) DisconnectCluster(profileID string) error {
	if k.GetActiveCluster() == profileID {
		return k.Disconnect()
	}

	k.mu.Lock()
	conn, ok := k.pool[profileID]
	if ok {
		delete(k.pool, profileID)
	}
	k.mu.Unlock()

	if ok && conn != nil {
		conn.close()
	}
	return nil
}

// DisconnectAll closes all active and pooled cluster connections and stops the TTL reaper.
// Called on application shutdown.
func (k *KafkaService) DisconnectAll() error {
	k.StopLiveTail()

	k.mu.Lock()
	if k.reaperCancel != nil {
		k.reaperCancel()
		k.reaperCancel = nil
	}
	conns := make([]*clusterConn, 0, len(k.pool))
	for id, conn := range k.pool {
		delete(k.pool, id)
		conns = append(conns, conn)
	}
	k.clearActiveConnLocked()
	k.mu.Unlock()

	for _, conn := range conns {
		conn.close()
	}
	return nil
}

// GetPooledClusters returns the profile IDs of all clusters currently warm in the connection pool.
func (k *KafkaService) GetPooledClusters() []string {
	k.mu.RLock()
	defer k.mu.RUnlock()

	ids := make([]string, 0, len(k.pool))
	for id := range k.pool {
		ids = append(ids, id)
	}
	return ids
}

// runIdleReaper periodically closes inactive pooled cluster clients that exceed inactiveClusterTTL,
// and disconnects the active cluster if it has been completely idle for activeClusterTTL (with no live-tail).
func (k *KafkaService) runIdleReaper(ctx context.Context) {
	ticker := time.NewTicker(reaperInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			k.reapIdleConnections()
		}
	}
}

func (k *KafkaService) reapIdleConnections() {
	k.activeTailMu.Lock()
	hasActiveTail := k.activeTail != nil
	k.activeTailMu.Unlock()

	var toClose []*clusterConn
	var idleDisconnectedID string

	k.mu.Lock()
	for id, conn := range k.pool {
		idle := conn.idleDuration()
		if id == k.activeProfile {
			// Keep active cluster alive if Live Tail is running or within activeClusterTTL
			if !hasActiveTail && idle > activeClusterTTL {
				delete(k.pool, id)
				toClose = append(toClose, conn)
				idleDisconnectedID = id
				k.clearActiveConnLocked()
			}
			continue
		}
		// Background pooled cluster — evict after inactiveClusterTTL
		if idle > inactiveClusterTTL {
			delete(k.pool, id)
			toClose = append(toClose, conn)
		}
	}
	k.mu.Unlock()

	for _, conn := range toClose {
		conn.close()
	}

	if idleDisconnectedID != "" {
		if app := application.Get(); app != nil {
			app.Event.Emit("cluster:idle-disconnected", idleDisconnectedID)
		}
	}
}

// IsConnected returns true if there is an active Kafka connection.
func (k *KafkaService) IsConnected() bool {
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.connected
}

// GetActiveCluster returns the profile ID of the active connection.
func (k *KafkaService) GetActiveCluster() string {
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.activeProfile
}

// UpdateReadOnly updates the read-only flag for the active connection
// without requiring a reconnect. Used when the user edits cluster config.
func (k *KafkaService) UpdateReadOnly(readOnly bool) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.connected {
		k.readOnly = readOnly
		if conn, ok := k.pool[k.activeProfile]; ok {
			conn.readOnly = readOnly
		}
	}
}

// ClearCache invalidates the in-memory metadata cache so the next
// API call fetches fresh data from the Kafka cluster.
// Exposed to the frontend via Wails binding for manual refresh.
func (k *KafkaService) ClearCache() {
	k.mu.RLock()
	cache := k.cache
	if conn, ok := k.pool[k.activeProfile]; ok {
		conn.touch()
	}
	k.mu.RUnlock()
	if cache != nil {
		cache.Invalidate()
	}
}

// ensureConnected returns ErrNotConnected if not connected, and refreshes the active cluster's TTL timestamp.
func (k *KafkaService) ensureConnected() error {
	if !k.connected {
		return ErrNotConnected
	}
	if conn, ok := k.pool[k.activeProfile]; ok {
		conn.touch()
	}
	return nil
}

// ensureWritable returns ErrReadOnly if the cluster is in read-only mode.
// Must be called under at least an RLock.
func (k *KafkaService) ensureWritable() error {
	if err := k.ensureConnected(); err != nil {
		return err
	}
	if k.readOnly {
		return ErrReadOnly
	}
	return nil
}

// getCtx returns the Wails context or a background context.
func (k *KafkaService) getCtx() context.Context {
	if k.ctx != nil {
		return k.ctx
	}
	return context.Background()
}

// buildClientOpts creates kgo.Opt slice from a cluster profile.
// Delegates to the shared kafkautil.BuildClientOpts to keep SASL/TLS logic in one place.
func (k *KafkaService) buildClientOpts(profile *config.ClusterProfile, password string) ([]kgo.Opt, error) {
	return kafkautil.BuildClientOpts(kafkautil.ProfileOpts{
		BootstrapServers: profile.BootstrapServers,
		SecurityProtocol: profile.SecurityProtocol,
		SASLMechanism:    profile.SASLMechanism,
		Username:         profile.Username,
		AwsProfile:       profile.AwsProfile,
		AwsRegion:        profile.AwsRegion,
	}, password)
}

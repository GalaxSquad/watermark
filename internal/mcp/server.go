package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	mcpgo "github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"watermark-01/internal/config"
	"watermark-01/internal/kafka"
	"watermark-01/internal/schema"
)

const maxMessageLimit = 100

// MCPService embeds an MCP server and exposes Start/Stop/IsRunning to the frontend via app.go bindings.
type MCPService struct {
	configSvc *config.ConfigService
	kafkaSvc  *kafka.KafkaService
	schemaSvc *schema.SchemaService

	mu         sync.RWMutex
	httpServer *server.StreamableHTTPServer
	running    bool
}

// NewMCPService wires up an MCPService with its dependencies.
func NewMCPService(c *config.ConfigService, k *kafka.KafkaService, s *schema.SchemaService) *MCPService {
	return &MCPService{configSvc: c, kafkaSvc: k, schemaSvc: s}
}

// IsRunning returns true if the MCP HTTP server is currently listening.
func (m *MCPService) IsRunning() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.running
}

// Start creates and starts the MCP HTTP server on localhost:{port}.
// It is a no-op if already running. Returns an error if the port is taken.
func (m *MCPService) Start(port int) error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil
	}
	m.mu.Unlock() // release before the blocking 200ms wait to avoid holding the lock

	mcpServer := server.NewMCPServer("watermark-mcp", "1.0.0",
		server.WithToolCapabilities(false),
	)
	m.registerTools(mcpServer)

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	httpSrv := server.NewStreamableHTTPServer(mcpServer,
		server.WithStateLess(true),
	)

	// Start is blocking; run it in a goroutine and surface bind errors quickly.
	errCh := make(chan error, 1)
	go func() {
		if err := httpSrv.Start(addr); err != nil && err != http.ErrServerClosed {
			errCh <- err
			m.mu.Lock()
			m.running = false
			m.httpServer = nil
			m.mu.Unlock()
		}
	}()

	// Give the listener ~200ms to bind; surface hard errors (e.g. port in use).
	select {
	case err := <-errCh:
		return fmt.Errorf("mcp: start: %w", err)
	case <-time.After(200 * time.Millisecond):
	}

	m.mu.Lock()
	m.httpServer = httpSrv
	m.running = true
	m.mu.Unlock()
	return nil
}

// Stop gracefully shuts down the MCP server. No-op if not running.
func (m *MCPService) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running || m.httpServer == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := m.httpServer.Shutdown(ctx)
	m.httpServer = nil
	m.running = false
	return err
}

// Restart stops then starts on the given port. Used when the user changes the port.
func (m *MCPService) Restart(port int) error {
	if err := m.Stop(); err != nil {
		return err
	}
	return m.Start(port)
}

// ── Tool registration ──────────────────────────────────────────────────────

func (m *MCPService) registerTools(s *server.MCPServer) {
	// ── Read tools ──────────────────────────────────────────────────────────

	s.AddTool(mcpgo.NewTool("list_clusters",
		mcpgo.WithDescription("List all configured Kafka cluster profiles. Credentials are never returned."),
	), m.handleListClusters)

	s.AddTool(mcpgo.NewTool("connect_cluster",
		mcpgo.WithDescription("Connect to a Kafka cluster by its profile ID."),
		mcpgo.WithString("cluster_id", mcpgo.Required(), mcpgo.Description("Cluster profile ID from list_clusters")),
	), m.handleConnectCluster)

	s.AddTool(mcpgo.NewTool("get_cluster_health",
		mcpgo.WithDescription("Get broker health, partition counts, and storage metrics for the active cluster."),
	), m.handleGetClusterHealth)

	s.AddTool(mcpgo.NewTool("list_topics",
		mcpgo.WithDescription("List all Kafka topics in the active cluster, optionally filtered by name."),
		mcpgo.WithString("filter", mcpgo.Description("Optional substring filter on topic name")),
	), m.handleListTopics)

	s.AddTool(mcpgo.NewTool("get_topic",
		mcpgo.WithDescription("Get detailed information about a single Kafka topic."),
		mcpgo.WithString("name", mcpgo.Required(), mcpgo.Description("Topic name")),
	), m.handleGetTopic)

	s.AddTool(mcpgo.NewTool("get_topic_configs",
		mcpgo.WithDescription("Get configuration key-value pairs for a Kafka topic."),
		mcpgo.WithString("name", mcpgo.Required(), mcpgo.Description("Topic name")),
	), m.handleGetTopicConfigs)

	s.AddTool(mcpgo.NewTool("list_consumer_groups",
		mcpgo.WithDescription("List all consumer groups in the active cluster with their state and lag."),
	), m.handleListConsumerGroups)

	s.AddTool(mcpgo.NewTool("get_consumer_group_detail",
		mcpgo.WithDescription("Get per-partition lag and assignment detail for a consumer group."),
		mcpgo.WithString("group_id", mcpgo.Required(), mcpgo.Description("Consumer group ID")),
	), m.handleGetConsumerGroupDetail)

	s.AddTool(mcpgo.NewTool("consume_messages",
		mcpgo.WithDescription("Read messages from a topic partition. Limit is capped at 100."),
		mcpgo.WithString("topic", mcpgo.Required(), mcpgo.Description("Topic name")),
		mcpgo.WithInteger("partition", mcpgo.Required(), mcpgo.Description("Partition number (-1 for all)")),
		mcpgo.WithInteger("offset", mcpgo.Required(), mcpgo.Description("Start offset (-1 for latest, -2 for earliest)")),
		mcpgo.WithInteger("limit", mcpgo.Description("Max messages to return (1-100, default 20)")),
	), m.handleConsumeMessages)

	s.AddTool(mcpgo.NewTool("list_schemas",
		mcpgo.WithDescription("List all Schema Registry subjects in the active cluster."),
	), m.handleListSchemas)

	// ── Write tools (blocked by ensureWritable when cluster is read-only) ──

	s.AddTool(mcpgo.NewTool("produce_message",
		mcpgo.WithDescription("Produce a message to a Kafka topic. Blocked on read-only clusters."),
		mcpgo.WithString("topic", mcpgo.Required(), mcpgo.Description("Topic name")),
		mcpgo.WithInteger("partition", mcpgo.Description("Target partition (-1 for auto, default -1)")),
		mcpgo.WithString("key", mcpgo.Description("Message key (optional)")),
		mcpgo.WithString("value", mcpgo.Required(), mcpgo.Description("Message value")),
	), m.handleProduceMessage)

	s.AddTool(mcpgo.NewTool("create_topic",
		mcpgo.WithDescription("Create a new Kafka topic. Blocked on read-only clusters."),
		mcpgo.WithString("name", mcpgo.Required(), mcpgo.Description("Topic name")),
		mcpgo.WithInteger("partitions", mcpgo.Required(), mcpgo.Description("Number of partitions")),
		mcpgo.WithInteger("replicas", mcpgo.Required(), mcpgo.Description("Replication factor")),
	), m.handleCreateTopic)

	s.AddTool(mcpgo.NewTool("delete_topic",
		mcpgo.WithDescription("Delete a Kafka topic. Blocked on read-only clusters."),
		mcpgo.WithString("name", mcpgo.Required(), mcpgo.Description("Topic name")),
	), m.handleDeleteTopic)

	s.AddTool(mcpgo.NewTool("delete_records_before",
		mcpgo.WithDescription("Delete records before a given offset in a topic partition. Blocked on read-only clusters."),
		mcpgo.WithString("topic", mcpgo.Required(), mcpgo.Description("Topic name")),
		mcpgo.WithInteger("partition", mcpgo.Required(), mcpgo.Description("Partition number")),
		mcpgo.WithInteger("before_offset", mcpgo.Required(), mcpgo.Description("Delete all records before this offset")),
	), m.handleDeleteRecordsBefore)

	s.AddTool(mcpgo.NewTool("purge_topic",
		mcpgo.WithDescription("Delete all records in a topic by advancing all partition offsets to latest. Blocked on read-only clusters."),
		mcpgo.WithString("topic", mcpgo.Required(), mcpgo.Description("Topic name")),
	), m.handlePurgeTopic)

	s.AddTool(mcpgo.NewTool("reset_consumer_offsets",
		mcpgo.WithDescription("Reset consumer group offsets using a strategy. Blocked on read-only clusters."),
		mcpgo.WithString("group_id", mcpgo.Required(), mcpgo.Description("Consumer group ID")),
		mcpgo.WithString("strategy", mcpgo.Required(), mcpgo.Description("Reset strategy: earliest | latest | specific")),
	), m.handleResetConsumerOffsets)
}

// ── Helpers ────────────────────────────────────────────────────────────────

func jsonResult(v any) (*mcpgo.CallToolResult, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return mcpgo.NewToolResultError(fmt.Sprintf("marshal response: %v", err)), nil
	}
	return mcpgo.NewToolResultText(string(b)), nil
}

func errResult(err error) (*mcpgo.CallToolResult, error) {
	return mcpgo.NewToolResultError(err.Error()), nil
}

// ── Read handlers ──────────────────────────────────────────────────────────

func (m *MCPService) handleListClusters(_ context.Context, _ mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	clusters := m.configSvc.GetClusters()
	// Strip all credentials — agents must never see passwords or usernames.
	for i := range clusters {
		clusters[i].Password = ""
		clusters[i].SchemaRegistryPassword = ""
		clusters[i].Username = ""
		clusters[i].SASLMechanism = ""
		clusters[i].AwsProfile = ""
	}
	return jsonResult(clusters)
}

func (m *MCPService) handleConnectCluster(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	id, err := req.RequireString("cluster_id")
	if err != nil {
		return errResult(err)
	}
	if err := m.kafkaSvc.Connect(id); err != nil {
		return errResult(err)
	}
	return mcpgo.NewToolResultText(fmt.Sprintf("connected to cluster %s", id)), nil
}

func (m *MCPService) handleGetClusterHealth(_ context.Context, _ mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	health, err := m.kafkaSvc.GetClusterHealth()
	if err != nil {
		return errResult(err)
	}
	return jsonResult(health)
}

func (m *MCPService) handleListTopics(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	topics, err := m.kafkaSvc.GetTopics()
	if err != nil {
		return errResult(err)
	}
	filter := req.GetString("filter", "")
	if filter != "" {
		var filtered []kafka.Topic
		fl := strings.ToLower(filter)
		for _, t := range topics {
			if strings.Contains(strings.ToLower(t.Name), fl) {
				filtered = append(filtered, t)
			}
		}
		topics = filtered
	}
	return jsonResult(topics)
}

func (m *MCPService) handleGetTopic(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	name, err := req.RequireString("name")
	if err != nil {
		return errResult(err)
	}
	topic, err := m.kafkaSvc.GetTopic(name)
	if err != nil {
		return errResult(err)
	}
	return jsonResult(topic)
}

func (m *MCPService) handleGetTopicConfigs(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	name, err := req.RequireString("name")
	if err != nil {
		return errResult(err)
	}
	configs, err := m.kafkaSvc.GetTopicConfigs(name)
	if err != nil {
		return errResult(err)
	}
	return jsonResult(configs)
}

func (m *MCPService) handleListConsumerGroups(_ context.Context, _ mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	groups, err := m.kafkaSvc.GetConsumerGroups()
	if err != nil {
		return errResult(err)
	}
	return jsonResult(groups)
}

func (m *MCPService) handleGetConsumerGroupDetail(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	id, err := req.RequireString("group_id")
	if err != nil {
		return errResult(err)
	}
	detail, err := m.kafkaSvc.GetConsumerGroupDetail(id)
	if err != nil {
		return errResult(err)
	}
	return jsonResult(detail)
}

func (m *MCPService) handleConsumeMessages(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	topic, err := req.RequireString("topic")
	if err != nil {
		return errResult(err)
	}
	partition, err := req.RequireInt("partition")
	if err != nil {
		return errResult(err)
	}
	offset, err := req.RequireInt("offset")
	if err != nil {
		return errResult(err)
	}
	limit := req.GetInt("limit", 20)
	if limit <= 0 || limit > maxMessageLimit {
		limit = maxMessageLimit
	}
	messages, err := m.kafkaSvc.ConsumeMessages(topic, int32(partition), int64(offset), limit)
	if err != nil {
		return errResult(err)
	}
	return jsonResult(messages)
}

func (m *MCPService) handleListSchemas(_ context.Context, _ mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	subjects, err := m.schemaSvc.GetSubjects()
	if err != nil {
		return errResult(err)
	}
	return jsonResult(subjects)
}

// ── Write handlers (read-only enforcement is in KafkaService.ensureWritable) ──

func (m *MCPService) handleProduceMessage(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	topic, err := req.RequireString("topic")
	if err != nil {
		return errResult(err)
	}
	partition := int32(req.GetInt("partition", -1))
	key := req.GetString("key", "")
	value, err := req.RequireString("value")
	if err != nil {
		return errResult(err)
	}
	if err := m.kafkaSvc.ProduceMessage(topic, partition, key, value, nil); err != nil {
		return errResult(err)
	}
	return mcpgo.NewToolResultText("message produced"), nil
}

func (m *MCPService) handleCreateTopic(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	name, err := req.RequireString("name")
	if err != nil {
		return errResult(err)
	}
	partitions, err := req.RequireInt("partitions")
	if err != nil {
		return errResult(err)
	}
	replicas, err := req.RequireInt("replicas")
	if err != nil {
		return errResult(err)
	}
	if err := m.kafkaSvc.CreateTopic(name, int32(partitions), int16(replicas), nil); err != nil {
		return errResult(err)
	}
	return mcpgo.NewToolResultText(fmt.Sprintf("topic %q created", name)), nil
}

func (m *MCPService) handleDeleteTopic(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	name, err := req.RequireString("name")
	if err != nil {
		return errResult(err)
	}
	if err := m.kafkaSvc.DeleteTopic(name); err != nil {
		return errResult(err)
	}
	return mcpgo.NewToolResultText(fmt.Sprintf("topic %q deleted", name)), nil
}

func (m *MCPService) handleDeleteRecordsBefore(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	topic, err := req.RequireString("topic")
	if err != nil {
		return errResult(err)
	}
	partition, err := req.RequireInt("partition")
	if err != nil {
		return errResult(err)
	}
	beforeOffset, err := req.RequireInt("before_offset")
	if err != nil {
		return errResult(err)
	}
	results, err := m.kafkaSvc.DeleteRecordsBefore(topic, int32(partition), int64(beforeOffset))
	if err != nil {
		return errResult(err)
	}
	return jsonResult(results)
}

func (m *MCPService) handlePurgeTopic(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	topic, err := req.RequireString("topic")
	if err != nil {
		return errResult(err)
	}
	results, err := m.kafkaSvc.PurgeTopic(topic)
	if err != nil {
		return errResult(err)
	}
	return jsonResult(results)
}

func (m *MCPService) handleResetConsumerOffsets(_ context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	groupID, err := req.RequireString("group_id")
	if err != nil {
		return errResult(err)
	}
	strategy, err := req.RequireString("strategy")
	if err != nil {
		return errResult(err)
	}
	if err := m.kafkaSvc.ResetConsumerGroupOffsets(groupID, strategy); err != nil {
		return errResult(err)
	}
	return mcpgo.NewToolResultText(fmt.Sprintf("offsets reset for group %q using strategy %q", groupID, strategy)), nil
}

// ── Utility ────────────────────────────────────────────────────────────────


package config

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
)

func TestExportConfigWithPasswords(t *testing.T) {
	svc := newTestService(t)

	svc.SaveCluster(ClusterProfile{
		Name:             "Test",
		BootstrapServers: "localhost:9092",
		SecurityProtocol: "SASL_PLAIN",
		Password:         "secret",
	})

	exported, err := svc.ExportConfig(true)
	if err != nil {
		t.Fatal(err)
	}

	// Should contain decrypted plaintext password for cross-machine portability
	if !strings.Contains(exported, `"password": "secret"`) {
		t.Fatalf("expected plaintext password in export, got: %s", exported)
	}

	// In-memory config must remain encrypted
	clusters := svc.GetClusters()
	if !IsEncrypted(clusters[0].Password) {
		t.Fatal("expected in-memory password to remain encrypted after export")
	}
}

func TestExportConfigWithoutPasswords(t *testing.T) {
	svc := newTestService(t)

	svc.SaveCluster(ClusterProfile{
		Name:             "Test",
		BootstrapServers: "localhost:9092",
		SecurityProtocol: "SASL_PLAIN",
		Password:         "secret",
	})

	exported, err := svc.ExportConfig(false)
	if err != nil {
		t.Fatal(err)
	}

	// Should NOT contain any password data
	if strings.Contains(exported, "secret") || strings.Contains(exported, "enc:v1:") {
		t.Fatal("expected no password data in export without passwords")
	}

	// Parse and verify password field is empty
	var cfg AppConfig
	json.Unmarshal([]byte(exported), &cfg)
	if cfg.Clusters[0].Password != "" {
		t.Fatal("expected empty password in stripped export")
	}

	// In-memory config must NOT have its password stripped
	clusters := svc.GetClusters()
	if !IsEncrypted(clusters[0].Password) {
		t.Fatal("expected in-memory password to remain encrypted after stripped export")
	}
}

func TestExportImportCrossMachine(t *testing.T) {
	svc1 := newTestService(t)
	svc2 := newTestService(t) // different dir, different key

	svc1.SaveCluster(ClusterProfile{
		ID:               "cluster-1",
		Name:             "Source Cluster",
		BootstrapServers: "kafka:9092",
		SecurityProtocol: "SASL_PLAIN",
		Password:         "my-super-secret",
	})

	exported, err := svc1.ExportConfig(true)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}

	if err := svc2.ImportConfig(exported); err != nil {
		t.Fatalf("import failed: %v", err)
	}

	decrypted, err := svc2.GetDecryptedPassword("cluster-1")
	if err != nil {
		t.Fatalf("failed to decrypt password on target machine: %v", err)
	}
	if decrypted != "my-super-secret" {
		t.Fatalf("expected 'my-super-secret', got '%s'", decrypted)
	}
}

func TestImportConfig(t *testing.T) {
	svc := newTestService(t)

	importJSON := `{
		"clusters": [
			{
				"id": "imported-1",
				"name": "Imported Cluster",
				"bootstrapServers": "kafka:9092",
				"color": "red",
				"securityProtocol": "SASL_PLAIN",
				"password": "plaintext-pw"
			}
		],
		"settings": {
			"theme": "light",
			"density": "compact",
			"codeFont": "Fira Code",
			"codeFontSize": 16,
			"launchOnStartup": false,
			"minimizeToTray": false
		},
		"activeClusterId": ""
	}`

	if err := svc.ImportConfig(importJSON); err != nil {
		t.Fatal(err)
	}

	clusters := svc.GetClusters()
	if len(clusters) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(clusters))
	}

	// Password should be auto-encrypted during import
	if !IsEncrypted(clusters[0].Password) {
		t.Fatal("expected password to be encrypted after import")
	}

	settings := svc.GetSettings()
	if settings.Theme != "light" {
		t.Fatalf("expected 'light' theme, got %s", settings.Theme)
	}
}

func TestImportConfigInvalidJSON(t *testing.T) {
	svc := newTestService(t)
	err := svc.ImportConfig("not json")
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestConcurrentAccess(t *testing.T) {
	svc := newTestService(t)

	var wg sync.WaitGroup
	errCh := make(chan error, 20)

	// Write operations
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			profile := ClusterProfile{
				Name:             "Concurrent",
				BootstrapServers: "localhost:9092",
				SecurityProtocol: "NONE",
			}
			if err := svc.SaveCluster(profile); err != nil {
				errCh <- err
			}
		}(i)
	}

	// Read operations
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = svc.GetClusters()
			_ = svc.GetSettings()
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Fatalf("concurrent error: %v", err)
	}
}

func TestSetActiveClusterNotFound(t *testing.T) {
	svc := newTestService(t)
	err := svc.SetActiveCluster("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent cluster")
	}
}

func TestTestConnectionInvalidServer(t *testing.T) {
	svc := newTestService(t)
	result, err := svc.TestConnection(ClusterProfile{
		BootstrapServers: "invalid-host:99999",
		SecurityProtocol: "NONE",
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "unreachable" {
		t.Fatalf("expected status 'unreachable', got %q", result.Status)
	}
}

func TestTestConnectionEmptyServers(t *testing.T) {
	svc := newTestService(t)
	result, err := svc.TestConnection(ClusterProfile{
		BootstrapServers: "",
		SecurityProtocol: "NONE",
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "unreachable" {
		t.Fatalf("expected status 'unreachable', got %q", result.Status)
	}
}

func TestConfigPersistence(t *testing.T) {
	dir := t.TempDir()

	// Create service and save data
	svc1, err := NewConfigServiceWithDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	svc1.SaveCluster(ClusterProfile{
		Name:             "Persistent",
		BootstrapServers: "localhost:9092",
		SecurityProtocol: "NONE",
	})
	svc1.SaveSettings(AppSettings{
		Theme:        "light",
		Density:      "spacious",
		CodeFont:     "Monospace",
		CodeFontSize: 16,
	})

	// Create new service with same dir — should load saved data
	svc2, err := NewConfigServiceWithDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	clusters := svc2.GetClusters()
	if len(clusters) != 1 {
		t.Fatalf("expected 1 cluster after reload, got %d", len(clusters))
	}
	if clusters[0].Name != "Persistent" {
		t.Fatalf("expected 'Persistent', got %s", clusters[0].Name)
	}

	settings := svc2.GetSettings()
	if settings.Theme != "light" {
		t.Fatalf("expected 'light', got %s", settings.Theme)
	}
}

func TestClassifyAuthError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		protocol string
		want     string // substring expected in output
	}{
		{"SASL error", errors.New("SASL authentication failed"), "SASL_PLAIN", "SASL"},
		{"AWS MSK error", errors.New("access denied"), "AWS_MSK_IAM", "AWS MSK IAM"},
		{"TLS error", errors.New("tls: handshake failure"), "SASL_SSL", "TLS"},
		{"Generic error", errors.New("connection reset"), "SASL_PLAIN", "Authentication failed"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := classifyAuthError(tc.err, tc.protocol)
			if !strings.Contains(result, tc.want) {
				t.Errorf("expected %q in result, got %q", tc.want, result)
			}
		})
	}
}

func TestClassifyMetadataError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus string
	}{
		{"authorization error", errors.New("CLUSTER_AUTHORIZATION_FAILED"), "forbidden"},
		{"topic auth error", errors.New("TOPIC_AUTHORIZATION_FAILED"), "forbidden"},
		{"timeout error", errors.New("context deadline exceeded"), "auth_error"},
		{"generic error", errors.New("connection reset"), "auth_error"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := classifyMetadataError(tc.err)
			if result.Status != tc.wantStatus {
				t.Errorf("expected status %q, got %q", tc.wantStatus, result.Status)
			}
		})
	}
}

func TestConnectionTestResultJSON(t *testing.T) {
	result := ConnectionTestResult{Status: "ok", Message: "Connected — 3 brokers"}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"status":"ok"`) {
		t.Fatalf("expected JSON with status field, got %s", string(data))
	}
}

func TestResolveTestPasswordPlaintext(t *testing.T) {
	svc := newTestService(t)
	pw, err := svc.resolveTestPassword(ClusterProfile{Password: "plain"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if pw != "plain" {
		t.Fatalf("expected 'plain', got %s", pw)
	}
}

func TestResolveTestPasswordFromSavedProfile(t *testing.T) {
	svc := newTestService(t)
	// Save a cluster with password (will be auto-encrypted)
	if err := svc.SaveCluster(ClusterProfile{
		Name:             "Saved",
		BootstrapServers: "localhost:9092",
		SecurityProtocol: "SASL_PLAIN",
		Password:         "saved-secret",
	}); err != nil {
		t.Fatal(err)
	}
	clusters := svc.GetClusters()
	clusterID := clusters[0].ID

	// Empty form password + clusterID → should resolve from saved
	pw, err := svc.resolveTestPassword(ClusterProfile{Password: ""}, clusterID)
	if err != nil {
		t.Fatal(err)
	}
	if pw != "saved-secret" {
		t.Fatalf("expected 'saved-secret', got %s", pw)
	}
}

func TestResolveTestPasswordEmpty(t *testing.T) {
	svc := newTestService(t)
	pw, err := svc.resolveTestPassword(ClusterProfile{Password: ""}, "")
	if err != nil {
		t.Fatal(err)
	}
	if pw != "" {
		t.Fatalf("expected empty, got %s", pw)
	}
}

func TestResolveTestPasswordFormOverridesSaved(t *testing.T) {
	svc := newTestService(t)
	if err := svc.SaveCluster(ClusterProfile{
		Name:             "Saved",
		BootstrapServers: "localhost:9092",
		SecurityProtocol: "SASL_PLAIN",
		Password:         "saved-secret",
	}); err != nil {
		t.Fatal(err)
	}
	clusters := svc.GetClusters()
	clusterID := clusters[0].ID

	// Form password takes priority over saved
	pw, err := svc.resolveTestPassword(ClusterProfile{Password: "form-pw"}, clusterID)
	if err != nil {
		t.Fatal(err)
	}
	if pw != "form-pw" {
		t.Fatalf("expected 'form-pw', got %s", pw)
	}
}


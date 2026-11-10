package mcp

import (
	"testing"

	"watermark-01/internal/config"
	"watermark-01/internal/kafka"
	"watermark-01/internal/schema"
)

func TestNewMCPService(t *testing.T) {
	cfgSvc, err := config.NewConfigServiceWithDir(t.TempDir())
	if err != nil {
		t.Fatalf("failed to create config svc: %v", err)
	}

	kafkaSvc := kafka.NewKafkaService(cfgSvc)
	schemaSvc := schema.NewSchemaService(cfgSvc)

	mcpSvc := NewMCPService(cfgSvc, kafkaSvc, schemaSvc)
	if mcpSvc == nil {
		t.Fatal("expected non-nil MCPService")
	}

	if mcpSvc.IsRunning() {
		t.Error("expected MCPService to not be running initially")
	}
}

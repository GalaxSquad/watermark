package config

// ClusterProfile matches frontend ClusterProfile interface in types/config.ts
type ClusterProfile struct {
	ID                     string `json:"id"`
	Name                   string `json:"name"`
	BootstrapServers       string `json:"bootstrapServers"`
	Color                  string `json:"color"`
	ReadOnly               bool   `json:"readOnly"`
	SecurityProtocol       string `json:"securityProtocol"`
	SASLMechanism          string `json:"saslMechanism,omitempty"`
	Username               string `json:"username,omitempty"`
	Password               string `json:"password,omitempty"`
	SchemaRegistryURL      string `json:"schemaRegistryUrl,omitempty"`
	SchemaRegistryPassword string `json:"schemaRegistryPassword,omitempty"`
	AwsProfile             string `json:"awsProfile,omitempty"` // AWS profile name for MSK IAM auth
	AwsRegion              string `json:"awsRegion,omitempty"`  // AWS region override (empty = from config/env)
}

// AppSettings matches frontend AppSettings interface in types/config.ts
type AppSettings struct {
	Theme           string `json:"theme"`
	Density         string `json:"density"`
	CodeFont        string `json:"codeFont"`
	CodeFontSize    int    `json:"codeFontSize"`
	LaunchOnStartup bool   `json:"launchOnStartup"`
	MinimizeToTray  bool   `json:"minimizeToTray"`
	MCPEnabled      bool   `json:"mcpEnabled"` // MCP server toggle (default: false — opt-in)
	MCPPort         int    `json:"mcpPort"`    // MCP server port (default: 34120)
}

// AppConfig is the root config structure persisted to disk at ~/.watermark/config.json
type AppConfig struct {
	Clusters        []ClusterProfile `json:"clusters"`
	Settings        AppSettings      `json:"settings"`
	ActiveClusterID string           `json:"activeClusterId"`
	SkippedVersion  string           `json:"skippedVersion,omitempty"`
}

// ConnectionTestResult is the structured result of a progressive cluster connectivity test.
// Status is one of: "unreachable", "auth_error", "forbidden", "ok".
type ConnectionTestResult struct {
	Status  string `json:"status"`  // "unreachable" | "auth_error" | "forbidden" | "ok"
	Message string `json:"message"` // human-readable detail
}

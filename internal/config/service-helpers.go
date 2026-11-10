package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const configFileName = "config.json"

// ExportConfig exports the config as a JSON string.
// If includePasswords is false, password fields are stripped.
func (s *ConfigService) ExportConfig(includePasswords bool) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	exportCfg := s.config
	if !includePasswords {
		for i := range exportCfg.Clusters {
			exportCfg.Clusters[i].Password = ""
			exportCfg.Clusters[i].SchemaRegistryPassword = ""
		}
	}

	data, err := json.MarshalIndent(exportCfg, "", "  ")
	if err != nil {
		return "", fmt.Errorf("export config: %w", err)
	}

	return string(data), nil
}

// ImportConfig imports configuration from a JSON string.
func (s *ConfigService) ImportConfig(jsonData string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var imported AppConfig
	if err := json.Unmarshal([]byte(jsonData), &imported); err != nil {
		return fmt.Errorf("import config: invalid JSON: %w", err)
	}

	// Encrypt any plaintext passwords in imported data
	for i := range imported.Clusters {
		if err := s.encryptProfilePasswords(&imported.Clusters[i]); err != nil {
			return fmt.Errorf("import config: encrypt: %w", err)
		}
	}

	s.config = imported
	return s.saveConfig()
}




// loadConfig reads the config JSON file from disk.
func (s *ConfigService) loadConfig() error {
	path := filepath.Join(s.configDir, configFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config: %w", err)
	}

	if err := json.Unmarshal(data, &s.config); err != nil {
		return fmt.Errorf("parse config: %w", err)
	}

	return nil
}

// saveConfig writes the config JSON file to disk.
func (s *ConfigService) saveConfig() error {
	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	path := filepath.Join(s.configDir, configFileName)
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write config: %w", err)
	}

	return nil
}

// defaultConfig returns sensible defaults for a fresh install.
func (s *ConfigService) defaultConfig() AppConfig {
	return AppConfig{
		Clusters: []ClusterProfile{},
		Settings: AppSettings{
			Theme:           "dark",
			Density:         "comfortable",
			CodeFont:        "JetBrains Mono",
			CodeFontSize:    14,
			LaunchOnStartup: false,
			MinimizeToTray:  false,
			MCPEnabled:      false,
			MCPPort:         34120,
		},
		ActiveClusterID: "",
	}
}

// encryptProfilePasswords encrypts password fields if they are not already encrypted.
func (s *ConfigService) encryptProfilePasswords(p *ClusterProfile) error {
	if p.Password != "" && !IsEncrypted(p.Password) {
		encrypted, err := Encrypt(p.Password, s.key)
		if err != nil {
			return err
		}
		p.Password = encrypted
	}

	if p.SchemaRegistryPassword != "" && !IsEncrypted(p.SchemaRegistryPassword) {
		encrypted, err := Encrypt(p.SchemaRegistryPassword, s.key)
		if err != nil {
			return err
		}
		p.SchemaRegistryPassword = encrypted
	}

	return nil
}

package config

import (
	"fmt"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportConfigFile opens a native Save dialog and writes the configuration to a JSON file.
// Returns true if exported, false if cancelled by user.
func (s *ConfigService) ExportConfigFile(includePasswords bool) (bool, error) {
	jsonData, err := s.ExportConfig(includePasswords)
	if err != nil {
		return false, fmt.Errorf("export config: %w", err)
	}

	app := application.Get()
	if app == nil || app.Dialog == nil {
		return false, fmt.Errorf("dialog service unavailable")
	}

	path, err := app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "Export Configuration",
		Filename: "watermark-config.json",
		Filters: []application.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		return false, fmt.Errorf("export config: dialog: %w", err)
	}
	if path == "" {
		return false, nil // user cancelled
	}

	if err := os.WriteFile(path, []byte(jsonData), 0644); err != nil {
		return false, fmt.Errorf("export config: write: %w", err)
	}
	return true, nil
}

// ImportConfigFile opens a native Open dialog and imports configuration from a JSON file.
// Returns true if imported, false if cancelled by user.
func (s *ConfigService) ImportConfigFile() (bool, error) {
	app := application.Get()
	if app == nil || app.Dialog == nil {
		return false, fmt.Errorf("dialog service unavailable")
	}

	path, err := app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title: "Import Configuration",
		Filters: []application.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		return false, fmt.Errorf("import config: dialog: %w", err)
	}
	if path == "" {
		return false, nil // user cancelled
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return false, fmt.Errorf("import config: read: %w", err)
	}

	if err := s.ImportConfig(string(data)); err != nil {
		return false, err
	}
	return true, nil
}

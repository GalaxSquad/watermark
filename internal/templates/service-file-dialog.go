package templates

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportToFile opens a native Save dialog and writes templates for a single cluster.
func (s *TemplateService) ExportToFile(clusterID string) error {
	s.mu.RLock()
	cluster, ok := s.store.Templates[clusterID]
	if !ok {
		cluster = map[string]TopicTemplate{}
	}
	exportStore := TemplateStore{
		Version:   s.store.Version,
		Templates: map[string]map[string]TopicTemplate{clusterID: cluster},
	}
	s.mu.RUnlock()

	data, err := json.MarshalIndent(exportStore, "", "  ")
	if err != nil {
		return fmt.Errorf("export: marshal: %w", err)
	}

	path, err := application.Get().Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "Export Templates",
		Filename: "watermark-templates.json",
		Filters: []application.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		return fmt.Errorf("export: dialog: %w", err)
	}
	if path == "" {
		return nil // user cancelled
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("export: write: %w", err)
	}
	return nil
}

// ImportFromFile opens a native Open dialog and imports templates from a JSON file
// into the specified cluster.
func (s *TemplateService) ImportFromFile(clusterID string, merge bool) error {
	path, err := application.Get().Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title: "Import Templates",
		Filters: []application.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		return fmt.Errorf("import: dialog: %w", err)
	}
	if path == "" {
		return nil // user cancelled
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("import: read: %w", err)
	}

	return s.ImportTemplates(clusterID, string(data), merge)
}

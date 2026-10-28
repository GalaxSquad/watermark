package annotations

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportToFile opens a native Save dialog and writes annotations for a single cluster.
func (s *AnnotationService) ExportToFile(clusterID string) error {
	s.mu.RLock()
	cluster, ok := s.store.Annotations[clusterID]
	if !ok {
		cluster = map[string]TopicAnnotation{}
	}
	exportStore := AnnotationStore{
		Version:     s.store.Version,
		Annotations: map[string]map[string]TopicAnnotation{clusterID: cluster},
	}
	s.mu.RUnlock()

	data, err := json.MarshalIndent(exportStore, "", "  ")
	if err != nil {
		return fmt.Errorf("export: marshal: %w", err)
	}

	path, err := application.Get().Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "Export Annotations",
		Filename: "watermark-annotations-cluster.json",
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

// ExportAllToFile opens a native Save dialog and writes all cluster annotations.
func (s *AnnotationService) ExportAllToFile() error {
	s.mu.RLock()
	data, err := json.MarshalIndent(s.store, "", "  ")
	s.mu.RUnlock()

	if err != nil {
		return fmt.Errorf("export all: marshal: %w", err)
	}

	path, err := application.Get().Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "Export All Annotations",
		Filename: "watermark-annotations-all.json",
		Filters: []application.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		return fmt.Errorf("export all: dialog: %w", err)
	}
	if path == "" {
		return nil // user cancelled
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("export all: write: %w", err)
	}
	return nil
}

// ImportFromFile opens a native Open dialog and imports annotations from a JSON file
// into the specified target cluster.
func (s *AnnotationService) ImportFromFile(targetClusterID string, merge bool) error {
	path, err := application.Get().Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title: "Import Annotations",
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

	return s.ImportAnnotations(targetClusterID, string(data), merge)
}

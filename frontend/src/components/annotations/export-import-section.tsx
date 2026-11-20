import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useAnnotations } from "@/hooks/use-annotations";
import { ExportToFile, ExportAllToFile, ImportFromFile } from "@/lib/wails-client";
import { useSettingsStore } from "@/store/settings";

/**
 * Export/Import section for the Settings overlay.
 * Uses native OS file dialogs via Wails runtime for reliable save/open.
 */
export function ExportImportSection() {
  const clusterId = useSettingsStore((s) => s.activeClusterId);
  const { annotations, invalidate } = useAnnotations();
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const annotatedCount = Object.keys(annotations).length;

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleExportCurrent = async () => {
    if (!clusterId) return;
    try {
      setError(null);
      await ExportToFile(clusterId);
      showSuccess("Exported successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleExportAll = async () => {
    try {
      setError(null);
      await ExportAllToFile();
      showSuccess("Exported successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleImport = async () => {
    if (!clusterId) return;
    try {
      setError(null);
      await ImportFromFile(clusterId, importMode === "merge");
      invalidate();
      showSuccess("Import complete!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="file-json" className="size-4" tone="brand" />
        <h3 className="text-sm font-display font-bold text-foreground">
          Topic Annotations
        </h3>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Share topic ownership tags with your team.{" "}
        <span className="text-muted-foreground">
          No credentials are included in exports.
        </span>
      </p>

      {/* Stats */}
      <div className="flex gap-4 text-xs font-mono">
        <span className="text-muted-foreground">
          Current cluster:{" "}
          <span className="text-primary">{annotatedCount}</span> annotated
        </span>
      </div>

      {/* Export buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCurrent}
          disabled={!clusterId}
          className="gap-1.5 text-xs"
        >
          <Icon name="download" className="size-3.5" />
          Export Current Cluster
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportAll}
          className="gap-1.5 text-xs"
        >
          <Icon name="download" className="size-3.5" />
          Export All Clusters
        </Button>
      </div>

      <div className="border-t border-border pt-4" />

      {/* Import */}
      <div className="space-y-3">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="radio"
              name="import-mode"
              checked={importMode === "merge"}
              onChange={() => setImportMode("merge")}
              className="text-primary focus:ring-primary/50"
            />
            Merge (keep existing)
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="radio"
              name="import-mode"
              checked={importMode === "replace"}
              onChange={() => setImportMode("replace")}
              className="text-primary focus:ring-primary/50"
            />
            Replace (overwrite all)
          </label>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleImport}
          className="gap-1.5 text-xs"
        >
          <Icon name="upload" className="size-3.5" />
          Import from File
        </Button>
      </div>

      {/* Status messages */}
      {error && (
        <p className="text-xs text-semantic-red font-mono">{error}</p>
      )}
      {success && (
        <p className="text-xs text-status-healthy font-mono">{success}</p>
      )}
    </div>
  );
}

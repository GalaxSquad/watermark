import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/components/shared/empty-state";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-card";
import {
  GetAnnotations,
  GetClusters,
  DeleteAnnotation,
  ExportToFile,
  ExportAllToFile,
  ImportFromFile,
} from "@/lib/wails-client";
import { useSettingsStore } from "@/store/settings";
import { useAnnotations } from "@/hooks/use-annotations";
import { AnnotationSummaryTable } from "./annotation-summary-table";
import { AnnotationJsonViewer } from "./annotation-json-viewer";
import { AnnotationEditorModal } from "./annotation-editor-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Annotation management panel for Settings overlay.
 * Supports viewing/exporting/importing annotations for any configured cluster
 * without switching the active connection.
 */
export function AnnotationSettingsPanel() {
  const activeClusterId = useSettingsStore((s) => s.activeClusterId);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const { invalidate } = useAnnotations();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [viewingClusterId, setViewingClusterId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<string | null>(null);

  const effectiveClusterId = viewingClusterId ?? activeClusterId;

  /* Fetch all configured clusters for the dropdown */
  const { data: clusters = [] } = useQuery({
    queryKey: ["clusters"],
    queryFn: GetClusters,
    staleTime: 60_000,
  });

  /* Fetch annotations for the currently-viewed cluster */
  const { data: viewingAnnotations = {} } = useQuery({
    queryKey: ["annotations", effectiveClusterId],
    queryFn: () => GetAnnotations(effectiveClusterId!),
    enabled: !!effectiveClusterId,
  });

  const annotatedCount = Object.keys(viewingAnnotations).length;
  const clusterName =
    clusters.find((c) => c.id === effectiveClusterId)?.name ?? "cluster";

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleExportCurrent = async () => {
    if (!effectiveClusterId) return;
    try {
      setError(null);
      await ExportToFile(effectiveClusterId);
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
    if (!effectiveClusterId) return;
    try {
      setError(null);
      await ImportFromFile(effectiveClusterId, importMode === "merge");
      invalidateViewing();
      showSuccess("Import complete!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  };

  const invalidateViewing = () => {
    queryClient.invalidateQueries({ queryKey: ["annotations", effectiveClusterId] });
    invalidate();
  };

  const handleEdit = (topicName: string) => {
    setEditingTopic(topicName);
  };

  const handleRemove = async (topicName: string) => {
    if (!effectiveClusterId) return;
    try {
      setError(null);
      await DeleteAnnotation(effectiveClusterId, topicName);
      invalidateViewing();
      showSuccess(`Removed annotation for ${topicName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  return (
    <>
      <div className="space-y-3">
        <SettingsCard
          icon="tag"
          title="Topic Annotations"
          description="Share topic ownership tags with your team. No credentials are included in exports."
        >
          <SettingsRow>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Cluster:</span>
              <Select
                value={effectiveClusterId ?? ""}
                onValueChange={(v) => setViewingClusterId(v || null)}
              >
                <SelectTrigger className="w-auto">
                  <SelectValue placeholder="No clusters configured" />
                </SelectTrigger>
                <SelectContent>
                  {clusters.length === 0 && (
                    <SelectItem value="__none__" disabled>No clusters configured</SelectItem>
                  )}
                  {clusters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-mono text-xs text-primary">
                {annotatedCount} annotated
              </span>
            </div>
          </SettingsRow>

          {annotatedCount > 0 ? (
            <SettingsRow>
              <AnnotationSummaryTable
                annotations={viewingAnnotations}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
            </SettingsRow>
          ) : (
            <SettingsRow>
              <EmptyState
                compact
                icon="tag"
                title="No annotations for this cluster"
                description="Annotations live on topics — open a topic to add owner, team or contact tags, then share them from here."
                action={
                  <Button
                    className="gap-1.5"
                    onClick={() => {
                      closeSettings();
                      navigate({ to: "/topics" });
                    }}
                  >
                    Browse Topics
                    <Icon name="chevron-right" className="size-3.5" />
                  </Button>
                }
              />
            </SettingsRow>
          )}

          {effectiveClusterId && (
            <SettingsRow>
              <AnnotationJsonViewer annotations={viewingAnnotations} />
            </SettingsRow>
          )}
        </SettingsCard>

        <SettingsCard
          icon="users"
          title="SHARE"
          description="Move annotations between clusters or teammates."
        >
          <SettingsRow>
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                ON IMPORT
              </p>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                    className="accent-primary text-primary focus:ring-primary/50"
                  />
                  Merge (keep existing)
                </label>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === "replace"}
                    onChange={() => setImportMode("replace")}
                    className="accent-primary text-primary focus:ring-primary/50"
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
                Import into {clusterName}
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCurrent}
                      disabled={!effectiveClusterId || annotatedCount === 0}
                      className="gap-1.5 text-xs"
                    >
                      <Icon name="download" className="size-3.5" />
                      Export {clusterName}
                    </Button>
                  </span>
                </TooltipTrigger>
                {annotatedCount === 0 && (
                  <TooltipContent side="top" className="text-xs">
                    Nothing to export — no annotations on {clusterName} yet
                  </TooltipContent>
                )}
              </Tooltip>
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
          </SettingsRow>
        </SettingsCard>

        {error && (
          <p className="text-xs text-semantic-red font-mono">{error}</p>
        )}
        {success && (
          <p className="text-xs text-status-healthy font-mono">{success}</p>
        )}
      </div>

      {editingTopic && (
        <AnnotationEditorModal
          topicName={editingTopic}
          open={!!editingTopic}
          onClose={() => {
            setEditingTopic(null);
            invalidateViewing();
          }}
        />
      )}
    </>
  );
}

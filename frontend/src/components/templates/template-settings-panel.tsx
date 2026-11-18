import { useState, useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSettingsStore } from "@/store/settings";
import { useTemplates } from "@/hooks/use-templates";
import type { TopicTemplate } from "@/types/templates";
import { GetClusters, ExportTemplatesToFile, ImportTemplatesFromFile } from "@/lib/wails-client";
import { TemplateListTable } from "./template-list-table";
import { SaveTemplateModal } from "./save-template-modal";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TemplateSettingsPanel() {
  const activeClusterId = useSettingsStore((s) => s.activeClusterId);
  const [viewingClusterId, setViewingClusterId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [editingTemplate, setEditingTemplate] = useState<TopicTemplate | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  const effectiveClusterId = viewingClusterId ?? activeClusterId;
  const { templateList, delete: deleteMutation } = useTemplates(effectiveClusterId ?? undefined);

  // Fetch all clusters for dropdown
  const { data: clusters = [] } = useQuery({
    queryKey: ["clusters"],
    queryFn: GetClusters,
    staleTime: 60_000,
  });

  const clusterName = clusters.find((c) => c.id === effectiveClusterId)?.name ?? "cluster";

  const handleExport = async () => {
    if (!effectiveClusterId) return;
    try {
      await ExportTemplatesToFile(effectiveClusterId);
      toast.success("Templates exported successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleImport = async () => {
    if (!effectiveClusterId) return;
    try {
      await ImportTemplatesFromFile(effectiveClusterId, importMode === "merge");
      toast.success("Templates imported successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const handleDeleteRequest = useCallback((templateId: string) => {
    setDeletingTemplateId(templateId);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingTemplateId) return;
    deleteMutation.mutate(deletingTemplateId, {
      onSuccess: () => toast.success("Template deleted"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
    });
    setDeletingTemplateId(null);
  }, [deletingTemplateId, deleteMutation]);

  return (
    <div className="space-y-3">
      <SettingsCard
        icon="bookmark"
        title="Topic Templates"
        description="Manage reusable topic configurations with auto-match patterns"
        action={
          <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-2">
            <Icon name="plus" className="size-4" />
            New Template
          </Button>
        }
      >
        <SettingsRow label="Viewing Cluster">
          <Select
            value={effectiveClusterId ?? ""}
            onValueChange={(v) => setViewingClusterId(v || null)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select cluster" />
            </SelectTrigger>
            <SelectContent>
              {clusters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {c.id === activeClusterId ? "(active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                  className="text-primary"
                />
                <span className="text-foreground">Merge</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="text-primary"
                />
                <span className="text-foreground">Replace</span>
              </label>
            </div>

            <div className="ml-auto flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExport}
                      disabled={templateList.length === 0}
                      className="gap-2"
                    >
                      <Icon name="download" className="size-3.5" />
                      Export
                    </Button>
                  </span>
                </TooltipTrigger>
                {templateList.length === 0 && (
                  <TooltipContent side="top" className="text-xs">
                    Nothing to export — no templates on {clusterName} yet
                  </TooltipContent>
                )}
              </Tooltip>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImport}
                className="gap-2"
              >
                <Icon name="upload" className="size-3.5" />
                Import
              </Button>
            </div>
          </div>
        </SettingsRow>

        <SettingsRow>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-primary">{templateList.length}</span> templates
            in <span className="font-medium">{clusterName}</span>
          </div>
        </SettingsRow>

        <SettingsRow>
          <TemplateListTable
            templates={templateList}
            onEdit={(template) => setEditingTemplate(template)}
            onDelete={handleDeleteRequest}
            onCreate={() => setShowCreateModal(true)}
          />
        </SettingsRow>
      </SettingsCard>

      {/* Create Modal (empty form) */}
      <SaveTemplateModal
        key="create"
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        topicName=""
        configs={[]}
        partitions={6}
        replicationFactor={3}
      />

      {/* Edit Modal (pre-filled form) */}
      {editingTemplate && (
        <SaveTemplateModal
          key={`edit-${editingTemplate.id}`}
          isOpen={!!editingTemplate}
          onClose={() => setEditingTemplate(null)}
          topicName=""
          configs={[]}
          partitions={editingTemplate.partitions}
          replicationFactor={editingTemplate.replicationFactor}
          initialConfigMap={editingTemplate.configs}
          initialName={editingTemplate.name}
          initialDescription={editingTemplate.description ?? ""}
          initialPattern={editingTemplate.pattern ?? ""}
          editTemplateId={editingTemplate.id}
        />
      )}

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={!!deletingTemplateId} onOpenChange={(open) => !open && setDeletingTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

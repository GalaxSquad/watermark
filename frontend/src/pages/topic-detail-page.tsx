import { useState, useCallback } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import { TopicTabs } from "@/components/topics/topic-tabs";
import { ProduceMessageModal } from "@/components/topics/produce-message-modal";
import { MessagesActionDropdown } from "@/components/topics/messages-action-dropdown";
import { DeleteRecordsDialog, type DeleteMode } from "@/components/topics/delete-records-dialog";
import { RefreshButton } from "@/components/shared/refresh-button";
import { TopicOwnershipHeader } from "@/components/annotations/topic-ownership-header";
import { AnnotationEditorModal } from "@/components/annotations/annotation-editor-modal";
import { useReadOnly } from "@/hooks/use-read-only";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "@/store/settings";

export function TopicDetailPage() {
  const { topicId } = useParams({ from: "/topics/$topicId" });
  const router = useRouter();
  const [produceOpen, setProduceOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode | null>(null);
  const isReadOnly = useReadOnly();
  const queryClient = useQueryClient();
  const clusterId = useSettingsStore((s) => s.activeClusterId);

  const handleDeleteSuccess = useCallback(() => {
    setDeleteMode(null);
    queryClient.invalidateQueries({ queryKey: ["messages", topicId] });
    queryClient.invalidateQueries({ queryKey: ["topic-partitions", topicId] });
  }, [queryClient, topicId]);

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.history.back()}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Icon name="chevron-left" className="size-4" />
        Topics
      </button>
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              Topic
            </span>
            <TopicOwnershipHeader
              topicName={topicId}
              onEdit={() => setEditorOpen(true)}
            />
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold tracking-tight text-foreground break-all" title={topicId}>
            {topicId}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshButton
            queryKeys={[
              ["messages", topicId],
              ["topic-consumers", topicId],
              ["topic-partitions", topicId],
              ["topic-configs", topicId],
              ["topic-acls", topicId],
              ["annotations", clusterId ?? ""],
            ]}
          />
          {!isReadOnly && (
            <MessagesActionDropdown
              onProduce={() => setProduceOpen(true)}
              onDeleteBeforeDate={() => setDeleteMode({ type: "beforeTimestamp", topicName: topicId, timestampMs: 0, timestampLabel: "" })}
              onPurgeTopic={() => setDeleteMode({ type: "purge", topicName: topicId })}
            />
          )}
        </div>
      </div>

      <TopicTabs topicName={topicId} />

      <ProduceMessageModal
        isOpen={produceOpen}
        onClose={() => setProduceOpen(false)}
        topicName={topicId}
      />

      <DeleteRecordsDialog
        mode={deleteMode}
        onClose={() => setDeleteMode(null)}
        onSuccess={handleDeleteSuccess}
      />

      <AnnotationEditorModal
        topicName={topicId}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}

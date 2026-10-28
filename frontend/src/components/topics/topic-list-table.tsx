import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/shared/data-table";
import { CopyableText } from "@/components/shared/copyable-text";
import { formatBytes } from "@/lib/utils";
import type { Topic } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetTopics } from "@/lib/wails-client";
import { useAnnotations } from "@/hooks/use-annotations";
import { useAnnotationUIStore } from "@/store/annotations";
import { OwnershipBadges } from "@/components/annotations/ownership-badges";
import { AnnotationEditorModal } from "@/components/annotations/annotation-editor-modal";
import { BatchTagModal } from "@/components/annotations/batch-tag-modal";
import { Icon } from "@/components/ui/icon";
import { useReadOnly } from "@/hooks/use-read-only";

interface TopicListTableProps {
  onTopicClick: (topicName: string) => void;
  onCloneTopic: (topicName: string) => void;
  searchFilter: string;
  hideInternal: boolean;
}

export function TopicListTable({ onTopicClick, onCloneTopic, searchFilter, hideInternal }: TopicListTableProps) {
  const isReadOnly = useReadOnly();
  const { data: topics = [], isLoading } = useKafkaQuery(["topics"], GetTopics);
  const { annotations } = useAnnotations();
  const {
    selectedTopicsForTag,
    toggleTopicForTag,
    setSelectedTopicsForTag,
    clearSelectedTopics,
    editingTopic,
    openEditor,
    closeEditor,
    isBatchModalOpen,
    openBatchModal,
    closeBatchModal,
  } = useAnnotationUIStore();

  const filteredData = topics.filter((topic) => {
    if (hideInternal && topic.isInternal) return false;
    if (searchFilter) {
      return topic.name.toLowerCase().includes(searchFilter.toLowerCase());
    }
    return true;
  });

  const allSelected =
    filteredData.length > 0 &&
    filteredData.every((t) => selectedTopicsForTag.includes(t.name));

  const toggleAll = () => {
    if (allSelected) {
      clearSelectedTopics();
    } else {
      setSelectedTopicsForTag(filteredData.map((t) => t.name));
    }
  };

  const columns: ColumnDef<Topic, unknown>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleAll}
          onClick={(e) => e.stopPropagation()}
          className="size-3.5"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedTopicsForTag.includes(row.original.name)}
          onCheckedChange={() => toggleTopicForTag(row.original.name)}
          onClick={(e) => e.stopPropagation()}
          className="size-3.5"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const ann = annotations[row.original.name];
        const producers = ann?.producers ?? [];
        const consumers = ann?.consumers ?? [];
        const notes = ann?.notes ?? "";
        const hasOwnership = producers.length > 0 || consumers.length > 0;
        const hasAnyAnnotation = hasOwnership || notes.length > 0;

        return (
          <div className="flex flex-col gap-1 min-w-0">
            <CopyableText
              value={row.original.name}
              textClassName="text-foreground font-medium max-w-[440px]"
              copyLabel="Copy Topic Name"
            />
            {hasAnyAnnotation && (
              <div
                className="flex items-center gap-1 flex-wrap min-w-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor(row.original.name);
                }}
              >
                {hasOwnership && (
                  <>
                    <OwnershipBadges
                      producers={producers}
                      consumers={[]}
                      maxVisible={3}
                    />
                    <span className="text-[10px] text-muted-foreground mx-0.5">→</span>
                    <OwnershipBadges
                      producers={[]}
                      consumers={consumers}
                      maxVisible={3}
                    />
                  </>
                )}
                {notes && (
                  <span className="text-[10px] text-muted-foreground font-mono italic">
                    {hasOwnership ? `— ${notes}` : notes}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    { accessorKey: "partitions", header: "Partitions" },
    { accessorKey: "replicas", header: "Replicas" },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) => formatBytes(row.original.size),
    },
    { accessorKey: "retention", header: "Retention" },
  ];

  return (
    <>
      {/* Batch action toolbar */}
      {selectedTopicsForTag.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-xs font-mono text-primary">
            {selectedTopicsForTag.length} selected
          </span>
          <button
            onClick={openBatchModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors"
          >
            <Icon name="tag" className="size-3" />
            Tag Selected
          </button>
          <button
            onClick={clearSelectedTopics}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <DataTable
        data={filteredData}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(row) => onTopicClick(row.name)}
        globalFilter={searchFilter}
        getRowContextMenu={(topic) =>
          isReadOnly
            ? [{ label: "Edit Tags", icon: "tag", onSelect: () => openEditor(topic.name) }]
            : [
                { label: "Clone Topic", icon: "copy", onSelect: () => onCloneTopic(topic.name) },
                { label: "Edit Tags", icon: "tag", onSelect: () => openEditor(topic.name) },
              ]
        }
      />

      {/* Editor modal */}
      {editingTopic && (
        <AnnotationEditorModal
          topicName={editingTopic}
          open={!!editingTopic}
          onClose={closeEditor}
        />
      )}

      {/* Batch tag modal */}
      <BatchTagModal
        topicNames={selectedTopicsForTag}
        open={isBatchModalOpen}
        onClose={closeBatchModal}
      />
    </>
  );
}

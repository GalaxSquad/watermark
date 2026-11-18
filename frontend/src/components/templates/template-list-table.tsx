import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { TopicTemplate } from "@/types/templates";
import type { RowContextMenuItem } from "@/components/shared/row-context-menu";

interface TemplateListTableProps {
  templates: TopicTemplate[];
  onEdit: (template: TopicTemplate) => void;
  onDelete: (templateId: string) => void;
  onCreate?: () => void;
}

const columns: ColumnDef<TopicTemplate, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground font-sans">
          {row.original.name}
        </span>
        {row.original.description && (
          <span className="text-xs text-muted-foreground font-sans">
            {row.original.description}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "pattern",
    header: "Pattern",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-foreground">
        {row.original.pattern || "—"}
      </span>
    ),
  },
  {
    accessorKey: "partitions",
    header: "Partitions",
    meta: { align: "right" },
  },
  {
    accessorKey: "replicationFactor",
    header: "RF",
    meta: { align: "right" },
  },
  {
    accessorKey: "configs",
    header: "Configs",
    meta: { align: "right" },
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {Object.keys(row.original.configs || {}).length}
      </span>
    ),
  },
];

export function TemplateListTable({
  templates,
  onEdit,
  onDelete,
  onCreate,
}: TemplateListTableProps) {
  return (
    <DataTable
      data={templates}
      columns={columns}
      getRowContextMenu={(template): RowContextMenuItem[] => [
        { label: "Edit Template", icon: "pencil", onSelect: () => onEdit(template) },
        { label: "Delete Template", icon: "trash", onSelect: () => onDelete(template.id), variant: "destructive", separatorBefore: true },
      ]}
      emptyState={
        <EmptyState
          icon="bookmark"
          title="No templates yet"
          description={
            <>
              Templates save a reusable topic setup — partitions, replication
              factor and configs — under a name pattern, so new topics that
              match the pattern start pre-configured instead of from scratch.
            </>
          }
          action={
            onCreate ? (
              <Button onClick={onCreate} size="sm" className="gap-1.5">
                <Icon name="plus" className="size-3.5" />
                Create your first template
              </Button>
            ) : undefined
          }
        />
      }
    />
  );
}

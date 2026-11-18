import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { cn } from "@/lib/utils";
import type { TopicConfig } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetTopicConfigs, GetTopicPartitions } from "@/lib/wails-client";
import { SaveTemplateModal } from "@/components/templates/save-template-modal";

const columns: ColumnDef<TopicConfig, unknown>[] = [
  {
    accessorKey: "name",
    header: "Config",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.isOverridden && (
          <span className="w-0.5 h-5 bg-primary rounded-full" />
        )}
        <span className={cn("font-mono text-sm", row.original.isOverridden && "text-primary")}>
          {row.original.name}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "value",
    header: "Value",
    cell: ({ row }) => (
      <span className={cn("font-mono", row.original.isOverridden && "text-foreground font-medium")}>
        {row.original.value}
      </span>
    ),
  },
  {
    accessorKey: "defaultValue",
    header: "Default",
    cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.defaultValue}</span>,
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.description}</span>,
  },
];

interface ConfigurationTabProps {
  topicName: string;
}

export function ConfigurationTab({ topicName }: ConfigurationTabProps) {
  const [showSaveModal, setShowSaveModal] = useState(false);

  const { data: configs = [] } = useKafkaQuery(
    ["topic-configs", topicName],
    () => GetTopicConfigs(topicName),
  );

  const { data: partitions = [] } = useKafkaQuery(
    ["topic-partitions", topicName],
    () => GetTopicPartitions(topicName),
  );

  const overriddenCount = configs.filter((c) => c.isOverridden).length;
  const partitionCount = partitions.length;
  const replicationFactor = partitions[0]?.replicas?.length ?? 1;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">
          <span className="text-primary">{overriddenCount}</span> overridden
        </span>
        <Button
          size="sm"
          onClick={() => setShowSaveModal(true)}
          disabled={overriddenCount === 0}
          className="gap-1.5 text-xs"
        >
          <Icon name="bookmark" className="size-3" />
          Save as Template
        </Button>
      </div>

      {/* Config Table */}
      <DataTable
        data={configs}
        columns={columns}
        highlightRow={(row) =>
          row.isOverridden ? "bg-primary/5 border-l-2 border-primary" : undefined
        }
      />

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        topicName={topicName}
        configs={configs}
        partitions={partitionCount}
        replicationFactor={replicationFactor}
      />
    </div>
  );
}

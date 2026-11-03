import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClearLagDialog, type ClearLagTarget } from "@/components/consumers/clear-lag-dialog";
import type { RowContextMenuItem } from "@/components/shared/row-context-menu";
import { cn, copyToClipboard, formatNumber } from "@/lib/utils";
import type { ConsumerGroup, ConsumerGroupState } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { useReadOnly } from "@/hooks/use-read-only";
import { GetTopicConsumers } from "@/lib/wails-client";

const STATE_MAP: Record<ConsumerGroupState, "healthy" | "rebalancing" | "dead" | "empty"> = {
  Stable: "healthy",
  Rebalancing: "rebalancing",
  Dead: "dead",
  Empty: "empty",
  Unknown: "empty",
};

const columns: ColumnDef<ConsumerGroup, unknown>[] = [
  {
    accessorKey: "groupId",
    header: "Group ID",
    cell: ({ row }) => (
      <Link
        to="/consumers/$groupId"
        params={{ groupId: row.original.groupId }}
        className="text-primary font-medium hover:underline hover:text-primary/80 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.groupId}
      </Link>
    ),
  },
  {
    accessorKey: "state",
    header: "State",
    cell: ({ row }) => (
      <StatusBadge
        status={STATE_MAP[row.original.state as ConsumerGroupState]}
        label={row.original.state}
      />
    ),
  },
  { accessorKey: "members", header: "Members" },
  {
    accessorKey: "totalLag",
    header: "Total Lag",
    cell: ({ row }) => (
      <span className={cn("font-mono", row.original.totalLag > 0 && "text-semantic-red font-bold")}>
        {formatNumber(row.original.totalLag)}
      </span>
    ),
  },
];

interface ConsumersTabProps {
  topicName: string;
}

export function ConsumersTab({ topicName }: ConsumersTabProps) {
  const { data: consumers = [] } = useKafkaQuery(
    ["topic-consumers", topicName],
    () => GetTopicConsumers(topicName),
  );
  const isReadOnly = useReadOnly();
  const [clearTarget, setClearTarget] = useState<ClearLagTarget | null>(null);

  const getRowContextMenu = (group: ConsumerGroup): RowContextMenuItem[] => {
    const items: RowContextMenuItem[] = [
      {
        label: "Copy Group ID",
        icon: "copy",
        onSelect: () => copyToClipboard(group.groupId, "Group ID"),
      },
    ];
    if (!isReadOnly) {
      items.push({
        label: "Clear Consumer Lag on Topic",
        icon: "chevrons-right",
        disabled: group.totalLag <= 0,
        separatorBefore: true,
        onSelect: () =>
          setClearTarget({
            type: "groupTopic",
            groupId: group.groupId,
            topicName,
            groupState: group.state,
            totalLag: group.totalLag,
          }),
      });
    }
    return items;
  };

  return (
    <>
      <DataTable
        data={consumers}
        columns={columns}
        getRowContextMenu={getRowContextMenu}
      />
      <ClearLagDialog
        target={clearTarget}
        onClose={() => setClearTarget(null)}
      />
    </>
  );
}

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils";
import type { ConsumerGroup, ConsumerGroupState } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetConsumerGroups } from "@/lib/wails-client";
import { AlertIndicator } from "./alert-indicator";
import { useLagAlertsStore } from "@/store/lag-alerts";

const STATE_MAP: Record<ConsumerGroupState, "healthy" | "rebalancing" | "dead" | "empty"> = {
  Stable: "healthy",
  Rebalancing: "rebalancing",
  Dead: "dead",
  Empty: "empty",
  Unknown: "empty",
};

interface ConsumerGroupTableProps {
  onGroupClick: (groupId: string) => void;
  searchFilter: string;
}

export function ConsumerGroupTable({ onGroupClick, searchFilter }: ConsumerGroupTableProps) {
  const { data: groups = [], isLoading } = useKafkaQuery(["consumer-groups"], GetConsumerGroups);
  const { alerts } = useLagAlertsStore();

  const columns = useMemo<ColumnDef<ConsumerGroup, unknown>[]>(() => [
    {
      accessorKey: "groupId",
      header: "Group ID",
      cell: ({ row }) => <span className="text-foreground font-medium">{row.original.groupId}</span>,
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
    {
      id: "alert",
      header: "Alert",
      cell: ({ row }) => (
        <AlertIndicator groupId={row.original.groupId} alerts={alerts} />
      ),
    },
  ], [alerts]);

  return (
    <DataTable
      data={groups}
      columns={columns}
      isLoading={isLoading}
      onRowClick={(row) => onGroupClick(row.groupId)}
      globalFilter={searchFilter}
    />
  );
}

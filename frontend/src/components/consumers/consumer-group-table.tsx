import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyableText } from "@/components/shared/copyable-text";
import { Icon } from "@/components/ui/icon";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn, formatNumber } from "@/lib/utils";
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
      cell: ({ row }) => (
        <CopyableText
          value={row.original.groupId}
          textClassName="text-foreground font-medium max-w-[420px]"
          copyLabel="Copy Group ID"
        />
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
    {
      accessorKey: "members",
      header: "Members",
      cell: ({ row }) => (
        <span className="font-mono text-muted-foreground">{row.original.members}</span>
      ),
    },
    {
      accessorKey: "totalLag",
      header: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              Total Lag
              <Icon name="info" tone="muted" className="size-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs font-sans normal-case tracking-normal">
            Active group thresholds: &lt;1,000 normal · 1,000–10,000 elevated (amber) · &gt;10,000 high (red). Empty/Dead groups show retained offset backlog as stale.
          </TooltipContent>
        </Tooltip>
      ),
      cell: ({ row }) => {
        const { totalLag, state } = row.original;
        const isInactive = state === "Empty" || state === "Dead";

        if (totalLag === 0) {
          return <span className="font-mono text-muted-foreground">0</span>;
        }

        if (isInactive) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground cursor-help">
                  <span>{formatNumber(totalLag)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground font-sans">
                    stale
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs font-sans">
                Group is {state} (0 active consumers). This lag is retained offset backlog and will not decrease until consumers rejoin or offsets are reset.
              </TooltipContent>
            </Tooltip>
          );
        }

        const colorClass =
          totalLag > 10000
            ? "text-semantic-red font-bold"
            : totalLag >= 1000
              ? "text-amber-400 font-semibold"
              : "text-foreground";

        return (
          <span className={cn("font-mono", colorClass)}>
            {formatNumber(totalLag)}
          </span>
        );
      },
    },
    {
      id: "alert",
      header: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              Alert
              <Icon name="info" tone="muted" className="size-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs font-sans normal-case tracking-normal">
            Shows active warning/critical breaches from rules configured in Monitoring → Configuration.
          </TooltipContent>
        </Tooltip>
      ),
      cell: ({ row }) => {
        const hasAlert = alerts.some(
          (a) => a.groupId === row.original.groupId && !a.resolved,
        );
        return hasAlert ? (
          <AlertIndicator groupId={row.original.groupId} alerts={alerts} />
        ) : (
          <span className="text-xs text-muted-foreground/50 font-mono">—</span>
        );
      },
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

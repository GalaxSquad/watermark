import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MetricCard } from "@/components/shared/metric-card";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyableText } from "@/components/shared/copyable-text";
import { EmptyState } from "@/components/shared/empty-state";
import { RowContextMenu, type RowContextMenuItem } from "@/components/shared/row-context-menu";
import { ClearLagDialog, type ClearLagTarget } from "@/components/consumers/clear-lag-dialog";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn, copyToClipboard, formatBytes, formatNumber } from "@/lib/utils";
import type { Broker, ConsumerGroup } from "@/types/kafka";
import { useKafkaQuery, clusterQueryKey } from "@/hooks/use-kafka-query";
import { useReadOnly } from "@/hooks/use-read-only";
import { useSettingsStore } from "@/store/settings";
import { GetDashboardData, GetTopics, GetConsumerGroups } from "@/lib/wails-client";

/**
 * Dashboard data hook — single backend call for both health + brokers.
 * Eliminates duplicate Metadata + LogDirs round-trips.
 */
function useDashboardData() {
  return useKafkaQuery(
    ["dashboard"],
    GetDashboardData,
    { staleTime: 30_000, refetchInterval: 30_000 },
  );
}

/** Small per-widget refresh — invalidates only this widget's query
 *  (no backend cache clear, no Cmd+R binding; the page-level RefreshButton
 *  owns the shortcut). */
function WidgetRefreshButton({ queryKey, label }: { queryKey: string[]; label: string }) {
  const queryClient = useQueryClient();
  const activeClusterId = useSettingsStore((s) => s.activeClusterId);
  const [spinning, setSpinning] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={() => {
            setSpinning(true);
            queryClient
              .invalidateQueries({ queryKey: clusterQueryKey(activeClusterId, queryKey) })
              .finally(() => setTimeout(() => setSpinning(false), 600));
          }}
        >
          <Icon name="refresh" className={cn("size-3.5", spinning && "animate-spin")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/* ====== Metric Cards ====== */
export function DashboardMetricCards() {
  const { data } = useDashboardData();
  const health = data?.health;
  // Topics count comes from the same ["topics"] query the Topics page uses,
  // counting user topics only (excludes internal topics like
  // __consumer_offsets) — the same definition the backend health endpoint
  // uses. Falls back to health.topicCount while the query is loading, so
  // Overview and Topics can never show two different numbers for the
  // same fact.
  const { data: topics } = useKafkaQuery(["topics"], GetTopics, {
    staleTime: 30_000,
  });
  const userTopicCount = topics
    ? topics.filter((t) => !t.isInternal).length
    : health?.topicCount;

  const metrics = [
    {
      label: "Cluster Status",
      value: health ? `${health.brokersOnline}/${health.brokersTotal} Online` : "—",
      icon: "check-circle" as const,
      tone: "success" as const,
      trend: health?.status === "healthy" ? { value: "All Healthy", positive: true } : undefined,
    },
    {
      label: "Brokers",
      value: health?.brokersOnline.toString() ?? "—",
      icon: "server" as const,
      tone: "brand" as const,
    },
    {
      label: "Topics",
      value: userTopicCount?.toString() ?? "—",
      icon: "layers" as const,
      tone: "info" as const,
    },
    {
      label: "Total Size",
      value: health ? formatBytes(health.totalSize) : "—",
      icon: "hard-drive" as const,
      tone: "warning" as const,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  );
}

/* ====== Broker Table ====== */
const brokerColumns: ColumnDef<Broker, unknown>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("font-mono", row.original.isController && "text-primary font-bold cursor-help")}>
            {row.original.id}{row.original.isController ? "*" : ""}
          </span>
        </TooltipTrigger>
        {row.original.isController && (
          <TooltipContent side="top" className="text-xs">
            Controller broker — coordinates metadata and partition leadership
          </TooltipContent>
        )}
      </Tooltip>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: () => <StatusBadge status="healthy" label="Online" />,
  },
  {
    accessorKey: "host",
    header: "Host / IP",
    cell: ({ row }) => (
      <CopyableText
        value={row.original.host}
        textClassName="max-w-[300px] text-foreground"
        copyLabel="Copy Broker Host"
      />
    ),
  },
  {
    accessorKey: "port",
    header: "Port",
    meta: { align: "right" },
    cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.port}</span>,
  },
  {
    accessorKey: "partitions",
    header: "Partitions",
    meta: { align: "right" },
    cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.partitions)}</span>,
  },
  {
    accessorKey: "size",
    header: "Size",
    meta: { align: "right" },
    cell: ({ row }) => <span className="font-mono">{formatBytes(row.original.size)}</span>,
  },
];

export function BrokerTable() {
  const { data } = useDashboardData();
  const brokers = data?.brokers ?? [];
  const hasController = brokers.some((b) => b.isController);

  return (
    <div>
      <h2 className="text-lg font-display font-bold text-foreground mb-4 uppercase tracking-wider">
        Brokers
      </h2>
      <DataTable
        data={brokers}
        columns={brokerColumns}
        highlightRow={(row) =>
          row.isController ? "bg-primary/10 border-l-2 border-primary" : undefined
        }
      />
      {hasController && (
        <p className="mt-2 text-[11px] font-mono text-muted-foreground">
          <span className="text-primary font-bold">*</span> controller broker
        </p>
      )}
    </div>
  );
}

/* ====== Quick Insights (Top Topics by Size + Top Consumer Lag) ====== */

function LagGroupRow({
  g,
  isReadOnly,
  onClear,
  onNavigate,
}: {
  g: ConsumerGroup;
  isReadOnly: boolean;
  onClear: (t: ClearLagTarget) => void;
  onNavigate: (groupId: string) => void;
}) {
  const isInactive = g.state === "Empty" || g.state === "Dead";
  const lagColor = isInactive
    ? "text-muted-foreground"
    : g.totalLag > 10000
      ? "text-semantic-red font-semibold"
      : g.totalLag >= 1000
        ? "text-amber-400 font-medium"
        : "text-foreground";
  const contextItems: RowContextMenuItem[] = [
    {
      label: "Copy Group ID",
      icon: "copy",
      onSelect: () => copyToClipboard(g.groupId, "Group ID"),
    },
  ];
  if (!isReadOnly) {
    contextItems.push({
      label: "Clear Consumer Lag",
      icon: "chevrons-right",
      disabled: g.totalLag <= 0,
      separatorBefore: true,
      onSelect: () =>
        onClear({
          type: "group",
          groupId: g.groupId,
          groupState: g.state,
          totalLag: g.totalLag,
        }),
    });
  }
  return (
    <RowContextMenu items={contextItems}>
      <div
        onClick={() => onNavigate(g.groupId)}
        className="flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-md cursor-pointer hover:bg-secondary transition-colors"
      >
        <CopyableText
          value={g.groupId}
          textClassName="text-foreground text-xs"
          copyLabel="Copy Group ID"
        />
        <div className="flex items-center gap-2.5 shrink-0 text-xs font-mono">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-sans">
            {g.state}
          </span>
          <span className={cn("w-20 text-right tabular-nums", lagColor)}>
            {formatNumber(g.totalLag)}
          </span>
        </div>
      </div>
    </RowContextMenu>
  );
}

export function DashboardQuickInsights() {
  const navigate = useNavigate();
  const isReadOnly = useReadOnly();
  const [clearTarget, setClearTarget] = useState<ClearLagTarget | null>(null);
  const { data: topics = [] } = useKafkaQuery(["topics"], GetTopics, {
    staleTime: 30_000,
  });
  const { data: groups = [] } = useKafkaQuery(["consumer-groups"], GetConsumerGroups, {
    staleTime: 30_000,
  });

  const topTopics = useMemo(
    () =>
      topics
        .filter((t) => !t.isInternal)
        .slice()
        .sort((a, b) => b.size - a.size)
        .slice(0, 5),
    [topics],
  );

  // Active groups only in the main ranking — Empty/Dead groups carry
  // retained offset backlog that never decreases, so ranking them by lag
  // surfaces noise (on AVB Non-Prod the old top 5 were all Empty with the
  // identical stale lag 2,804). Stale groups get their own section below.
  const activeLagGroups = useMemo(
    () =>
      groups
        .filter((g) => g.state !== "Empty" && g.state !== "Dead")
        .slice()
        .sort((a, b) => b.totalLag - a.totalLag)
        .slice(0, 5),
    [groups],
  );
  const staleGroups = useMemo(
    () =>
      groups
        .filter((g) => g.state === "Empty" || g.state === "Dead")
        .slice()
        .sort((a, b) => b.totalLag - a.totalLag),
    [groups],
  );
  const topStaleGroups = staleGroups.slice(0, 3);

  const goToGroup = (groupId: string) =>
    navigate({ to: "/consumers/$groupId", params: { groupId } });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Topics by Size */}
      <div className="glass-panel p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Icon name="layers" tone="info" className="size-3.5" />
            Largest Topics
          </h3>
          <div className="flex items-center gap-1">
            <WidgetRefreshButton queryKey={["topics"]} label="Refresh topics" />
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => navigate({ to: "/topics" })}
              className="h-auto p-0 text-xs gap-1"
            >
              View all
              <Icon name="chevron-right" tone="brand" className="size-3" />
            </Button>
          </div>
        </div>

        {topTopics.length === 0 ? (
          <EmptyState
            compact
            icon="layers"
            title="No user topics found"
            description="This cluster has no non-internal topics yet."
          />
        ) : (
          <div className="divide-y divide-border text-sm">
            {topTopics.map((t) => (
              <div
                key={t.name}
                onClick={() =>
                  navigate({ to: "/topics/$topicId", params: { topicId: t.name } })
                }
                className="flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-md cursor-pointer hover:bg-secondary transition-colors"
              >
                <CopyableText
                  value={t.name}
                  textClassName="text-foreground text-xs"
                  copyLabel="Copy Topic Name"
                />
                <div className="flex items-center gap-3 shrink-0 text-xs font-mono text-muted-foreground">
                  <span>{t.partitions}p</span>
                  <span className="text-foreground w-20 text-right tabular-nums">{formatBytes(t.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Consumer Groups by Lag — active groups only; stale backlog separate */}
      <div className="glass-panel p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Icon name="activity" tone="warning" className="size-3.5" />
            Top Consumer Lag
          </h3>
          <div className="flex items-center gap-1">
            <WidgetRefreshButton queryKey={["consumer-groups"]} label="Refresh consumer groups" />
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => navigate({ to: "/consumers" })}
              className="h-auto p-0 text-xs gap-1"
            >
              View all
              <Icon name="chevron-right" tone="brand" className="size-3" />
            </Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <EmptyState
            compact
            icon="users"
            title="No consumer groups"
            description="No consumer groups exist on this cluster yet."
          />
        ) : (
          <>
            {activeLagGroups.length === 0 ? (
              <div className="py-2 text-center text-xs text-muted-foreground">
                No active consumer groups right now — every group is Empty or Dead.
              </div>
            ) : (
              <div className="divide-y divide-border text-sm">
                {activeLagGroups.map((g) => (
                  <LagGroupRow
                    key={g.groupId}
                    g={g}
                    isReadOnly={isReadOnly}
                    onClear={setClearTarget}
                    onNavigate={goToGroup}
                  />
                ))}
              </div>
            )}

            {topStaleGroups.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Stale backlog · {staleGroups.length} inactive group{staleGroups.length === 1 ? "" : "s"}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mb-1">
                  Retained offset backlog from Empty/Dead groups — it will not decrease until consumers rejoin.
                </p>
                <div className="divide-y divide-border/50 text-sm opacity-80">
                  {topStaleGroups.map((g) => (
                    <LagGroupRow
                      key={g.groupId}
                      g={g}
                      isReadOnly={isReadOnly}
                      onClear={setClearTarget}
                      onNavigate={goToGroup}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <ClearLagDialog
        target={clearTarget}
        onClose={() => setClearTarget(null)}
      />
    </div>
  );
}

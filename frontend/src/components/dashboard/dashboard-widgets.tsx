import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MetricCard } from "@/components/shared/metric-card";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyableText } from "@/components/shared/copyable-text";
import { Icon } from "@/components/ui/icon";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import type { Broker } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
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

/* ====== Metric Cards ====== */
export function DashboardMetricCards() {
  const { data } = useDashboardData();
  const health = data?.health;

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
      value: health?.topicCount.toString() ?? "—",
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
      <span className={cn("font-mono", row.original.isController && "text-primary font-bold")}>
        {row.original.id}{row.original.isController ? "*" : ""}
      </span>
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
    cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.port}</span>,
  },
  {
    accessorKey: "partitions",
    header: "Partitions",
    cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.partitions)}</span>,
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }) => <span className="font-mono">{formatBytes(row.original.size)}</span>,
  },
];

export function BrokerTable() {
  const { data } = useDashboardData();
  const brokers = data?.brokers ?? [];

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
    </div>
  );
}

/* ====== Quick Insights (Top Topics by Size + Top Consumer Lag) ====== */
export function DashboardQuickInsights() {
  const navigate = useNavigate();
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

  const topLagGroups = useMemo(
    () =>
      groups
        .slice()
        .sort((a, b) => b.totalLag - a.totalLag)
        .slice(0, 5),
    [groups],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Topics by Size */}
      <div className="glass-panel p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Icon name="layers" tone="info" className="size-3.5" />
            Largest Topics
          </h3>
          <button
            type="button"
            onClick={() => navigate({ to: "/topics" })}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View all
            <Icon name="chevron-right" tone="brand" className="size-3" />
          </button>
        </div>

        {topTopics.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No user topics found in this cluster.
          </div>
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
                  <span className="text-foreground w-20 text-right">{formatBytes(t.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Consumer Groups by Lag */}
      <div className="glass-panel p-4 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Icon name="activity" tone="warning" className="size-3.5" />
            Top Consumer Lag
          </h3>
          <button
            type="button"
            onClick={() => navigate({ to: "/consumers" })}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View all
            <Icon name="chevron-right" tone="brand" className="size-3" />
          </button>
        </div>

        {topLagGroups.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No consumer groups active on this cluster.
          </div>
        ) : (
          <div className="divide-y divide-border text-sm">
            {topLagGroups.map((g) => {
              const isInactive = g.state === "Empty" || g.state === "Dead";
              const lagColor = isInactive
                ? "text-muted-foreground"
                : g.totalLag > 10000
                  ? "text-semantic-red font-semibold"
                  : g.totalLag >= 1000
                    ? "text-amber-400 font-medium"
                    : "text-foreground";
              return (
                <div
                  key={g.groupId}
                  onClick={() =>
                    navigate({
                      to: "/consumers/$groupId",
                      params: { groupId: g.groupId },
                    })
                  }
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
                    <span className={cn("w-20 text-right", lagColor)}>
                      {formatNumber(g.totalLag)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

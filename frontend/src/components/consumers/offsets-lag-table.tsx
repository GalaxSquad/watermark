import { useState, useMemo, Fragment } from "react";
import { Icon } from "@/components/ui/icon";
import { CopyableText } from "@/components/shared/copyable-text";
import { RowContextMenu, type RowContextMenuItem } from "@/components/shared/row-context-menu";
import { useReadOnly } from "@/hooks/use-read-only";
import { cn, copyToClipboard, formatNumber } from "@/lib/utils";
import type { ConsumerGroupOffset, ConsumerGroupState } from "@/types/kafka";
import { ClearLagDialog, type ClearLagTarget } from "./clear-lag-dialog";

interface TopicGroup {
  topic: string;
  partitions: ConsumerGroupOffset[];
  totalLag: number;
}

interface OffsetsLagTableProps {
  groupId: string;
  groupState?: ConsumerGroupState | string;
  offsets: ConsumerGroupOffset[];
}

export function OffsetsLagTable({ groupId, groupState, offsets }: OffsetsLagTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [clearTarget, setClearTarget] = useState<ClearLagTarget | null>(null);
  const isReadOnly = useReadOnly();

  // Group offsets by topic, sorted by topic name
  const groups = useMemo<TopicGroup[]>(() => {
    const map = new Map<string, ConsumerGroupOffset[]>();
    for (const o of offsets) {
      const list = map.get(o.topic) ?? [];
      list.push(o);
      map.set(o.topic, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([topic, partitions]) => ({
        topic,
        partitions: partitions.sort((a, b) => a.partition - b.partition),
        totalLag: partitions.reduce((sum, p) => sum + p.lag, 0),
      }));
  }, [offsets]);

  const toggle = (topic: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(topic) ? next.delete(topic) : next.add(topic);
      return next;
    });

  return (
    <div>
      <h3 className="text-sm font-display font-bold text-foreground mb-3 uppercase tracking-wider">
        Offsets &amp; Lag
      </h3>
      <div className="glass-panel overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                {["Topic", "Partitions", "Total Lag"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Icon name="check-circle" tone="success" className="size-6" />
                      <span className="font-medium font-sans">No offset or lag data</span>
                      <span className="text-xs text-muted-foreground/70 font-sans">
                        This consumer group has no active topic subscriptions or committed offsets.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                groups.map((g) => {
                  const isOpen = expanded.has(g.topic);
                  const topicContextItems: RowContextMenuItem[] = [
                    {
                      label: "Copy Topic Name",
                      icon: "copy",
                      onSelect: () => copyToClipboard(g.topic, "Topic Name"),
                    },
                  ];
                  if (!isReadOnly) {
                    topicContextItems.push({
                      label: "Clear Consumer Lag on Topic",
                      icon: "chevrons-right",
                      disabled: g.totalLag <= 0,
                      separatorBefore: true,
                      onSelect: () =>
                        setClearTarget({
                          type: "groupTopic",
                          groupId,
                          topicName: g.topic,
                          groupState,
                          totalLag: g.totalLag,
                          partitionCount: g.partitions.length,
                        }),
                    });
                  }

                  return (
                    <Fragment key={g.topic}>
                      {/* Topic summary row */}
                      <RowContextMenu items={topicContextItems}>
                        <tr
                          className="cursor-pointer hover:bg-secondary transition-colors duration-150"
                          onClick={() => toggle(g.topic)}
                        >
                          <td className="px-4 py-3 text-sm font-mono text-foreground">
                            <div className="flex items-center gap-2 min-w-0">
                              <Icon
                                name="chevron-right"
                                tone="muted"
                                className={cn(
                                  "size-4 transition-transform duration-150 shrink-0",
                                  isOpen && "rotate-90"
                                )}
                              />
                              <CopyableText
                                value={g.topic}
                                textClassName="text-foreground"
                                copyLabel="Copy Topic Name"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono tabular-nums text-foreground">
                            {g.partitions.length}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono tabular-nums">
                            <span
                              className={cn(
                                g.totalLag > 10000
                                  ? "text-semantic-red font-bold"
                                  : g.totalLag >= 1000
                                    ? "text-amber-400 font-semibold"
                                    : "text-foreground"
                              )}
                            >
                              {formatNumber(g.totalLag)}
                              {g.totalLag > 10000 && (
                                <Icon name="alert-triangle" className="size-3 inline-block ml-1" tone="danger" />
                              )}
                            </span>
                          </td>
                        </tr>
                      </RowContextMenu>

                      {/* Expanded partition detail rows */}
                      {isOpen && (
                        <tr key={`${g.topic}-detail`}>
                          <td colSpan={3} className="p-0">
                            <table className="w-full bg-secondary">
                              <thead>
                                <tr className="border-b border-border">
                                  {["Partition", "Host", "Current Offset", "End Offset", "Lag"].map((h) => (
                                    <th
                                      key={h}
                                      className="px-6 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/[0.03]">
                                {g.partitions.map((p) => {
                                  const partContextItems: RowContextMenuItem[] = isReadOnly
                                    ? []
                                    : [
                                        {
                                          label: `Clear Consumer Lag on Partition ${p.partition}`,
                                          icon: "chevrons-right",
                                          disabled: p.lag <= 0,
                                          onSelect: () =>
                                            setClearTarget({
                                              type: "groupPartition",
                                              groupId,
                                              topicName: g.topic,
                                              partition: p.partition,
                                              groupState,
                                              lag: p.lag,
                                              currentOffset: p.currentOffset,
                                              endOffset: p.endOffset,
                                            }),
                                        },
                                      ];

                                  const partRow = (
                                    <tr key={p.partition} className="hover:bg-accent/40 transition-colors">
                                      <td className="px-6 py-2 text-xs font-mono tabular-nums text-muted-foreground">
                                        {p.partition}
                                      </td>
                                      <td className="px-6 py-2 text-xs font-mono text-muted-foreground">
                                        {p.host || "—"}
                                      </td>
                                      <td className="px-6 py-2 text-xs font-mono tabular-nums text-foreground">
                                        {formatNumber(p.currentOffset)}
                                      </td>
                                      <td className="px-6 py-2 text-xs font-mono tabular-nums text-foreground">
                                        {formatNumber(p.endOffset)}
                                      </td>
                                      <td className="px-6 py-2 text-xs font-mono tabular-nums">
                                        <span
                                          className={cn(
                                            p.lag > 10000
                                              ? "text-semantic-red font-bold"
                                              : p.lag >= 1000
                                                ? "text-amber-400 font-semibold"
                                                : "text-foreground"
                                          )}
                                        >
                                          {formatNumber(p.lag)}
                                          {p.lag > 10000 && (
                                            <Icon name="alert-triangle" className="size-3 inline-block ml-1" tone="danger" />
                                          )}
                                        </span>
                                      </td>
                                    </tr>
                                  );

                                  return partContextItems.length > 0 ? (
                                    <RowContextMenu key={p.partition} items={partContextItems}>
                                      {partRow}
                                    </RowContextMenu>
                                  ) : (
                                    partRow
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ClearLagDialog
        target={clearTarget}
        onClose={() => setClearTarget(null)}
      />
    </div>
  );
}

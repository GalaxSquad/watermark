import { useState, useMemo, Fragment } from "react";
import { Icon } from "@/components/ui/icon";
import { cn, formatNumber } from "@/lib/utils";
import type { ConsumerGroupOffset } from "@/types/kafka";

interface TopicGroup {
  topic: string;
  partitions: ConsumerGroupOffset[];
  totalLag: number;
}

interface OffsetsLagTableProps {
  offsets: ConsumerGroupOffset[];
}

export function OffsetsLagTable({ offsets }: OffsetsLagTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
                  return (
                    <Fragment key={g.topic}>
                      {/* Topic summary row */}
                      <tr
                        className="cursor-pointer hover:bg-secondary transition-colors duration-150"
                        onClick={() => toggle(g.topic)}
                      >
                        <td className="px-4 py-3 text-sm font-mono text-foreground">
                          <div className="flex items-center gap-2">
                            <Icon
                              name="chevron-right"
                              tone="muted"
                              className={cn(
                                "size-4 transition-transform duration-150 shrink-0",
                                isOpen && "rotate-90"
                              )}
                            />
                            {g.topic}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono tabular-nums text-foreground">
                          {g.partitions.length}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono tabular-nums">
                          <span className={cn(g.totalLag > 0 && "text-semantic-red font-bold")}>
                            {formatNumber(g.totalLag)}
                            {g.totalLag > 0 && <Icon name="alert-triangle" className="size-3 inline-block ml-1" tone="danger" />}
                          </span>
                        </td>
                      </tr>

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
                                {g.partitions.map((p) => (
                                  <tr key={p.partition}>
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
                                      <span className={cn(p.lag > 0 && "text-semantic-red font-bold")}>
                                        {formatNumber(p.lag)}
                                        {p.lag > 0 && <Icon name="alert-triangle" className="size-3 inline-block ml-1" tone="danger" />}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
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
    </div>
  );
}

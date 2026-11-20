import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { useReadOnly } from "@/hooks/use-read-only";
import { GetConsumerGroups } from "@/lib/wails-client";
import { cn, copyToClipboard } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { CopyableText } from "@/components/shared/copyable-text";
import { RowContextMenu, type RowContextMenuItem } from "@/components/shared/row-context-menu";
import { ClearLagDialog, type ClearLagTarget } from "@/components/consumers/clear-lag-dialog";
import { globMatch } from "@/lib/glob-match";
import { useSettingsStore } from "@/store/settings";
import { useGroupLagConfig } from "@/hooks/use-group-lag-config";
import { RankingConfigPanel } from "./ranking-config-panel";

const STATE_STYLES: Record<string, string> = {
  Stable: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  Rebalancing: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  Empty: "bg-muted text-muted-foreground border-border",
  Dead: "bg-red-400/10 text-red-400 border-red-400/20",
  Unknown: "bg-muted text-muted-foreground border-border",
};

function shouldShowGroup(
  groupId: string,
  lag: number,
  config: { minLag: number; excludeGlobs: string[]; includeExact: string[] },
): boolean {
  if (lag < config.minLag) return false;
  if (config.includeExact.includes(groupId)) return true;
  for (const glob of config.excludeGlobs) {
    if (globMatch(groupId, glob)) return false;
  }
  return true;
}

/** Monitor tab — real-time consumer group lag table with auto-refresh. */
export function LagMonitorTab() {
  const navigate = useNavigate();
  const clusterId = useSettingsStore((s) => s.activeClusterId);
  const { config, updateConfig } = useGroupLagConfig(clusterId);
  const [showFilters, setShowFilters] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const [clearTarget, setClearTarget] = useState<ClearLagTarget | null>(null);
  const isReadOnly = useReadOnly();

  const { data: groups } = useKafkaQuery(
    ["consumer-groups"],
    GetConsumerGroups,
    { refetchInterval: false },
  );

  // Main ranking shows ACTIVE groups only. Empty/Dead groups carry retained
  // offset backlog that never decreases — ranking them by lag used to fill
  // the whole top 5 with identical stale numbers. Stale groups are one
  // toggle away instead of dominating the default view.
  const { activeFiltered, staleFiltered, staleCount } = useMemo(() => {
    if (!groups) return { activeFiltered: [], staleFiltered: [], staleCount: 0 };
    const active = groups
      .filter((g) => g.state !== "Empty" && g.state !== "Dead")
      .filter((g) => shouldShowGroup(g.groupId, g.totalLag, config))
      .sort((a, b) => b.totalLag - a.totalLag);
    const stale = groups
      .filter((g) => g.state === "Empty" || g.state === "Dead")
      .filter((g) => shouldShowGroup(g.groupId, g.totalLag, config))
      .sort((a, b) => b.totalLag - a.totalLag);
    return { activeFiltered: active, staleFiltered: stale, staleCount: stale.length };
  }, [groups, config]);

  const filtered = showStale ? staleFiltered : activeFiltered;

  return (
    <div className="flex flex-col gap-3 h-[256px] min-w-0">
      <div className="flex justify-between items-center text-xs shrink-0">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Icon name="activity" className="size-4" tone="success" />
          Consumer Lag Ranking
        </h2>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={showStale ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowStale((s) => !s)}
                className="h-7 text-xs gap-1.5"
              >
                <Icon name="clock" className="size-3" />
                Stale backlog{staleCount > 0 ? ` (${staleCount})` : ""}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs font-sans normal-case tracking-normal">
              {showStale
                ? "Showing retained backlog from Empty/Dead groups. Switch back to active groups."
                : "Show retained offset backlog from Empty/Dead groups instead of the active ranking."}
            </TooltipContent>
          </Tooltip>
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-7 text-xs gap-1.5", showFilters && "bg-secondary text-foreground")}
              >
                <Icon name="filter" className="size-3" />
                Filter Config
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[400px] p-0 border-border bg-[#0c0c0c]">
              <RankingConfigPanel config={config} onUpdate={updateConfig} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {!groups ? (
        <div className="glass-panel flex-1 flex items-center justify-center">
          <EmptyState
            compact
            icon="activity"
            title="No cluster connected"
            description="Connect to a cluster to view consumer group lag."
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel flex-1 flex items-center justify-center">
          <EmptyState
            compact
            icon="activity"
            title={showStale ? "No stale backlog" : "No active groups match"}
            description={
              showStale
                ? "No Empty/Dead groups match the current filters."
                : "No active consumer groups match the current filters. Inactive groups live under Stale backlog."
            }
          />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-2.5 py-2 text-center font-medium w-9">#</th>
                  <th className="px-2.5 py-2 text-left font-medium">Group ID</th>
                  <th className="px-2 py-2 text-left font-medium w-24">State</th>
                  <th className="px-2 py-2 text-right font-medium w-20">Members</th>
                  <th className="px-2.5 py-2 text-right font-medium w-28">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          Total Lag
                          <Icon name="info" tone="muted" className="size-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs font-sans normal-case tracking-normal">
                        Active group thresholds: &lt;1K normal, 1K–10K elevated (amber), &gt;10K high (red). Empty/Dead groups show retained backlog in muted gray.
                      </TooltipContent>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 5).map((g, idx) => {
                  const isInactive = g.state === "Empty" || g.state === "Dead";
                  const lagClass = isInactive
                    ? "text-muted-foreground"
                    : g.totalLag > 10000
                      ? "text-semantic-red font-semibold"
                      : g.totalLag > 1000
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
                        setClearTarget({
                          type: "group",
                          groupId: g.groupId,
                          groupState: g.state,
                          totalLag: g.totalLag,
                        }),
                    });
                  }

                  return (
                    <RowContextMenu key={g.groupId} items={contextItems}>
                      <tr
                        onClick={() =>
                          navigate({
                            to: "/consumers/$groupId",
                            params: { groupId: g.groupId },
                          })
                        }
                        className="border-b border-border cursor-pointer hover:bg-secondary transition-colors"
                      >
                        <td className="px-2.5 py-2 text-center text-muted-foreground font-mono text-xs">
                          {idx + 1}
                        </td>
                        <td className="px-2.5 py-2 min-w-0">
                          <CopyableText
                            value={g.groupId}
                            textClassName="text-foreground"
                            copyLabel="Copy Group ID"
                          />
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex px-2 py-0.5 text-xs font-medium rounded border",
                              STATE_STYLES[g.state] ?? STATE_STYLES.Unknown,
                            )}
                          >
                            {g.state}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right text-muted-foreground font-mono whitespace-nowrap">
                          {g.members}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono whitespace-nowrap">
                          <span className={lagClass}>
                            {g.totalLag.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    </RowContextMenu>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border shrink-0 bg-black/20">
            {showStale
              ? `Showing top ${Math.min(filtered.length, 5)} of ${staleCount} stale groups (retained backlog)`
              : `Showing top ${Math.min(filtered.length, 5)} of ${activeFiltered.length} active groups${staleCount > 0 ? ` · ${staleCount} stale hidden` : ""}`}
          </div>
        </div>
      )}
      <ClearLagDialog
        target={clearTarget}
        onClose={() => setClearTarget(null)}
      />
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetConsumerGroups } from "@/lib/wails-client";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

  const { data: groups } = useKafkaQuery(
    ["consumer-groups"],
    GetConsumerGroups,
    { refetchInterval: false },
  );

  const filtered = useMemo(() => {
    if (!groups) return [];
    return groups
      .filter((g) => shouldShowGroup(g.groupId, g.totalLag, config))
      .sort((a, b) => b.totalLag - a.totalLag);
  }, [groups, config]);

  return (
    <div className="flex flex-col gap-3 h-[256px]">
      <div className="flex justify-between items-center text-xs shrink-0">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Icon name="activity" className="size-4" tone="success" />
          Consumer Lag Ranking
        </h2>
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-muted-foreground hover:text-foreground rounded border border-transparent hover:border-border hover:bg-secondary transition-colors duration-150 outline-none active:scale-[0.98]",
                showFilters && "bg-secondary border-border text-foreground"
              )}
            >
              <Icon name="filter" className="size-3" />
              Filter Config
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[400px] p-0 border-border bg-[#0c0c0c]">
            <RankingConfigPanel config={config} onUpdate={updateConfig} />
          </PopoverContent>
        </Popover>
      </div>

      {!groups ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm glass-panel py-8">
          Connect to a cluster to view consumer group lag.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm glass-panel py-8">
          No consumer groups match current filters.
        </div>
      ) : (
        <div className="glass-panel overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-3 py-2 text-center font-medium w-12">#</th>
                  <th className="px-3 py-2 text-left font-medium">Group ID</th>
                  <th className="px-3 py-2 text-left font-medium">State</th>
                  <th className="px-3 py-2 text-right font-medium">Members</th>
                  <th className="px-3 py-2 text-right font-medium">Total Lag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 5).map((g, idx) => (
                  <tr
                    key={g.groupId}
                    onClick={() =>
                      navigate({
                        to: "/consumers/$groupId",
                        params: { groupId: g.groupId },
                      })
                    }
                    className="border-b border-border cursor-pointer hover:bg-secondary transition-colors"
                  >
                    <td className="px-3 py-2 text-center text-muted-foreground font-mono text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground truncate max-w-[300px]" title={g.groupId}>
                      {g.groupId}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 text-xs font-medium rounded border",
                          STATE_STYLES[g.state] ?? STATE_STYLES.Unknown,
                        )}
                      >
                        {g.state}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground font-mono">
                      {g.members}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span
                        className={cn(
                          g.totalLag > 10000
                            ? "text-semantic-red"
                            : g.totalLag > 1000
                              ? "text-amber-400"
                              : "text-foreground",
                        )}
                      >
                        {g.totalLag.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border shrink-0 bg-black/20">
            Showing top {Math.min(filtered.length, 5)} of {groups?.length ?? 0} groups
          </div>
        </div>
      )}
    </div>
  );
}

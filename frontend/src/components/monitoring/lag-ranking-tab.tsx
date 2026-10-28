import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { useRankingConfig } from "@/hooks/use-ranking-config";
import { useSettingsStore } from "@/store/settings";
import { GetAllGroupsLagDetail } from "@/lib/wails-client";
import { globMatch } from "@/lib/glob-match";
import { RankingConfigPanel } from "./ranking-config-panel";
import { CopyableText } from "@/components/shared/copyable-text";
import { cn } from "@/lib/utils";
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
import type { TopicLagSummary } from "@/types/lag-alerts";

function shouldShowTopic(
  topic: string,
  lag: number,
  config: { minLag: number; excludeGlobs: string[]; includeExact: string[] },
): boolean {
  if (lag < config.minLag) return false;
  if (config.includeExact.includes(topic)) return true;
  for (const glob of config.excludeGlobs) {
    if (globMatch(topic, glob)) return false;
  }
  return true;
}

/** Ranking tab — topic lag leaderboard with filter config. */
export function LagRankingTab() {
  const navigate = useNavigate();
  const clusterId = useSettingsStore((s) => s.activeClusterId);
  const { config, updateConfig } = useRankingConfig(clusterId);
  const [showFilters, setShowFilters] = useState(false);

  const { data: topicLags } = useKafkaQuery<TopicLagSummary[]>(
    ["all-groups-lag-detail"],
    GetAllGroupsLagDetail as () => Promise<TopicLagSummary[]>,
    { refetchInterval: false },
  );

  const filtered = useMemo(() => {
    if (!topicLags) return [];
    return topicLags
      .filter((t) => shouldShowTopic(t.topic, t.totalLag, config))
      .sort((a, b) => b.totalLag - a.totalLag);
  }, [topicLags, config]);

  return (
    <div className="flex flex-col gap-3 h-[256px] min-w-0">
      <div className="flex justify-between items-center text-xs shrink-0">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Icon name="trophy" className="size-4" tone="warning" />
          Topic Lag Ranking
        </h2>
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <button
              type="button"
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

      {!topicLags ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm glass-panel py-8">
          Connect to a cluster to view topic lag ranking.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm glass-panel py-8">
          No topics match current filters.
        </div>
      ) : (
        <div className="glass-panel flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-2.5 py-2 text-center font-medium w-9">#</th>
                  <th className="px-2.5 py-2 text-left font-medium">Topic</th>
                  <th className="px-2.5 py-2 text-right font-medium w-28">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          Total Lag
                          <Icon name="info" tone="muted" className="size-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs font-sans normal-case tracking-normal">
                        Thresholds: &lt;1K normal, 1K–10K elevated (amber), &gt;10K high (red).
                      </TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="px-2.5 py-2 text-right font-medium w-20">Groups</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 5).map((t, idx) => (
                  <tr
                    key={t.topic}
                    onClick={() =>
                      navigate({
                        to: "/topics/$topicId",
                        params: { topicId: t.topic },
                      })
                    }
                    className="border-b border-border cursor-pointer hover:bg-secondary transition-colors"
                  >
                    <td className="px-2.5 py-2 text-center text-muted-foreground font-mono text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-2.5 py-2 min-w-0">
                      <CopyableText
                        value={t.topic}
                        textClassName="text-foreground"
                        copyLabel="Copy Topic Name"
                      />
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono whitespace-nowrap">
                      <span
                        className={cn(
                          t.totalLag > 10000
                            ? "text-semantic-red font-semibold"
                            : t.totalLag > 1000
                              ? "text-amber-400 font-medium"
                              : "text-foreground",
                        )}
                      >
                        {t.totalLag.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right text-muted-foreground font-mono whitespace-nowrap">
                      {t.groups}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border shrink-0 bg-black/20">
            Showing top {Math.min(filtered.length, 5)} of {topicLags?.length ?? 0} topics
          </div>
        </div>
      )}
    </div>
  );
}

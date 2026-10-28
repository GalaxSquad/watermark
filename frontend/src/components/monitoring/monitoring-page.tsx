import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { LagMonitorTab } from "./lag-monitor-tab";
import { LagRankingTab } from "./lag-ranking-tab";
import { AlertHistoryTab } from "./alert-history-tab";
import { LagChartsTab } from "./lag-charts-tab";
import { MonitoringConfigTab } from "./monitoring-config-tab";
import { AlertRefreshControls } from "./alert-refresh-controls";
import { useAlertRefreshPrefs } from "@/hooks/use-alert-refresh-prefs";
import { useRefreshCountdown } from "@/hooks/use-refresh-countdown";
import { useSettingsStore } from "@/store/settings";
import { useLagAlertsStore } from "@/store/lag-alerts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export function MonitoringPage() {
  const { activeClusterId } = useSettingsStore();
  const { loadConfig, alerts } = useLagAlertsStore();
  const [configOpen, setConfigOpen] = useState(false);
  const prefs = useAlertRefreshPrefs();
  const { secondsLeft, refresh } = useRefreshCountdown(
    prefs.intervalMs,
    prefs.enabled,
  );

  useEffect(() => {
    if (activeClusterId) {
      loadConfig(activeClusterId);
    }
  }, [activeClusterId, loadConfig]);

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="min-h-[calc(100vh-128px)] flex flex-col">
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold uppercase tracking-wider min-w-0">
          Monitoring
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          <AlertRefreshControls
            enabled={prefs.enabled}
            intervalMs={prefs.intervalMs}
            secondsLeft={secondsLeft}
            onToggle={prefs.toggle}
            onIntervalChange={prefs.setIntervalMs}
            onRefresh={refresh}
          />

          <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label="Alert Notifications"
                    className="relative p-1.5 text-muted-foreground hover:text-foreground rounded border border-border bg-secondary hover:bg-accent transition-colors"
                  >
                    <Icon name="bell" className="size-3.5" />
                    {unreadAlertsCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-semantic-red px-1 text-[8px] font-bold text-white leading-none">
                        {unreadAlertsCount}
                      </span>
                    )}
                  </button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Alert Notifications</TooltipContent>
            </Tooltip>
            <DialogContent className="max-w-4xl bg-card border border-border p-6 flex flex-col gap-4 max-h-[85vh]">
              <DialogHeader className="border-b border-border pb-4 shrink-0 -mx-6 px-6 -mt-2">
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Icon name="bell" className="size-5" tone="muted" />
                  Alert Notifications
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 pt-2 pb-2">
                <AlertHistoryTab />
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={configOpen} onOpenChange={setConfigOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label="Monitoring Configuration"
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded border border-border bg-secondary hover:bg-accent transition-colors"
                  >
                    <Icon name="settings" className="size-3.5" />
                  </button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Monitoring Configuration</TooltipContent>
            </Tooltip>
            <DialogContent className="max-w-2xl bg-card border border-border p-6 flex flex-col gap-4 max-h-[85vh]">
              <DialogHeader className="border-b border-border pb-4 shrink-0 -mx-6 px-6 -mt-2">
                <DialogTitle className="text-lg font-bold">Monitoring Configuration</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 pt-2 pb-2">
                <MonitoringConfigTab />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="flex flex-col gap-6 h-full min-h-0">
          {/* Top Section: Split Rankings (stacks below 1280px, side-by-side with fixed table layout above 1280px) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 shrink-0 z-10">
            <LagMonitorTab />
            <LagRankingTab />
          </div>

          {/* Bottom Chart */}
          <div className="flex flex-col gap-4 flex-1 min-h-0 border-t border-border pt-6">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2 shrink-0">
              <Icon name="bar-chart" className="size-4" tone="brand" />
              Lag Visualization
            </h2>
            <LagChartsTab onOpenConfig={() => setConfigOpen(true)} />
          </div>
        </div>
      </div>
    </div>
  );
}

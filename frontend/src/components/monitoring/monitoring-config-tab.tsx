import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "@/store/settings";
import { useLagAlertsStore } from "@/store/lag-alerts";
import {
  SaveAlertConfig,
  AddRule,
  UpdateRule,
  DeleteRule,
  RestartMonitoring,
  GetConsumerGroups,
  GetCluster,
} from "@/lib/wails-client";
import type { AlertRule, ClusterAlertConfig } from "@/types/lag-alerts";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { TrackedEntitiesConfig } from "./tracked-entities-config";
import { MonitoringToggle } from "./monitoring-toggle";
import { MonitoringRuleRow } from "./monitoring-rule-row";


/** Monitoring config tab — alerts + tracked entities configuration. */
export function MonitoringConfigTab() {
  const { activeClusterId, connectionStatus } = useSettingsStore();
  const { alertConfig, loadConfig } = useLagAlertsStore();
  const [groups, setGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [clusterName, setClusterName] = useState<string>("");

  const connected = connectionStatus === "connected" && !!activeClusterId;

  useEffect(() => {
    if (!activeClusterId) return;
    loadConfig(activeClusterId);
    GetCluster(activeClusterId)
      .then((c: { name: string }) => setClusterName(c.name || activeClusterId))
      .catch(() => setClusterName(activeClusterId));
    GetConsumerGroups()
      .then((gs) => setGroups(gs.map((g: { groupId: string }) => g.groupId)))
      .catch(() => setGroups([]));
  }, [activeClusterId, loadConfig]);

  const cfg: ClusterAlertConfig = alertConfig ?? {
    enabled: false,
    pollIntervalSec: 30,
    notifyOS: false,
    notificationSound: false,
    recordingEnabled: false,
    rules: [],
    trackedTopics: [],
    trackedGroups: [],
    excludedTopics: [],
    excludedGroups: [],
  };

  const saveConfig = async (updated: ClusterAlertConfig) => {
    if (!activeClusterId) return;
    setSaving(true);
    try {
      await SaveAlertConfig(activeClusterId, updated);
      await loadConfig(activeClusterId);
      await RestartMonitoring(activeClusterId);
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (field: keyof ClusterAlertConfig) => {
    await saveConfig({ ...cfg, [field]: !cfg[field as keyof typeof cfg] });
  };

  const handleAddRule = async () => {
    if (!activeClusterId) return;
    setSaving(true);
    try {
      const rule: AlertRule = {
        id: crypto.randomUUID(),
        groupPattern: "*",
        warningLag: 1000,
        criticalLag: 5000,
        enabled: true,
      };
      await AddRule(activeClusterId, rule);
      await loadConfig(activeClusterId);
    } catch {
      toast.error("Failed to add rule");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRule = async (rule: AlertRule) => {
    if (!activeClusterId) return;
    setSaving(true);
    try {
      await UpdateRule(activeClusterId, rule);
      await loadConfig(activeClusterId);
    } catch {
      toast.error("Failed to update rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!activeClusterId) return;
    setSaving(true);
    try {
      await DeleteRule(activeClusterId, ruleId);
      await loadConfig(activeClusterId);
    } catch {
      toast.error("Failed to delete rule");
    } finally {
      setSaving(false);
    }
  };

  const handleTrackedUpdate = async (
    trackedTopics: string[],
    trackedGroups: string[],
    excludedTopics: string[],
    excludedGroups: string[],
  ) => {
    await saveConfig({ ...cfg, trackedTopics, trackedGroups, excludedTopics, excludedGroups });
  };

  if (!connected) {
    return (
      <EmptyState
        compact
        icon="activity"
        title="No cluster connected"
        description="Connect to a cluster to configure monitoring."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Monitoring for: <span className="text-primary">{clusterName}</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Fully opt-in — no polling until you enable monitoring and add rules.
        </p>
      </div>

      {/* Global toggles */}
      <div className="space-y-3">
        <MonitoringToggle
          label="Enable Monitoring"
          description="Start polling consumer group lag"
          checked={cfg.enabled}
          onChange={() => handleToggle("enabled")}
          disabled={saving}
        />
        <MonitoringToggle
          label="OS Notifications"
          description="Show system notifications on breach"
          checked={cfg.notifyOS}
          onChange={() => handleToggle("notifyOS")}
          disabled={saving}
        />
        <MonitoringToggle
          label="Notification Sound"
          description="Play sound with OS notifications"
          checked={cfg.notificationSound}
          onChange={() => handleToggle("notificationSound")}
          disabled={saving || !cfg.notifyOS}
        />
        <MonitoringToggle
          label="Record Lag for Charts"
          description="Enable time-series recording for the Charts tab"
          checked={cfg.recordingEnabled}
          onChange={() => handleToggle("recordingEnabled")}
          disabled={saving || !cfg.enabled}
        />
      </div>

      {/* Poll interval (only when monitoring enabled) */}
      {cfg.enabled && (
        <div>
          <label className="block text-xs text-muted-foreground mb-2">Poll Interval</label>
          <div className="flex gap-2">
            {[
              { label: "15s", value: 15 },
              { label: "30s", value: 30 },
              { label: "60s", value: 60 },
              { label: "120s", value: 120 },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => saveConfig({ ...cfg, pollIntervalSec: opt.value })}
                disabled={saving}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  cfg.pollIntervalSec === opt.value
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-secondary text-muted-foreground border-border hover:border-border-hover"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tracked Entities Config (only shown when recording is enabled) */}
      {cfg.recordingEnabled && (
        <TrackedEntitiesConfig
          trackedTopics={cfg.trackedTopics ?? []}
          trackedGroups={cfg.trackedGroups ?? []}
          excludedTopics={cfg.excludedTopics ?? []}
          excludedGroups={cfg.excludedGroups ?? []}
          onUpdate={handleTrackedUpdate}
          disabled={saving}
        />
      )}

      {/* Rules table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Alert Rules
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddRule}
            disabled={saving}
            className="gap-1 text-xs bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
          >
            <Icon name="plus" className="size-3" />
            Add Rule
          </Button>
        </div>

        {cfg.rules.length === 0 ? (
          <EmptyState
            compact
            icon="bell"
            title="No alert rules yet"
            description="Add a rule to start monitoring — each rule watches a group pattern and fires when lag passes its warning or critical threshold."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddRule}
                disabled={saving}
                className="gap-1 text-xs"
              >
                <Icon name="plus" className="size-3" />
                Add your first rule
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span className="w-2 shrink-0" />
              <span className="flex-1">Pattern</span>
              <span className="w-20 text-center text-yellow-400/60 flex items-center justify-center gap-1"><Icon name="alert-triangle" className="size-3" tone="warning" />Warn</span>
              <span className="w-20 text-center text-red-400/60 flex items-center justify-center gap-1"><Icon name="x" className="size-3" tone="danger" />Crit</span>
              <span className="w-6" />
            </div>
            {cfg.rules.map((rule) => (
              <MonitoringRuleRow
                key={rule.id}
                rule={rule}
                groups={groups}
                onUpdate={handleUpdateRule}
                onDelete={() => handleDeleteRule(rule.id)}
                disabled={saving}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

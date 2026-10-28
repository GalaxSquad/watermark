import { useEffect } from "react";
import { toast } from "sonner";
import { Events } from "@wailsio/runtime";
import { useLagAlertsStore } from "@/store/lag-alerts";
import type { LagAlertPayload } from "@/types/lag-alerts";

/**
 * Subscribes to "lag:alert" Wails events from the Go poll loop.
 * Must be mounted at AppShell level so alerts work on any page.
 */
export function useLagAlerts(clusterID: string | null) {
  const { addAlerts, markResolved, loadAlerts, reset } = useLagAlertsStore();

  // Load initial alerts when cluster connects
  useEffect(() => {
    if (!clusterID) {
      reset();
      return;
    }
    loadAlerts(clusterID);
  }, [clusterID, loadAlerts, reset]);

  // Subscribe to real-time lag:alert events from Go backend
  useEffect(() => {
    if (!clusterID) return;

    const off = Events.On("lag:alert", (ev) => {
      const payload = ev.data as LagAlertPayload;
      if (!payload?.alerts?.length) return;

      if (payload.type === "breach") {
        addAlerts(payload.alerts);
        // Only toast for critical alerts (warning toasts removed per validation)
        for (const alert of payload.alerts) {
          if (alert.level === "critical") {
            toast.error(`Critical lag alert: ${alert.groupId}`, {
              description: `Lag ${alert.lag.toLocaleString()} ≥ threshold ${alert.threshold.toLocaleString()}`,
              duration: 5000,
            });
          }
        }
      } else if (payload.type === "recovery") {
        markResolved(payload.alerts.map((a) => a.id));
      }
    });
    return () => {
      off();
    };
  }, [clusterID, addAlerts, markResolved]);
}

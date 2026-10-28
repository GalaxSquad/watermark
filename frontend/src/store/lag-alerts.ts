import { create } from "zustand";
import type { AlertEvent, ClusterAlertConfig } from "@/types/lag-alerts";
import {
  GetAlerts,
  GetAlertConfig,
  MarkAllRead,
  ClearAlerts,
} from "@/lib/wails-client";

const MAX_STORE_ALERTS = 50;

interface LagAlertsState {
  alerts: AlertEvent[];
  unreadCount: number;
  alertConfig: ClusterAlertConfig | null;
  configLoading: boolean;
  configLoaded: boolean;

  // Actions
  addAlerts: (incoming: AlertEvent[]) => void;
  markResolved: (alertIds: string[]) => void;
  markAllRead: (clusterID: string) => Promise<void>;
  clearAll: (clusterID: string) => Promise<void>;
  loadAlerts: (clusterID: string) => Promise<void>;
  loadConfig: (clusterID: string) => Promise<void>;
  reset: () => void;
}

export const useLagAlertsStore = create<LagAlertsState>((set) => ({
  alerts: [],
  unreadCount: 0,
  alertConfig: null,
  configLoading: false,
  configLoaded: false,

  addAlerts: (incoming) => {
    set((s) => {
      const merged = [...incoming, ...s.alerts].slice(0, MAX_STORE_ALERTS);
      const unread = merged.filter((a) => !a.read && !a.resolved).length;
      return { alerts: merged, unreadCount: unread };
    });
  },

  markResolved: (alertIds) => {
    set((s) => {
      const ids = new Set(alertIds);
      const alerts = s.alerts.map((a) =>
        ids.has(a.id) ? { ...a, resolved: true } : a
      );
      const unread = alerts.filter((a) => !a.read && !a.resolved).length;
      return { alerts, unreadCount: unread };
    });
  },

  markAllRead: async (clusterID) => {
    await MarkAllRead(clusterID);
    set((s) => {
      const alerts = s.alerts.map((a) =>
        a.clusterId === clusterID ? { ...a, read: true } : a
      );
      return { alerts, unreadCount: 0 };
    });
  },

  clearAll: async (clusterID) => {
    await ClearAlerts(clusterID);
    set((s) => {
      const alerts = s.alerts.filter((a) => a.clusterId !== clusterID);
      const unread = alerts.filter((a) => !a.read && !a.resolved).length;
      return { alerts, unreadCount: unread };
    });
  },

  loadAlerts: async (clusterID) => {
    try {
      const raw = await GetAlerts(clusterID);
      const alerts = raw as AlertEvent[];
      const unread = alerts.filter((a: AlertEvent) => !a.read && !a.resolved).length;
      set({ alerts: alerts.slice(0, MAX_STORE_ALERTS), unreadCount: unread });
    } catch {
      // ignore — cluster may not have alerts yet
    }
  },

  loadConfig: async (clusterID) => {
    set({ configLoading: true });
    try {
      const config = await GetAlertConfig(clusterID);
      set({
        alertConfig: (config as ClusterAlertConfig) ?? null,
        configLoading: false,
        configLoaded: true,
      });
    } catch {
      set({
        alertConfig: null,
        configLoading: false,
        configLoaded: true,
      });
    }
  },

  reset: () =>
    set({
      alerts: [],
      unreadCount: 0,
      alertConfig: null,
      configLoading: false,
      configLoaded: false,
    }),
}));


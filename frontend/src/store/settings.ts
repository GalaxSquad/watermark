import { create } from "zustand";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";
import type { ThemeMode, UIDensity } from "@/types/config";
import {
  Connect,
  Disconnect,
  DisconnectCluster,
  GetPooledClusters,
  IsConnected,
  GetActiveClusterID,
  SetActiveCluster,
  ConfigureSchemaRegistry,
  RestartMonitoring,
} from "@/lib/wails-client";

/** Frontend timeout (slightly longer than backend's 10s to let backend timeout trigger first) */
const CONNECTION_TIMEOUT_MS = 15_000;

/** Cache TTL — invalidate cluster cache if older than 30 minutes */
const CLUSTER_CACHE_TTL_MS = 30 * 60 * 1000;

/** Wraps a promise with a timeout — rejects if it doesn't resolve in time */
function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operation"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface SettingsState {
  /* Theme */
  theme: ThemeMode;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: ThemeMode) => void;
  setResolvedTheme: (resolved: "light" | "dark") => void;

  /* UI Density */
  density: UIDensity;
  setDensity: (density: UIDensity) => void;

  /* Active Cluster & Warm Pool */
  activeClusterId: string | null;
  pooledClusterIds: string[];
  refreshPooledClusters: () => Promise<void>;

  /* Per-cluster cache timestamps */
  clusterTimestamps: Record<string, number>;
  touchClusterTimestamp: (id: string) => void;

  /* Connection */
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  connectToCluster: (id: string) => Promise<void>;
  disconnectCluster: (targetClusterId?: string) => Promise<void>;
  initializeConnection: () => Promise<void>;

  /** Check if a cluster's cache has expired (older than CLUSTER_CACHE_TTL_MS) */
  isClusterCacheExpired: (id: string) => boolean;

  /* Settings Overlay */
  isSettingsOpen: boolean;
  toggleSettings: () => void;
  openSettings: () => void;
  closeSettings: () => void;

  /* Editor config */
  codeFont: string;
  setCodeFont: (font: string) => void;
  codeFontSize: number;
  setCodeFontSize: (size: number) => void;
}

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;

  if (resolved === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
  }

  localStorage.setItem("watermark-theme", mode);
  return resolved;
}

let systemListener: (() => void) | null = null;

function setupSystemListener() {
  cleanupSystemListener();
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    const resolved = applyTheme("system");
    useSettingsStore.setState({ resolvedTheme: resolved });
  };
  mq.addEventListener("change", handler);
  systemListener = () => mq.removeEventListener("change", handler);
}

function cleanupSystemListener() {
  if (systemListener) {
    systemListener();
    systemListener = null;
  }
}

export function initTheme() {
  const saved = (localStorage.getItem("watermark-theme") as ThemeMode) || "dark";
  const resolved = applyTheme(saved);
  if (saved === "system") setupSystemListener();
  return { saved, resolved };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: (localStorage.getItem("watermark-theme") as ThemeMode) || "dark",
  resolvedTheme: resolveTheme((localStorage.getItem("watermark-theme") as ThemeMode) || "dark"),
  setResolvedTheme: (resolved) => set({ resolvedTheme: resolved }),
  setTheme: (theme) => {
    const resolved = applyTheme(theme);
    cleanupSystemListener();
    if (theme === "system") setupSystemListener();
    set({ theme, resolvedTheme: resolved });
  },

  density: "comfortable",
  setDensity: (density) => set({ density }),

  activeClusterId: null,
  pooledClusterIds: [],

  refreshPooledClusters: async () => {
    try {
      const ids = await GetPooledClusters();
      set({ pooledClusterIds: ids ?? [] });
    } catch {
      // ignore
    }
  },

  clusterTimestamps: {},

  touchClusterTimestamp: (id: string) => {
    set((s) => ({
      clusterTimestamps: { ...s.clusterTimestamps, [id]: Date.now() },
    }));
  },

  connectionStatus: "disconnected",
  connectionError: null,

  isClusterCacheExpired: (id: string) => {
    const ts = get().clusterTimestamps[id];
    if (!ts) return true; // no timestamp = treat as expired
    return Date.now() - ts > CLUSTER_CACHE_TTL_MS;
  },

  connectToCluster: async (id: string) => {
    // Do NOT call Disconnect() when switching clusters — the backend keeps the
    // previous cluster's client warm in its pool until its Idle TTL (15m) expires.
    set({ connectionStatus: "connecting", connectionError: null, activeClusterId: id });

    try {
      await SetActiveCluster(id);
      await withTimeout(Connect(id), CONNECTION_TIMEOUT_MS, "Connection");

      // Reconfigure Schema Registry & Lag Alerting for the newly active cluster (non-blocking)
      ConfigureSchemaRegistry(id).catch(() => {});
      RestartMonitoring(id).catch(() => {});

      const pooled = await GetPooledClusters().catch(() => [id]);

      // Update timestamp on successful connection
      set((s) => ({
        connectionStatus: "connected",
        connectionError: null,
        pooledClusterIds: pooled ?? [id],
        clusterTimestamps: { ...s.clusterTimestamps, [id]: Date.now() },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ connectionStatus: "error", connectionError: message });
      throw err;
    }
  },

  disconnectCluster: async (targetClusterId?: string) => {
    const { activeClusterId } = get();
    const idToDisconnect = targetClusterId ?? activeClusterId;

    if (idToDisconnect && idToDisconnect !== activeClusterId) {
      // Explicitly disconnect a background warm cluster in the pool
      try {
        await DisconnectCluster(idToDisconnect);
      } catch {
        // ignore
      }
      await get().refreshPooledClusters();
      return;
    }

    try {
      await Disconnect();
    } catch {
      // ignore disconnect errors
    }
    const pooled = await GetPooledClusters().catch(() => []);
    set({
      connectionStatus: "disconnected",
      connectionError: null,
      activeClusterId: null,
      pooledClusterIds: pooled ?? [],
    });
  },

  initializeConnection: async () => {
    // Subscribe to backend idle-TTL auto-disconnect events
    Events.On("cluster:idle-disconnected", () => {
      get().refreshPooledClusters();
      set({ connectionStatus: "disconnected", connectionError: null });
      toast.info("Cluster disconnected after 30 minutes of inactivity");
    });

    try {
      const activeId = await GetActiveClusterID();
      if (!activeId) {
        const pooled = await GetPooledClusters().catch(() => []);
        set({ connectionStatus: "disconnected", activeClusterId: null, pooledClusterIds: pooled ?? [] });
        return;
      }

      // Check if already connected (e.g. hot reload)
      const connected = await IsConnected();
      if (connected) {
        const pooled = await GetPooledClusters().catch(() => [activeId]);
        set((s) => ({
          connectionStatus: "connected",
          activeClusterId: activeId,
          pooledClusterIds: pooled ?? [activeId],
          clusterTimestamps: { ...s.clusterTimestamps, [activeId]: Date.now() },
        }));
        return;
      }

      // Try to auto-connect to the saved active cluster
      set({ connectionStatus: "connecting", activeClusterId: activeId });
      await withTimeout(Connect(activeId), CONNECTION_TIMEOUT_MS, "Auto-connect");
      const pooled = await GetPooledClusters().catch(() => [activeId]);
      set((s) => ({
        connectionStatus: "connected",
        pooledClusterIds: pooled ?? [activeId],
        clusterTimestamps: { ...s.clusterTimestamps, [activeId]: Date.now() },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ connectionStatus: "error", connectionError: message });
    }
  },

  isSettingsOpen: false,
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  codeFont: "JetBrains Mono",
  setCodeFont: (font) => set({ codeFont: font }),
  codeFontSize: 13,
  setCodeFontSize: (size) => set({ codeFontSize: size }),
}));

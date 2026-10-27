import { useEffect } from "react";
import { Toaster } from "sonner";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { SettingsOverlay } from "@/components/settings/settings-overlay";
import { useSettingsStore } from "@/store/settings";
import { usePrefetchOnConnect } from "@/hooks/use-prefetch-on-connect";
import { useLagAlerts } from "@/hooks/use-lag-alerts";
import { GetClusters } from "@/lib/wails-client";
import { waitForWails } from "@/lib/wails-ready";

/* ====== Page imports ====== */
import { DashboardPage } from "@/pages/dashboard-page";
import { TopicsPage } from "@/pages/topics-page";
import { TopicDetailPage } from "@/pages/topic-detail-page";
import { ConsumersPage } from "@/pages/consumers-page";
import { ConsumerDetailPage } from "@/pages/consumer-detail-page";
import { SchemasPage } from "@/pages/schemas-page";
import { MonitoringPage } from "@/components/monitoring/monitoring-page";

/* ========================================================================= */
/*  Root layout — App Shell                                                  */
/* ========================================================================= */

function AppShell() {
  const { initializeConnection, openSettings, activeClusterId, resolvedTheme } = useSettingsStore();
  usePrefetchOnConnect();
  useLagAlerts(activeClusterId);

  useEffect(() => {
    // Wait for Wails runtime before touching Go bindings
    waitForWails().then(() => {
      initializeConnection();

      GetClusters().then((clusters) => {
        if (!clusters || clusters.length === 0) {
          openSettings();
        }
      }).catch(() => {});
    }).catch(() => {
      // Wails runtime never became ready — should not happen in normal use
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd+, shortcut to open settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSettings]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="w-full max-w-[1720px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      <SettingsOverlay />
      <Toaster theme={resolvedTheme} position="bottom-right" richColors />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: AppShell,
});

/* ====== Route definitions ====== */

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const topicsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/topics",
  component: TopicsPage,
});

const topicDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/topics/$topicId",
  component: TopicDetailPage,
});

const consumersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/consumers",
  component: ConsumersPage,
});

const consumerDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/consumers/$groupId",
  component: ConsumerDetailPage,
});

const schemasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schemas",
  component: SchemasPage,
});

const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/monitoring",
  component: MonitoringPage,
});

/* ====== Router tree ====== */

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  topicsRoute,
  topicDetailRoute,
  consumersRoute,
  consumerDetailRoute,
  monitoringRoute,
  schemasRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

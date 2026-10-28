import {
  DashboardMetricCards,
  BrokerTable,
  DashboardQuickInsights,
} from "@/components/dashboard/dashboard-widgets";
import { RefreshButton } from "@/components/shared/refresh-button";

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold uppercase tracking-wider min-w-0">
          Cluster Overview
        </h1>
        <div className="shrink-0">
          <RefreshButton queryKeys={[["dashboard"], ["topics"], ["consumer-groups"]]} />
        </div>
      </div>
      <DashboardMetricCards />
      <BrokerTable />
      <DashboardQuickInsights />
    </div>
  );
}

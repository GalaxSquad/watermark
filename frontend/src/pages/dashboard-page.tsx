import {
  DashboardMetricCards,
  BrokerTable,
  DashboardQuickInsights,
} from "@/components/dashboard/dashboard-widgets";
import { RefreshButton } from "@/components/shared/refresh-button";
import { PageHeader } from "@/components/shared/page-header";

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Cluster Overview"
        actions={<RefreshButton queryKeys={[["dashboard"], ["topics"], ["consumer-groups"]]} />}
      />
      <DashboardMetricCards />
      <BrokerTable />
      <DashboardQuickInsights />
    </div>
  );
}

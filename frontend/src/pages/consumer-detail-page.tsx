import { useState } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { GroupDetailHeader } from "@/components/consumers/group-detail-header";
import { ActiveMembersTable } from "@/components/consumers/active-members-table";
import { OffsetsLagTable } from "@/components/consumers/offsets-lag-table";
import { ConsumerActionDropdown } from "@/components/consumers/consumer-action-dropdown";
import { DropGroupDialog } from "@/components/consumers/drop-group-dialog";
import { RefreshButton } from "@/components/shared/refresh-button";
import { CopyableText } from "@/components/shared/copyable-text";
import { useKafkaQuery, clusterQueryKey } from "@/hooks/use-kafka-query";
import { GetConsumerGroupDetail, DeleteRule, RestartMonitoring } from "@/lib/wails-client";
import { useReadOnly } from "@/hooks/use-read-only";
import { useSettingsStore } from "@/store/settings";
import { useLagAlertsStore } from "@/store/lag-alerts";
import type { ConsumerGroupState } from "@/types/kafka";

export function ConsumerDetailPage() {
  const { groupId } = useParams({ from: "/consumers/$groupId" });
  const router = useRouter();
  const queryClient = useQueryClient();
  const isReadOnly = useReadOnly();
  const { activeClusterId } = useSettingsStore();
  const { loadConfig } = useLagAlertsStore();

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const { data: detail } = useKafkaQuery(
    ["consumer-group-detail", groupId],
    () => GetConsumerGroupDetail(groupId),
  );

  const groupState = (detail?.state ?? "Unknown") as ConsumerGroupState;
  const canDrop = groupState === "Empty" || groupState === "Dead";

  const handleDropSuccess = async (droppedId: string) => {
    let cascadeWarning: string | null = null;
    if (activeClusterId) {
      try {
        await loadConfig(activeClusterId);
        const freshConfig = useLagAlertsStore.getState().alertConfig;
        if (freshConfig) {
          const exact = freshConfig.rules.filter((r) => r.groupPattern === droppedId);
          for (const r of exact) {
            await DeleteRule(activeClusterId, r.id);
          }
          if (exact.length > 0) {
            await loadConfig(activeClusterId);
            await RestartMonitoring(activeClusterId);
          }
        }
      } catch (err) {
        cascadeWarning = err instanceof Error ? err.message : String(err);
      }
    }
    setDropTarget(null);
    toast.success(`Consumer group "${droppedId}" dropped`);
    if (cascadeWarning) {
      toast.warning(`Group dropped, but lag-alert cleanup failed: ${cascadeWarning}`);
    }
    queryClient.invalidateQueries({ queryKey: clusterQueryKey(activeClusterId, ["consumer-groups"]) });
    router.navigate({ to: "/consumers" });
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.history.back()}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Icon name="chevron-left" className="size-4" />
        Consumer Groups
      </button>
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0 flex-1">
          <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider block">
            Consumer Group
          </span>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold tracking-tight text-foreground min-w-0">
            <CopyableText
              value={groupId}
              alwaysShowCopy
              copyLabel="Copy Group ID"
            />
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshButton queryKeys={[["consumer-group-detail", groupId]]} />
          {!isReadOnly && (
            <ConsumerActionDropdown
              groupId={groupId}
              canDrop={canDrop}
              onDropGroup={() => setDropTarget(groupId)}
            />
          )}
        </div>
      </div>

      <GroupDetailHeader
        groupId={groupId}
        state={groupState}
        coordinator={detail?.coordinator ?? 0}
        totalLag={detail?.offsets.reduce((sum, o) => sum + o.lag, 0) ?? 0}
      />

      <div className="space-y-6">
        <OffsetsLagTable offsets={detail?.offsets ?? []} />
        <ActiveMembersTable members={detail?.members ?? []} />
      </div>

      <DropGroupDialog
        groupId={dropTarget}
        onClose={() => setDropTarget(null)}
        onSuccess={handleDropSuccess}
      />
    </div>
  );
}

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ClearConsumerGroupLag, ClearTopicLag } from "@/lib/wails-client";
import { clusterQueryKey } from "@/hooks/use-kafka-query";
import { useSettingsStore } from "@/store/settings";
import { formatNumber } from "@/lib/utils";
import type { ClearLagResult, ConsumerGroupState } from "@/types/kafka";

export type ClearLagTarget =
  | {
      type: "group";
      groupId: string;
      groupState?: ConsumerGroupState | string;
      totalLag: number;
    }
  | {
      type: "groupTopic";
      groupId: string;
      topicName: string;
      groupState?: ConsumerGroupState | string;
      totalLag: number;
      partitionCount?: number;
    }
  | {
      type: "groupPartition";
      groupId: string;
      topicName: string;
      partition: number;
      groupState?: ConsumerGroupState | string;
      lag: number;
      currentOffset?: number;
      endOffset?: number;
    }
  | {
      type: "topic";
      topicName: string;
      totalLag: number;
      groupCount?: number;
    };

function executeClearLag(target: ClearLagTarget): Promise<ClearLagResult[]> {
  switch (target.type) {
    case "group":
      return ClearConsumerGroupLag(target.groupId, "", -1);
    case "groupTopic":
      return ClearConsumerGroupLag(target.groupId, target.topicName, -1);
    case "groupPartition":
      return ClearConsumerGroupLag(target.groupId, target.topicName, target.partition);
    case "topic":
      return ClearTopicLag(target.topicName);
  }
}

function getDialogTitle(target: ClearLagTarget): string {
  switch (target.type) {
    case "topic":
      return `Clear ALL lag on topic "${target.topicName}"?`;
    case "group":
      return `Clear lag for consumer "${target.groupId}"?`;
    case "groupTopic":
      return `Clear consumer lag on "${target.topicName}"?`;
    case "groupPartition":
      return `Clear consumer lag on "${target.topicName}" [P${target.partition}]?`;
  }
}

function getActionButtonLabel(isPending: boolean, isTopicWide: boolean): string {
  if (isPending) {
    return "Clearing…";
  }
  return isTopicWide ? "Clear All Topic Lag" : "Clear Consumer Lag";
}

interface ClearLagDialogProps {
  target: ClearLagTarget | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ClearLagDialog({ target, onClose, onSuccess }: ClearLagDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const queryClient = useQueryClient();
  const { activeClusterId } = useSettingsStore();

  useEffect(() => {
    setConfirmed(false);
  }, [target]);

  const invalidateLagQueries = () => {
    queryClient.invalidateQueries({
      queryKey: clusterQueryKey(activeClusterId, ["consumer-groups"]),
    });
    queryClient.invalidateQueries({
      queryKey: clusterQueryKey(activeClusterId, ["all-groups-lag-detail"]),
    });
    if (target && "groupId" in target) {
      queryClient.invalidateQueries({
        queryKey: clusterQueryKey(activeClusterId, ["consumer-group-detail", target.groupId]),
      });
    }
    if (target && "topicName" in target) {
      queryClient.invalidateQueries({
        queryKey: clusterQueryKey(activeClusterId, ["topic-consumers", target.topicName]),
      });
      queryClient.invalidateQueries({
        queryKey: clusterQueryKey(activeClusterId, ["topic-partitions", target.topicName]),
      });
    }
  };

  const handleClearLag = async () => {
    if (!target) return;
    setIsPending(true);
    try {
      const results = await executeClearLag(target);

      const failed = results?.filter((r) => r.error) ?? [];
      if (failed.length > 0) {
        const seenErrors = new Set<string>();
        failed.forEach((r) => {
          const key = `${r.topic}:${r.partition}:${r.error}`;
          if (!seenErrors.has(key)) {
            seenErrors.add(key);
            toast.error(`${r.topic} [P${r.partition}]: ${r.error}`);
          }
        });
      }

      if (!results || results.length === 0) {
        toast.info("No lagging messages found to clear.");
        invalidateLagQueries();
        onSuccess?.();
        onClose();
      } else if (failed.length === 0) {
        const clearedTotal = results.reduce((sum, r) => sum + r.clearedLag, 0);
        if (target.type === "topic") {
          toast.success(
            `Cleared all lag (${formatNumber(clearedTotal)} messages) on topic "${target.topicName}"`,
          );
        } else {
          toast.success(
            `Cleared ${formatNumber(clearedTotal)} lagging message${clearedTotal === 1 ? "" : "s"} for consumer group "${target.groupId}"`,
          );
        }
        invalidateLagQueries();
        onSuccess?.();
        onClose();
      } else {
        invalidateLagQueries();
      }
    } catch (err) {
      toast.error(`Clear lag failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPending(false);
    }
  };

  if (!target) return null;

  const isTopicWide = target.type === "topic";
  const isActiveGroup =
    !isTopicWide &&
    "groupState" in target &&
    (target.groupState === "Stable" || target.groupState === "Rebalancing");

  const lagCount = target.type === "groupPartition" ? target.lag : target.totalLag;
  const title = getDialogTitle(target);

  return (
    <AlertDialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle
            className={`flex items-start gap-2 ${isTopicWide ? "text-red-400" : "text-amber-400"}`}
          >
            <Icon
              name={isTopicWide ? "alert-triangle" : "chevrons-right"}
              className="size-4 shrink-0 mt-0.5"
              tone={isTopicWide ? "danger" : "warning"}
            />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-foreground text-sm">
              {/* Scope Summary Box */}
              <div className="text-xs font-mono bg-secondary/70 border border-border rounded-lg p-3 space-y-1.5">
                {isTopicWide ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Scope:</span>
                      <span className="text-red-400 font-semibold">
                        ALL Consumer Groups ({target.groupCount ?? "all"} group{target.groupCount === 1 ? "" : "s"})
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Topic:</span>
                      <span className="text-foreground truncate">{target.topicName}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Total Lag to Clear:</span>
                      <span className="text-amber-400 font-semibold">{formatNumber(lagCount)} messages</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Scope:</span>
                      <span className="text-emerald-400 font-semibold">This Consumer Group Only</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Consumer Group:</span>
                      <span className="text-foreground truncate">{target.groupId}</span>
                    </div>
                    {"topicName" in target && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Topic:</span>
                        <span className="text-foreground truncate">
                          {target.topicName}
                          {target.type === "groupPartition" ? ` [Partition ${target.partition}]` : ""}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Lag to Clear:</span>
                      <span className="text-amber-400 font-semibold">
                        {formatNumber(lagCount)} message{lagCount === 1 ? "" : "s"}
                        {target.type === "groupPartition" &&
                        target.currentOffset !== undefined &&
                        target.endOffset !== undefined
                          ? ` (${formatNumber(target.currentOffset)} → ${formatNumber(target.endOffset)})`
                          : ""}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Detailed behavior explanation */}
              {isTopicWide ? (
                <p className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                  <Icon name="alert-triangle" className="size-4 shrink-0 mt-0.5" tone="danger" />
                  <span>
                    <strong>Topic-wide action:</strong> This will clear <strong>ALL</strong> lagging
                    messages on topic <span className="font-mono">{target.topicName}</span> across{" "}
                    <strong>every consumer group</strong> by truncating lagging records up to{" "}
                    <span className="font-mono">EndOffset</span> and advancing committed offsets.
                  </span>
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Consumer-scoped action:</strong> Clears only the{" "}
                    <strong className="text-foreground">{formatNumber(lagCount)} lagging message{lagCount === 1 ? "" : "s"}</strong>{" "}
                    on the lagging partition(s) of consumer group{" "}
                    <span className="font-mono text-foreground">{target.groupId}</span> up to{" "}
                    <span className="font-mono text-foreground">EndOffset</span>. Newly produced
                    messages after <span className="font-mono text-foreground">EndOffset</span> will
                    continue to be processed normally.
                  </p>
                  {isActiveGroup && (
                    <p className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                      <Icon name="alert-triangle" className="size-4 shrink-0 mt-0.5" tone="warning" />
                      <span>
                        Group is currently <strong>{target.groupState}</strong> (active consumers).
                        Lagging records on this consumer&apos;s lagging partition(s) will be truncated up
                        to <span className="font-mono">EndOffset</span> so active members skip them
                        immediately.
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id="clear-lag-confirm"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
          />
          <label htmlFor="clear-lag-confirm" className="text-xs text-foreground cursor-pointer select-none">
            {isTopicWide
              ? `I understand this will clear ALL lag on topic "${target.topicName}" for all consumer groups`
              : `I understand this will clear ${formatNumber(lagCount)} lagging message${lagCount === 1 ? "" : "s"} for consumer group "${target.groupId}"`}
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearLag}
            disabled={!confirmed || isPending}
            className={
              isTopicWide
                ? "bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
                : "bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
            }
          >
            {getActionButtonLabel(isPending, isTopicWide)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

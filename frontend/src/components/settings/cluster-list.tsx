import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { SettingsCard } from "./settings-card";
import { ClusterForm } from "./cluster-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GetClusters, DeleteClusterProfile, DuplicateCluster } from "@/lib/wails-client";
import { useSettingsStore } from "@/store/settings";

const COLOR_DOTS: Record<string, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  green: "bg-green-500",
  purple: "bg-primary",
};

/** Lighter shades for text readability on dark backgrounds */
const COLOR_TEXT: Record<string, string> = {
  red: "text-red-400",
  orange: "text-orange-400",
  green: "text-green-400",
  purple: "text-violet-400",
};

export function ClusterList() {
  const [editingClusterId, setEditingClusterId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const {
    activeClusterId,
    pooledClusterIds,
    connectionStatus,
    connectToCluster,
    disconnectCluster,
  } = useSettingsStore();

  /* Cluster profiles are global config — not scoped by active cluster */
  const { data: clusters = [] } = useQuery({
    queryKey: ["clusters"],
    queryFn: GetClusters,
    refetchInterval: false,
    staleTime: Infinity,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["clusters"] });

  const handleDelete = async (id: string) => {
    // Disconnect and evict from pool if active or warm
    if (id === activeClusterId || pooledClusterIds.includes(id)) {
      await disconnectCluster(id);
    }
    await DeleteClusterProfile(id);
    invalidate();
  };

  const handleDuplicate = async (id: string) => {
    await DuplicateCluster(id);
    invalidate();
  };

  const handleConnect = async (id: string) => {
    if (activeClusterId === id && connectionStatus === "connected") {
      await disconnectCluster(id);
    } else {
      await connectToCluster(id);
    }
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        icon="globe"
        title="Cluster Connections"
        action={
          <Button onClick={() => setEditingClusterId("new")} size="sm" className="gap-1.5 text-xs">
            <Icon name="plus" className="size-3" />
            Add
          </Button>
        }
      >
        {/* Empty state */}
        {clusters.length === 0 && !editingClusterId && (
          <EmptyState
            icon="power"
            title="No clusters configured"
            description="Add a Kafka cluster to get started — connect once and Watermark keeps it warm for fast switching."
            action={
              <Button onClick={() => setEditingClusterId("new")} size="sm" className="gap-1.5">
                <Icon name="plus" className="size-3.5" />
                Add Your First Cluster
              </Button>
            }
          />
        )}

        {/* Cluster profiles */}
        {clusters.map((cluster) => {
          const isActive = activeClusterId === cluster.id;
          const isConnected = isActive && connectionStatus === "connected";
          const isConnecting = isActive && connectionStatus === "connecting";
          const isWarm = !isConnected && pooledClusterIds.includes(cluster.id);

          return (
            <div
              key={cluster.id}
              className="flex items-center justify-between gap-6 px-[22px] py-3"
            >
              <div className="flex items-center gap-3">
                {/* Connection status dot */}
                <span
                  className={cn(
                    "size-2.5 rounded-full transition-colors",
                    isConnected
                      ? "bg-status-healthy animate-pulse"
                      : isConnecting
                        ? "bg-primary animate-pulse"
                        : isWarm
                          ? "bg-amber-400"
                          : "bg-muted-foreground"
                  )}
                />
                <span className={cn(
                    "text-sm font-medium",
                    COLOR_TEXT[cluster.color] ?? "text-foreground"
                  )}>{cluster.name}</span>
                {cluster.readOnly && (
                  <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 bg-secondary rounded border border-border">
                    Read-Only
                  </span>
                )}
                {isConnected && (
                  <span className="text-[10px] font-mono text-status-healthy px-1.5 py-0.5 bg-status-healthy/10 rounded border border-status-healthy/20">
                    Connected
                  </span>
                )}
                {isWarm && (
                  <span
                    title="Connection kept warm in pool — auto-closes after 15 minutes of inactivity"
                    className="text-[10px] font-mono text-amber-400 px-1.5 py-0.5 bg-amber-500/10 rounded border border-amber-500/20"
                  >
                    Warm (15m TTL)
                  </span>
                )}
                {isConnecting && (
                  <span className="text-[10px] font-mono text-primary px-1.5 py-0.5 bg-primary/10 rounded border border-primary/20">
                    Connecting...
                  </span>
                )}
                {/* Every row states its status in words, not just a dot —
                    a gray dot alone can't say "never connected" vs "failed". */}
                {!isConnected && !isConnecting && !isWarm && (
                  <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 bg-secondary rounded border border-border">
                    Disconnected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Connect/Disconnect toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleConnect(cluster.id)}
                      disabled={isConnecting}
                      aria-label={isConnected ? "Disconnect" : isWarm ? "Switch to warm connection" : "Connect"}
                      className={cn(
                        isConnected
                          ? "text-status-healthy hover:text-red-400 hover:bg-red-500/10"
                          : "text-muted-foreground hover:text-status-healthy hover:bg-status-healthy/10"
                      )}
                    >
                      <Icon name="power" className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {isConnected ? "Disconnect" : isWarm ? "Switch to warm connection" : "Connect"}
                  </TooltipContent>
                </Tooltip>
                {isWarm && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => disconnectCluster(cluster.id)}
                        aria-label="Close warm connection in pool"
                        className="text-amber-400 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Icon name="x" className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Close warm connection in pool
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setEditingClusterId(editingClusterId === cluster.id ? null : cluster.id)}
                      aria-label={editingClusterId === cluster.id ? "Close editor" : "Edit cluster"}
                      className={cn(
                        editingClusterId === cluster.id && "text-primary bg-primary/10"
                      )}
                    >
                      <Icon name="pencil" className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {editingClusterId === cluster.id ? "Close editor" : "Edit cluster"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDuplicate(cluster.id)}
                      aria-label="Duplicate cluster"
                    >
                      <Icon name="copy" className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Duplicate cluster
                  </TooltipContent>
                </Tooltip>
                {/* Destructive action stays muted until hover — red only in
                    the confirm step, never as a permanent red icon. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDelete(cluster.id)}
                      aria-label={`Delete cluster ${cluster.name}`}
                      className="text-muted-foreground hover:text-semantic-red hover:bg-semantic-red/10"
                    >
                      <Icon name="trash" className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Delete cluster
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </SettingsCard>

      {/* New cluster form */}
      {editingClusterId === "new" && (
        <ClusterForm
          clusterId="new"
          clusterName=""
          onClose={() => { setEditingClusterId(null); invalidate(); }}
        />
      )}

      {/* Edit form for existing clusters */}
      {editingClusterId && editingClusterId !== "new" && (
        <ClusterForm
          key={editingClusterId}
          clusterId={editingClusterId}
          clusterName={clusters.find((c) => c.id === editingClusterId)?.name ?? ""}
          onClose={() => { setEditingClusterId(null); invalidate(); }}
        />
      )}
    </div>
  );
}

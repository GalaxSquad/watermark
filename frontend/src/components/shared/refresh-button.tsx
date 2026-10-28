/**
 * Per-page refresh button with 10s cooldown.
 * Invalidates both the Go backend metadata cache (ClearCache)
 * and TanStack Query cache (invalidateQueries) for the given query keys.
 *
 * Query keys are automatically scoped by the active cluster ID.
 * Resets the cluster timestamp so the cache is considered fresh.
 *
 * Supports Cmd+R / Ctrl+R keyboard shortcut when mounted.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ClearCache } from "@/lib/wails-client";
import { useSettingsStore } from "@/store/settings";
import { clusterQueryKey } from "@/hooks/use-kafka-query";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const DEFAULT_COOLDOWN_MS = 10_000;

interface RefreshButtonProps {
  /** Query keys to invalidate (without cluster prefix), e.g. [["topics"], ["dashboard"]] */
  queryKeys: string[][];
  /** Cooldown duration in ms (default: 10_000) */
  cooldownMs?: number;
  /** Enable Cmd+R / Ctrl+R keyboard shortcut (default: true) */
  enableShortcut?: boolean;
  className?: string;
}

type ButtonState = "idle" | "refreshing" | "success" | "cooldown";

export function RefreshButton({
  queryKeys,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  enableShortcut = true,
  className,
}: RefreshButtonProps) {
  const queryClient = useQueryClient();
  const activeClusterId = useSettingsStore((s) => s.activeClusterId);
  const touchClusterTimestamp = useSettingsStore((s) => s.touchClusterTimestamp);
  const [state, setState] = useState<ButtonState>("idle");
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (state !== "idle") return;

    setState("refreshing");

    try {
      // Step 1: Clear Go backend cache
      await ClearCache();

      // Step 2: Invalidate TanStack Query cache for all specified keys (cluster-scoped)
      await Promise.all(
        queryKeys.map((key) =>
          queryClient.invalidateQueries({
            queryKey: clusterQueryKey(activeClusterId, key),
          })
        )
      );

      // Step 3: Reset cluster timestamp so cache is considered fresh
      if (activeClusterId) {
        touchClusterTimestamp(activeClusterId);
      }

      // Brief success flash
      setState("success");
      setTimeout(() => {
        setState("cooldown");
        const totalSeconds = Math.ceil(cooldownMs / 1000);
        setCountdown(totalSeconds);

        timerRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearTimer();
              setState("idle");
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, 600);
    } catch {
      // On error, go back to idle so user can retry
      setState("idle");
    }
  }, [state, queryKeys, queryClient, activeClusterId, touchClusterTimestamp, cooldownMs, clearTimer]);

  // Keyboard shortcut: Cmd+R / Ctrl+R
  useEffect(() => {
    if (!enableShortcut) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        handleRefresh();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enableShortcut, handleRefresh]);

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  const isDisabled = state !== "idle";
  const tooltipText =
    state === "cooldown"
      ? `Refresh available in ${countdown}s`
      : state === "refreshing"
        ? "Refreshing…"
        : enableShortcut
          ? "Refresh data (⌘R)"
          : "Refresh data";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={tooltipText}
          onClick={handleRefresh}
          disabled={isDisabled}
          className={cn(
            "relative flex items-center justify-center size-9 rounded-lg border transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-95",
            state === "idle" &&
              "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border-hover cursor-pointer",
            state === "refreshing" &&
              "border-primary/30 bg-primary/10 text-primary cursor-wait",
            state === "success" &&
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
            state === "cooldown" &&
              "border-border bg-secondary text-muted-foreground cursor-not-allowed",
            className
          )}
        >
          {state === "success" ? (
            <Icon name="check" className="size-4" />
          ) : (
            <Icon
              name="refresh"
              className={cn(
                "size-4 transition-transform",
                state === "refreshing" && "animate-spin"
              )}
            />
          )}

          {/* Countdown badge */}
          {state === "cooldown" && countdown > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-mono font-semibold text-muted-foreground bg-card border border-border rounded-full px-1">
              {countdown}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

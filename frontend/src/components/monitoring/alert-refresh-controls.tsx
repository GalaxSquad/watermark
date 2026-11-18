import { useState, useCallback, useRef, useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { REFRESH_INTERVALS } from "@/hooks/use-alert-refresh-prefs";

const MANUAL_REFRESH_COOLDOWN_SEC = 5;

interface AlertRefreshControlsProps {
  enabled: boolean;
  intervalMs: number;
  secondsLeft: number;
  onToggle: () => void;
  onIntervalChange: (ms: number) => void;
  onRefresh: () => void;
}

/** Format interval ms to human-readable label. */
function formatInterval(ms: number): string {
  return REFRESH_INTERVALS.find((i) => i.value === ms)?.label ?? `${ms / 1000}s`;
}

/**
 * Two-button refresh controls for the Monitoring page header.
 *
 * Button 1: Auto-refresh toggle with interval dropdown.
 *    - Click the play/pause icon to toggle auto-refresh on/off.
 *    - Click the interval label to open a dropdown to choose interval.
 *
 * Button 2: Manual refresh with 5s cooldown.
 */
export function AlertRefreshControls({
  enabled,
  intervalMs,
  secondsLeft,
  onToggle,
  onIntervalChange,
  onRefresh,
}: AlertRefreshControlsProps) {
  const [spinning, setSpinning] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (cooldownLeft > 0) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 600);

    // Start cooldown countdown
    setCooldownLeft(MANUAL_REFRESH_COOLDOWN_SEC);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldownLeft((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [onRefresh, cooldownLeft]);

  const isCoolingDown = cooldownLeft > 0;

  return (
    <div className="flex items-center gap-1">
      {/* Auto-refresh toggle + interval picker */}
      <div className="flex items-center rounded border border-border bg-secondary overflow-hidden">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                aria-label={enabled ? "Pause auto-refresh" : "Resume auto-refresh"}
                className={cn(
                  "h-auto rounded-none gap-1.5 px-2 py-1.5 text-xs",
                  enabled
                    ? "text-emerald-400 hover:text-emerald-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {enabled ? (
                  <Icon name="pause" className="size-3" tone="success" />
                ) : (
                  <Icon name="play" className="size-3" tone="muted" />
                )}
                {enabled && (
                  <span className="font-mono tabular-nums text-[11px] min-w-[2ch] text-right">
                    {secondsLeft}s
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {enabled
                ? `Auto-refreshing every ${formatInterval(intervalMs)}. Click to pause.`
                : "Auto-refresh paused. Click to resume."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="w-px h-4 bg-accent" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-auto rounded-none px-2 py-1.5 text-[11px] font-mono text-muted-foreground">
              {formatInterval(intervalMs)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[120px]">
            <DropdownMenuLabel>Refresh interval</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={String(intervalMs)}
              onValueChange={(v) => onIntervalChange(Number(v))}
            >
              {REFRESH_INTERVALS.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={String(opt.value)}>
                  <span className="flex items-center justify-between w-full">
                    {opt.label}
                    {opt.value === intervalMs && (
                      <Icon name="check" className="size-3 ml-2" tone="brand" />
                    )}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Manual refresh with cooldown */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleManualRefresh}
              disabled={isCoolingDown}
              aria-label="Refresh now"
            >
              {isCoolingDown ? (
                <span className="text-[10px] font-mono tabular-nums w-3.5 h-3.5 flex items-center justify-center">
                  {cooldownLeft}
                </span>
              ) : (
                <Icon
                  name="refresh"
                  className={cn(
                    "size-3.5 transition-transform",
                    spinning && "animate-spin",
                  )}
                />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isCoolingDown
              ? `Wait ${cooldownLeft}s before next refresh`
              : "Refresh now"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

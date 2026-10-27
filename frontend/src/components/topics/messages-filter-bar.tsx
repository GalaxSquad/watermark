import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { StartPosition, MessageFormat } from "@/types/kafka";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const FETCH_LIMIT_OPTIONS = [50, 100, 200, 500] as const;

interface MessagesFilterBarProps {
  startPosition: StartPosition;
  onStartPositionChange: (pos: StartPosition) => void;
  customOffset: number;
  onCustomOffsetChange: (offset: number) => void;
  fromDate: string;
  onFromDateChange: (date: string) => void;
  format: MessageFormat;
  onFormatChange: (fmt: MessageFormat) => void;
  fetchLimit: number;
  onFetchLimitChange: (limit: number) => void;
  bodyFilter: string;
  onBodyFilterChange: (filter: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
  autoRefresh: boolean;
  onAutoRefreshToggle: () => void;
  countdown: number;
  onStartLiveTail: () => void;
  messageCount: number;
  selectMode: boolean;
  onSelectModeToggle: () => void;
  selectedCount: number;
  sortDir: "asc" | "desc";
  onSortDirToggle: () => void;
}

export function MessagesFilterBar({
  startPosition,
  onStartPositionChange,
  customOffset,
  onCustomOffsetChange,
  fromDate,
  onFromDateChange,
  format,
  onFormatChange,
  fetchLimit,
  onFetchLimitChange,
  bodyFilter,
  onBodyFilterChange,
  onRefresh,
  isFetching,
  autoRefresh,
  onAutoRefreshToggle,
  countdown,
  onStartLiveTail,
  messageCount,
  selectMode,
  onSelectModeToggle,
  selectedCount,
  sortDir,
  onSortDirToggle,
}: MessagesFilterBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      {/* Left: Query filters */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Start position */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-muted-foreground">Start:</span>
          <Select value={startPosition} onValueChange={(v) => onStartPositionChange(v as StartPosition)}>
            <SelectTrigger className="h-8 w-auto px-2.5 text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Latest">Latest</SelectItem>
              <SelectItem value="Earliest">Earliest</SelectItem>
              <SelectItem value="CustomOffset">Custom Offset</SelectItem>
              <SelectItem value="FromDate">From Date</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom offset input */}
        {startPosition === "CustomOffset" && (
          <input
            type="number"
            min={0}
            value={customOffset}
            onChange={(e) => onCustomOffsetChange(Math.max(0, Number(e.target.value)))}
            placeholder="Offset"
            className="h-8 w-28 px-2.5 bg-secondary border border-border rounded-lg text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        )}

        {/* From date input */}
        {startPosition === "FromDate" && (
          <input
            type="datetime-local"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            className="h-8 px-2.5 bg-secondary border border-border rounded-lg text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        )}

        {/* Format */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-muted-foreground">Format:</span>
          <Select value={format} onValueChange={(v) => onFormatChange(v as MessageFormat)}>
            <SelectTrigger className="h-8 w-auto px-2.5 text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["Auto", "String", "JSON", "Avro", "Protobuf", "Hex"] as MessageFormat[]).map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fetch limit */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-muted-foreground">Limit:</span>
          <Select value={String(fetchLimit)} onValueChange={(v) => onFetchLimitChange(Number(v))}>
            <SelectTrigger className="h-8 w-auto px-2.5 text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FETCH_LIMIT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Body contains filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-muted-foreground">Contains:</span>
          <input
            type="text"
            value={bodyFilter}
            onChange={(e) => onBodyFilterChange(e.target.value)}
            placeholder="key or value…"
            className="h-8 w-36 px-2.5 bg-secondary border border-border rounded-lg text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Right: Actions & status */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className={cn(
            "h-8 flex items-center gap-1.5 px-3 text-xs font-medium rounded-lg border transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
            "text-foreground bg-secondary/80 border-border hover:bg-accent",
            isFetching && "opacity-60 cursor-wait text-primary bg-primary/10 border-primary/30",
          )}
        >
          <Icon name="refresh" tone={isFetching ? "brand" : "default"} className={cn("size-3.5", isFetching && "animate-spin")} />
          {isFetching ? "Fetching…" : "Refresh"}
        </button>

        {/* Sort direction toggle */}
        <button
          onClick={onSortDirToggle}
          title="Sort by time (ASC/DESC)"
          className="h-8 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] text-muted-foreground hover:text-foreground bg-secondary/80 border-border hover:bg-accent"
        >
          {sortDir === "asc" ? <Icon name="arrow-up" className="size-3.5" /> : <Icon name="arrow-down" className="size-3.5" />}
          {sortDir === "asc" ? "ASC" : "DESC"}
        </button>

        {/* Auto-refresh toggle */}
        <button
          onClick={onAutoRefreshToggle}
          className={cn(
            "h-8 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
            autoRefresh
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              : "text-muted-foreground hover:text-foreground bg-secondary/80 border-border hover:bg-accent",
          )}
        >
          {autoRefresh ? <Icon name="timer-off" className="size-3.5" tone="success" /> : <Icon name="timer" className="size-3.5" />}
          {autoRefresh ? (
            <>
              Stop
              <span className="tabular-nums font-mono text-xs opacity-80">({countdown}s)</span>
            </>
          ) : (
            "Auto (10s)"
          )}
        </button>

        {/* Select mode toggle */}
        <button
          onClick={onSelectModeToggle}
          className={cn(
            "h-8 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
            selectMode
              ? "text-primary bg-primary/10 border-primary/30"
              : "text-muted-foreground hover:text-foreground bg-secondary/80 border-border hover:bg-accent",
          )}
        >
          <Icon name="check-square" className="size-3.5" tone={selectMode ? "brand" : "muted"} />
          Select{selectedCount > 0 && ` (${selectedCount})`}
        </button>

        {/* Live Tail */}
        <button
          onClick={onStartLiveTail}
          className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium rounded-lg border transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
        >
          <Icon name="radio" className="size-3.5" tone="success" />
          Live Tail
        </button>

        {/* Message count */}
        <span className="text-xs font-mono tabular-nums text-muted-foreground pl-1 whitespace-nowrap">
          {messageCount} {messageCount === 1 ? "message" : "messages"}
        </span>
      </div>
    </div>
  );
}

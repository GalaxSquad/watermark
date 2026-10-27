import { useState, useMemo, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatLocalTimestamp } from "@/lib/utils";
import type { Message } from "@/types/kafka";
import { MessageContextMenu } from "./message-context-menu";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 250] as const;

interface MessagesTableProps {
  messages: Message[];
  selectedMessage: Message | null;
  onSelectMessage: (msg: Message) => void;
  onReplay?: (msg: Message) => void;
  inspectorOpen?: boolean;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (msg: Message) => void;
  onToggleAll?: (msgs: Message[]) => void;
  onDeleteBefore?: (msg: Message) => void;
  onDeleteBeforeTimestamp?: (msg: Message) => void;
  isLoading?: boolean;
}

export function MessagesTable({
  messages,
  selectedMessage,
  onSelectMessage,
  onReplay,
  inspectorOpen = false,
  selectMode,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onDeleteBefore,
  onDeleteBeforeTimestamp,
  isLoading = false,
}: MessagesTableProps) {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(messages.length / pageSize));

  // Reset page if it's out of bounds after data/pageSize change
  const safePage = Math.min(currentPage, totalPages - 1);
  useEffect(() => {
    if (safePage !== currentPage) setCurrentPage(safePage);
  }, [safePage, currentPage]);

  const paginatedMessages = useMemo(() => {
    const start = safePage * pageSize;
    return messages.slice(start, start + pageSize);
  }, [messages, safePage, pageSize]);

  // Keyboard navigation: ArrowUp and ArrowDown to browse messages smoothly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (paginatedMessages.length === 0) return;
        e.preventDefault();
        const currentIndex = paginatedMessages.findIndex(
          (m) => m.partition === selectedMessage?.partition && m.offset === selectedMessage?.offset
        );
        let nextIndex = 0;
        if (e.key === "ArrowDown") {
          nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, paginatedMessages.length - 1);
        } else {
          nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        }
        onSelectMessage(paginatedMessages[nextIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paginatedMessages, selectedMessage, onSelectMessage]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(0);
  };

  return (
    <div className="glass-panel overflow-hidden flex flex-col">
      {/* Table — height shrinks when inspector is open to keep it visible */}
      <div className={cn("overflow-auto min-h-[280px]", inspectorOpen ? "max-h-[30vh]" : "max-h-[50vh]")}>
        <table className="w-full">
          <thead>
            <tr className="bg-secondary">
              {selectMode && (
                <th className="px-3 py-3 w-8">
                  <Checkbox
                    checked={paginatedMessages.length > 0 && paginatedMessages.every(m => selectedIds?.has(`${m.partition}-${m.offset}`))}
                    onCheckedChange={() => onToggleAll?.(paginatedMessages)}
                    className="size-4"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">P</th>
              <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">Offset</th>
              <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">Timestamp</th>
              <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">Key</th>
              <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, rIdx) => (
                <tr key={`msg-skeleton-${rIdx}`}>
                  {selectMode && <td className="px-3 py-3 w-8"><Skeleton className="size-4" /></td>}
                  <td className="px-4 py-3"><Skeleton className="h-4 w-6" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                </tr>
              ))
            ) : paginatedMessages.length === 0 ? (
              <tr>
                <td colSpan={selectMode ? 6 : 5} className="px-4 py-12 text-center text-sm text-muted-foreground font-sans">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Icon name="layers" tone="muted" className="size-8 opacity-40" />
                    <span className="font-medium">No messages found</span>
                    <span className="text-xs text-muted-foreground/70">
                      Click Refresh to fetch latest records from the topic.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedMessages.map((msg) => {
                const msgKey = `${msg.partition}-${msg.offset}`;
                const isChecked = selectedIds?.has(msgKey) ?? false;
                return (
                  <MessageContextMenu
                    key={msgKey}
                    onReplay={onReplay ? () => onReplay(msg) : undefined}
                    onCopyValue={() => navigator.clipboard.writeText(msg.value)}
                    onCopyKey={() => navigator.clipboard.writeText(msg.key ?? "")}
                    onDeleteBefore={onDeleteBefore ? () => onDeleteBefore(msg) : undefined}
                    onDeleteBeforeTimestamp={onDeleteBeforeTimestamp ? () => onDeleteBeforeTimestamp(msg) : undefined}
                  >
                    <tr
                      onClick={() => selectMode ? onToggleSelect?.(msg) : onSelectMessage(msg)}
                      className={cn(
                        "cursor-pointer transition-colors duration-150",
                        !selectMode && selectedMessage?.partition === msg.partition && selectedMessage?.offset === msg.offset
                          ? "bg-primary/10"
                          : selectMode && isChecked
                            ? "bg-primary/5"
                            : "hover:bg-secondary"
                      )}
                    >
                      {selectMode && (
                        <td className="px-3 py-3 w-8">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => onToggleSelect?.(msg)}
                            onClick={(e) => e.stopPropagation()}
                            className="size-4"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-mono tabular-nums text-foreground">{msg.partition}</td>
                      <td className="px-4 py-3 text-sm font-mono tabular-nums text-foreground">{msg.offset}</td>
                      <td className="px-4 py-3 text-sm font-mono tabular-nums text-muted-foreground">{formatLocalTimestamp(msg.timestamp)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-semantic-purple">{msg.key}</td>
                      <td className="px-4 py-3 text-sm font-mono text-semantic-cyan truncate max-w-xs">{msg.value}</td>
                    </tr>
                  </MessageContextMenu>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-secondary/80">
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Rows</span>
          <div className="flex gap-0.5">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={cn(
                  "px-2 py-1 text-xs font-mono tabular-nums rounded transition-[color,background-color,border-color] duration-150",
                  pageSize === size
                    ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Page info + navigation */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {messages.length > 0
              ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, messages.length)} of ${messages.length}`
              : "0 messages"}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrentPage(0)}
                disabled={safePage === 0}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="First page"
              >
                <Icon name="chevrons-left" className="size-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(safePage - 1)}
                disabled={safePage === 0}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <Icon name="chevron-left" className="size-3.5" />
              </button>
              <span className="px-2 text-xs font-mono tabular-nums text-muted-foreground">
                {safePage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(safePage + 1)}
                disabled={safePage >= totalPages - 1}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next page"
              >
                <Icon name="chevron-right" className="size-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages - 1)}
                disabled={safePage >= totalPages - 1}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Last page"
              >
                <Icon name="chevrons-right" className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

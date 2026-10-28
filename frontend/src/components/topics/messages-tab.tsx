import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import type { Message, StartPosition, MessageFormat } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { useDebounce } from "@/hooks/use-debounce";
import { ConsumeMessages, ConsumeMessagesFromTimestamp, StartLiveTail, StopLiveTail } from "@/lib/wails-client";
import { Events } from "@wailsio/runtime";
import { MessagesTable } from "./messages-table";
import { MessageInspector } from "./message-inspector";
import { MessagesFilterBar } from "./messages-filter-bar";
import { ProduceMessageModal } from "./produce-message-modal";
import { DeleteRecordsDialog, type DeleteMode } from "./delete-records-dialog";
import { useReadOnly } from "@/hooks/use-read-only";
import { formatLocalTimestamp } from "@/lib/utils";

const LIVE_TAIL_MAX_MESSAGES = 500;
const AUTO_REFRESH_SECONDS = 10;

interface MessagesTabProps {
  topicName: string;
}

export function MessagesTab({ topicName }: MessagesTabProps) {
  const isReadOnly = useReadOnly();
  // --- Filter state (pending — applied only on refresh) ---
  const [startPosition, setStartPosition] = useState<StartPosition>("Latest");
  const [format, setFormat] = useState<MessageFormat>("Auto");
  const [fetchLimit, setFetchLimit] = useState(50);
  const [customOffset, setCustomOffset] = useState<number>(0);
  const [fromDate, setFromDate] = useState<string>("");
  const [bodyFilter, setBodyFilter] = useState<string>("");
  const debouncedBodyFilter = useDebounce(bodyFilter, 300);

  // --- Applied values (actually used by the query) ---
  const [appliedStart, setAppliedStart] = useState<StartPosition>("Latest");
  const [appliedLimit, setAppliedLimit] = useState(50);
  const [appliedCustomOffset, setAppliedCustomOffset] = useState<number>(0);
  const [appliedFromDate, setAppliedFromDate] = useState<string>("");

  // --- Auto-refresh ---
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Live-tail state ---
  const [liveTailActive, setLiveTailActive] = useState(false);
  const [liveTailMessages, setLiveTailMessages] = useState<Message[]>([]);

  // --- UI state ---
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [replayMessage, setReplayMessage] = useState<Message | null>(null);
  const [batchReplayMessages, setBatchReplayMessages] = useState<Message[] | null>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteMode | null>(null);

  const openSingleReplay = (msg: Message) => { setBatchReplayMessages(null); setReplayMessage(msg); };
  const openBatchReplay = (msgs: Message[]) => { setReplayMessage(null); setBatchReplayMessages(msgs); };

  // --- Delete handlers ---
  const handleDeleteBefore = (msg: Message) => {
    setDeleteMode({ type: "beforeOffset", topicName, partition: msg.partition, offset: msg.offset });
  };
  const handleDeleteBeforeTimestamp = (msg: Message) => {
    setDeleteMode({ type: "beforeTimestamp", topicName, timestampMs: new Date(msg.timestamp).getTime(), timestampLabel: formatLocalTimestamp(msg.timestamp) });
  };
  const handleDeleteBeforeDate = () => {
    setDeleteMode({ type: "beforeTimestamp", topicName, timestampMs: 0, timestampLabel: "" });
  };
  const handlePurgeTopic = () => {
    setDeleteMode({ type: "purge", topicName });
  };
  const handleDeleteSuccess = () => {
    setDeleteMode(null);
    refetch();
  };

  // --- Sort direction ---
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // --- Select mode state ---
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (msg: Message) => {
    const key = `${msg.partition}-${msg.offset}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (msgs: Message[]) => {
    const allKeys = msgs.map(m => `${m.partition}-${m.offset}`);
    const allSelected = allKeys.every(k => selectedIds.has(k));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allKeys.forEach(k => next.delete(k));
      } else {
        allKeys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const handleSelectModeToggle = () => {
    setSelectMode(prev => !prev);
    setSelectedIds(new Set());
  };

  const isFromDate = appliedStart === "FromDate" && appliedFromDate !== "";
  const startOffset =
    appliedStart === "Earliest" ? -2
    : appliedStart === "CustomOffset" ? appliedCustomOffset
    : -1; // Latest or FromDate (handled separately)

  const { data: fetchedMessages = [], refetch, isFetching } = useKafkaQuery(
    ["messages", topicName, appliedStart, String(startOffset), String(appliedLimit), appliedFromDate],
    () =>
      isFromDate
        ? ConsumeMessagesFromTimestamp(topicName, -1, new Date(appliedFromDate).getTime(), appliedLimit)
        : ConsumeMessages(topicName, -1, startOffset, appliedLimit),
    { refetchInterval: false, refetchOnWindowFocus: false, enabled: true },
  );

  // Body filter applies to browse mode only — live tail is unfiltered
  const messages = liveTailActive
    ? liveTailMessages
    : debouncedBodyFilter
      ? fetchedMessages.filter(
          (m) =>
            m.value.toLowerCase().includes(debouncedBodyFilter.toLowerCase()) ||
            m.key.toLowerCase().includes(debouncedBodyFilter.toLowerCase()),
        )
      : fetchedMessages;

  const displayedMessages = useMemo(() => {
    if (liveTailActive) return messages;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...messages].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (ta !== tb) return (ta - tb) * dir;
      if (a.partition !== b.partition) return (a.partition - b.partition) * dir;
      return (a.offset - b.offset) * dir;
    });
  }, [messages, sortDir, liveTailActive]);

  const selectedMessages = fetchedMessages.filter(m => selectedIds.has(`${m.partition}-${m.offset}`));

  // --- Refresh handler ---
  const handleRefresh = useCallback(() => {
    setAppliedStart(startPosition);
    setAppliedLimit(fetchLimit);
    setAppliedCustomOffset(customOffset);
    setAppliedFromDate(fromDate);
    setSelectedIds(new Set());
    setTimeout(() => refetch(), 0);
  }, [startPosition, fetchLimit, customOffset, fromDate, refetch]);

  // --- Auto-refresh countdown & interval management ---
  useEffect(() => {
    if (autoRefresh) {
      setCountdown(AUTO_REFRESH_SECONDS);
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            refetch();
            return AUTO_REFRESH_SECONDS;
          }
          return prev - 1;
        });
      }, 1_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, refetch]);

  // --- Live-tail event subscription ---
  useEffect(() => {
    if (!liveTailActive) return;

    const cancelMessage = Events.On("liveTail:message", (ev) => {
      const msg = ev.data as Message;
      setLiveTailMessages((prev) => {
        const next = [msg, ...prev];
        return next.length > LIVE_TAIL_MAX_MESSAGES ? next.slice(0, LIVE_TAIL_MAX_MESSAGES) : next;
      });
    });

    const cancelError = Events.On("liveTail:error", (ev) => {
      console.error("[LiveTail] error:", ev.data);
    });

    return () => {
      cancelMessage();
      cancelError();
    };
  }, [liveTailActive]);

  // --- Start live-tail ---
  const handleStartLiveTail = useCallback(async () => {
    if (autoRefresh) setAutoRefresh(false);
    if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); }
    setLiveTailMessages([]);
    setSelectedMessage(null);
    try {
      await StartLiveTail(topicName);
      setLiveTailActive(true);
    } catch (err) {
      console.error("[LiveTail] failed to start:", err);
    }
  }, [autoRefresh, topicName]);

  // --- Stop live-tail ---
  const handleStopLiveTail = useCallback(async () => {
    await StopLiveTail();
    setLiveTailActive(false);
  }, []);

  // --- Cleanup on unmount / topic change ---
  useEffect(() => {
    return () => {
      StopLiveTail().catch(() => {});
    };
  }, [topicName]);

  // Close inspector on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedMessage) {
        setSelectedMessage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMessage]);

  return (
    <div className="space-y-4">
      {/* ── Controls bar: two distinct modes ── */}
      {liveTailActive ? (
        /* ════════ LIVE TAIL MODE ════════ */
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-semibold text-emerald-400 tracking-wide">LIVE TAIL</span>
          </div>

          <div className="h-4 w-px bg-emerald-500/20" />

          <span className="text-xs font-mono text-muted-foreground">{topicName}</span>
          <span className="text-xs font-mono text-muted-foreground">· {liveTailMessages.length} messages</span>

          <div className="flex-1" />

          <button
            onClick={handleStopLiveTail}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
          >
            <Icon name="square" className="size-3" weight="fill" />
            Stop
          </button>
        </div>
      ) : (
        /* ════════ BROWSE MODE ════════ */
        <MessagesFilterBar
          startPosition={startPosition}
          onStartPositionChange={setStartPosition}
          customOffset={customOffset}
          onCustomOffsetChange={setCustomOffset}
          fromDate={fromDate}
          onFromDateChange={setFromDate}
          format={format}
          onFormatChange={setFormat}
          fetchLimit={fetchLimit}
          onFetchLimitChange={setFetchLimit}
          bodyFilter={bodyFilter}
          onBodyFilterChange={setBodyFilter}
          onRefresh={handleRefresh}
          isFetching={isFetching}
          autoRefresh={autoRefresh}
          onAutoRefreshToggle={() => setAutoRefresh(!autoRefresh)}
          countdown={countdown}
          onStartLiveTail={handleStartLiveTail}
          messageCount={messages.length}
          selectMode={selectMode}
          onSelectModeToggle={handleSelectModeToggle}
          selectedCount={selectedIds.size}
          sortDir={sortDir}
          onSortDirToggle={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
        />
      )}

      {/* Selection toolbar */}
      {!isReadOnly && selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-primary/20 bg-primary/5">
          <span className="text-sm font-mono text-primary">{selectedIds.size} selected</span>
          <button
            onClick={() => openBatchReplay(selectedMessages)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border text-primary bg-primary/10 border-primary/20 hover:bg-primary/20 transition-colors"
          >
            <Icon name="rotate-ccw" className="size-3.5" tone="brand" />
            Replay Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="x" className="size-3.5" />
            Clear
          </button>
        </div>
      )}

      <MessagesTable
        messages={displayedMessages}
        selectedMessage={selectedMessage}
        onSelectMessage={setSelectedMessage}
        onReplay={isReadOnly ? undefined : openSingleReplay}
        inspectorOpen={!!selectedMessage}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelection}
        onToggleAll={toggleSelectAll}
        onDeleteBefore={!isReadOnly && !liveTailActive ? handleDeleteBefore : undefined}
        onDeleteBeforeTimestamp={!isReadOnly && !liveTailActive ? handleDeleteBeforeTimestamp : undefined}
        isLoading={isFetching && fetchedMessages.length === 0}
      />

      {selectedMessage && (
        <MessageInspector
          value={selectedMessage.value}
          offset={selectedMessage.offset}
          format={format}
          onClose={() => setSelectedMessage(null)}
          onReplay={isReadOnly ? undefined : (() => openSingleReplay(selectedMessage!))}
        />
      )}

      <ProduceMessageModal
        isOpen={!!replayMessage || !!batchReplayMessages}
        onClose={() => { setReplayMessage(null); setBatchReplayMessages(null); }}
        topicName={topicName}
        replaySource={replayMessage ?? undefined}
        batchReplaySource={batchReplayMessages ?? undefined}
      />

      <DeleteRecordsDialog
        mode={deleteMode}
        onClose={() => setDeleteMode(null)}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}

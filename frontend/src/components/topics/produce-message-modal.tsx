import { useState, useRef, useEffect } from "react";
import { Events } from "@wailsio/runtime";
import { Icon } from "@/components/ui/icon";
import {
  CancelProduceMessageBatch,
  ProduceMessage,
  ProduceMessageBatch,
  ProduceMessages,
} from "@/lib/wails-client";
import type {
  Message,
  ProduceBatchOptions,
  ProduceBatchProgress,
  ProduceBatchSummary,
  ProduceResult,
} from "@/types/kafka";
import { BatchReplayProgress } from "./batch-replay-progress";
import { ProduceBatchProgressPanel } from "./produce-batch-progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProduceMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
  replaySource?: Message;
  batchReplaySource?: Message[];
}

type DeliveryStatus = "idle" | "sending" | "success" | "error";

interface BatchState {
  total: number;
  completed: number;
  failed: number;
  results: ProduceResult[];
}

/** Mirrors the backend maxBatchCount guard so oversized runs fail fast in the UI. */
const MAX_BATCH_COUNT = 1_000_000;

interface BatchRunState {
  phase: "idle" | "running" | "done";
  progress: ProduceBatchProgress;
  summary: ProduceBatchSummary | null;
  error: string | null;
  cancelling: boolean;
}

const IDLE_BATCH_RUN: BatchRunState = {
  phase: "idle",
  progress: { opId: "", total: 0, sent: 0, failed: 0, elapsedMs: 0, actualTps: 0 },
  summary: null,
  error: null,
  cancelling: false,
};

function parseHeaders(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error("Headers must be valid JSON");
  }
}

function parseBatchCount(raw: string): number {
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_BATCH_COUNT) : 1;
}

export function ProduceMessageModal({ isOpen, onClose, topicName, replaySource, batchReplaySource }: ProduceMessageModalProps) {
  const isBatch = !!batchReplaySource?.length;
  const isReplay = !!replaySource;

  const [form, setForm] = useState({ partition: -1, key: "", value: "", headers: "" });
  const [status, setStatus] = useState<DeliveryStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [batchState, setBatchState] = useState<BatchState>({ total: 0, completed: 0, failed: 0, results: [] });
  const [batchCountInput, setBatchCountInput] = useState("1");
  const [targetTpsInput, setTargetTpsInput] = useState("");
  const [batchRun, setBatchRun] = useState<BatchRunState>(IDLE_BATCH_RUN);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const batchRunningRef = useRef(false);
  const batchRunIdRef = useRef(0);

  // Batch send settings — count <= 1 keeps the existing single-send path intact.
  const requestedCount = parseBatchCount(batchCountInput);
  const effectiveCount = isReplay ? 1 : requestedCount;
  const parsedTargetTps = Number(targetTpsInput);
  const targetTps = Number.isFinite(parsedTargetTps) && parsedTargetTps > 0 ? parsedTargetTps : 0;
  const batchValidationError = isReplay
    ? null
    : Math.floor(Number(batchCountInput)) > MAX_BATCH_COUNT
      ? `Message count must not exceed ${MAX_BATCH_COUNT.toLocaleString()}`
      : parsedTargetTps < 0
        ? "Target TPS must be 0 or greater"
        : null;

  // Cancel in-flight work when modal closes
  useEffect(() => {
    if (!isOpen) {
      cancelledRef.current = true;
      batchRunIdRef.current += 1;
      if (batchRunningRef.current) {
        batchRunningRef.current = false;
        CancelProduceMessageBatch().catch((err) => {
          console.error("[ProduceBatch] cancel on close failed:", err);
        });
      }
    } else {
      cancelledRef.current = false;
      batchRunIdRef.current += 1;
      setBatchRun(IDLE_BATCH_RUN);
    }
  }, [isOpen]);

  // Live progress for the running batch. The state guard discards late events.
  useEffect(() => {
    if (!isOpen) return;
    const cancelProgress = Events.On("produce:batch:progress", (ev) => {
      const progress = ev.data as ProduceBatchProgress;
      setBatchRun((prev) => (prev.phase === "running" ? { ...prev, progress } : prev));
    });
    return () => cancelProgress();
  }, [isOpen]);

  // Pre-fill form for single replay
  useEffect(() => {
    if (replaySource && !isBatch) {
      setForm({
        partition: replaySource.partition,
        key: replaySource.key ?? "",
        value: replaySource.value ?? "",
        headers: replaySource.headers ? JSON.stringify(replaySource.headers) : "",
      });
      setStatus("idle");
      setStatusMessage("");
    }
  }, [replaySource, isBatch]);

  // Reset batch state when batch source changes
  useEffect(() => {
    if (isBatch) {
      setBatchState({ total: batchReplaySource!.length, completed: 0, failed: 0, results: [] });
      setStatus("idle");
    }
  }, [batchReplaySource, isBatch]);

  useEffect(() => {
    return () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); };
  }, []);

  const handleBatchProduce = async (count: number) => {
    const runId = ++batchRunIdRef.current;
    // A pending single-send timer must not clear key/value mid-batch.
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    batchRunningRef.current = true;
    setStatus("idle");
    setStatusMessage("");
    setBatchRun({
      phase: "running",
      progress: { opId: "", total: count, sent: 0, failed: 0, elapsedMs: 0, actualTps: 0 },
      summary: null,
      error: null,
      cancelling: false,
    });

    try {
      const opts: ProduceBatchOptions = {
        partition: form.partition,
        key: form.key,
        value: form.value,
        headers: parseHeaders(form.headers),
        count,
        targetTps,
      };
      const summary = await ProduceMessageBatch(topicName, opts);
      if (batchRunIdRef.current !== runId) return;
      setBatchRun((prev) => ({ ...prev, phase: "done", summary, cancelling: false }));
    } catch (err) {
      if (batchRunIdRef.current !== runId) return;
      setBatchRun((prev) => ({
        ...prev,
        phase: "done",
        cancelling: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      if (batchRunIdRef.current === runId) batchRunningRef.current = false;
    }
  };

  const handleCancelBatch = async () => {
    setBatchRun((prev) => (prev.phase === "running" ? { ...prev, cancelling: true } : prev));
    try {
      await CancelProduceMessageBatch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBatchRun((prev) =>
        prev.phase === "running" ? { ...prev, cancelling: false, error: `Cancel failed: ${message}` } : prev,
      );
    }
  };

  const handleSend = async () => {
    if (effectiveCount > 1) {
      await handleBatchProduce(effectiveCount);
      return;
    }
    if (batchRun.phase !== "idle") setBatchRun(IDLE_BATCH_RUN);
    setStatus("sending");
    setStatusMessage("");
    try {
      const headers = parseHeaders(form.headers);
      await ProduceMessage(topicName, form.partition, form.key, form.value, headers);
      setStatus("success");
      setStatusMessage(replaySource ? "Message replayed successfully!" : "Message sent successfully!");
      successTimerRef.current = setTimeout(() => {
        setStatus("idle");
        setStatusMessage("");
        if (!replaySource) setForm(prev => ({ ...prev, key: "", value: "" }));
      }, 3000);
    } catch (err) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBatchReplay = async () => {
    if (!batchReplaySource?.length) return;
    setStatus("sending");
    const total = batchReplaySource.length;
    setBatchState({ total, completed: 0, failed: 0, results: [] });

    try {
      const requests = batchReplaySource.map((msg) => ({
        partition: msg.partition,
        key: msg.key ?? "",
        value: msg.value ?? "",
        headers: msg.headers ?? {},
      }));

      const results = await ProduceMessages(topicName, requests);
      if (cancelledRef.current) return;

      const failed = results.filter((r) => !!r.error).length;
      setBatchState({ total, completed: total, failed, results });
      setStatus("success");
    } catch (err) {
      if (cancelledRef.current) return;
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const isDone = isBatch && status === "success";

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {isBatch ? "Replay Messages" : isReplay ? "Replay Message" : "Produce Message"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground font-mono">Topic: {topicName}</p>

          {/* Batch mode UI */}
          {isBatch ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                <Icon name="rotate-ccw" className="size-3.5" tone="brand" />
                <span className="text-xs font-mono text-primary">
                  Replaying {batchReplaySource!.length} messages
                </span>
              </div>
              {batchReplaySource!.length >= 10 && status === "idle" && (
                <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-400">
                  You are about to replay {batchReplaySource!.length} messages to {topicName}. Continue?
                </div>
              )}
              {(status === "sending" || status === "success") && (
                <BatchReplayProgress
                  total={batchState.total}
                  completed={batchState.completed}
                  failed={batchState.failed}
                  results={batchState.results}
                  isSending={status === "sending"}
                />
              )}
              {status === "error" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-xs font-mono">
                  <Icon name="x-circle" className="size-3.5" tone="danger" />
                  {statusMessage}
                </div>
              )}
            </div>
          ) : (
            /* Single produce/replay UI */
            <>
              {isReplay && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                  <Icon name="rotate-ccw" className="size-3.5" tone="brand" />
                  <span className="text-xs font-mono text-primary">
                    Replaying from P:{replaySource!.partition} O:{replaySource!.offset}
                  </span>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Partition (-1 for auto)</label>
                  <input type="number" value={form.partition} onChange={(e) => setForm({ ...form, partition: Number(e.target.value) })}
                    className="w-full h-9 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Key (optional)</label>
                  <input type="text" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="message-key"
                    className="w-full h-9 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Value</label>
                  <textarea value={form.value} onChange={(e) => { setForm({ ...form, value: e.target.value }); if (status === "error") { setStatus("idle"); setStatusMessage(""); } }}
                    placeholder='{"key": "value"}' rows={6}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Headers (optional, JSON)</label>
                  <input type="text" value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder='{"Content-Type": "application/json"}'
                    className="w-full h-9 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
                </div>
                {!isReplay && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="produce-batch-count" className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Message count</label>
                        <input id="produce-batch-count" type="number" min={1} step={1} value={batchCountInput}
                          onChange={(e) => setBatchCountInput(e.target.value)}
                          disabled={batchRun.phase === "running"}
                          className="w-full h-9 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50" />
                      </div>
                      <div>
                        <label htmlFor="produce-batch-tps" className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Target TPS</label>
                        <input id="produce-batch-tps" type="number" min={0} step={1} value={targetTpsInput} placeholder="0 = unthrottled"
                          onChange={(e) => setTargetTpsInput(e.target.value)}
                          disabled={batchRun.phase === "running"}
                          className="w-full h-9 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50" />
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      Count &gt; 1 sends the same message repeatedly and expands {"${VARIABLE}"} tokens per message, e.g. {"${SEQUENCE}"}.
                    </p>
                    {batchValidationError ? (
                      <p className="text-[10px] font-mono text-semantic-red">{batchValidationError}</p>
                    ) : null}
                  </div>
                )}
              </div>
              {batchRun.phase !== "idle" ? (
                <ProduceBatchProgressPanel
                  progress={batchRun.progress}
                  summary={batchRun.summary}
                  error={batchRun.error}
                  isRunning={batchRun.phase === "running"}
                  isCancelling={batchRun.cancelling}
                  onCancel={handleCancelBatch}
                />
              ) : null}
              {status !== "idle" && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono ${
                  status === "sending" ? "bg-primary/10 text-primary" :
                  status === "success" ? "bg-status-healthy/10 text-status-healthy" :
                  "bg-semantic-red/10 text-semantic-red"
                }`}>
                  {status === "sending" && <Icon name="loader" className="size-3.5 animate-spin" tone="brand" />}
                  {status === "success" && <Icon name="check-circle" className="size-3.5" tone="success" />}
                  {status === "error" && <Icon name="x-circle" className="size-3.5" tone="danger" />}
                  <span>{status === "sending" ? "Sending message..." : statusMessage}</span>
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground bg-secondary rounded-lg border border-border hover:bg-accent transition-colors">
            {isDone ? "Close" : "Cancel"}
          </button>
          {!isDone && (
            <button
              onClick={isBatch ? handleBatchReplay : handleSend}
              disabled={status === "sending" || batchRun.phase === "running" || (!isBatch && !form.value.trim()) || (!isBatch && !!batchValidationError)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
            >
              {(status === "sending" || batchRun.phase === "running") && <Icon name="loader" className="size-3.5 animate-spin" />}
              {isBatch ? "Replay All" : effectiveCount > 1 ? `Send ${effectiveCount.toLocaleString()} Messages` : isReplay ? "Replay" : "Send Message"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

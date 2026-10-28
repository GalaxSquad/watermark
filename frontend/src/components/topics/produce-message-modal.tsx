import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { ProduceMessage, ProduceMessages } from "@/lib/wails-client";
import type { Message, ProduceResult } from "@/types/kafka";
import { BatchReplayProgress } from "./batch-replay-progress";
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

export function ProduceMessageModal({ isOpen, onClose, topicName, replaySource, batchReplaySource }: ProduceMessageModalProps) {
  const isBatch = !!batchReplaySource?.length;

  const [form, setForm] = useState({ partition: -1, key: "", value: "", headers: "" });
  const [status, setStatus] = useState<DeliveryStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [batchState, setBatchState] = useState<BatchState>({ total: 0, completed: 0, failed: 0, results: [] });
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Cancel in-flight batch when modal closes
  useEffect(() => {
    if (!isOpen) cancelledRef.current = true;
    else cancelledRef.current = false;
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

  const handleSend = async () => {
    setStatus("sending");
    setStatusMessage("");
    try {
      let headers: Record<string, string> = {};
      if (form.headers.trim()) {
        try { headers = JSON.parse(form.headers); }
        catch { throw new Error("Headers must be valid JSON"); }
      }
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

  const isReplay = !!replaySource;
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
              </div>
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
              disabled={status === "sending" || (!isBatch && !form.value.trim())}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
            >
              {status === "sending" && <Icon name="loader" className="size-3.5 animate-spin" />}
              {isBatch ? "Replay All" : isReplay ? "Replay" : "Send Message"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

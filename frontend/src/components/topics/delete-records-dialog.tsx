import { useState, useEffect } from "react";
import { toast } from "sonner";
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
import { DeleteRecordsBefore, DeleteRecordsBeforeTimestamp, PurgeTopic } from "@/lib/wails-client";

export type DeleteMode =
  | { type: "beforeOffset"; topicName: string; partition: number; offset: number }
  | { type: "beforeTimestamp"; topicName: string; timestampMs: number; timestampLabel: string }
  | { type: "purge"; topicName: string };

interface DeleteRecordsDialogProps {
  mode: DeleteMode | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteRecordsDialog({ mode, onClose, onSuccess }: DeleteRecordsDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // Date picker state — used when opened from Actions dropdown (timestampMs === 0)
  const [pickedDate, setPickedDate] = useState("");

  useEffect(() => {
    setConfirmed(false);
    setPickedDate("");
  }, [mode]);

  const handleDelete = async () => {
    if (!mode) return;
    setIsPending(true);
    try {
      let results: Array<{ partition: number; newLowOffset: number; error?: string }> | null = null;

      if (mode.type === "beforeOffset") {
        results = await DeleteRecordsBefore(mode.topicName, mode.partition, mode.offset);
      } else if (mode.type === "beforeTimestamp") {
        const tsMs = mode.timestampMs === 0 ? new Date(pickedDate).getTime() : mode.timestampMs;
        if (mode.timestampMs === 0 && !isFinite(tsMs)) {
          toast.error("Invalid date — please select a valid date and time.");
          return;
        }
        results = await DeleteRecordsBeforeTimestamp(mode.topicName, tsMs);
      } else {
        results = await PurgeTopic(mode.topicName);
      }

      // Surface per-partition errors if any
      const failed = results?.filter((r) => r.error) ?? [];
      if (failed.length > 0) {
        failed.forEach((r) => toast.error(`Partition ${r.partition}: ${r.error}`));
      }

      if (!results || results.length === 0) {
        toast.info("No records matched — nothing was deleted.");
        onSuccess();
      } else if (failed.length === 0) {
        if (mode.type === "beforeOffset") {
          toast.success(`Deleted records before offset ${mode.offset} on partition ${mode.partition}`);
        } else if (mode.type === "beforeTimestamp") {
          const label = mode.timestampMs === 0 ? pickedDate : mode.timestampLabel;
          toast.success(`Deleted records before ${label} across all partitions`);
        } else {
          toast.success(`Topic "${mode.topicName}" purged`);
        }
        onSuccess();
      }
      // If failed.length > 0, do NOT call onSuccess — keep dialog open for retry
    } catch (err) {
      // Keep dialog open so user can retry — only show error toast
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPending(false);
    }
  };

  if (!mode) return null;

  const isPurge = mode.type === "purge";
  const isTimestamp = mode.type === "beforeTimestamp";
  const needsDatePicker = isTimestamp && (mode as Extract<DeleteMode, { type: "beforeTimestamp" }>).timestampMs === 0;

  const title = isPurge
    ? `Purge all messages from "${mode.topicName}"?`
    : isTimestamp
      ? needsDatePicker
        ? `Delete messages before a date in "${mode.topicName}"?`
        : `Delete messages before ${(mode as Extract<DeleteMode, { type: "beforeTimestamp" }>).timestampLabel}?`
      : `Delete messages before offset ${(mode as Extract<DeleteMode, { type: "beforeOffset" }>).offset}?`;

  const description = isPurge
    ? `This will permanently delete ALL messages from every partition of "${mode.topicName}". This cannot be undone.`
    : isTimestamp
      ? `This will permanently delete all messages before the given timestamp across ALL partitions of "${mode.topicName}". This cannot be undone.`
      : `This will permanently delete all messages before offset ${(mode as Extract<DeleteMode, { type: "beforeOffset" }>).offset} on partition ${(mode as Extract<DeleteMode, { type: "beforeOffset" }>).partition} of "${mode.topicName}". This cannot be undone.`;

  const deleteDisabled = isPending
    || (isPurge && !confirmed)
    || (needsDatePicker && !pickedDate);

  return (
    <AlertDialog open={!!mode} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-start gap-2 text-red-400">
            <Icon name="alert-triangle" className="size-4 shrink-0 mt-0.5" tone="danger" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-foreground">
            {description}
          </AlertDialogDescription>
          {(isPurge || isTimestamp) && (
            <p className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
              <Icon name="alert-triangle" className="size-3 shrink-0" tone="warning" /> This operation affects all partitions and is irreversible.
            </p>
          )}
        </AlertDialogHeader>

        {/* Date picker — shown when opened from Actions dropdown */}
        {needsDatePicker && (
          <div className="py-2">
            <label className="text-xs font-mono text-muted-foreground block mb-1">Delete all messages before:</label>
            <input
              type="datetime-local"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              className="h-8 px-2 w-full bg-secondary border border-border rounded text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        )}

        {/* Two-step confirmation for purge */}
        {isPurge && (
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="purge-confirm"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(!!v)}
            />
            <label htmlFor="purge-confirm" className="text-sm text-foreground cursor-pointer select-none">
              I understand this is irreversible
            </label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteDisabled}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

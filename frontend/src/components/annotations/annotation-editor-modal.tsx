import { useState, useEffect } from "react";
import { useAnnotations } from "@/hooks/use-annotations";
import { ServiceNameInput } from "./service-name-input";
import * as annotations from "../../../bindings/watermark-01/internal/annotations/models";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface AnnotationEditorModalProps {
  topicName: string;
  open: boolean;
  onClose: () => void;
}

export function AnnotationEditorModal({
  topicName,
  open,
  onClose,
}: AnnotationEditorModalProps) {
  const {
    annotations: allAnnotations,
    serviceNames,
    setAnnotation,
    deleteAnnotation,
  } = useAnnotations();

  const existing = allAnnotations[topicName];

  const [producers, setProducers] = useState<string[]>([]);
  const [consumers, setConsumers] = useState<string[]>([]);
  const [pendingProducer, setPendingProducer] = useState("");
  const [pendingConsumer, setPendingConsumer] = useState("");
  const [notes, setNotes] = useState("");

  // Sync form state when modal opens for a topic
  useEffect(() => {
    if (open) {
      setProducers(existing?.producers ?? []);
      setConsumers(existing?.consumers ?? []);
      setPendingProducer("");
      setPendingConsumer("");
      setNotes(existing?.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topicName]);

  const mergePending = (list: string[], pending: string): string[] => {
    const extra = pending
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (extra.length === 0) return list;
    const merged = [...list];
    for (const item of extra) {
      if (!merged.includes(item)) merged.push(item);
    }
    return merged;
  };

  const handleSave = () => {
    const finalProducers = mergePending(producers, pendingProducer);
    const finalConsumers = mergePending(consumers, pendingConsumer);
    const ann = new annotations.TopicAnnotation({
      producers: finalProducers,
      consumers: finalConsumers,
      notes: notes.trim(),
      updatedAt: "",
    });
    setAnnotation.mutate(
      { topicName, annotation: ann },
      { onSuccess: onClose }
    );
  };

  const handleDelete = () => {
    deleteAnnotation.mutate(topicName, { onSuccess: onClose });
  };

  const hasAnnotation = existing && (
    (existing.producers?.length > 0) ||
    (existing.consumers?.length > 0) ||
    existing.notes
  );

  const isSaving = setAnnotation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit Annotations:{" "}
            <span className="text-primary font-mono">{topicName}</span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Producers */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-purple-600 dark:text-purple-300 uppercase tracking-wider">
              Producers
            </label>
            <ServiceNameInput
              value={producers}
              onChange={setProducers}
              pendingInput={pendingProducer}
              onPendingInputChange={setPendingProducer}
              suggestions={serviceNames}
              placeholder="Type producer name and press Enter..."
              variant="producer"
            />
          </div>

          {/* Consumers */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-blue-600 dark:text-blue-300 uppercase tracking-wider">
              Consumers
            </label>
            <ServiceNameInput
              value={consumers}
              onChange={setConsumers}
              pendingInput={pendingConsumer}
              onPendingInputChange={setPendingConsumer}
              suggestions={serviceNames}
              placeholder="Type consumer name and press Enter..."
              variant="consumer"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional description..."
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30 transition-colors duration-150"
            />
          </div>
        </DialogBody>

        <DialogFooter className="justify-between">
          <div>
            {hasAnnotation && (
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs text-semantic-red hover:text-semantic-red/80 transition-colors"
                disabled={isSaving}
              >
                Remove Annotations
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground bg-secondary rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

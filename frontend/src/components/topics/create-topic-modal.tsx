import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { CreateTopic } from "@/lib/wails-client";
import { TemplatePickerDropdown } from "@/components/templates/template-picker-dropdown";
import type { TopicTemplate } from "@/types/templates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ---------- Kafka topic name validation ---------- */

const TOPIC_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const MAX_TOPIC_NAME_LENGTH = 249;

function validateTopicName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Topic name is required";
  if (trimmed === "." || trimmed === "..") return "Topic name cannot be '.' or '..'";
  if (trimmed.length > MAX_TOPIC_NAME_LENGTH)
    return `Topic name cannot exceed ${MAX_TOPIC_NAME_LENGTH} characters`;
  if (!TOPIC_NAME_REGEX.test(trimmed))
    return "Only letters, numbers, dots, hyphens, and underscores allowed";
  return null;
}

/* ---------- Default form values ---------- */

const DEFAULT_FORM = {
  name: "",
  partitions: 6,
  replicationFactor: 3,
  retentionMs: 604800000,
  cleanupPolicy: "delete",
};

type FormState = typeof DEFAULT_FORM;

/* ---------- Component ---------- */

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  cloneFrom?: {
    name: string;
    partitions: number;
    replicationFactor: number;
    configs: Record<string, string>;
  };
}

export function CreateTopicModal({ isOpen, onClose, cloneFrom }: CreateTopicModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() =>
    cloneFrom
      ? {
          name: "",
          partitions: cloneFrom.partitions,
          replicationFactor: cloneFrom.replicationFactor,
          retentionMs: Number(cloneFrom.configs["retention.ms"] ?? DEFAULT_FORM.retentionMs),
          cleanupPolicy: cloneFrom.configs["cleanup.policy"] ?? DEFAULT_FORM.cleanupPolicy,
        }
      : DEFAULT_FORM,
  );
  const [error, setError] = useState<string | null>(null);

  const applyTemplate = (template: TopicTemplate | null) => {
    if (!template) {
      setForm({ ...DEFAULT_FORM, name: form.name });
      return;
    }

    setForm({
      name: form.name,
      partitions: template.partitions,
      replicationFactor: template.replicationFactor,
      retentionMs: Number(template.configs["retention.ms"] ?? DEFAULT_FORM.retentionMs),
      cleanupPolicy: template.configs["cleanup.policy"] ?? DEFAULT_FORM.cleanupPolicy,
    });
  };

  const handleClose = () => {
    setForm({ ...DEFAULT_FORM });
    setError(null);
    onClose();
  };

  const buildConfigs = (): Record<string, string> => {
    const base = cloneFrom?.configs ?? {};
    return {
      ...base,
      "retention.ms": String(form.retentionMs),
      "cleanup.policy": form.cleanupPolicy,
    };
  };

  const mutation = useMutation({
    mutationFn: () =>
      CreateTopic(form.name.trim(), form.partitions, form.replicationFactor, buildConfigs()),
    onSuccess: () => {
      toast.success(`Topic "${form.name.trim()}" created successfully`);
      queryClient.invalidateQueries({ queryKey: ["topics"] });
      handleClose();
    },
    onError: (err: Error) => {
      toast.error(`Failed to create topic: ${err.message}`);
    },
  });

  const handleSubmit = () => {
    const validationError = validateTopicName(form.name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    mutation.mutate();
  };

  const retentionLabel = `(${Math.round(form.retentionMs / 86400000)}d)`;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && !mutation.isPending && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg min-w-0">
            {cloneFrom ? (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>Clone from</span>
                <span
                  className="truncate text-sm font-mono font-normal text-muted-foreground"
                  title={cloneFrom.name}
                >
                  {cloneFrom.name}
                </span>
              </span>
            ) : (
              "Create New Topic"
            )}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Template Picker */}
          <TemplatePickerDropdown
            topicName={form.name}
            onTemplateSelect={applyTemplate}
          />

          {/* Topic Name */}
          <div>
            <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
              Topic Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (error) setError(null);
              }}
              placeholder="my.new.topic"
              className={`w-full h-9 px-3 bg-secondary border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 ${
                error ? "border-semantic-red/50" : "border-border"
              }`}
            />
            {error && (
              <p className="text-xs text-semantic-red mt-1">{error}</p>
            )}
          </div>

          {/* Partitions + Replication Factor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
                Partitions
              </label>
              <Select value={String(form.partitions)} onValueChange={(v) => setForm({ ...form, partitions: Number(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 3, 6, 12, 24, 48].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
                Replication Factor
              </label>
              <Select value={String(form.replicationFactor)} onValueChange={(v) => setForm({ ...form, replicationFactor: Number(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Retention */}
          <div>
            <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
              Retention (ms) {retentionLabel}
            </label>
            <input
              type="number"
              value={form.retentionMs}
              onChange={(e) => setForm({ ...form, retentionMs: Number(e.target.value) })}
              className="w-full h-9 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Cleanup Policy */}
          <div>
            <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
              Cleanup Policy
            </label>
            <Select value={form.cleanupPolicy} onValueChange={(v) => setForm({ ...form, cleanupPolicy: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="delete">delete</SelectItem>
                <SelectItem value="compact">compact</SelectItem>
                <SelectItem value="compact,delete">compact,delete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="gap-2"
          >
            {mutation.isPending && <Icon name="loader" className="size-3.5 animate-spin" />}
            {mutation.isPending ? "Creating..." : "Create Topic"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

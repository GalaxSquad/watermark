import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { ProduceBatchSummary } from "@/types/kafka";

/** Backend caps error samples at 10; the modal surfaces the first 5. */
const ERROR_SAMPLE_LIMIT = 5;

/** Fields shared by the live progress event and the authoritative summary. */
interface BatchCounters {
  total: number;
  sent: number;
  failed: number;
  elapsedMs: number;
  actualTps: number;
}

export interface ProduceBatchProgressPanelProps {
  /** Latest live counters, or the starting counters before the first event. */
  progress: BatchCounters;
  /** Authoritative result, present once the run finishes. */
  summary: ProduceBatchSummary | null;
  /** Failure of the ProduceMessageBatch call itself (transport or validation). */
  error: string | null;
  isRunning: boolean;
  isCancelling: boolean;
  onCancel: () => void;
}

function formatElapsed(ms: number): string {
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(2)} s` : `${ms} ms`;
}

function statusOf(
  counters: BatchCounters,
  cancelled: boolean,
  error: string | null,
  isRunning: boolean,
  isCancelling: boolean,
): { label: string; className: string } {
  if (isCancelling) return { label: "Cancelling...", className: "text-primary" };
  if (isRunning) return { label: "Sending batch...", className: "text-primary" };
  if (error) return { label: "Batch failed", className: "text-semantic-red" };
  if (cancelled) return { label: "Cancelled", className: "text-amber-400" };
  if (counters.failed > 0) return { label: "Done with failures", className: "text-semantic-red" };
  return { label: "Done", className: "text-status-healthy" };
}

export function ProduceBatchProgressPanel({
  progress,
  summary,
  error,
  isRunning,
  isCancelling,
  onCancel,
}: ProduceBatchProgressPanelProps) {
  const counters = summary ?? progress;
  const completed = Math.min(counters.total, counters.sent + counters.failed);
  const percent = counters.total > 0 ? Math.round((completed / counters.total) * 100) : 0;
  const cancelled = summary?.cancelled ?? false;
  const errors = summary?.errors ?? [];
  const errorSamples = errors.slice(0, ERROR_SAMPLE_LIMIT);
  const unknownVariables = summary?.unknownVariables ?? [];
  const status = statusOf(counters, cancelled, error, isRunning, isCancelling);
  const showStats = !isRunning || completed > 0;

  return (
    <div className="space-y-3">
      {/* Progress bar — role="progressbar" + aria-valuenow/min/max via Radix */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs font-mono">
          <span className={`flex items-center gap-1.5 ${status.className}`}>
            {isRunning ? <Icon name="loader" className="size-3.5 animate-spin" tone="brand" /> : null}
            {status.label}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {completed}/{counters.total}
            </span>
            {isRunning ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onCancel}
                disabled={isCancelling}
                className="gap-1 font-mono text-xs"
              >
                <Icon name="x-circle" className="size-3" tone="danger" />
                {isCancelling ? "Cancelling..." : "Cancel batch"}
              </Button>
            ) : null}
          </div>
        </div>
        <Progress value={percent} className="h-1.5" />
      </div>

      {/* Counters — live while running, authoritative once the summary lands */}
      {showStats ? (
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1 text-status-healthy">
            <Icon name="check-circle" className="size-3.5" tone="success" />
            {counters.sent} sent
          </span>
          {counters.failed > 0 ? (
            <span className="flex items-center gap-1 text-semantic-red">
              <Icon name="x-circle" className="size-3.5" tone="danger" />
              {counters.failed} failed
            </span>
          ) : null}
          {counters.elapsedMs > 0 ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon name="clock" className="size-3.5" tone="muted" />
              {formatElapsed(counters.elapsedMs)}
            </span>
          ) : null}
          {counters.actualTps > 0 ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon name="zap" className="size-3.5" tone="muted" />
              {counters.actualTps.toFixed(1)} msg/s
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Unknown ${TOKENS} sent literally — a warning, never a blocker */}
      {unknownVariables.length > 0 ? (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-400">
          <Icon name="alert-triangle" className="size-3.5 mt-0.5 shrink-0" tone="warning" />
          <span className="break-all">
            Unknown variables sent literally:{" "}
            <span className="text-foreground">{unknownVariables.join(" ")}</span>
          </span>
        </div>
      ) : null}

      {/* Error samples — aria-expanded + aria-controls via Radix Collapsible */}
      {errorSamples.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="chevron-down" className="size-3.5 transition-transform data-[state=open]:rotate-180" />
            Show error samples ({errorSamples.length}
            {errors.length > errorSamples.length ? ` of ${errors.length}` : ""})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {errorSamples.map((sample) => (
                <div
                  key={sample.index}
                  className="text-xs font-mono text-semantic-red px-2 py-1 bg-semantic-red/5 rounded break-all"
                >
                  #{sample.index}: {sample.error}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-semantic-red/10 text-semantic-red text-xs font-mono">
          <Icon name="x-circle" className="size-3.5" tone="danger" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

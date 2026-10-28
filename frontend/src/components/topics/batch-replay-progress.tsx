import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { ProduceResult } from "@/types/kafka";

interface BatchReplayProgressProps {
  total: number;
  completed: number;
  failed: number;
  results: ProduceResult[];
  isSending: boolean;
}

export function BatchReplayProgress({ total, completed, failed, results, isSending }: BatchReplayProgressProps) {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const succeeded = completed - failed;
  const hasFailures = results.some(r => r.error);

  return (
    <div className="space-y-3">
      {/* Progress bar — role="progressbar" + aria-valuenow/min/max via Radix */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono text-muted-foreground">
          <span>{isSending ? "Replaying..." : completed === total ? "Done" : "Ready"}</span>
          <span>{completed}/{total}</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Summary */}
      {completed > 0 && (
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1 text-status-healthy">
            <Icon name="check-circle" className="size-3.5" tone="success" />
            {succeeded} sent
          </span>
          {failed > 0 && (
            <span className="flex items-center gap-1 text-semantic-red">
              <Icon name="x-circle" className="size-3.5" tone="danger" />
              {failed} failed
            </span>
          )}
          {isSending && <Icon name="loader" className="size-3.5 animate-spin" tone="brand" />}
        </div>
      )}

      {/* Expandable failures — aria-expanded + aria-controls via Radix Collapsible */}
      {hasFailures && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="chevron-down" className="size-3.5 transition-transform data-[state=open]:rotate-180" />
            Show failures
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {results.filter(r => r.error).map(r => (
                <div key={r.index} className="text-xs font-mono text-semantic-red px-2 py-1 bg-semantic-red/5 rounded">
                  #{r.index}: {r.error}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

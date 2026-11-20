import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useDensity } from "@/hooks/use-density";
import { cn } from "@/lib/utils";
import type { TopicAnnotation } from "@/types/annotations";
import { OwnershipBadges } from "./ownership-badges";

interface AnnotationSummaryTableProps {
  annotations: Record<string, TopicAnnotation>;
  onEdit?: (topicName: string) => void;
  onRemove?: (topicName: string) => void;
}

export function AnnotationSummaryTable({
  annotations,
  onEdit,
  onRemove,
}: AnnotationSummaryTableProps) {
  const { rowHeight, cellPadding } = useDensity();
  const entries = Object.entries(annotations).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left text-muted-foreground uppercase tracking-wider text-[10px]">
            <th className={cn("px-3", cellPadding)}>Topic</th>
            <th className={cn("px-3", cellPadding)}>Producers</th>
            <th className={cn("px-3", cellPadding)}>Consumers</th>
            <th className={cn("px-3 text-right w-20", cellPadding)}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([topic, ann]) => (
            <tr
              key={topic}
              style={{ height: rowHeight }}
              className="border-t border-border hover:bg-secondary transition-colors"
            >
              <td className={cn("px-3 font-mono text-foreground truncate max-w-[200px]", cellPadding)}>
                {topic}
              </td>
              <td className={cn("px-3", cellPadding)}>
                <OwnershipBadges
                  producers={ann.producers ?? []}
                  consumers={[]}
                  maxVisible={3}
                />
              </td>
              <td className={cn("px-3", cellPadding)}>
                <OwnershipBadges
                  producers={[]}
                  consumers={ann.consumers ?? []}
                  maxVisible={3}
                />
              </td>
              <td className={cn("px-3 text-right", cellPadding)}>
                <div className="flex items-center justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onEdit?.(topic)}
                        aria-label={`Edit annotation for ${topic}`}
                      >
                        <Icon name="pencil" className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Edit annotation
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRemove?.(topic)}
                        aria-label={`Remove annotation for ${topic}`}
                        className="text-muted-foreground hover:text-semantic-red hover:bg-semantic-red/10"
                      >
                        <Icon name="trash" className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Remove annotation
                    </TooltipContent>
                  </Tooltip>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

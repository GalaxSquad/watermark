import type { SchemaVersion } from "@/types/kafka";
import { useKafkaQuery } from "@/hooks/use-kafka-query";
import { GetSchemaVersions } from "@/lib/wails-client";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/empty-state";
import { useDensity } from "@/hooks/use-density";
import { cn } from "@/lib/utils";

interface VersionHistoryProps {
  subjectName: string;
}

export function VersionHistory({ subjectName }: VersionHistoryProps) {
  const { data: versions = [] } = useKafkaQuery(
    ["schema-versions", subjectName],
    () => GetSchemaVersions(subjectName),
    { refetchInterval: 30_000 },
  );
  const { rowHeight, cellPadding } = useDensity();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">
          Version History
        </h4>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button variant="outline" size="sm" disabled className="text-xs">
                Compare Versions
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Coming soon
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="glass-panel overflow-hidden">
        {versions.length === 0 ? (
          <EmptyState
            compact
            icon="file-code"
            title="No versions found"
            description="This subject has no registered schema versions yet."
          />
        ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-secondary">
              <th className={cn("px-4 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider tabular-nums", cellPadding)}>Version</th>
              <th className={cn("px-4 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider tabular-nums", cellPadding)}>Schema ID</th>
              <th className={cn("px-4 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider", cellPadding)}>Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {versions.map((v) => (
              <tr key={v.version} style={{ height: rowHeight }} className="hover:bg-secondary transition-colors">
                <td className={cn("px-4 text-sm font-mono text-primary text-right tabular-nums", cellPadding)}>v{v.version}</td>
                <td className={cn("px-4 text-sm font-mono text-muted-foreground text-right tabular-nums", cellPadding)}>{v.id}</td>
                <td className={cn("px-4 text-sm text-foreground", cellPadding)}>{v.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/lib/icon-map";
import type { Tone } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: IconName;
  tone?: Tone;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon,
  tone = "brand",
  trend,
  className,
}: MetricCardProps) {
  return (
    <div className={cn("glass-panel p-5", className)}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div
          className={cn(
            "flex items-center justify-center size-9 rounded-lg",
            "bg-primary/10"
          )}
        >
          <Icon name={icon} tone={tone} className="size-4" />
        </div>
      </div>
      <div className="font-mono text-2xl font-bold text-foreground tabular-nums">{value}</div>
      {trend && (
        <div
          className={cn(
            "mt-1 text-xs font-medium",
            trend.positive ? "text-status-healthy" : "text-semantic-red"
          )}
        >
          {trend.positive ? "↑" : "↓"} {trend.value}
        </div>
      )}
    </div>
  );
}

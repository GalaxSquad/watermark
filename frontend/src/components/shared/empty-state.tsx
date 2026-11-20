import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/lib/icon-map";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Phosphor icon name from the app icon map */
  icon: IconName;
  /** One-line headline — what is empty */
  title: string;
  /** 1–2 sentences: what this thing is for + where to start */
  description?: ReactNode;
  /** Optional call-to-action (usually a Button) */
  action?: ReactNode;
  /** Tighter vertical padding for embedded lists (inside tables/panels) */
  compact?: boolean;
  className?: string;
}

/**
 * Shared empty state — every "nothing here yet" screen follows the same
 * shape: icon in a tinted tile, a headline, a sentence that explains what
 * the thing is for and where to start, and (when there is a next step) one
 * action. See DESIGN.md §4.
 *
 * When used inside a <table>, render it inside a <td colSpan={n}>.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-4",
        compact ? "py-8 px-4" : "py-12 px-6",
        className
      )}
    >
      <div className="size-12 rounded-xl bg-secondary border border-border flex items-center justify-center">
        <Icon name={icon} tone="muted" className="size-6" />
      </div>
      <div className="space-y-1.5 max-w-md">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <div className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

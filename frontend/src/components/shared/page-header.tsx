import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Page title — rendered mono, uppercase, per the app-wide convention */
  title: string;
  /** Right-side actions (refresh button, primary CTA, …) */
  actions?: ReactNode;
  /** Optional sub-line under the title */
  description?: ReactNode;
  className?: string;
}

/**
 * Shared page header — every top-level page uses the same mono uppercase
 * title with an actions slot on the right. See DESIGN.md §3.
 */
export function PageHeader({ title, actions, description, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold uppercase tracking-wider min-w-0">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

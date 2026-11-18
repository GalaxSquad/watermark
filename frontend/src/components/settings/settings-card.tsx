import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { type IconName } from "@/lib/icon-map";
import { cn } from "@/lib/utils";

interface SettingsCardProps {
  icon: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsCard({
  icon,
  title,
  description,
  action,
  children,
  className,
}: SettingsCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card",
        className
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/60 px-[22px] pb-4 pt-[18px]">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.13]">
          <Icon name={icon} tone="brand" className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex h-8 items-center font-mono text-xs font-bold uppercase tracking-wider text-foreground">
            {title}
          </h3>
          {description != null && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action != null && <div className="shrink-0">{action}</div>}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsRow({ label, description, children, className }: SettingsRowProps) {
  if (label == null) {
    return <div className={cn("block px-[22px] py-3", className)}>{children}</div>;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 px-[22px] py-3",
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description != null && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

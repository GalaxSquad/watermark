import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/lib/icon-map";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: IconName;
  count?: number;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: "horizontal" | "vertical";
  className?: string;
}

export function TabNavigation({
  tabs,
  activeTab,
  onTabChange,
  variant = "horizontal",
  className,
}: TabNavigationProps) {
  if (variant === "vertical") {
    return (
      <nav className={cn("flex flex-col gap-1", className)}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg text-left transition-colors",
              activeTab === tab.id
                ? "bg-primary/10 text-primary border-l-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {tab.icon && <Icon name={tab.icon} className="size-3.5 shrink-0" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-xs text-muted-foreground font-mono">({tab.count})</span>
            )}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className={cn("flex items-center gap-1 border-b border-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.98]",
            activeTab === tab.id
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.icon && <Icon name={tab.icon} className="size-3.5 shrink-0" />}
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1 text-xs text-muted-foreground font-mono tabular-nums">({tab.count})</span>
          )}
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t shadow-[0_0_8px_rgba(139,92,246,0.5)] transition-[opacity,transform] duration-200 ease-out" />
          )}
        </button>
      ))}
    </nav>
  );
}


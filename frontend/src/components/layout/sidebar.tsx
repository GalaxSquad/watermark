import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import logoImg from "@/assets/logo.svg";
import { cn } from "@/lib/utils";
import { GetCurrentVersion } from "@/lib/wails-client";
import { UpdateBanner } from "./update-banner";
import { useLagAlertsStore } from "@/store/lag-alerts";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/lib/icon-map";

interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: "bar-chart", path: "/" },
  { id: "topics", label: "Topics", icon: "layers", path: "/topics" },
  { id: "consumers", label: "Consumers", icon: "users", path: "/consumers" },
  { id: "monitoring", label: "Monitoring", icon: "alert-triangle", path: "/monitoring" },
  { id: "schemas", label: "Schemas", icon: "file-code", path: "/schemas" },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { unreadCount, alerts } = useLagAlertsStore();
  const hasCritical = alerts.some(
    (a) => !a.resolved && !a.read && a.level === "critical",
  );

  // Fetch real version from Go backend (never changes during runtime)
  const { data: version = "dev" } = useQuery({
    queryKey: ["app-version"],
    queryFn: GetCurrentVersion,
    staleTime: Infinity,
  });

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <aside className="glass-sidebar w-[264px] h-screen flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="flex items-center justify-center shrink-0">
          <img src={logoImg} alt="Watermark" className="size-10" />
        </div>
        <div>
          <h1 className="text-base font-display font-bold text-foreground tracking-tight">
            Watermark
          </h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4" aria-label="Main navigation">
        <span className="px-3 mb-2 block text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest">
          Menu
        </span>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const isMonitoringCritical = item.id === "monitoring" && hasCritical;
            let tone: "brand" | "danger" | "muted" = "muted";
            if (active) tone = "brand";
            else if (isMonitoringCritical) tone = "danger";
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  e.currentTarget.blur();
                  navigate({ to: item.path });
                }}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm border transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.99] active:duration-75 w-full text-left outline-none",
                  "focus-visible:ring-2 focus-visible:ring-semantic-cyan/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "bg-primary/15 border-primary/30 text-primary font-semibold shadow-sm"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon
                  name={item.icon}
                  tone={tone}
                  weight={active ? "regular" : "thin"}
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    !active && !isMonitoringCritical && "group-hover:text-foreground"
                  )}
                />
                <span className="truncate">{item.label}</span>
                {item.id === "monitoring" && unreadCount > 0 && (
                  <span className={cn(
                    "ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-semantic-red text-white text-[10px] font-bold",
                    hasCritical && "animate-pulse",
                  )}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {active && item.id !== "monitoring" && (
                  <span className="ml-auto size-1.5 rounded-full bg-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Update banner (rendered above version footer) */}
      <UpdateBanner />

      {/* Version footer */}
      <div className="px-6 py-4 border-t border-border text-center">
        <span className="text-[10px] font-mono text-muted-foreground">{version}</span>
      </div>
    </aside>
  );
}


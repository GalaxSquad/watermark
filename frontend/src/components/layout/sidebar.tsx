import { useLocation, useNavigate } from "@tanstack/react-router";
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
  const location = useLocation();
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
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
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
      <nav className="flex-1 px-3 py-4">
        <span className="px-3 mb-2 block text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest">
          Menu
        </span>
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const isMonitoringCritical = item.id === "monitoring" && hasCritical;
            let tone: "brand" | "danger" | "default" = "default";
            if (active) tone = "brand";
            else if (isMonitoringCritical) tone = "danger";
            return (
              <button
                key={item.id}
                onClick={() => navigate({ to: item.path })}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ease-out active:scale-[0.99] active:duration-75 w-full text-left",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon name={item.icon} tone={tone} className="size-4" />
                {item.label}
                {item.id === "monitoring" && unreadCount > 0 && (
                  <span className={cn(
                    "ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-semantic-red text-white text-[10px] font-bold",
                    hasCritical && "animate-pulse",
                  )}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {active && item.id !== "monitoring" && (
                  <span className="ml-auto size-1.5 rounded-full bg-primary" />
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


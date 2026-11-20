import { useEffect } from "react";
import { useSettingsStore } from "@/store/settings";
import { useSearchPaletteStore } from "@/store/search-palette";
import { ClusterDropdown } from "./cluster-dropdown";
import { SearchCommandPalette } from "@/components/shared/search-command-palette";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export function AppHeader() {
  const { openSettings, resolvedTheme, setTheme } = useSettingsStore();
  const { toggle: toggleSearch } = useSearchPaletteStore();

  const isDark = resolvedTheme === "dark";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent || navigator.platform || "");

  /* Cmd+K / Ctrl+K hotkey for search */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSearch]);

  return (
    <>
      <header className="h-12 flex items-center justify-between px-6 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        {/* Left: Cluster selector + search */}
        <div className="flex items-center gap-4">
          <ClusterDropdown />

          <Button
            variant="outline"
            onClick={toggleSearch}
            className="h-8 gap-2 px-3 text-muted-foreground hover:text-foreground"
          >
            <Icon name="search" className="size-3.5" />
            <span className="text-xs">Search...</span>
            <kbd className="ml-3 text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded border border-border font-mono">
              {isMac ? "⌘K" : "Ctrl+K"}
            </kbd>
          </Button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? <Icon name="sun" className="size-4" /> : <Icon name="moon" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isDark ? "Switch to light mode" : "Switch to dark mode"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="settings-trigger"
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Settings (${isMac ? "⌘," : "Ctrl+,"})`}
                onClick={openSettings}
              >
                <Icon name="settings" className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Settings ({isMac ? "⌘," : "Ctrl+,"})
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <SearchCommandPalette />
    </>
  );
}


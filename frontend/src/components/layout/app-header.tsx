import { useEffect } from "react";
import { useSettingsStore } from "@/store/settings";
import { useSearchPaletteStore } from "@/store/search-palette";
import { ClusterDropdown } from "./cluster-dropdown";
import { SearchCommandPalette } from "@/components/shared/search-command-palette";
import { Icon } from "@/components/ui/icon";

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

          <button
            onClick={toggleSearch}
            className="h-8 flex items-center gap-2 px-3 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-ring transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]"
          >
            <Icon name="search" className="size-3.5" />
            <span className="text-xs">Search...</span>
            <kbd className="ml-3 text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded border border-border font-mono">
              {isMac ? "⌘K" : "Ctrl+K"}
            </kbd>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="size-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-[color,background-color,transform] duration-150 active:scale-90"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Icon name="sun" className="size-4" /> : <Icon name="moon" className="size-4" />}
          </button>
          <button
            id="settings-trigger"
            onClick={openSettings}
            className="size-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-[color,background-color,transform] duration-150 active:scale-90"
            title="Settings (⌘,)"
          >
            <Icon name="settings" className="size-4" />
          </button>
        </div>
      </header>

      <SearchCommandPalette />
    </>
  );
}


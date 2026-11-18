import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type { IconName } from "@/lib/icon-map";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import { globMatch } from "@/lib/glob-match";
import {
  type ChartType,
  type TimeWindow,
  type ViewMode,
  type ChartEntity,
  TIME_WINDOWS,
  MAX_CHART_ENTITIES,
  CHART_COLORS,
} from "./chart-entity-types";

const CHART_TYPE_ICONS: { id: ChartType; label: string; iconName: IconName }[] = [
  { id: "area" as const, label: "Area", iconName: "area-chart" },
  { id: "line" as const, label: "Line", iconName: "line-chart" },
  { id: "bar" as const, label: "Bar", iconName: "bar-chart" },
];

interface ChartControlsProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  entities: string[];
  selectedEntities: ChartEntity[];
  onAddEntity: (name: string) => void;
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  chartType: ChartType;
  onChartTypeChange: (t: ChartType) => void;
  trackedPatterns: string[];
  excludedPatterns: string[];
}

/** Controls bar — mode toggle, entity add (with tracked/available sections), time window, chart type. */
export function ChartControls({
  mode,
  onModeChange,
  entities,
  selectedEntities,
  onAddEntity,
  timeWindow,
  onTimeWindowChange,
  chartType,
  onChartTypeChange,
  trackedPatterns,
  excludedPatterns,
}: ChartControlsProps) {
  const [open, setOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState("");

  const isAlreadyAdded = selectedEntities.some((e) => e.name === pendingSelection);
  const atCapacity = selectedEntities.length >= MAX_CHART_ENTITIES;
  const addDisabled = !pendingSelection || atCapacity || isAlreadyAdded;

  // Classify entities into tracked/available/excluded
  const { tracked, available, excluded } = useMemo(() => {
    const trackedList: string[] = [];
    const availableList: string[] = [];
    const excludedSet = new Set<string>();

    for (const entity of entities) {
      const isExcluded = excludedPatterns.some((p) => globMatch(entity, p));
      if (isExcluded) excludedSet.add(entity);

      const isTracked = trackedPatterns.some((p) => globMatch(entity, p));
      if (isTracked) {
        trackedList.push(entity);
      } else {
        availableList.push(entity);
      }
    }

    // Sort: already-on-chart first, then alphabetical
    const sortFn = (a: string, b: string) => {
      const aSelected = selectedEntities.some((e) => e.name === a);
      const bSelected = selectedEntities.some((e) => e.name === b);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return a.localeCompare(b);
    };

    return {
      tracked: trackedList.sort(sortFn),
      available: availableList.sort(sortFn),
      excluded: excludedSet,
    };
  }, [entities, trackedPatterns, excludedPatterns, selectedEntities]);

  const handleAdd = () => {
    if (pendingSelection && !addDisabled) {
      onAddEntity(pendingSelection);
      setPendingSelection("");
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Mode toggle */}
      <div className="flex gap-0.5 bg-secondary rounded-lg p-0.5">
        {(["topic", "group"] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors capitalize",
              mode === m
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "topic" ? "Topics" : "Groups"}
          </button>
        ))}
      </div>

      {/* Entity combobox with tracked/available sections + Add button */}
      <div className="flex items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              role="combobox"
              aria-expanded={open}
              className="flex items-center justify-between px-3 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground hover:border-border-hover focus:outline-none focus:border-ring truncate min-w-[200px] max-w-[300px] font-mono"
            >
              <span className="truncate">
                {pendingSelection || `Select ${mode}...`}
              </span>
              <Icon name="chevrons-up-down" className="ml-2 size-3 shrink-0 opacity-50" tone="muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 border border-border bg-[#0f1115]" align="start">
            <Command className="bg-transparent text-foreground">
              <div className="flex items-center border-b border-border px-3">
                <Icon name="search" className="mr-2 size-4 shrink-0" tone="muted" />
                <CommandPrimitive.Input
                  placeholder={`Search ${mode}...`}
                  className="flex flex-1 h-10 bg-transparent border-0 outline-none focus:ring-0 text-sm placeholder:text-muted-foreground text-foreground"
                />
              </div>
              <CommandList>
                <CommandEmpty className="text-xs text-muted-foreground py-6 text-center">No {mode} found.</CommandEmpty>

                {/* Tracked section */}
                {tracked.length > 0 && (
                  <CommandGroup heading={`Tracked (${tracked.length})`}>
                    {tracked.map((e) => {
                      const added = selectedEntities.some((s) => s.name === e);
                      const isExcluded = excluded.has(e);
                      const chartEntity = selectedEntities.find((s) => s.name === e);
                      const dotColor = chartEntity
                        ? CHART_COLORS[chartEntity.colorIndex]
                        : "#8B5CF6"; // neutral purple if tracked but not charted

                      return (
                        <CommandItem
                          key={e}
                          value={e}
                          disabled={added || isExcluded}
                          onSelect={() => {
                            setPendingSelection(e);
                            setOpen(false);
                          }}
                          className={cn(
                            "text-xs font-mono cursor-pointer",
                            "data-[selected=true]:bg-accent data-[selected=true]:text-foreground",
                            added && "opacity-40 cursor-not-allowed",
                            isExcluded && "opacity-30 line-through cursor-not-allowed",
                            !isExcluded && "bg-primary/5", // subtle bg tint for tracked
                          )}
                        >
                          <span
                            className="mr-2 size-2 rounded-full shrink-0 inline-block"
                            style={{ backgroundColor: isExcluded ? "#4b5563" : dotColor }}
                          />
                          {added && <Icon name="check" className="mr-1 size-3" tone="brand" />}
                          {e}
                          {isExcluded && (
                            <span className="ml-auto text-[10px] text-semantic-red">excluded</span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

                {/* Available section */}
                {available.length > 0 && (
                  <CommandGroup heading={`Available (${available.length})`}>
                    {available.map((e) => {
                      const added = selectedEntities.some((s) => s.name === e);
                      const isExcluded = excluded.has(e);
                      return (
                        <CommandItem
                          key={e}
                          value={e}
                          disabled={added || isExcluded}
                          onSelect={() => {
                            setPendingSelection(e);
                            setOpen(false);
                          }}
                          className={cn(
                            "text-xs font-mono cursor-pointer",
                            "data-[selected=true]:bg-accent data-[selected=true]:text-foreground",
                            added && "opacity-40 cursor-not-allowed",
                            isExcluded && "opacity-30 line-through cursor-not-allowed",
                          )}
                        >
                          <span className="mr-2 size-2 shrink-0" /> {/* spacer for alignment */}
                          {added && <Icon name="check" className="mr-1 size-3" tone="brand" />}
                          {e}
                          {isExcluded && (
                            <span className="ml-auto text-[10px] text-semantic-red">excluded</span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={addDisabled}
          className="gap-1 text-xs bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
        >
          <Icon name="plus" className="size-3" tone="brand" />
          Add
        </Button>

        {selectedEntities.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedEntities.length}/{MAX_CHART_ENTITIES}
          </span>
        )}
      </div>

      {/* Time window */}
      <div className="flex gap-0.5 bg-secondary rounded-lg p-0.5">
        {TIME_WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => onTimeWindowChange(w)}
            className={cn(
              "px-2 py-1 text-xs rounded-md transition-colors",
              timeWindow === w
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {w}
          </button>
        ))}
      </div>

      {/* Chart type */}
      <div className="flex gap-0.5 bg-secondary rounded-lg p-0.5">
        {CHART_TYPE_ICONS.map((ct) => (
          <button
            key={ct.id}
            onClick={() => onChartTypeChange(ct.id)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors",
              chartType === ct.id
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon name={ct.iconName} className="size-3" />
            {ct.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Mini 5-dot color picker popover for chart entity color selection.
 * Picking a taken color triggers swap between entities.
 */

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CHART_COLORS, type ChartEntity } from "./chart-entity-types";

interface ChartColorPickerProps {
  currentIndex: number;
  entities: ChartEntity[];
  onSelect: (colorIndex: number) => void;
}

export function ChartColorPicker({ currentIndex, entities, onSelect }: ChartColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="size-3 rounded-full shrink-0 cursor-pointer ring-1 ring-white/20 hover:ring-white/40 transition-[box-shadow,transform] duration-150 active:scale-90"
          style={{ backgroundColor: CHART_COLORS[currentIndex] }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2 bg-[#0f1115] border border-border"
        align="start"
        side="top"
      >
        <div className="flex gap-1.5">
          {CHART_COLORS.map((color, i) => {
            const usedBy = entities.find((e) => e.colorIndex === i);
            const isCurrent = i === currentIndex;
            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                className={cn(
                  "size-5 rounded-full transition-[box-shadow,transform] duration-150 ease-out active:scale-90 flex items-center justify-center text-[8px] font-bold",
                  isCurrent && "ring-2 ring-white ring-offset-1 ring-offset-[#0f1115]",
                )}
                style={{ backgroundColor: color }}
                title={usedBy ? `Used by ${usedBy.name}` : "Available"}
              >
                {usedBy && !isCurrent ? usedBy.name[0].toUpperCase() : ""}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

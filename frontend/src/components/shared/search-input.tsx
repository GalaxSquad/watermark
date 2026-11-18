import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  shortcutHint?: string;
  disabled?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
  shortcutHint,
  disabled = false,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className, disabled && "opacity-50")}>
      <Icon name="search" tone="muted" className="absolute left-3 top-1/2 -translate-y-1/2 size-4" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-lg",
          "text-sm text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50",
          "transition-colors duration-150 disabled:cursor-not-allowed"
        )}
      />
      {shortcutHint && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border font-mono">
          {shortcutHint}
        </kbd>
      )}
    </div>
  );
}

import { useState, useRef, useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";

interface ServiceNameInputProps {
  value: string[];
  onChange: (names: string[]) => void;
  suggestions: string[];
  placeholder: string;
  variant: "producer" | "consumer";
}

const VARIANT_STYLES = {
  producer: {
    badge: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
    ring: "focus-within:ring-purple-500/30",
    dot: "bg-purple-400",
  },
  consumer: {
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    ring: "focus-within:ring-blue-500/30",
    dot: "bg-blue-400",
  },
};

export function ServiceNameInput({
  value,
  onChange,
  suggestions,
  placeholder,
  variant,
}: ServiceNameInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const styles = VARIANT_STYLES[variant];

  // Filter suggestions: not already added, and matches input
  const filtered = suggestions.filter(
    (s) =>
      !value.includes(s) &&
      s.toLowerCase().includes(input.toLowerCase())
  );

  const addName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [value, onChange]);

  const removeName = (name: string) => {
    onChange(value.filter((n) => n !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      addName(input);
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      removeName(value[value.length - 1]);
    }
  };

  const hasSuggestions = showSuggestions && filtered.length > 0;

  return (
    <Popover open={hasSuggestions} onOpenChange={(open) => { if (!open) setShowSuggestions(false); }}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex flex-wrap gap-1.5 items-center min-h-[38px] px-2.5 py-1.5",
            "bg-secondary border border-border rounded-lg",
            "transition-[color,background-color,border-color,box-shadow] duration-150",
            "focus-within:ring-1",
            styles.ring
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((name) => (
            <span
              key={name}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded-md border",
                "transition-transform duration-150 ease-out hover:scale-[1.03]",
                styles.badge
              )}
            >
              <span className={cn("size-1.5 rounded-full", styles.dot)} />
              {name}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeName(name);
                }}
                className="ml-0.5 hover:text-foreground transition-colors"
                type="button"
              >
                <Icon name="x" className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : "Add..."}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
          />
        </div>
      </PopoverAnchor>

      {/* Suggestions dropdown */}
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1 max-h-40 overflow-y-auto"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {filtered.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => addName(suggestion)}
            className="w-full px-3 py-1.5 text-left text-sm text-foreground font-mono hover:bg-accent rounded transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

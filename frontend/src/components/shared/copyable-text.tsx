import { useState, useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface CopyableTextProps {
  /** Exact string value to show in tooltip and copy to clipboard */
  value: string;
  /** Optional custom node to render inside the truncated text span */
  children?: React.ReactNode;
  /** Wrapper classes */
  className?: string;
  /** Text span classes */
  textClassName?: string;
  /** Use monospace font (default: true for IDs, hosts, topic names, group IDs) */
  mono?: boolean;
  /** Always show the copy button instead of only on hover */
  alwaysShowCopy?: boolean;
  /** Accessible label for the copy button */
  copyLabel?: string;
}

/**
 * Truncatable identifier (broker host, topic name, consumer group ID) with
 * full-text hover tooltip and one-click clipboard copy button.
 */
export function CopyableText({
  value,
  children,
  className,
  textClassName,
  mono = true,
  alwaysShowCopy = false,
  copyLabel = "Copy to clipboard",
}: CopyableTextProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Fallback for restricted clipboard environments
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    },
    [value],
  );

  return (
    <span
      className={cn(
        "group/copy inline-flex items-center gap-1.5 max-w-full min-w-0",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "truncate min-w-0",
              mono && "font-mono",
              textClassName,
            )}
          >
            {children ?? value}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md break-all font-mono text-xs">
          {value}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : `${copyLabel}: ${value}`}
            className={cn(
              "shrink-0 inline-flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-[opacity,color,background-color] duration-150 outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring",
              alwaysShowCopy || copied
                ? "opacity-100"
                : "opacity-0 group-hover/copy:opacity-100",
            )}
          >
            {copied ? (
              <Icon name="check" tone="success" className="size-3" />
            ) : (
              <Icon name="copy" tone="muted" className="size-3" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {copied ? "Copied!" : copyLabel}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

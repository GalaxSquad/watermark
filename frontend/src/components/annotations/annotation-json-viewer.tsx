import { useState, lazy, Suspense } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useSettingsStore } from "@/store/settings";

const Editor = lazy(() => import("@monaco-editor/react"));

interface AnnotationJsonViewerProps {
  annotations: Record<string, unknown>;
}

/**
 * Collapsible read-only Monaco JSON viewer for annotation data.
 * Shows annotations-only shape (no version/wrapper envelope).
 */
export function AnnotationJsonViewer({
  annotations,
}: AnnotationJsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useSettingsStore();

  const jsonContent = JSON.stringify(annotations, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dynamic editor height: min 100px, max 300px, ~19px per line
  const lineCount = jsonContent.split("\n").length;
  const editorHeight = Math.min(Math.max(lineCount * 19, 100), 300);

  return (
    <Collapsible className="space-y-2">
      <CollapsibleTrigger className="group flex items-center gap-2 text-[13px] text-foreground transition-colors">
        <Icon
          name="chevron-right"
          tone="muted"
          className={cn(
            "size-3 transition-transform",
            "group-data-[state=open]:rotate-90"
          )}
        />
        <Icon name="code" className="size-3.5" tone="brand" />
        Raw Config
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="relative rounded-lg border border-border overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleCopy}
                aria-label="Copy to clipboard"
                className="absolute top-2 right-2 z-10"
              >
                {copied ? (
                  <Icon name="check" className="size-3" tone="success" />
                ) : (
                  <Icon name="copy" className="size-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {copied ? "Copied!" : "Copy to clipboard"}
            </TooltipContent>
          </Tooltip>
          <Suspense fallback={<div className="flex justify-center items-center h-full p-4"><Icon name="loader" className="w-4 h-4 animate-spin" tone="muted" /></div>}>
            <Editor
              height={editorHeight}
              language="json"
              value={jsonContent}
              theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                lineNumbers: "off",
                folding: true,
                scrollBeyondLastLine: false,
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                padding: { top: 12, bottom: 12 },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: "none",
                scrollbar: {
                  vertical: "auto",
                  horizontal: "auto",
                  verticalScrollbarSize: 6,
                },
              }}
            />
          </Suspense>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

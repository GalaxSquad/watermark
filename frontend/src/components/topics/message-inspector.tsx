import { lazy, Suspense } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

type MessageFormat = "Auto" | "String" | "JSON" | "Avro" | "Protobuf" | "Hex";

/** Formats a raw message value string for Monaco display. */
function formatMessageValue(
  raw: string,
  format: MessageFormat
): { content: string; language: string } {
  if (format === "String" || format === "Hex") {
    return { content: raw, language: "plaintext" };
  }
  try {
    return { content: JSON.stringify(JSON.parse(raw), null, 2), language: "json" };
  } catch {
    return { content: raw, language: "plaintext" };
  }
}

interface MessageInspectorProps {
  value: string;
  offset: number;
  format: MessageFormat;
  onClose: () => void;
  onReplay?: () => void;
}

export function MessageInspector({ value, offset, format, onClose, onReplay }: MessageInspectorProps) {
  const { content, language } = formatMessageValue(value, format);
  const { resolvedTheme } = useSettingsStore();

  return (
    <div className="glass-panel overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary">
        <span className="text-xs font-mono text-muted-foreground">
          MESSAGE INSPECTOR (Offset: {offset})
        </span>
        <div className="flex gap-2">
          {onReplay && (
            <Button
              variant="secondary"
              size="xs"
              onClick={onReplay}
              className="gap-1 text-xs"
            >
              <Icon name="rotate-ccw" className="size-3" tone="brand" />
              Replay
            </Button>
          )}
          <Button
            variant="secondary"
            size="xs"
            onClick={() => navigator.clipboard.writeText(value)}
            className="text-xs"
          >
            Copy
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close inspector"
          >
            <Icon name="x" className="size-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-[300px]">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading editor...</div>}>
          <MonacoEditor
            height="300px"
            language={language}
            theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
            value={content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              fontFamily: "JetBrains Mono",
              lineNumbers: "off",
              folding: true,
              renderLineHighlight: "none",
              padding: { top: 12 },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

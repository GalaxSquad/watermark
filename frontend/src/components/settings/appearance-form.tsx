import { lazy, Suspense } from "react";
import { Slider } from "@/components/ui/slider";
import { useSettingsStore } from "@/store/settings";
import { ACCENT_PRESETS, type AccentPreset } from "@/types/config";
import { cn } from "@/lib/utils";
import { SettingsCard, SettingsRow } from "./settings-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

const SAMPLE_JSON = `{
  "user": "test",
  "status": "active",
  "timestamp": 1709640000,
  "metadata": {
    "source": "kafka",
    "version": "3.6"
  }
}`;

export function AppearanceForm() {
  const { theme, setTheme, density, setDensity, accent, setAccent, codeFont, setCodeFont, codeFontSize, setCodeFontSize, resolvedTheme } =
    useSettingsStore();

  return (
    <div className="space-y-3">
      <SettingsCard icon="palette" title="Appearance">
        <SettingsRow label="Theme">
          <Select value={theme} onValueChange={(v) => setTheme(v as "dark" | "light" | "system")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="UI Density"
          description="Controls row height and padding in tables"
        >
          <Select value={density} onValueChange={(v) => setDensity(v as "compact" | "comfortable" | "spacious")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="comfortable">Comfortable</SelectItem>
              <SelectItem value="spacious">Spacious</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Accent"
          description="Primary color for buttons, links and highlights. Status colors (healthy, warning, danger) never change."
        >
          <div className="flex flex-col items-end">
            <Select value={accent} onValueChange={(v) => setAccent(v as AccentPreset)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ACCENT_PRESETS[key].value }}
                      />
                      {ACCENT_PRESETS[key].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Swatch preview — one tap to switch, no dropdown needed */}
            <div className="flex items-center gap-2 mt-2">
              {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`${ACCENT_PRESETS[key].label} accent`}
                  title={ACCENT_PRESETS[key].label}
                  onClick={() => setAccent(key)}
                  className={cn(
                    "size-6 rounded-full border-2 transition-transform hover:scale-110",
                    accent === key ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: ACCENT_PRESETS[key].value }}
                />
              ))}
            </div>
          </div>
        </SettingsRow>

        <SettingsRow label="Code Font">
          <input
            type="text"
            value={codeFont}
            onChange={(e) => setCodeFont(e.target.value)}
            className="w-48 h-9 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </SettingsRow>

        <SettingsRow label={`Font Size (${codeFontSize}px)`}>
          <div className="w-48">
            <Slider
              value={[codeFontSize]}
              onValueChange={([v]) => setCodeFontSize(v)}
              min={12}
              max={16}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between mt-1 text-[10px] font-mono text-muted-foreground/70">
              <span>12px</span>
              <span>16px</span>
            </div>
          </div>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard icon="code" title="Preview">
        <SettingsRow>
          <div className="overflow-hidden rounded-lg border border-border">
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading preview...</div>}>
              <MonacoEditor
                height="180px"
                language="json"
                theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
                value={SAMPLE_JSON}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: codeFontSize,
                  fontFamily: codeFont,
                  lineNumbers: "on",
                  renderLineHighlight: "none",
                  padding: { top: 12 },
                }}
              />
            </Suspense>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type { RankingConfig } from "@/types/ranking-config";

interface RankingConfigPanelProps {
  config: RankingConfig;
  onUpdate: (updates: Partial<RankingConfig>) => void;
}

/** Collapsible filter config for the topic ranking tab. */
export function RankingConfigPanel({ config, onUpdate }: RankingConfigPanelProps) {
  const [newExclude, setNewExclude] = useState("");
  const [newInclude, setNewInclude] = useState("");

  const addExclude = () => {
    const val = newExclude.trim();
    if (!val || config.excludeGlobs.includes(val)) return;
    onUpdate({ excludeGlobs: [...config.excludeGlobs, val] });
    setNewExclude("");
  };

  const removeExclude = (idx: number) => {
    onUpdate({ excludeGlobs: config.excludeGlobs.filter((_, i) => i !== idx) });
  };

  const addInclude = () => {
    const val = newInclude.trim();
    if (!val || config.includeExact.includes(val)) return;
    onUpdate({ includeExact: [...config.includeExact, val] });
    setNewInclude("");
  };

  const removeInclude = (idx: number) => {
    onUpdate({ includeExact: config.includeExact.filter((_, i) => i !== idx) });
  };

  return (
    <div className="glass-panel p-4 space-y-4 shrink-0">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Ranking Filters
      </h3>

      {/* Min lag threshold */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Min Lag</label>
        <input
          type="number"
          min={0}
          value={config.minLag}
          onChange={(e) => onUpdate({ minLag: parseInt(e.target.value) || 0 })}
          className="w-28 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground focus:outline-none focus:border-ring font-mono"
        />
      </div>

      {/* Exclude globs */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Exclude Patterns (glob)</label>
        <div className="flex flex-wrap gap-1.5">
          {config.excludeGlobs.map((g, i) => (
            <span key={g} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-semantic-red/10 text-semantic-red border border-semantic-red/20 rounded font-mono">
              {g}
              <button onClick={() => removeExclude(i)} className="hover:text-foreground">
                <Icon name="x" className="size-3" tone="danger" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newExclude}
            onChange={(e) => setNewExclude(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExclude()}
            placeholder="e.g. TRANSACTION*"
            className="flex-1 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring font-mono"
          />
          <Button
            variant="outline"
            size="icon-xs"
            onClick={addExclude}
            aria-label="Add exclude pattern"
          >
            <Icon name="plus" className="size-3" />
          </Button>
        </div>
      </div>

      {/* Include overrides */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Include Overrides (exact)</label>
        <div className="flex flex-wrap gap-1.5">
          {config.includeExact.map((name, i) => (
            <span key={name} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 rounded font-mono">
              {name}
              <button onClick={() => removeInclude(i)} className="hover:text-foreground">
                <Icon name="x" className="size-3" tone="success" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newInclude}
            onChange={(e) => setNewInclude(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addInclude()}
            placeholder="e.g. TRANSACTION_01"
            className="flex-1 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring font-mono"
          />
          <Button
            variant="outline"
            size="icon-xs"
            onClick={addInclude}
            aria-label="Add include pattern"
          >
            <Icon name="plus" className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

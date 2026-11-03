import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { useLagAlertsStore } from "@/store/lag-alerts";
import { AddRule, DeleteRule, RestartMonitoring } from "@/lib/wails-client";
import type { AlertRule } from "@/types/lag-alerts";

interface ConsumerActionDropdownProps {
  groupId: string;
  onDropGroup: () => void;
  onClearLag?: () => void;
  canClearLag?: boolean;
  canDrop: boolean;
  disabled?: boolean;
}

export function ConsumerActionDropdown({
  groupId,
  onDropGroup,
  onClearLag,
  canClearLag = false,
  canDrop,
  disabled,
}: ConsumerActionDropdownProps) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [warningLag, setWarningLag] = useState("");
  const [criticalLag, setCriticalLag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { activeClusterId } = useSettingsStore();
  const { alertConfig, loadConfig } = useLagAlertsStore();

  const existingRule = alertConfig?.rules.find((r) => r.groupPattern === groupId);

  const handleAlertOpen = (open: boolean) => {
    if (open && existingRule) {
      setWarningLag(String(existingRule.warningLag));
      setCriticalLag(String(existingRule.criticalLag));
    }
    if (open) setError("");
    setAlertOpen(open);
  };

  const handleSave = async () => {
    if (!activeClusterId) return;
    const w = Number.parseInt(warningLag, 10);
    const c = Number.parseInt(criticalLag, 10);
    if (Number.isNaN(w) || Number.isNaN(c) || w <= 0 || c <= 0) {
      setError("Enter valid positive numbers.");
      return;
    }
    if (w >= c) {
      setError("Warning must be less than critical.");
      return;
    }
    setSaving(true);
    try {
      const rule: AlertRule = {
        id: existingRule?.id ?? crypto.randomUUID(),
        groupPattern: groupId,
        warningLag: w,
        criticalLag: c,
        enabled: true,
      };
      await AddRule(activeClusterId, rule);
      await loadConfig(activeClusterId);
      await RestartMonitoring(activeClusterId);
      setAlertOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!activeClusterId || !existingRule) return;
    setSaving(true);
    try {
      await DeleteRule(activeClusterId, existingRule.id);
      await loadConfig(activeClusterId);
      setAlertOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={alertOpen} onOpenChange={handleAlertOpen}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <button
              disabled={disabled}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                "text-white bg-primary hover:bg-primary/90",
                disabled && "opacity-40 cursor-not-allowed pointer-events-none",
              )}
            >
              Actions
              <Icon name="chevron-down" className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => handleAlertOpen(true)}>
            <Icon name="bell" className="size-3.5" />
            Set Alert
          </DropdownMenuItem>
          {onClearLag && (
            <DropdownMenuItem
              disabled={!canClearLag}
              onSelect={canClearLag ? onClearLag : undefined}
            >
              <Icon name="chevrons-right" className="size-3.5" tone={canClearLag ? "warning" : undefined} />
              Clear Consumer Lag
            </DropdownMenuItem>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem disabled>
                  <Icon name="chevrons-left" className="size-3.5" />
                  Reset Offsets
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>Group must be Empty or Dead to reset offsets</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuSeparator />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  disabled={!canDrop}
                  onSelect={canDrop ? onDropGroup : undefined}
                  className={canDrop ? "text-red-400 focus:text-red-400" : undefined}
                >
                  <Icon name="trash" className="size-3.5" tone={canDrop ? "danger" : undefined} />
                  Drop Group
                </DropdownMenuItem>
              </TooltipTrigger>
              {!canDrop && <TooltipContent>Group must be Empty or Dead to drop</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </DropdownMenuContent>
      </DropdownMenu>

      <PopoverContent className="w-72" align="end" sideOffset={8}>
        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">Lag Alert</div>
          <div className="text-xs text-muted-foreground truncate font-mono">{groupId}</div>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Warning lag threshold</Label>
              <Input
                type="number"
                min={1}
                value={warningLag}
                onChange={(e) => setWarningLag(e.target.value)}
                placeholder="e.g. 1000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Critical lag threshold</Label>
              <Input
                type="number"
                min={1}
                value={criticalLag}
                onChange={(e) => setCriticalLag(e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
          </div>
          {error && <p className="text-xs text-semantic-red">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-1.5 text-xs bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {existingRule && (
              <button
                onClick={handleRemove}
                disabled={saving}
                className="px-3 py-1.5 text-xs text-semantic-red bg-semantic-red/10 border border-semantic-red/20 rounded hover:bg-semantic-red/20 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            )}
            <button
              onClick={() => setAlertOpen(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground bg-secondary border border-border rounded hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

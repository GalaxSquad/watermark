import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GetCurrentVersion,
  CheckForUpdate,
  GetSettings,
  SaveSettings,
  IsMCPRunning,
  StartMCP,
  StopMCP,
  ExportConfigFile,
  ImportConfigFile,
} from "@/lib/wails-client";
import { UpdateChangelogModal } from "@/components/layout/update-changelog-modal";
import type { UpdateInfo } from "@/components/layout/update-changelog-modal";
import { SettingsCard, SettingsRow } from "./settings-card";

type CheckState = "idle" | "checking" | "up-to-date" | "available" | "skipped" | "done" | "error";

function AppVersionSection() {
  const [version, setVersion] = useState("");
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    GetCurrentVersion().then(setVersion).catch(() => {});
  }, []);

  const handleCheck = useCallback(async () => {
    if (checkState === "available" || checkState === "skipped") {
      setShowModal(true);
      return;
    }

    setCheckState("checking");
    setErrorMsg("");
    try {
      const info = await CheckForUpdate();
      if (info?.available) {
        setUpdateInfo(info as UpdateInfo);
        setCheckState(info.skipped ? "skipped" : "available");
      } else {
        setCheckState("up-to-date");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Check failed");
      setCheckState("error");
    }
  }, [checkState]);

  const handleModalClose = useCallback((reason: "skipped" | "updated" | "cancelled") => {
    setShowModal(false);
    if (reason === "skipped") setCheckState("skipped");
    if (reason === "updated") setCheckState("done");
  }, []);

  const buttonLabel = () => {
    switch (checkState) {
      case "checking": return "Checking…";
      case "up-to-date": return "Up to date";
      case "available": return `Update to ${updateInfo?.latestVersion}`;
      case "skipped": return `Skipped ${updateInfo?.latestVersion}`;
      case "done": return "Restart to apply";
      case "error": return "Retry";
      default: return "Check for Updates";
    }
  };

  const isLoading = checkState === "checking";
  const isAvailable = checkState === "available";
  const isSkipped = checkState === "skipped";
  const isDone = checkState === "done";
  const isError = checkState === "error";

  return (
    <>
      <SettingsCard icon="info" title="About">
        <SettingsRow
          label="Watermark"
          description={
            /* Backend version string already includes the "v" prefix (e.g. "v1.3.2") — do not prepend another one. */
            version || "—"
          }
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheck}
            disabled={isLoading || isDone || checkState === "up-to-date"}
            className={cn(
              "gap-2 text-xs",
              isAvailable && "bg-primary/20 border-primary/30 text-primary hover:bg-primary/30",
              isSkipped && "bg-muted text-muted-foreground",
              isError && "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
            )}
          >
            {isLoading && <Icon name="loader" className="size-3 animate-spin" />}
            {isAvailable && <Icon name="arrow-down-circle" className="size-3" tone="brand" />}
            {isDone && <Icon name="check-circle" className="size-3" tone="success" />}
            {isError && <Icon name="alert-circle" className="size-3" tone="danger" />}
            {buttonLabel()}
          </Button>
        </SettingsRow>
        {isError && errorMsg && (
          <SettingsRow>
            <p className="text-xs text-red-400/70">{errorMsg}</p>
          </SettingsRow>
        )}
      </SettingsCard>

      {updateInfo && (
        <UpdateChangelogModal
          isOpen={showModal}
          onClose={handleModalClose}
          updateInfo={updateInfo}
        />
      )}
    </>
  );
}

function MCPSection() {
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState(34120);
  const [portInput, setPortInput] = useState("34120");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Load persisted settings on mount
  useEffect(() => {
    GetSettings()
      .then((s) => {
        setEnabled(s.mcpEnabled ?? false);
        const p = s.mcpPort || 34120;
        setPort(p);
        setPortInput(String(p));
      })
      .catch(() => {});
    IsMCPRunning().then(setRunning).catch(() => {});
  }, []);

  const toggle = useCallback(
    async (checked: boolean) => {
      setError("");
      setBusy(true);
      try {
        const settings = await GetSettings();
        await SaveSettings({ ...settings, mcpEnabled: checked, mcpPort: port });
        if (checked) {
          await StartMCP();
        } else {
          await StopMCP();
        }
        setEnabled(checked);
        setRunning(checked);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [port]
  );

  const applyPort = useCallback(
    async (raw: string) => {
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed) || parsed < 1024 || parsed > 65535) {
        setPortInput(String(port)); // revert invalid input
        return;
      }
      setPort(parsed);
      setPortInput(String(parsed));
      try {
        const settings = await GetSettings();
        await SaveSettings({ ...settings, mcpPort: parsed, mcpEnabled: enabled });
        // Restart on new port if already running
        if (running) {
          setBusy(true);
          try {
            await StopMCP();
            await StartMCP();
          } finally {
            setBusy(false);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [enabled, port, running]
  );

  return (
    <SettingsCard
      icon="server"
      title="MCP Server"
      description="Expose Kafka operations to AI agents (Claude, Cursor, etc.) via the Model Context Protocol. Credentials never leave the app process."
    >
      <SettingsRow
        label={
          <Label htmlFor="mcp-enabled" className="cursor-pointer">
            Enable MCP server
          </Label>
        }
        description={
          running ? (
            <span className="inline-flex items-center gap-1.5 text-green-400">
              <span className="inline-block size-1.5 rounded-full bg-green-400" />
              Running on localhost:{port}
            </span>
          ) : (
            "Not running"
          )
        }
      >
        <Switch
          id="mcp-enabled"
          checked={enabled}
          disabled={busy}
          onCheckedChange={toggle}
        />
      </SettingsRow>

      {enabled && (
        <SettingsRow label={<Label htmlFor="mcp-port">Port</Label>}>
          <input
            id="mcp-port"
            type="number"
            min={1024}
            max={65535}
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onBlur={(e) => applyPort(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyPort(portInput)}
            className="w-24 px-2 py-1 text-sm text-right bg-secondary border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </SettingsRow>
      )}

      {error && (
        <SettingsRow>
          <p className="text-xs text-red-400">{error}</p>
        </SettingsRow>
      )}
    </SettingsCard>
  );
}

function ImportExportSection() {
  const queryClient = useQueryClient();
  const [includePasswords, setIncludePasswords] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exported = await ExportConfigFile(includePasswords);
      if (exported) {
        toast.success("Configuration exported successfully");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const imported = await ImportConfigFile();
      if (imported) {
        await queryClient.invalidateQueries({ queryKey: ["clusters"] });
        await queryClient.invalidateQueries({ queryKey: ["settings"] });
        toast.success("Configuration imported successfully");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <SettingsCard
      icon="file-json"
      title="Configuration Backup"
      description="Share cluster configurations with your team."
    >
      <SettingsRow>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={isImporting || isExporting}
            className="gap-2"
          >
            {isImporting ? (
              <Icon name="loader" className="size-4 animate-spin" />
            ) : (
              <Icon name="upload" className="size-4" />
            )}
            Import Config (.json)
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isImporting || isExporting}
            className="gap-2"
          >
            {isExporting ? (
              <Icon name="loader" className="size-4 animate-spin" />
            ) : (
              <Icon name="download" className="size-4" />
            )}
            Export Config (.json)
          </Button>
        </div>
      </SettingsRow>

      <SettingsRow
        label={
          <Label htmlFor="include-passwords" className="cursor-pointer">
            Include passwords in export
          </Label>
        }
        description={
          includePasswords ? (
            <span className="inline-flex items-center gap-1 font-medium text-semantic-red">
              <Icon name="alert-triangle" className="size-3" tone="warning" />
              stored as plaintext, keep file secure
            </span>
          ) : (
            "Passwords are excluded from exports."
          )
        }
      >
        <Switch
          id="include-passwords"
          checked={includePasswords}
          onCheckedChange={setIncludePasswords}
        />
      </SettingsRow>
    </SettingsCard>
  );
}

export function DataSystemForm() {
  return (
    <div className="space-y-3">
      <SettingsCard icon="monitor" title="System & Workspace">
        <SettingsRow
          label={
            <Label htmlFor="launch-startup" className="cursor-pointer">
              Start application when computer starts
            </Label>
          }
        >
          <Switch id="launch-startup" defaultChecked />
        </SettingsRow>

        <SettingsRow
          label={
            <Label htmlFor="minimize-tray" className="cursor-pointer">
              Minimize to system tray when closed
            </Label>
          }
        >
          <Switch id="minimize-tray" defaultChecked />
        </SettingsRow>
      </SettingsCard>

      <MCPSection />

      <ImportExportSection />

      <AppVersionSection />
    </div>
  );
}

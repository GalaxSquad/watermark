import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
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
    <section>
      <h3 className="flex items-center gap-2 text-sm font-display font-bold text-foreground uppercase tracking-wider mb-4">
        <Icon name="info" className="size-4" tone="info" /> About
      </h3>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-foreground font-medium">Watermark</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {version ? `v${version}` : "—"}
          </p>
        </div>
        <button
          onClick={handleCheck}
          disabled={isLoading || isDone || checkState === "up-to-date"}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isAvailable
              ? "bg-primary/20 border-primary/30 text-primary hover:bg-primary/30"
              : isSkipped
                ? "bg-muted border-border text-muted-foreground hover:bg-muted"
                : isError
                  ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                  : "bg-secondary border-border text-foreground hover:bg-accent"
          }`}
        >
          {isLoading && <Icon name="loader" className="size-3 animate-spin" />}
          {isAvailable && <Icon name="arrow-down-circle" className="size-3" tone="brand" />}
          {isDone && <Icon name="check-circle" className="size-3" tone="success" />}
          {isError && <Icon name="alert-circle" className="size-3" tone="danger" />}
          {buttonLabel()}
        </button>
      </div>
      {isError && errorMsg && (
        <p className="text-xs text-red-400/70 mt-2">{errorMsg}</p>
      )}

      {updateInfo && (
        <UpdateChangelogModal
          isOpen={showModal}
          onClose={handleModalClose}
          updateInfo={updateInfo}
        />
      )}
    </section>
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
    <section>
      <h3 className="flex items-center gap-2 text-sm font-display font-bold text-foreground uppercase tracking-wider mb-4">
        <Icon name="globe" className="size-4" tone="brand" /> MCP Server
      </h3>

      <p className="text-xs text-muted-foreground mb-4">
        Expose Kafka operations to AI agents (Claude, Cursor, etc.) via the Model Context Protocol.
        Credentials never leave the app process.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="mcp-enabled" className="text-sm text-foreground font-normal cursor-pointer">
              Enable MCP server
            </Label>
            <p className="text-xs mt-0.5">
              {running ? (
                <span className="flex items-center gap-1.5 text-green-400">
                  <span className="inline-block size-1.5 rounded-full bg-green-400" />
                  Running on localhost:{port}
                </span>
              ) : (
                <span className="text-muted-foreground">Not running</span>
              )}
            </p>
          </div>
          <Switch
            id="mcp-enabled"
            checked={enabled}
            disabled={busy}
            onCheckedChange={toggle}
          />
        </div>

        {enabled && (
          <div className="flex items-center justify-between">
            <Label htmlFor="mcp-port" className="text-sm text-foreground font-normal">
              Port
            </Label>
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
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </section>
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
    <section>
      <h3 className="flex items-center gap-2 text-sm font-display font-bold text-foreground uppercase tracking-wider mb-4">
        <Icon name="file-json" className="size-4" tone="brand" /> Configuration Backup
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Share cluster configurations with your team.
      </p>
      <div className="flex gap-3">
        <button
          onClick={handleImport}
          disabled={isImporting || isExporting}
          className="flex items-center gap-2 px-4 py-2 text-sm text-foreground bg-secondary rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {isImporting ? (
            <Icon name="loader" className="size-4 animate-spin" />
          ) : (
            <Icon name="upload" className="size-4" />
          )}
          Import Config (.json)
        </button>
        <button
          onClick={handleExport}
          disabled={isImporting || isExporting}
          className="flex items-center gap-2 px-4 py-2 text-sm text-foreground bg-secondary rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {isExporting ? (
            <Icon name="loader" className="size-4 animate-spin" />
          ) : (
            <Icon name="download" className="size-4" />
          )}
          Export Config (.json)
        </button>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Switch
          id="include-passwords"
          checked={includePasswords}
          onCheckedChange={setIncludePasswords}
        />
        <Label
          htmlFor="include-passwords"
          className="text-xs text-semantic-red font-normal cursor-pointer"
        >
          Include passwords in export —{" "}
          <strong className="inline-flex items-center gap-1">
            <Icon name="alert-triangle" className="size-3" tone="warning" /> stored
            as plaintext, keep file secure
          </strong>
        </Label>
      </div>
    </section>
  );
}

export function DataSystemForm() {
  return (
    <div className="space-y-8">
      {/* Data section */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-display font-bold text-foreground uppercase tracking-wider mb-4">
          <Icon name="monitor" className="size-4" tone="brand" /> System & Workspace
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="launch-startup" className="text-sm text-foreground font-normal cursor-pointer">
              Start application when computer starts
            </Label>
            <Switch id="launch-startup" defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="minimize-tray" className="text-sm text-foreground font-normal cursor-pointer">
              Minimize to system tray when closed
            </Label>
            <Switch id="minimize-tray" defaultChecked />
          </div>
        </div>
      </section>

      {/* MCP Server */}
      <MCPSection />

      {/* Import/Export */}
      <ImportExportSection />

      {/* About / version */}
      <AppVersionSection />
    </div>
  );
}

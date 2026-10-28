import { useEffect, useState, useCallback } from "react";
import { GetChangelog, ApplyUpdate, SkipVersion } from "@/lib/wails-client";
import { renderChangelogMarkdown } from "@/lib/changelog-markdown-renderer";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ReleaseNote {
  version: string;
  date: string;
  notes: string;
}

interface UpdateInfo {
  available: boolean;
  skipped: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

type ModalState = "loading" | "ready" | "fetch-error" | "updating" | "success" | "update-error";

interface UpdateChangelogModalProps {
  isOpen: boolean;
  onClose: (reason: "skipped" | "updated" | "cancelled") => void;
  updateInfo: UpdateInfo;
}

const INITIAL_SHOW = 5;

function formatVersion(ver?: string): string {
  if (!ver) return "";
  return `v${ver.replace(/^v+/, "")}`;
}

export function UpdateChangelogModal({ isOpen, onClose, updateInfo }: UpdateChangelogModalProps) {
  const [state, setState] = useState<ModalState>("loading");
  const [changelog, setChangelog] = useState<ReleaseNote[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Fetch changelog when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setState("loading");
    setShowAll(false);
    GetChangelog()
      .then((notes) => {
        setChangelog(notes ?? []);
        setState("ready");
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : "Failed to load changelog");
        setState("fetch-error");
      });
  }, [isOpen]);

  const handleSkip = useCallback(async () => {
    await SkipVersion(updateInfo.latestVersion).catch(() => {});
    onClose("skipped");
  }, [updateInfo.latestVersion, onClose]);

  const handleUpdate = useCallback(async () => {
    setState("updating");
    setUpdateError("");
    try {
      await ApplyUpdate();
      setState("success");
      setTimeout(() => onClose("updated"), 3000);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "Update failed");
      setState("update-error");
    }
  }, [onClose]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && state !== "updating") {
      onClose("cancelled");
    }
  }, [state, onClose]);

  const visibleNotes = showAll ? changelog : changelog.slice(0, INITIAL_SHOW);
  const hiddenCount = changelog.length - INITIAL_SHOW;
  const isUpdating = state === "updating";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col" showCloseButton={!isUpdating && state !== "success"}>
        <DialogHeader className="shrink-0">
          <div>
            <DialogTitle className="text-lg">Update Available</DialogTitle>
            <DialogDescription className="mt-0.5">
              {formatVersion(updateInfo.currentVersion)} → {formatVersion(updateInfo.latestVersion)}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1 overflow-y-auto pr-1">
          {/* Loading */}
          {state === "loading" && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Icon name="loader" tone="muted" className="size-4 animate-spin" />
              <span className="text-sm">Loading changelog…</span>
            </div>
          )}

          {/* Fetch error */}
          {state === "fetch-error" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <Icon name="alert-circle" tone="danger" className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Could not load changelog</p>
                <p className="text-xs text-red-400/70 mt-0.5">{fetchError}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {state === "success" && (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Icon name="check-circle" tone="success" className="size-5" />
              <span className="text-sm font-medium text-emerald-400">
                Updated to {formatVersion(updateInfo.latestVersion)} — Restart to apply
              </span>
            </div>
          )}

          {/* Update error */}
          {state === "update-error" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
              <Icon name="alert-circle" tone="danger" className="size-4 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{updateError}</p>
            </div>
          )}

          {/* Updating progress */}
          {state === "updating" && (
            <div className="flex items-center justify-center py-6 gap-2 text-primary">
              <Icon name="loader" tone="brand" className="size-4 animate-spin" />
              <span className="text-sm">Downloading update…</span>
            </div>
          )}

          {/* Changelog entries */}
          {(state === "ready" || state === "update-error") && changelog.length > 0 && (
            <div className="space-y-4">
              {visibleNotes.map((note) => (
                <div key={note.version}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      {formatVersion(note.version)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{note.date}</span>
                  </div>
                  <div className="pl-1">{renderChangelogMarkdown(note.notes)}</div>
                </div>
              ))}
              {!showAll && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Icon name="chevron-down" tone="muted" className="size-3" />
                  Show {hiddenCount} more version{hiddenCount !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          )}
        </DialogBody>

        {/* Footer */}
        {state !== "success" && (
          <DialogFooter className="shrink-0">
            {(state === "ready" || state === "update-error") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkip}
                disabled={isUpdating}
              >
                Skip This Version
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleUpdate}
              disabled={isUpdating}
              className="gap-2"
            >
              {isUpdating && <Icon name="loader" className="size-3.5 animate-spin" />}
              {isUpdating ? "Updating…" : `Update to ${formatVersion(updateInfo.latestVersion)}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { UpdateInfo, ReleaseNote };

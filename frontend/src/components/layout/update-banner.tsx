import { useEffect, useState, useCallback } from "react";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { CheckForUpdate } from "@/lib/wails-client";
import { UpdateChangelogModal } from "@/components/layout/update-changelog-modal";
import type { UpdateInfo } from "@/components/layout/update-changelog-modal";
import { cn } from "@/lib/utils";
import { waitForWails } from "@/lib/wails-ready";
import { Icon } from "@/components/ui/icon";

/**
 * Sidebar update banner — shows when a new version is available.
 * Listens for "update:available" Wails events + startup check.
 * Clicking "Update Now" opens the changelog modal.
 */
export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [restartReady, setRestartReady] = useState(false);

  // Startup check — wait for Wails runtime first
  useEffect(() => {
    waitForWails().then(() => {
      CheckForUpdate().then((info) => {
        if (info?.available && !info?.skipped) {
          setUpdateInfo(info as UpdateInfo);
          setDismissed(false);
        }
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  // Listen for backend-pushed update events (periodic check)
  useEffect(() => {
    const cancel = EventsOn("update:available", (info: UpdateInfo) => {
      // Auto-check: suppress banner for skipped versions
      if (info?.available && !info?.skipped) {
        setUpdateInfo(info);
        setDismissed(false);
      }
    });
    return () => { cancel(); };
  }, []);

  const handleModalClose = useCallback((reason: "skipped" | "updated" | "cancelled") => {
    setShowModal(false);
    if (reason === "skipped") {
      setDismissed(true);
    } else if (reason === "updated") {
      setRestartReady(true);
    }
  }, []);

  if (!updateInfo?.available || dismissed) {
    if (!restartReady) return null;
  }

  if (restartReady) {
    return (
      <div className="mx-3 mb-3">
        <div className="relative rounded-xl border px-3.5 py-3 bg-emerald-500/10 border-emerald-500/20">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" tone="success" className="size-3.5" />
            <span className="text-[11px] font-semibold text-emerald-400">
              Updated to {updateInfo?.latestVersion}
            </span>
          </div>
          <p className="text-[10px] text-emerald-400/60 mt-1">Restart the app to use the new version.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-3 mb-3">
        <div className={cn(
          "relative rounded-xl border px-3.5 py-3 transition-[opacity,border-color,background-color] duration-200 ease-out",
          "bg-primary/10 border-primary/20"
        )}>
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Dismiss update"
          >
            <Icon name="x" className="size-3" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Icon name="arrow-down-circle" tone="brand" className="size-3.5" />
            <span className="text-[11px] font-semibold text-primary">
              {updateInfo!.latestVersion} Available
            </span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="w-full mt-1.5 text-[11px] font-medium py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
          >
            Update Now
          </button>
        </div>
      </div>

      <UpdateChangelogModal
        isOpen={showModal}
        onClose={handleModalClose}
        updateInfo={updateInfo!}
      />
    </>
  );
}

export type { UpdateInfo };

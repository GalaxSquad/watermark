/**
 * App Configuration Types
 *
 * Re-exports Wails-generated model classes as the canonical types.
 */

import * as config from "../../bindings/watermark-01/internal/config/models";

export type ClusterProfile = config.ClusterProfile;
export type AppSettings = config.AppSettings;

/* Convenience aliases — Wails generates `color: string` etc. */
export type ThemeMode = "dark" | "light" | "system";
export type UIDensity = "compact" | "comfortable" | "spacious";
export type ClusterColor = "red" | "orange" | "green" | "purple";

/** Accent color presets (DESIGN.md §2). Violet is the default — the
 *  pre-existing look. Other presets only swap the accent tokens
 *  (--primary, --ring, --sidebar-primary, --sidebar-ring,
 *  --icon-brand-primary); semantic colors never change. */
export type AccentPreset =
  | "violet"
  | "stream"
  | "phosphor"
  | "amber"
  | "ocean"
  | "rose"
  | "coral"
  | "indigo"
  | "lime"
  | "graphite";

export const ACCENT_PRESETS: Record<AccentPreset, { label: string; value: string }> = {
  violet: { label: "Violet", value: "#8B5CF6" },
  stream: { label: "Stream", value: "#3AAFA9" },
  phosphor: { label: "Phosphor", value: "#5BC98A" },
  amber: { label: "Amber", value: "#E8A33D" },
  ocean: { label: "Ocean", value: "#4B8DFF" },
  rose: { label: "Rose", value: "#F0568A" },
  coral: { label: "Coral", value: "#F26D3D" },
  indigo: { label: "Indigo", value: "#7575F8" },
  lime: { label: "Lime", value: "#A3E635" },
  graphite: { label: "Graphite", value: "#D8DEE6" },
};

/** Row height and padding per density mode */
export const DENSITY_CONFIG: Record<UIDensity, { rowHeight: string; padding: string }> = {
  compact: { rowHeight: "36px", padding: "py-2 px-4" },
  comfortable: { rowHeight: "48px", padding: "py-3 px-6" },
  spacious: { rowHeight: "56px", padding: "py-4 px-6" },
};

/** Vertical cell padding per density mode, applied by tables.
 *  Horizontal padding stays px-4 everywhere so the default
 *  (comfortable) look is unchanged from the pre-density layout. */
export const DENSITY_CELL_PADDING: Record<UIDensity, string> = {
  compact: "py-1.5",
  comfortable: "py-3",
  spacious: "py-4",
};

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

/** Row height and padding per density mode */
export const DENSITY_CONFIG: Record<UIDensity, { rowHeight: string; padding: string }> = {
  compact: { rowHeight: "36px", padding: "py-2 px-4" },
  comfortable: { rowHeight: "48px", padding: "py-3 px-6" },
  spacious: { rowHeight: "56px", padding: "py-4 px-6" },
};

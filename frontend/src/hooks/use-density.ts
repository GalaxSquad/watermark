import { useSettingsStore } from "@/store/settings";
import { DENSITY_CONFIG, DENSITY_CELL_PADDING } from "@/types/config";

/**
 * Table density hook — the UI Density setting (Preferences > Appearance)
 * wired into tables. Returns the row min-height from DENSITY_CONFIG plus
 * the vertical cell-padding class for the current density.
 *
 * Tables apply `rowHeight` as an inline `height` on <tr> (a minimum —
 * content can grow taller) and `cellPadding` on <td>/<th> in place of
 * the previous fixed `py-3`.
 */
export function useDensity() {
  const density = useSettingsStore((s) => s.density);
  return {
    density,
    rowHeight: DENSITY_CONFIG[density].rowHeight,
    cellPadding: DENSITY_CELL_PADDING[density],
  };
}

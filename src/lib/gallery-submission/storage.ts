import type { CustomSet } from "@/types/deboss";
import { CUSTOM_SETS_STORAGE_KEY } from "@/lib/deboss/constants";

/**
 * Standalone, one-shot reader of the SAME localStorage key
 * useDebossStudio.ts's own custom-sets load effect reads (same shape, same
 * try/catch defensiveness). Needed because the navbar's "Create" picker
 * (CreateLauncher.tsx) renders on every page, including pages with no
 * useDebossStudio hook instance (that hook also drives canvas rendering/
 * font loading, unnecessary overhead outside the studio page). This never
 * writes, so it carries none of that hook's persist-guard/ref machinery;
 * if CUSTOM_SETS_STORAGE_KEY's shape ever changes, update both call sites.
 */
export function getStoredCustomSets(): CustomSet[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_SETS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomSet[]) : [];
  } catch {
    return [];
  }
}

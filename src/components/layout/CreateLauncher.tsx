"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { CustomSet } from "@/types/deboss";
import { DEFAULT_TEXT_BLOCK } from "@/lib/deboss/constants";
import { isGallerySubmissionConfigured } from "@/config/gallery-submission";
import { getStoredCustomSets } from "@/lib/gallery-submission/storage";
import { SetPickerModal } from "@/components/studio/SetPickerModal";
import { GallerySubmissionModal } from "@/components/studio/GallerySubmissionModal";

/**
 * The navbar's "Create" CTA (Header.tsx): opens a picker of the visitor's
 * own saved sets (read directly from localStorage via getStoredCustomSets,
 * since this renders on every page, not just the studio page where the
 * full useDebossStudio hook lives), then the shared submission modal
 * paired with DEFAULT_TEXT_BLOCK (there's no live canvas/text here, unlike
 * the studio page's chip entry point in RequestPostButton.tsx).
 *
 * Rendered twice in Header.tsx (desktop + mobile panel, same pattern as
 * NAV_LINKS mapping twice); each instance owns its own open/chosen state,
 * harmless since the two are never visible at once (globals.css's
 * 880px breakpoint shows exactly one).
 */
export function CreateLauncher({ mobile = false }: { mobile?: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenSet, setChosenSet] = useState<CustomSet | null>(null);

  // The whole point of this CTA is launching the submission flow; until
  // the owner supplies real EmailJS/Apps Script config there is nothing
  // useful for it to do, so it doesn't render at all rather than opening
  // a picker that dead-ends at GallerySubmissionModal's "not set up" state.
  if (!isGallerySubmissionConfigured()) return null;

  return (
    <>
      <button
        type="button"
        className={`navbar-cta${mobile ? " navbar-cta-mobile" : ""}`}
        onClick={() => setPickerOpen(true)}
      >
        <Sparkles size={15} aria-hidden="true" />
        Create
      </button>

      {pickerOpen && (
        <SetPickerModal
          sets={getStoredCustomSets()}
          onPick={(set) => {
            setChosenSet(set);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {chosenSet && (
        <GallerySubmissionModal
          targetSet={chosenSet}
          textBlocks={[DEFAULT_TEXT_BLOCK]}
          sourceKind="navbar"
          onClose={() => setChosenSet(null)}
        />
      )}
    </>
  );
}

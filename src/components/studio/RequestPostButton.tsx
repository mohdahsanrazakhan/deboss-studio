"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { CustomSet, TextBlock } from "@/types/deboss";
import { isGallerySubmissionConfigured } from "@/config/gallery-submission";
import { GallerySubmissionModal } from "./GallerySubmissionModal";

/**
 * The set-chip's 4th action (after star/name/delete, see ControlPanel.tsx):
 * opens the shared GallerySubmissionModal for THIS set, paired with the
 * current on-canvas text blocks (the studio page always has a live canvas,
 * unlike the navbar's CreateLauncher.tsx entry point).
 */
export function RequestPostButton({
  set,
  textBlocks,
}: {
  set: CustomSet;
  textBlocks: TextBlock[];
}) {
  const [open, setOpen] = useState(false);
  if (!isGallerySubmissionConfigured()) return null;

  return (
    <>
      <button
        type="button"
        className="set-chip-request"
        aria-label={`Request to post "${set.name}" on the gallery`}
        title="Request to post on gallery"
        onClick={() => setOpen(true)}
      >
        <Sparkles size={12} aria-hidden="true" />
      </button>
      {open && (
        <GallerySubmissionModal
          targetSet={set}
          textBlocks={textBlocks}
          sourceKind="chip"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

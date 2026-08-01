"use client";

import Link from "next/link";
import type { CustomSet } from "@/types/deboss";

interface SetPickerModalProps {
  sets: CustomSet[];
  onPick: (set: CustomSet) => void;
  onClose: () => void;
}

/**
 * The navbar "Create" entry point's first step: pick one of the visitor's
 * own saved sets to request posting on the gallery (CreateLauncher.tsx).
 * Reuses the .modal-overlay/.modal pattern (ConfirmDialog.tsx); rows stay
 * plain text for now, matching .set-chip-name's existing look, rather than
 * rendering a GalleryPreview thumbnail per row (up to MAX_CUSTOM_SETS at
 * once on modal open is not worth the font-load/canvas cost up front).
 */
export function SetPickerModal({ sets, onPick, onClose }: SetPickerModalProps) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal gallery-submit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="set-picker-title">Pick a set to submit</h2>

        {sets.length > 0 ? (
          <div className="set-picker-list" role="list">
            {sets.map((set) => (
              <button
                key={set.id}
                type="button"
                role="listitem"
                className="set-picker-row"
                onClick={() => onPick(set)}
              >
                {set.name}
              </button>
            ))}
          </div>
        ) : (
          <p>
            You don&apos;t have any saved sets yet. Open the studio, tune the controls to your
            taste, and save a look as a set first.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          {sets.length === 0 && (
            <Link href="/" className="btn primary" onClick={onClose}>
              Go to the studio
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

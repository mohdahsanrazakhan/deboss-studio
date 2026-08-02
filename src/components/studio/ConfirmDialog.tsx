"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small reusable confirm/cancel modal, used for destructive actions like
 * deleting a saved set. Portaled to document.body, same fix already applied
 * to GallerySubmissionModal.tsx/SetPickerModal.tsx: `.panel` (the sidebar)
 * is `position: sticky`, which establishes its own stacking context, so a
 * `position: fixed` modal nested inside it paints behind the canvas
 * (a DOM sibling with no z-index that simply comes later in layout) no
 * matter how high the modal's own z-index is.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the safe (cancel) action by default for keyboard users.
    cancelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            ref={cancelRef}
            className="btn ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="button" className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

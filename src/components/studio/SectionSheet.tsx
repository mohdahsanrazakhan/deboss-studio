"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DebossState } from "@/types/deboss";
import { MiniPreview } from "./MiniPreview";

interface SectionSheetProps {
  id: string;
  title: string;
  openSection: string | null;
  onClose: () => void;
  /** Live style, used only to render the floating MiniPreview while this sheet is open. */
  previewState: DebossState;
  children: React.ReactNode;
}

/**
 * Wraps a control-panel section so the SAME markup can serve two roles:
 * on wide screens (see the max-width:880px rules in globals.css) it's a
 * plain passthrough div and `children` render inline as always; on narrow
 * screens it becomes a bottom sheet, hidden until `openSection === id`.
 *
 * No JS viewport detection is needed — the visual mode is 100% CSS-driven
 * off the `is-open` class. The only things that ever set `openSection` are
 * the mobile-menu buttons in ControlPanel, which are themselves CSS-hidden
 * on wide screens, so `isOpen` can only become true from a mobile context
 * in the first place — that's what makes it safe to key `role`/`aria-modal`
 * off `isOpen` alone below, with no separate "is this mobile" check.
 */
export function SectionSheet({
  id,
  title,
  openSection,
  onClose,
  previewState,
  children,
}: SectionSheetProps) {
  const isOpen = openSection === id;
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock background scroll while the sheet is up
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className={`section-modal${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="section-modal-backdrop"
        aria-label={`Close ${title}`}
        tabIndex={-1}
        onClick={onClose}
      />
      {/* Sibling of .section-modal-panel, not nested inside it — the panel's
          slide-up animation briefly applies a transform, which would hijack
          this element's `position: fixed` containing block if it were a
          descendant. */}
      {isOpen && <MiniPreview state={previewState} />}
      <div
        className="section-modal-panel"
        role={isOpen ? "dialog" : undefined}
        aria-modal={isOpen || undefined}
        aria-label={title}
      >
        <div className="section-modal-header">
          <span>{title}</span>
          <button
            type="button"
            ref={closeRef}
            className="section-modal-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

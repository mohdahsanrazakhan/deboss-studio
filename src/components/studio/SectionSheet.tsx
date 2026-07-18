"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import type { DebossState } from "@/types/deboss";
import { MiniPreview } from "./MiniPreview";

interface SectionSheetProps {
  id: string;
  title: string;
  /** Shown in the desktop accordion header, matching the icon used for this section's mobile-menu button. */
  icon: ComponentType<{ size?: number; "aria-hidden"?: React.AriaAttributes["aria-hidden"] }>;
  openSection: string | null;
  onToggle: () => void;
  onClose: () => void;
  /** Live style, used only to render the floating MiniPreview while this sheet is open. */
  previewState: DebossState;
  children: React.ReactNode;
}

/**
 * Wraps a control-panel section so the SAME markup can serve two roles:
 * on wide screens it's an accordion item (a clickable header that expands/
 * collapses `children` in place, see the max-width:880px rules in
 * globals.css for the switchover point), so tweaking one section doesn't
 * force scrolling past every other one; on narrow screens it's a bottom
 * sheet, hidden until `openSection === id`.
 *
 * No JS viewport detection is needed: the visual mode is 100% CSS-driven.
 * `openSection` is shared between both roles (the mobile-menu buttons in
 * ControlPanel and this component's own accordion header both just call
 * onToggle/onClose), so only one section is ever open at a time either way.
 */
export function SectionSheet({
  id,
  title,
  icon: Icon,
  openSection,
  onToggle,
  onClose,
  previewState,
  children,
}: SectionSheetProps) {
  const isOpen = openSection === id;
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    // Body scroll lock is a mobile-bottom-sheet-only behaviour: on desktop
    // this same isOpen state instead drives an inline accordion section, and
    // locking the page there just cuts off any controls below the fold.
    // 880px must stay in sync with the max-width:880px switchover in
    // globals.css, the same breakpoint that flips this component between
    // the two modes.
    const isMobileSheet = window.matchMedia("(max-width: 880px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (isMobileSheet) {
      document.body.style.overflow = "hidden";
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (isMobileSheet) {
        document.body.style.overflow = previousOverflow;
      }
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
      {/* Sibling of .section-modal-panel, not nested inside it: the panel's
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
        {/* Desktop-only accordion trigger: CSS-hidden on narrow screens,
            where the separate .mobile-menu grid + the close button below
            are what open/close this section instead. */}
        <button
          type="button"
          className="accordion-header"
          aria-expanded={isOpen}
          onClick={onToggle}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="accordion-header-label">{title}</span>
          <ChevronDown size={16} className="accordion-chevron" aria-hidden="true" />
        </button>
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
        <div className={`accordion-body${isOpen ? " is-open" : ""}`}>
          <div className="accordion-body-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}

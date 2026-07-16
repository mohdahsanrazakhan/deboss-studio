"use client";

import { useEffect, useRef } from "react";
import type { DebossState } from "@/types/deboss";
import { MAX_PREVIEW_DPR } from "@/lib/deboss/constants";
import { computeLayout, drawScene, ensureFont } from "@/lib/deboss/engine";

type GalleryPreviewProps = {
  state: DebossState;
  /** Logical CSS px width to render at; height follows from the text layout. */
  width?: number;
  /** Accessible label; the canvas has no text alternative of its own. */
  label: string;
  /** Wrapper class; defaults to the padded checkerboard swatch used on the
   *  individual example page. The gallery index overrides this so the
   *  canvas can sit edge-to-edge inside its own card media box instead. */
  className?: string;
};

/**
 * A static, read-only render of a full GalleryExample using the real engine
 * (computeLayout + drawScene), not a CSS approximation. Unlike MiniPreview
 * (a single-glyph swatch for the mobile sheet peek, aria-hidden since the
 * real interactive canvas exists alongside it), this renders an example's
 * actual multi-line text at a real display size and is the only visual
 * representation of that example on the page, so it carries its own
 * accessible label instead of being hidden.
 *
 * This is a new, independent display context, not the Studio's own
 * PreviewStage or export path, so it sits outside the preview/export
 * parity rule (CLAUDE.md #1); reusing the real engine here anyway is more
 * accurate than a CSS approximation would be.
 */
export function GalleryPreview({
  state,
  width = 360,
  label,
  className = "gallery-preview",
}: GalleryPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      await Promise.all([ensureFont(state.font, state.fontSize), document.fonts.ready]);
      if (cancelled) return;

      const layout = computeLayout(state, width);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PREVIEW_DPR);
      drawScene(canvas, state, layout, dpr, state.transparent);
      canvas.style.width = `${layout.logicalW}px`;
      canvas.style.height = `${layout.logicalH}px`;
    })();

    return () => {
      cancelled = true;
    };
  }, [state, width]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
}

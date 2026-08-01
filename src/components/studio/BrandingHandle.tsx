"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DebossStudio } from "@/hooks/useDebossStudio";
import { CENTER_SNAP_THRESHOLD_PX } from "@/lib/deboss/constants";
import { measureBrandingBox } from "@/lib/deboss/engine";

type Box = { left: number; top: number; width: number; height: number };

/**
 * Invisible pointer-capture overlay for dragging the branding watermark
 * around the canvas. The watermark itself is baked into the canvas pixels
 * by drawBranding (engine.ts) so preview and export stay pixel-identical
 * (CLAUDE.md hard rule #1); this component only ever reads/writes
 * `state.brandingX/Y`, it never draws the text itself.
 *
 * The hit-box is computed with `measureBrandingBox`, the SAME formula
 * `drawBranding` uses to draw, so the draggable area always matches what's
 * actually on screen. Positioned via `canvas.offsetLeft/Top` against
 * `.stage-inner` (its positioned ancestor, see globals.css), so no manual
 * bounding-rect subtraction is needed for the resting position; a
 * ResizeObserver keeps it in sync when the stage's fluid width changes
 * (state alone doesn't change on a pure window resize).
 */
export function BrandingHandle({ studio }: { studio: DebossStudio }) {
  const { state, canvasRef, setBrandingPosition, setActiveGuides } = studio;
  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const recompute = () => {
      const text = state.brandingText.trim();
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!text || !w || !h) {
        setBox(null);
        return;
      }
      const { width, height } = measureBrandingBox(state);
      setBox({
        left: canvas.offsetLeft + state.brandingX * w - width / 2,
        top: canvas.offsetTop + state.brandingY * h - height / 2,
        width,
        height,
      });
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [state, canvasRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!rect.width || !rect.height || !w || !h) return;

      const { width, height } = measureBrandingBox(state);
      // Cap at 0.5 so a branding box wider/taller than the canvas itself
      // can't invert the clamp range below.
      const halfWNorm = Math.min(0.5, width / 2 / w);
      const halfHNorm = Math.min(0.5, height / 2 / h);

      let x = (e.clientX - rect.left) / rect.width;
      let y = (e.clientY - rect.top) / rect.height;
      x = Math.min(1 - halfWNorm, Math.max(halfWNorm, x));
      y = Math.min(1 - halfHNorm, Math.max(halfHNorm, y));

      // Same Canva-style center snap as CanvasTextOverlay.tsx's BlockOverlay
      // (see that file for the full reasoning); the two draggables share
      // studio.activeGuides since only one can be dragging at a time.
      const snapV = Math.abs(x - 0.5) * w <= CENTER_SNAP_THRESHOLD_PX;
      const snapH = Math.abs(y - 0.5) * h <= CENTER_SNAP_THRESHOLD_PX;
      if (snapV) x = 0.5;
      if (snapH) y = 0.5;
      setActiveGuides({ v: snapV, h: snapH });

      setBrandingPosition(x, y);
    },
    [state, canvasRef, setBrandingPosition, setActiveGuides],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    setDragging(false);
    setActiveGuides({ v: false, h: false });
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer capture already released */
    }
  }, [setActiveGuides]);

  if (!box) return null;

  return (
    <div
      className={`branding-handle${dragging ? " is-dragging" : ""}`}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-hidden="true"
    />
  );
}

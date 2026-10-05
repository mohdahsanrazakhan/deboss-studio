"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DebossStudio } from "@/hooks/useDebossStudio";
import type { LogoAnchor } from "@/types/deboss";
import { CENTER_SNAP_THRESHOLD_PX } from "@/lib/deboss/constants";
import { resolveLogoBox } from "@/lib/deboss/engine";

type Box = { left: number; top: number; width: number; height: number };

/** Snapped anchors a drag can lock back onto (everything except "custom"). */
const SNAP_ANCHORS: Exclude<LogoAnchor, "custom">[] = ["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br"];
/** Logical px: how close a dragged logo's center must get to a snapped anchor's center to lock onto it. A bit wider than the plain center-guide threshold because it snaps on both axes at once. */
const ANCHOR_SNAP_PX = 10;

/**
 * Invisible pointer-capture overlay for dragging the logo watermark, the
 * same pattern as BrandingHandle.tsx: the logo is baked into the canvas by
 * drawLogo (engine.ts), this only reads/writes `state.logo`. Its box comes
 * from `resolveLogoBox`, the same formula drawLogo uses, so the draggable
 * area always matches the drawn mark.
 *
 * Dragging keeps the grab offset (the logo doesn't jump to center itself
 * under the pointer), and releasing near one of the 9 snapped positions
 * locks back onto that exact anchor (so the margin stays exact) instead of
 * leaving a near-miss custom x/y.
 */
export function LogoHandle({ studio }: { studio: DebossStudio }) {
  const { state, canvasRef, updateLogo, setLogoPosition, setActiveGuides } = studio;
  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  // Pointer position minus logo center at grab time, in logical px.
  const grabOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const recompute = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!state.logo.enabled || !w || !h) {
        setBox(null);
        return;
      }
      const { cx, cy, width, height } = resolveLogoBox(state, w, h);
      setBox({
        left: canvas.offsetLeft + cx - width / 2,
        top: canvas.offsetTop + cy - height / 2,
        width,
        height,
      });
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [state, canvasRef]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const { cx, cy } = resolveLogoBox(state, w, h);
      // Rect is in CSS px of the rendered canvas; offsetWidth is the same
      // logical size unless something scales it, so convert defensively.
      const px = ((e.clientX - rect.left) / rect.width) * w;
      const py = ((e.clientY - rect.top) / rect.height) * h;
      grabOffsetRef.current = { x: px - cx, y: py - cy };
      draggingRef.current = true;
      setDragging(true);
    },
    [state, canvasRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!rect.width || !rect.height || !w || !h) return;

      const { width, height } = resolveLogoBox(state, w, h);
      const halfW = Math.min(w / 2, width / 2);
      const halfH = Math.min(h / 2, height / 2);

      let cx = ((e.clientX - rect.left) / rect.width) * w - grabOffsetRef.current.x;
      let cy = ((e.clientY - rect.top) / rect.height) * h - grabOffsetRef.current.y;
      cx = Math.min(w - halfW, Math.max(halfW, cx));
      cy = Math.min(h - halfH, Math.max(halfH, cy));

      // Lock onto an exact snapped position when close to one.
      for (const anchor of SNAP_ANCHORS) {
        const target = resolveLogoBox({ ...state, logo: { ...state.logo, anchor } }, w, h);
        if (Math.abs(target.cx - cx) <= ANCHOR_SNAP_PX && Math.abs(target.cy - cy) <= ANCHOR_SNAP_PX) {
          setActiveGuides({ v: anchor[1] === "c" || anchor === "c", h: anchor[0] === "m" || anchor === "c" });
          if (state.logo.anchor !== anchor) updateLogo({ anchor });
          return;
        }
      }

      // Otherwise the same Canva-style center snap as BrandingHandle.tsx.
      const snapV = Math.abs(cx - w / 2) <= CENTER_SNAP_THRESHOLD_PX;
      const snapH = Math.abs(cy - h / 2) <= CENTER_SNAP_THRESHOLD_PX;
      if (snapV) cx = w / 2;
      if (snapH) cy = h / 2;
      setActiveGuides({ v: snapV, h: snapH });

      setLogoPosition(cx / w, cy / h);
    },
    [state, canvasRef, updateLogo, setLogoPosition, setActiveGuides],
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

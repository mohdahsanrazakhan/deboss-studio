"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { DebossStudio } from "@/hooks/useDebossStudio";
import { MAX_TEXT_LENGTH, PAD_X } from "@/lib/deboss/constants";
import { computeLayout, isPaperDark, measureBlockBox } from "@/lib/deboss/engine";
import { stripTags } from "@/lib/deboss/richtext";
import type { Layout, TextBlock } from "@/types/deboss";

/**
 * Loaded via next/dynamic so Tiptap's bytes stay out of the tracked First
 * Load JS (docs/SEO-PLAN.md's guardrail) until the user actually clicks to
 * edit: mounted only while a block is being edited, unlike the old sidebar
 * box that loaded it unconditionally on first paint.
 */
const RichTextEditor = dynamic(
  () => import("./RichTextEditor").then((m) => m.RichTextEditor),
  { ssr: false },
);

const DRAG_THRESHOLD_PX = 5;
const MIN_HIT_WIDTH = 160;
const MIN_HIT_HEIGHT = 60;
// Safety margin on the idle/drag hit-box's measured width: guards against a
// widest line re-wrapping one word early inside the (narrower) edit
// container due to canvas-vs-DOM sub-pixel rounding differences.
const WRAP_SAFETY_MARGIN = 4;

type Box = { left: number; top: number; width: number; height: number };

/** Content-hugging box for the idle hover/click/drag hit-region, selection outline, and drag clamping. Empty text falls back to a small centered placeholder so there's always something to click. */
function computeContentBox(block: TextBlock, layout: Layout, canvas: HTMLCanvasElement): Box {
  const dx = (block.textAnchorX - 0.5) * layout.logicalW;
  const dy = (block.textAnchorY - 0.5) * layout.logicalH;

  const isEmpty = !stripTags(block.text).trim();
  const measured = isEmpty
    ? { width: MIN_HIT_WIDTH, height: MIN_HIT_HEIGHT }
    : measureBlockBox(block, layout);
  const width = Math.max(measured.width + WRAP_SAFETY_MARGIN, MIN_HIT_WIDTH);
  const height = Math.max(measured.height, MIN_HIT_HEIGHT);

  let left: number;
  if (block.align === "center") {
    left = layout.logicalW / 2 + dx - width / 2;
  } else if (block.align === "right") {
    left = layout.logicalW - PAD_X + dx - width;
  } else {
    left = PAD_X + dx;
  }
  const top = layout.logicalH / 2 + dy - height / 2;

  return { left: canvas.offsetLeft + left, top: canvas.offsetTop + top, width, height };
}

/** Full wrap-width box the editor mounts into: same width buildBlockMask wraps text at (PAD_X to logicalW-PAD_X, shifted by the drag offset), so typing/wrapping matches the canvas exactly regardless of content length. text-align (CSS) reproduces buildBlockMask's per-align tx within this fixed container. */
function computeEditBox(block: TextBlock, layout: Layout, canvas: HTMLCanvasElement): Box {
  const dx = (block.textAnchorX - 0.5) * layout.logicalW;
  const dy = (block.textAnchorY - 0.5) * layout.logicalH;

  const isEmpty = !stripTags(block.text).trim();
  const measured = isEmpty
    ? { width: 0, height: block.fontSize * block.lineHeightFactor }
    : measureBlockBox(block, layout);
  const height = Math.max(measured.height, block.fontSize * block.lineHeightFactor);

  const width = layout.logicalW - PAD_X * 2;
  const left = PAD_X + dx;
  const top = layout.logicalH / 2 + dy - height / 2;

  return { left: canvas.offsetLeft + left, top: canvas.offsetTop + top, width, height };
}

/** Normalizes a client-space point against the canvas's own box, clamped to [0,1]. */
function normalizedPointOnCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const x = rect.width ? (clientX - rect.left) / rect.width : 0.5;
  const y = rect.height ? (clientY - rect.top) / rect.height : 0.5;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

type BlockOverlayProps = {
  studio: DebossStudio;
  block: TextBlock;
  contentBox: Box;
  editBox: Box;
  isSelected: boolean;
  isEditing: boolean;
};

/** One block's idle hit-region (+ selection outline/delete control) or edit container. Click (no drag) selects + edits; drag selects + moves without editing. */
function BlockOverlay({ studio, block, contentBox, editBox, isSelected, isEditing }: BlockOverlayProps) {
  const { state, canvasRef, textRevision, updateTextBlock, setBlockPosition, deleteTextBlock, setSelectedBlockId, setEditingBlockId } = studio;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Exit editing on Escape or a pointerdown outside this block's own editor+toolbar.
  useEffect(() => {
    if (!isEditing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingBlockId(null);
    };
    const onPointerDownOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      // The floating formatting toolbar is portaled to document.body (see
      // RichTextEditor.tsx), so it's never a DOM descendant of this block's
      // own edit container; without this check every tap on it reads as an
      // "outside" click and exits edit mode before the format action can
      // ever run, which shipped as a real bug caught while fixing mobile
      // formatting (selection appeared to just vanish on tap).
      if ((target as HTMLElement).closest?.(".rich-text-toolbar")) return;
      setEditingBlockId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDownOutside);
    };
  }, [isEditing, setEditingBlockId]);

  // Delete key removes this block, but only while it's selected-not-editing
  // (mid-typing, Delete/Backspace must keep editing text, never the block).
  useEffect(() => {
    if (!isSelected || isEditing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // some other field has focus
      deleteTextBlock(block.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSelected, isEditing, deleteTextBlock, block.id]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      const canvas = canvasRef.current;
      if (!start || !canvas) return;

      if (!draggingRef.current) {
        const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        if (moved < DRAG_THRESHOLD_PX) return;
        draggingRef.current = true;
        setSelectedBlockId(block.id);
      }

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const layout = computeLayout(state, canvas.offsetWidth);
      const halfWNorm = Math.min(0.5, contentBox.width / 2 / rect.width);
      const halfHNorm = Math.min(0.5, contentBox.height / 2 / rect.height);

      let centerXNorm = (e.clientX - rect.left) / rect.width;
      let centerYNorm = (e.clientY - rect.top) / rect.height;
      centerXNorm = Math.min(1 - halfWNorm, Math.max(halfWNorm, centerXNorm));
      centerYNorm = Math.min(1 - halfHNorm, Math.max(halfHNorm, centerYNorm));

      // Base center (the box's center when textAnchor is 0.5/0.5, i.e. dx=0)
      // depends on align; the drag offset is the difference from there, the
      // same relationship buildBlockMask's tx formulas encode.
      let baseCenterXNorm: number;
      if (block.align === "center") {
        baseCenterXNorm = 0.5;
      } else if (block.align === "right") {
        baseCenterXNorm = (layout.logicalW - PAD_X - contentBox.width / 2) / layout.logicalW;
      } else {
        baseCenterXNorm = (PAD_X + contentBox.width / 2) / layout.logicalW;
      }
      const dxNorm = centerXNorm - baseCenterXNorm;
      const dyNorm = centerYNorm - 0.5;

      setBlockPosition(block.id, 0.5 + dxNorm, 0.5 + dyNorm);
    },
    [state, canvasRef, block.id, block.align, contentBox, setBlockPosition, setSelectedBlockId],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const wasDragging = draggingRef.current;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer capture already released */
      }
      draggingRef.current = false;
      pointerStartRef.current = null;
      if (!wasDragging) {
        setSelectedBlockId(block.id);
        setEditingBlockId(block.id);
      }
    },
    [block.id, setSelectedBlockId, setEditingBlockId],
  );

  if (isEditing) {
    // Plain preview colour while typing must adapt to the paper the same
    // way the branding watermark does: PAPER_TONES includes "Black", and a
    // fixed dark ink colour would go invisible on it.
    const overlayClassName = isPaperDark(state.paper)
      ? "canvas-text-overlay is-dark-paper"
      : "canvas-text-overlay";
    return (
      <div
        ref={containerRef}
        className={overlayClassName}
        style={{ left: editBox.left, top: editBox.top, width: editBox.width, height: editBox.height }}
      >
        <RichTextEditor
          value={block.text}
          onChange={(text) => updateTextBlock(block.id, { text })}
          font={block.font}
          baseSize={block.fontSize}
          maxLength={MAX_TEXT_LENGTH}
          externalRevision={textRevision}
          align={block.align}
          letterSpacing={block.letterSpacing}
          lineHeightFactor={block.lineHeightFactor}
        />
      </div>
    );
  }

  return (
    <div
      className={`canvas-text-hit${isSelected ? " is-selected" : ""}`}
      style={{ left: contentBox.left, top: contentBox.top, width: contentBox.width, height: contentBox.height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-hidden="true"
    >
      {isSelected && (
        <button
          type="button"
          className="canvas-text-delete"
          aria-label="Delete text block"
          title="Delete text block"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerCancel={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            deleteTextBlock(block.id);
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function CanvasTextOverlay({ studio }: { studio: DebossStudio }) {
  const { state, canvasRef, selectedBlockId, setSelectedBlockId, editingBlockId, addTextBlock } = studio;
  const [boxes, setBoxes] = useState<Record<string, { content: Box; edit: Box }>>({});
  const [canvasBox, setCanvasBox] = useState<Box | null>(null);
  const bgPointerStartRef = useRef<{ x: number; y: number; wasEditing: boolean } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const recompute = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h) {
        setBoxes({});
        setCanvasBox(null);
        return;
      }
      const sceneLayout = computeLayout(state, w);
      const next: Record<string, { content: Box; edit: Box }> = {};
      for (const block of state.textBlocks) {
        const entry = sceneLayout.blocks.find((b) => b.id === block.id);
        if (!entry) continue;
        next[block.id] = {
          content: computeContentBox(block, entry.layout, canvas),
          edit: computeEditBox(block, entry.layout, canvas),
        };
      }
      setBoxes(next);
      setCanvasBox({ left: canvas.offsetLeft, top: canvas.offsetTop, width: w, height: h });
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [state, canvasRef]);

  const handleBackgroundPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    bgPointerStartRef.current = { x: e.clientX, y: e.clientY, wasEditing: editingBlockId !== null };
  }, [editingBlockId]);

  const handleBackgroundPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = bgPointerStartRef.current;
      bgPointerStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer capture already released */
      }
      if (!start) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved >= DRAG_THRESHOLD_PX) return; // a drag-through over empty canvas: no-op
      if (start.wasEditing) {
        // This click's only job was to dismiss the editor that was open
        // (handled by that block's own outside-pointerdown listener);
        // don't also spawn a new block from the same gesture.
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      setSelectedBlockId(null);
      const { x, y } = normalizedPointOnCanvas(canvas, e.clientX, e.clientY);
      addTextBlock(x, y);
    },
    [canvasRef, addTextBlock, setSelectedBlockId],
  );

  if (!canvasBox) return null;

  return (
    <>
      <div
        className="canvas-text-background"
        style={{ left: canvasBox.left, top: canvasBox.top, width: canvasBox.width, height: canvasBox.height }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerUp={handleBackgroundPointerUp}
        aria-hidden="true"
      />
      {state.textBlocks.map((block) => {
        const box = boxes[block.id];
        if (!box) return null;
        return (
          <BlockOverlay
            key={block.id}
            studio={studio}
            block={block}
            contentBox={box.content}
            editBox={box.edit}
            isSelected={selectedBlockId === block.id}
            isEditing={editingBlockId === block.id}
          />
        );
      })}
    </>
  );
}

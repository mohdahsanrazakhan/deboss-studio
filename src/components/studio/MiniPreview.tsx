"use client";

import { useEffect, useRef } from "react";
import type { DebossState, Layout } from "@/types/deboss";
import { MAX_PREVIEW_DPR } from "@/lib/deboss/constants";
import { drawScene } from "@/lib/deboss/engine";
import { stripTags } from "@/lib/deboss/richtext";

/** Logical CSS px: kept small and fixed so it always fits the peek area above a mobile sheet. */
const MINI_SIZE = 76;

/**
 * A small floating "swatch" of the current font/engraving/paper style,
 * shown above the mobile bottom sheets (see SectionSheet) so a change made
 * inside a sheet is visible without closing it. Deliberately simplified to
 * a single glyph, since full word-wrap/aspect logic doesn't fit a box this
 * size. This is a supplementary coach-mark, not an alternate preview or
 * export path, so it's exempt from the preview/export parity rule
 * (CLAUDE.md #1): that rule is about PreviewStage vs. the exported PNG,
 * which this never touches.
 */
export function MiniPreview({ state }: { state: DebossState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const char = [...stripTags(state.text).trim()][0] ?? "A";
    const miniState: DebossState = {
      ...state,
      text: char,
      align: "center",
      fontSize: 48,
      // The watermark would be cluttered/meaningless at this size, same
      // reasoning as reducing the main text down to a single glyph.
      brandingText: "",
    };
    const layout: Layout = {
      lines: [char],
      lineHeight: 48,
      logicalW: MINI_SIZE,
      logicalH: MINI_SIZE,
    };
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PREVIEW_DPR);

    drawScene(canvas, miniState, layout, dpr, miniState.transparent);
    canvas.style.width = `${MINI_SIZE}px`;
    canvas.style.height = `${MINI_SIZE}px`;
  }, [state]);

  return (
    <div className="mini-preview" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

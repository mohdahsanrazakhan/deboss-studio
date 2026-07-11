/**
 * Deboss rendering engine
 * ---------------------------------------------------------------------
 * Everything (preview AND export) is drawn through the same `drawScene`
 * path so the downloaded PNG is pixel-identical to what the user sees,
 * just at a higher resolution.
 *
 * The engraving illusion is built from real "inner shadows" composited
 * onto the paper, which is what makes the text read as pressed INTO the
 * sheet rather than raised above it:
 *
 *   • Light source is top-left.
 *   • The upper-left inner wall of each stroke faces away from the light
 *     -> a soft DARK inner shadow.
 *   • The lower-right inner wall faces toward the light
 *     -> a soft WHITE inner highlight.
 *   • The text itself is never given a contrasting colour; it stays the
 *     colour of the paper, exactly like a blind letterpress deboss.
 *
 * This module is CLIENT-ONLY (it touches `document`) and framework-
 * agnostic: it takes a DebossState and a target canvas, nothing else.
 */

import type { DebossState, Layout } from "@/types/deboss";
import {
  ASPECT_RATIOS,
  LINE_FACTOR,
  MAX_LOGICAL_H,
  MIN_LOGICAL_H,
  PAD_X,
  PAD_Y,
} from "./constants";
import { detectTextDirection } from "./direction";

/* -------------------------------------------------------------------
   Paper grain — generated once (lazily) as a repeatable noise tile.
   Lazy so this module can be imported during SSR without touching DOM.
   ------------------------------------------------------------------- */
let _noiseTile: HTMLCanvasElement | null = null;

function getNoiseTile(): HTMLCanvasElement {
  if (_noiseTile) return _noiseTile;
  const size = 220;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Low-contrast speckle: random dark/light dots at random low alpha.
    const light = Math.random() > 0.5;
    const v = light ? 255 : 40;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = Math.random() * 42; // per-dot alpha
  }
  ctx.putImageData(img, 0, 0);
  _noiseTile = c;
  return c;
}

/* -------------------------------------------------------------------
   Text layout
   ------------------------------------------------------------------- */
let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (_measureCtx) return _measureCtx;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  _measureCtx = ctx;
  return ctx;
}

/** Wrap the text to fit maxWidth (in logical px), honouring hard \n breaks. */
function layoutLines(state: DebossState, maxWidth: number): string[] {
  const measureCtx = getMeasureCtx();
  measureCtx.font = `${state.fontSize}px "${state.font}"`;
  measureCtx.direction = detectTextDirection(state.text);

  const out: string[] = [];
  const paragraphs = state.text.replace(/\r/g, "").split("\n");

  for (const para of paragraphs) {
    if (para.trim() === "") {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (measureCtx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Compute the full layout for a given logical width. */
export function computeLayout(state: DebossState, logicalW: number): Layout {
  const lines = layoutLines(state, logicalW - PAD_X * 2);
  const lineHeight = state.fontSize * LINE_FACTOR;

  let logicalH: number;
  if (state.aspect === "auto") {
    const contentH = Math.max(lines.length, 1) * lineHeight;
    logicalH = Math.min(
      Math.max(contentH + PAD_Y * 2, MIN_LOGICAL_H),
      MAX_LOGICAL_H,
    );
  } else {
    logicalH = Math.round(logicalW / ASPECT_RATIOS[state.aspect]);
  }

  return { lines, lineHeight, logicalW, logicalH };
}

/* -------------------------------------------------------------------
   Glyph mask — the text drawn solid on a transparent canvas
   ------------------------------------------------------------------- */
function buildMask(
  state: DebossState,
  pxW: number,
  pxH: number,
  s: number,
  layout: Layout,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = pxW;
  c.height = pxH;
  const x = c.getContext("2d");
  if (!x) throw new Error("Canvas 2D context unavailable");

  x.fillStyle = "#000";
  x.direction = detectTextDirection(state.text); // full bidi shaping for the detected script
  x.textBaseline = "middle";
  x.font = `${state.fontSize * s}px "${state.font}"`;

  let tx: number;
  if (state.align === "center") {
    x.textAlign = "center";
    tx = (layout.logicalW / 2) * s;
  } else if (state.align === "right") {
    x.textAlign = "right";
    tx = (layout.logicalW - PAD_X) * s;
  } else {
    x.textAlign = "left";
    tx = PAD_X * s;
  }

  const blockH = layout.lines.length * layout.lineHeight;
  const startY = (layout.logicalH - blockH) / 2 + layout.lineHeight / 2;

  layout.lines.forEach((line, i) => {
    const y = (startY + i * layout.lineHeight) * s;
    if (line) x.fillText(line, tx, y);
  });
  return c;
}

/* -------------------------------------------------------------------
   Inner-shadow generator (the heart of the deboss effect)
   ------------------------------------------------------------------- */
/**
 * Returns a canvas containing a coloured inner shadow, clipped to the
 * glyph shape. A positive offset produces shading on the OPPOSITE
 * (top-left) inner edge, matching a top-left light source.
 */
function innerShadow(
  mask: HTMLCanvasElement,
  color: string,
  blur: number,
  offX: number,
  offY: number,
): HTMLCanvasElement {
  const w = mask.width;
  const h = mask.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  if (!x) throw new Error("Canvas 2D context unavailable");

  // 1. Flood the whole tile with the shadow colour.
  x.fillStyle = color;
  x.fillRect(0, 0, w, h);

  // 2. Erase using ONLY the glyph's shadow. The glyph image itself is
  //    drawn far off-canvas (at -push), so it never erases directly;
  //    the shadow — offset back by +push plus the desired (offX,offY) —
  //    is the only thing that lands on the tile. What survives is a soft
  //    band of colour on the inner edge opposite the offset direction.
  const push = Math.max(w, h) + 200;
  x.globalCompositeOperation = "destination-out";
  x.shadowColor = "rgba(0,0,0,1)";
  x.shadowBlur = blur;
  x.shadowOffsetX = offX + push;
  x.shadowOffsetY = offY + push;
  x.drawImage(mask, -push, -push);

  // 3. Keep only what falls inside the glyph -> a true inner shadow.
  x.globalCompositeOperation = "destination-in";
  x.shadowColor = "transparent";
  x.shadowBlur = 0;
  x.shadowOffsetX = 0;
  x.shadowOffsetY = 0;
  x.drawImage(mask, 0, 0);

  return c;
}

/* -------------------------------------------------------------------
   Paper background
   ------------------------------------------------------------------- */
function drawPaper(
  ctx: CanvasRenderingContext2D,
  state: DebossState,
  pxW: number,
  pxH: number,
): void {
  const { r, g, b } = state.paper;

  // Base colour
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, pxW, pxH);

  // Grain
  if (state.texture > 0) {
    const pattern = ctx.createPattern(getNoiseTile(), "repeat");
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = state.texture;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();
    }
  }

  // Soft directional lighting: brighter top-left, gently darker lower-right.
  const grad = ctx.createLinearGradient(0, 0, pxW, pxH);
  grad.addColorStop(0, "rgba(255,255,255,0.10)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.0)");
  grad.addColorStop(1, "rgba(70,60,45,0.06)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, pxW, pxH);
}

/* -------------------------------------------------------------------
   The master render function (used for preview AND export)
   ------------------------------------------------------------------- */
export function drawScene(
  target: HTMLCanvasElement,
  state: DebossState,
  layout: Layout,
  s: number,
  transparent: boolean,
): void {
  const pxW = Math.round(layout.logicalW * s);
  const pxH = Math.round(layout.logicalH * s);

  target.width = pxW;
  target.height = pxH;

  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.clearRect(0, 0, pxW, pxH);

  // (a) Paper — skipped when exporting transparency.
  if (!transparent) drawPaper(ctx, state, pxW, pxH);

  // Nothing to engrave? stop here.
  if (!state.text.trim()) return;

  // (b) Glyph mask.
  const mask = buildMask(state, pxW, pxH, s, layout);

  const blur = state.blur * s;
  const off = Math.max(state.depth * s, 0.01);

  // (c) Recess floor — seat the letters a hair into the sheet.
  //     A faint uniform darkening inside the glyph adds believable depth.
  const floor = document.createElement("canvas");
  floor.width = pxW;
  floor.height = pxH;
  const fctx = floor.getContext("2d");
  if (fctx) {
    fctx.drawImage(mask, 0, 0);
    fctx.globalCompositeOperation = "source-in";
    fctx.fillStyle = "rgba(60,50,38,1)";
    fctx.fillRect(0, 0, pxW, pxH);
    ctx.globalAlpha = 0.05 + state.depth / 90; // very subtle
    ctx.drawImage(floor, 0, 0);
    ctx.globalAlpha = 1;
  }

  // (c.5) Optional colour tint — infuses the glyph with a chosen colour
  //       while leaving it under the shadow/highlight so the engraving
  //       still reads as pressed into the paper, not printed on top.
  if (state.tintStrength > 0) {
    const { r, g, b } = state.tint;
    const tint = document.createElement("canvas");
    tint.width = pxW;
    tint.height = pxH;
    const tctx = tint.getContext("2d");
    if (tctx) {
      tctx.drawImage(mask, 0, 0);
      tctx.globalCompositeOperation = "source-in";
      tctx.fillStyle = `rgb(${r},${g},${b})`;
      tctx.fillRect(0, 0, pxW, pxH);
      ctx.globalAlpha = state.tintStrength;
      ctx.drawImage(tint, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  // (d) Dark inner shadow on the upper-left walls (away from the light).
  const { r: sr, g: sg, b: sb } = state.shadowColor;
  const dark = innerShadow(mask, `rgb(${sr},${sg},${sb})`, blur, off, off);
  ctx.globalAlpha = state.shadow;
  ctx.drawImage(dark, 0, 0);

  // (e) White inner highlight on the lower-right walls (facing the light).
  const light = innerShadow(mask, "rgb(255,255,255)", blur, -off, -off);
  ctx.globalAlpha = state.highlight;
  ctx.drawImage(light, 0, 0);

  ctx.globalAlpha = 1;
}

/* -------------------------------------------------------------------
   Font loading — canvas needs the face ready before it can shape it
   ------------------------------------------------------------------- */
export async function ensureFont(
  family: string,
  sizePx: number,
): Promise<void> {
  try {
    await document.fonts.load(`${sizePx}px "${family}"`);
  } catch {
    /* fallback face will be used */
  }
}

/* -------------------------------------------------------------------
   Export — high-resolution PNG built from the same render path
   ------------------------------------------------------------------- */
export function buildExportCanvas(
  state: DebossState,
  logicalW: number,
  exportScale: number,
): HTMLCanvasElement {
  const layout = computeLayout(state, logicalW);
  const out = document.createElement("canvas");
  drawScene(out, state, layout, exportScale, state.transparent);
  return out;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export failed"));
    }, "image/png");
  });
}

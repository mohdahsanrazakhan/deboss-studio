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

import type { DebossState, Layout, MeasuredFragment, MeasuredLine, PaperColor, TextRun } from "@/types/deboss";
import {
  ASPECT_RATIOS,
  BRANDING_FILL_ON_DARK_PAPER,
  BRANDING_FILL_ON_LIGHT_PAPER,
  BRANDING_FONT_FAMILY,
  BRANDING_FONT_SIZE_MAX,
  BRANDING_FONT_SIZE_MIN,
  BRANDING_FONT_SIZE_RATIO,
  BRANDING_PAPER_LUMINANCE_THRESHOLD,
  MAX_LOGICAL_H,
  MIN_LOGICAL_H,
  PAD_X,
  PAD_Y,
} from "./constants";
import { detectTextDirection } from "./direction";
import { hasRichRuns, parseRuns, stripTags } from "./richtext";

/* -------------------------------------------------------------------
   Paper grain: generated once (lazily) as a repeatable noise tile.
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
  // Must match buildMask's own letterSpacing exactly, or wrapping decisions
  // here disagree with what actually gets drawn.
  measureCtx.letterSpacing = `${state.letterSpacing}px`;

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

/* -------------------------------------------------------------------
   Rich-text layout: only used when state.text contains styled runs
   (bold/italic/underline/per-selection size). Plain text (every
   GALLERY_EXAMPLES entry, the default sample text, any user who never
   opens the rich-text toolbar) stays on layoutLines/computeLayout's
   original scalar path above, completely untouched, so nothing existing
   can drift by so much as a pixel.

   Canvas has no native "mixed-run" text layout API, and hand-rolling a
   bidi-aware line-breaking + run-positioning algorithm to replace the
   single-fillText-per-line approach above is exactly the kind of thing
   that quietly breaks Arabic/Urdu correctness. Instead this measures the
   SAME markup in a hidden, real DOM element and reads back the browser's
   own bidi-correct, wrap-correct visual positions, then replicates those
   exact positions with one fillText call per fragment. A style boundary
   landing mid-word still breaks Arabic/Urdu letter-joining at the cut
   (each fillText call shapes its substring in isolation, a Canvas2D
   limitation this measurement cannot fix); the rich-text editor mitigates
   this by snapping selections in cursive-script fonts out to word
   boundaries before applying any formatting (see CURSIVE_SCRIPT_FONTS in
   constants.ts and RichTextEditor.tsx).

   Line GROUPING is read from Range.getClientRects() per paragraph, not by
   comparing fragments' own getBoundingClientRect() to each other: a single
   fragment's rect spans its full font ascent/descent, and a much larger
   font on one line can make that box tall enough to spatially reach into
   a neighbouring line's rect even though the two sit on genuinely
   separate, non-overlapping CSS line boxes. This shipped as a real bug
   once (two lines with a big enough size difference, whether across
   paragraphs or from one paragraph's own word-wrap, rendered on top of
   each other) before switching to per-paragraph Range rects, which are
   the browser's own authoritative, guaranteed-non-overlapping line
   boundaries. Don't reintroduce fragment-vs-fragment rect comparison for
   line grouping; only fragments' x/width (not which line they're on)
   should come from their own individual rects.
   ------------------------------------------------------------------- */
let _measureContainer: HTMLDivElement | null = null;

function getMeasureContainer(): HTMLDivElement {
  if (_measureContainer) return _measureContainer;
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "-99999px";
  el.style.visibility = "hidden";
  el.style.whiteSpace = "pre-wrap";
  el.style.margin = "0";
  el.style.padding = "0";
  el.style.border = "0";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  _measureContainer = el;
  return el;
}

/** One word-or-subword piece ready to become its own DOM span; `spaceBefore` is false only when glued to a mid-word style-boundary predecessor. */
interface Fragment extends TextRun {
  spaceBefore: boolean;
}

/**
 * Splits parsed runs at whitespace into word-level fragments. A run
 * boundary that falls mid-word (no whitespace on either side) produces
 * adjacent fragments with `spaceBefore: false`, so the DOM step below
 * renders them as sibling spans with no text node between them: default
 * CSS wrapping then physically cannot separate them onto different
 * lines, guaranteeing each fragment's rect is a single, unambiguous line.
 */
function tokenizeParagraph(runs: TextRun[]): Fragment[] {
  const fragments: Fragment[] = [];
  let pendingSpace = false;
  let isFirst = true;

  for (const run of runs) {
    const pieces = run.text.split(/(\s+)/);
    for (const piece of pieces) {
      if (piece === "") continue;
      if (/^\s+$/.test(piece)) {
        pendingSpace = true;
        continue;
      }
      fragments.push({
        text: piece,
        bold: run.bold,
        italic: run.italic,
        underline: run.underline,
        size: run.size,
        spaceBefore: !isFirst && pendingSpace,
      });
      pendingSpace = false;
      isFirst = false;
    }
  }
  return fragments;
}

/** Measures state.text (with styled runs) at a given content width. Logical (unscaled) px; PAD_X/PAD_Y are added by the caller. */
function measureRichLines(
  state: DebossState,
  maxWidth: number,
): { fragments: Omit<MeasuredFragment, "y">[]; height: number }[] {
  const container = getMeasureContainer();
  container.style.width = `${maxWidth}px`;
  container.style.fontFamily = `"${state.font}"`;
  container.dir = detectTextDirection(stripTags(state.text));
  container.style.textAlign =
    state.align === "center" ? "center" : state.align === "right" ? "right" : "left";
  // Must match buildMask's own ctx.letterSpacing exactly, or wrapping here
  // (and therefore every fragment's measured position) disagrees with what
  // canvas actually draws.
  container.style.letterSpacing = `${state.letterSpacing}px`;
  container.innerHTML = "";

  const paragraphs = state.text.replace(/\r/g, "").split("\n");
  // Track each paragraph's own first/last DOM node so a Range can be built
  // spanning exactly its content (see below for why).
  const paraBounds: { first: Node; last: Node }[] = [];
  const entries: { span: HTMLSpanElement; fragment: Fragment | null; paraIndex: number }[] = [];

  paragraphs.forEach((line, idx) => {
    if (idx > 0) container.appendChild(document.createTextNode("\n"));
    if (line.trim() === "") {
      const marker = document.createElement("span");
      marker.style.fontSize = `${state.fontSize}px`;
      // Zero-width space (explicit escape, not a literal invisible character
      // in source): reserves this blank line's height, draws nothing visible.
      marker.textContent = "​";
      container.appendChild(marker);
      entries.push({ span: marker, fragment: null, paraIndex: idx });
      paraBounds[idx] = { first: marker, last: marker };
      return;
    }
    const runs = parseRuns(line, state.fontSize);
    for (const frag of tokenizeParagraph(runs)) {
      if (frag.spaceBefore) container.appendChild(document.createTextNode(" "));
      const span = document.createElement("span");
      span.style.fontWeight = frag.bold ? "700" : "400";
      span.style.fontStyle = frag.italic ? "italic" : "normal";
      span.style.fontSize = `${frag.size}px`;
      span.textContent = frag.text;
      container.appendChild(span);
      entries.push({ span, fragment: frag, paraIndex: idx });
      if (!paraBounds[idx]) paraBounds[idx] = { first: span, last: span };
      else paraBounds[idx].last = span;
    }
  });

  const containerRect = container.getBoundingClientRect();

  // A single inline element's own bounding rect spans its full font
  // ascent/descent, which for a much larger font can be tall enough to
  // spatially reach into a neighbouring line's rect even though the two
  // render on genuinely separate, non-overlapping CSS line boxes (this bit
  // us both across paragraphs and within one paragraph's own wrapped
  // lines). The reliable source of "how many visual lines, and where" is
  // Range.getClientRects() over a paragraph's WHOLE content, which returns
  // the browser's own actual line-box rects, one per rendered line,
  // guaranteed non-overlapping. Each fragment is then assigned to whichever
  // of ITS OWN paragraph's line-rects its vertical centre falls in.
  const paraLineRects: DOMRect[][] = paraBounds.map(({ first, last }) => {
    const range = document.createRange();
    range.setStartBefore(first);
    range.setEndAfter(last);
    const rects = Array.from(range.getClientRects());
    return rects.length > 0 ? rects : [range.getBoundingClientRect()];
  });

  // lineKey uniquely identifies a visual line across the whole document:
  // (paragraph index, that paragraph's own line-rect index).
  const lineGroups = new Map<
    string,
    { paraIndex: number; lineIndex: number; top: number; fragments: Omit<MeasuredFragment, "y">[] }
  >();
  const lineOrder: string[] = [];

  for (const { span, fragment, paraIndex } of entries) {
    const rect = span.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const rectsForPara = paraLineRects[paraIndex] ?? [rect];
    let lineIndex = rectsForPara.findIndex((r) => centerY >= r.top && centerY <= r.bottom);
    if (lineIndex === -1) {
      // Rounding edge case: fall back to the closest line-rect by centre distance.
      let best = 0;
      let bestDist = Infinity;
      rectsForPara.forEach((r, i) => {
        const dist = Math.abs(centerY - (r.top + r.height / 2));
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      lineIndex = best;
    }

    const key = `${paraIndex}:${lineIndex}`;
    let group = lineGroups.get(key);
    if (!group) {
      const lineRect = rectsForPara[lineIndex] ?? rect;
      group = { paraIndex, lineIndex, top: lineRect.top - containerRect.top, fragments: [] };
      lineGroups.set(key, group);
      lineOrder.push(key);
    }
    if (fragment) {
      group.fragments.push({
        text: fragment.text,
        bold: fragment.bold,
        italic: fragment.italic,
        underline: fragment.underline,
        size: fragment.size,
        x: rect.left - containerRect.left + PAD_X,
        width: rect.width,
      });
    }
  }

  const lines: { fragments: Omit<MeasuredFragment, "y">[]; height: number }[] = lineOrder.map((key) => {
    const group = lineGroups.get(key);
    if (!group) return { fragments: [], height: state.fontSize * state.lineHeightFactor };
    return {
      fragments: group.fragments,
      height:
        Math.max(state.fontSize, ...group.fragments.map((f) => f.size)) * state.lineHeightFactor,
    };
  });

  container.innerHTML = "";
  return lines;
}

/** Compute the full layout for a given logical width. */
export function computeLayout(state: DebossState, logicalW: number): Layout {
  if (hasRichRuns(state.text)) {
    const rawLines = measureRichLines(state, logicalW - PAD_X * 2);
    const blockH = rawLines.reduce((sum, l) => sum + l.height, 0);

    let logicalH: number;
    if (state.aspect === "auto") {
      logicalH = Math.min(Math.max(blockH + PAD_Y * 2, MIN_LOGICAL_H), MAX_LOGICAL_H);
    } else {
      logicalH = Math.round(logicalW / ASPECT_RATIOS[state.aspect]);
    }

    let cursorY = (logicalH - blockH) / 2;
    const richLines: MeasuredLine[] = rawLines.map((line) => {
      const y = cursorY + line.height / 2;
      cursorY += line.height;
      return {
        height: line.height,
        fragments: line.fragments.map((f) => ({ ...f, y })),
      };
    });

    const lineHeight = rawLines[0]?.height ?? state.fontSize * state.lineHeightFactor;
    return { lines: [], lineHeight, logicalW, logicalH, richLines };
  }

  // Plain path: identical to before this feature existed for any state
  // that hasn't changed lineHeightFactor/letterSpacing off their defaults
  // (DEFAULT_STATE.lineHeightFactor === the old fixed LINE_FACTOR constant).
  const lines = layoutLines(state, logicalW - PAD_X * 2);
  const lineHeight = state.fontSize * state.lineHeightFactor;

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
   Branding watermark: a second, independently-positioned, flat (not
   debossed) text layer, e.g. an Instagram handle. Deliberately kept
   simple: single line, fixed font, drawn as a plain fillText after the
   main engraving so it reads as a quiet signature rather than competing
   with the artwork. `getBrandingFontSize` is the ONE formula shared by
   drawing (drawBranding, below) and by the drag overlay's hit-box sizing
   (BrandingHandle.tsx) — they must stay identical or the draggable
   hit-box drifts from what's actually drawn, the same principle already
   documented for letterSpacing/lineHeightFactor's measure-vs-draw match.
   ------------------------------------------------------------------- */
/** Perceived luminance (ITU-R BT.601), 0 (black) - 255 (white). */
function paperLuminance({ r, g, b }: PaperColor): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/** PAPER_TONES includes "Black", not just light stock: pick a light watermark on dark paper, a dark one on light paper, so it never goes invisible. */
function getBrandingFill(paper: PaperColor): string {
  return paperLuminance(paper) < BRANDING_PAPER_LUMINANCE_THRESHOLD
    ? BRANDING_FILL_ON_DARK_PAPER
    : BRANDING_FILL_ON_LIGHT_PAPER;
}
export function getBrandingFontSize(logicalW: number): number {
  return Math.min(
    BRANDING_FONT_SIZE_MAX,
    Math.max(BRANDING_FONT_SIZE_MIN, logicalW * BRANDING_FONT_SIZE_RATIO),
  );
}

/** Logical (unscaled) px box for the branding text, single line, used both to draw it and to size/clamp its drag handle. */
export function measureBrandingBox(
  state: DebossState,
  logicalW: number,
): { width: number; height: number } {
  const fontSize = getBrandingFontSize(logicalW);
  const measureCtx = getMeasureCtx();
  measureCtx.font = `500 ${fontSize}px "${BRANDING_FONT_FAMILY}"`;
  const width = measureCtx.measureText(state.brandingText.trim()).width;
  return { width, height: fontSize * 1.2 };
}

/** Flat watermark pass: no-op when there's no branding text. Drawn last by drawScene, unconditionally, so it renders even when the main text is empty. */
function drawBranding(
  ctx: CanvasRenderingContext2D,
  state: DebossState,
  layout: Layout,
  pxW: number,
  pxH: number,
  s: number,
): void {
  const text = state.brandingText.trim();
  if (!text) return;

  const fontSizePx = getBrandingFontSize(layout.logicalW) * s;
  ctx.save();
  ctx.font = `500 ${fontSizePx}px "${BRANDING_FONT_FAMILY}"`;
  ctx.fillStyle = getBrandingFill(state.paper);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, state.brandingX * pxW, state.brandingY * pxH);
  ctx.restore();
}

/* -------------------------------------------------------------------
   Glyph mask: the text drawn solid on a transparent canvas
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
  x.textBaseline = "middle";
  // Must match the measurement side exactly (layoutLines' measureCtx and
  // measureRichLines' container both set the same value), or the glyphs
  // actually drawn here disagree with the widths/wrap points already
  // measured against.
  x.letterSpacing = `${state.letterSpacing * s}px`;

  if (layout.richLines) {
    // DOM measurement already baked state.align into each fragment's x,
    // and resolved bidi visual order across mixed-style runs; draw each
    // fragment independently at its own measured position/size/style.
    x.textAlign = "left";
    for (const line of layout.richLines) {
      for (const frag of line.fragments) {
        const weight = frag.bold ? "700" : "400";
        const style = frag.italic ? "italic " : "";
        x.font = `${style}${weight} ${frag.size * s}px "${state.font}"`;
        const fx = frag.x * s;
        const fy = frag.y * s;
        x.fillText(frag.text, fx, fy);
        if (frag.underline) {
          // Drawn into this same mask so it inherits the shared recess/
          // tint/shadow/highlight compositing exactly like the glyphs.
          // Offsets are tuned against "middle" baseline, not measured;
          // revisit if a specific font's underline reads off.
          const thickness = Math.max(frag.size * s * 0.06, 1);
          const underlineY = fy + frag.size * s * 0.38;
          x.fillRect(fx, underlineY, frag.width * s, thickness);
        }
      }
    }
    return c;
  }

  // Plain path: byte-identical to before this feature existed.
  x.direction = detectTextDirection(state.text); // full bidi shaping for the detected script
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
  //    the shadow, offset back by +push plus the desired (offX,offY),
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

  // (a) Paper: skipped when exporting transparency.
  if (!transparent) drawPaper(ctx, state, pxW, pxH);

  // Main text engraving: skipped when there's nothing to engrave (strip tags
  // first, so a document that's only markup with no visible text, e.g.
  // "<b></b>", still counts as empty, not as non-whitespace content). Unlike
  // before this early return no longer skips the rest of the function: a
  // document can carry only a branding watermark with no main text.
  if (stripTags(state.text).trim()) {
    // (b) Glyph mask.
    const mask = buildMask(state, pxW, pxH, s, layout);

    const blur = state.blur * s;
    const off = Math.max(state.depth * s, 0.01);

    // (c) Recess floor: seat the letters a hair into the sheet.
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

    // (c.5) Optional colour tint: infuses the glyph with a chosen colour
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

  // (f) Branding watermark: always last, on top, regardless of whether
  // there's any main text (see drawBranding's own comment).
  drawBranding(ctx, state, layout, pxW, pxH, s);
}

/* -------------------------------------------------------------------
   Font loading: canvas needs the face ready before it can shape it
   ------------------------------------------------------------------- */
export async function ensureFont(
  family: string,
  sizePx: number,
  style: "normal" | "italic" = "normal",
): Promise<void> {
  try {
    const prefix = style === "italic" ? "italic " : "";
    await document.fonts.load(`${prefix}${sizePx}px "${family}"`);
  } catch {
    /* fallback face will be used */
  }
}

/* -------------------------------------------------------------------
   Export: high-resolution PNG built from the same render path
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

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

import type { DebossState, FontFamily, Layout, MeasuredFragment, MeasuredLine, PaperColor, SceneLayout, TextBlock, TextRun } from "@/types/deboss";
import {
  ASPECT_RATIOS,
  BRANDING_DEFAULT_SIZE_RATIO,
  BRANDING_FONT_SIZE_MAX,
  BRANDING_FONT_SIZE_MIN,
  BRANDING_PAPER_LUMINANCE_THRESHOLD,
  DEFAULT_TEXT_BLOCK,
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

/** Wrap one block's text to fit maxWidth (in logical px), honouring hard \n breaks. */
function layoutLines(block: TextBlock, maxWidth: number): string[] {
  const measureCtx = getMeasureCtx();
  measureCtx.font = `${block.fontSize}px "${block.font}"`;
  measureCtx.direction = detectTextDirection(block.text);
  // Must match buildBlockMask's own letterSpacing exactly, or wrapping
  // decisions here disagree with what actually gets drawn.
  measureCtx.letterSpacing = `${block.letterSpacing}px`;

  const out: string[] = [];
  const paragraphs = block.text.replace(/\r/g, "").split("\n");

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
        strikethrough: run.strikethrough,
        uppercase: run.uppercase,
        size: run.size,
        spaceBefore: !isFirst && pendingSpace,
      });
      pendingSpace = false;
      isFirst = false;
    }
  }
  return fragments;
}

/** Measures one block's text (with styled runs) at a given content width. Logical (unscaled) px; PAD_X/PAD_Y are added by the caller. `logicalW` is used only to recenter the block's own bounding box regardless of align (see the shift below); it doesn't affect wrapping, which still happens at `maxWidth`. */
function measureRichLines(
  block: TextBlock,
  maxWidth: number,
  logicalW: number,
): { fragments: Omit<MeasuredFragment, "y">[]; height: number }[] {
  const container = getMeasureContainer();
  container.style.width = `${maxWidth}px`;
  container.style.fontFamily = `"${block.font}"`;
  container.dir = detectTextDirection(stripTags(block.text));
  container.style.textAlign =
    block.align === "center" ? "center" : block.align === "right" ? "right" : "left";
  // Must match buildBlockMask's own ctx.letterSpacing exactly, or wrapping
  // here (and therefore every fragment's measured position) disagrees with
  // what canvas actually draws.
  container.style.letterSpacing = `${block.letterSpacing}px`;
  container.innerHTML = "";

  const paragraphs = block.text.replace(/\r/g, "").split("\n");
  // Track each paragraph's own first/last DOM node so a Range can be built
  // spanning exactly its content (see below for why).
  const paraBounds: { first: Node; last: Node }[] = [];
  const entries: { span: HTMLSpanElement; fragment: Fragment | null; paraIndex: number }[] = [];

  paragraphs.forEach((line, idx) => {
    if (idx > 0) container.appendChild(document.createTextNode("\n"));
    if (line.trim() === "") {
      const marker = document.createElement("span");
      marker.style.fontSize = `${block.fontSize}px`;
      // Zero-width space (explicit escape, not a literal invisible character
      // in source): reserves this blank line's height, draws nothing visible.
      marker.textContent = "​";
      container.appendChild(marker);
      entries.push({ span: marker, fragment: null, paraIndex: idx });
      paraBounds[idx] = { first: marker, last: marker };
      return;
    }
    const runs = parseRuns(line, block.fontSize);
    for (const frag of tokenizeParagraph(runs)) {
      if (frag.spaceBefore) container.appendChild(document.createTextNode(" "));
      const span = document.createElement("span");
      span.style.fontWeight = frag.bold ? "700" : "400";
      span.style.fontStyle = frag.italic ? "italic" : "normal";
      span.style.fontSize = `${frag.size}px`;
      // Uppercase glyphs are wider than lowercase, so this must be applied
      // BEFORE measuring (below), or buildBlockMask's own .toUpperCase()
      // draw would disagree with the width/wrap positions measured here.
      // Strikethrough needs no such measurement-side change: a drawn line
      // doesn't affect glyph width.
      span.style.textTransform = frag.uppercase ? "uppercase" : "";
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
        strikethrough: fragment.strikethrough,
        uppercase: fragment.uppercase,
        size: fragment.size,
        x: rect.left - containerRect.left + PAD_X,
        width: rect.width,
      });
    }
  }

  const lines: { fragments: Omit<MeasuredFragment, "y">[]; height: number }[] = lineOrder.map((key) => {
    const group = lineGroups.get(key);
    if (!group) return { fragments: [], height: block.fontSize * block.lineHeightFactor };
    return {
      fragments: group.fragments,
      height:
        Math.max(block.fontSize, ...group.fragments.map((f) => f.size)) * block.lineHeightFactor,
    };
  });

  // Recenter the block's own bounding box at the canvas's horizontal
  // center, regardless of align: container.style.textAlign above only
  // justifies lines within the FULL maxWidth column, which would
  // otherwise move a short block to a canvas edge when align changes
  // instead of just re-justifying its text in place (same fix as
  // buildBlockMask's plain-text tx formula; measureBlockBox's own
  // width computation is unaffected by a uniform shift like this).
  let minX = Infinity;
  let maxX = -Infinity;
  for (const line of lines) {
    for (const frag of line.fragments) {
      minX = Math.min(minX, frag.x);
      maxX = Math.max(maxX, frag.x + frag.width);
    }
  }
  if (Number.isFinite(minX)) {
    const blockWidth = maxX - minX;
    const shift = logicalW / 2 - blockWidth / 2 - minX;
    for (const line of lines) {
      for (const frag of line.fragments) frag.x += shift;
    }
  }

  container.innerHTML = "";
  return lines;
}

/** One block's own content height (logical px) at a given wrap width, ignoring position — used only to decide the scene's canvas height (from textBlocks[0] alone, see computeLayout below). */
function measureBlockContentHeight(block: TextBlock, maxWidth: number, logicalW: number): number {
  if (hasRichRuns(block.text)) {
    const rawLines = measureRichLines(block, maxWidth, logicalW);
    return rawLines.reduce((sum, l) => sum + l.height, 0);
  }
  const lines = layoutLines(block, maxWidth);
  const lineHeight = block.fontSize * block.lineHeightFactor;
  return Math.max(lines.length, 1) * lineHeight;
}

/** One block's full Layout (lines/richLines + shared canvas dimensions), at a given wrap width. The canvas dimensions themselves are already decided by the caller (computeLayout), not derived here. */
function computeBlockLayout(
  block: TextBlock,
  maxWidth: number,
  logicalW: number,
  logicalH: number,
): Layout {
  if (hasRichRuns(block.text)) {
    const rawLines = measureRichLines(block, maxWidth, logicalW);
    const blockH = rawLines.reduce((sum, l) => sum + l.height, 0);

    let cursorY = (logicalH - blockH) / 2;
    const richLines: MeasuredLine[] = rawLines.map((line) => {
      const y = cursorY + line.height / 2;
      cursorY += line.height;
      return {
        height: line.height,
        fragments: line.fragments.map((f) => ({ ...f, y })),
      };
    });

    const lineHeight = rawLines[0]?.height ?? block.fontSize * block.lineHeightFactor;
    return { lines: [], lineHeight, logicalW, logicalH, richLines };
  }

  // Plain path: identical to before this feature existed for any block
  // that hasn't changed lineHeightFactor/letterSpacing off their defaults
  // (DEFAULT_TEXT_BLOCK.lineHeightFactor === the old fixed LINE_FACTOR constant).
  const lines = layoutLines(block, maxWidth);
  const lineHeight = block.fontSize * block.lineHeightFactor;
  return { lines, lineHeight, logicalW, logicalH };
}

/**
 * Compute the full scene layout for a given logical width: the canvas's
 * own dimensions (in "auto" aspect, sized from textBlocks[0] ALONE, a
 * deliberate simplification — fitting every block's bounding box would
 * make canvas size circularly depend on block positions, which are
 * themselves fractions of canvas size), plus every block's own Layout
 * measured against those final dimensions/wrap width.
 */
export function computeLayout(state: DebossState, logicalW: number): SceneLayout {
  const maxWidth = logicalW - PAD_X * 2;
  const primary = state.textBlocks[0];

  let logicalH: number;
  if (state.aspect === "auto") {
    const contentH = primary ? measureBlockContentHeight(primary, maxWidth, logicalW) : 0;
    logicalH = Math.min(Math.max(contentH + PAD_Y * 2, MIN_LOGICAL_H), MAX_LOGICAL_H);
  } else {
    logicalH = Math.round(logicalW / ASPECT_RATIOS[state.aspect]);
  }

  const blocks = state.textBlocks.map((block) => ({
    id: block.id,
    layout: computeBlockLayout(block, maxWidth, logicalW, logicalH),
  }));

  return { logicalW, logicalH, blocks };
}

/* -------------------------------------------------------------------
   Branding watermark: a second, independently-positioned text layer,
   e.g. an Instagram handle. Reuses the SAME glyph-mask/inner-shadow
   engraving pipeline every text block goes through (via a throwaway
   synthetic TextBlock, see drawBranding below), so it looks like a real
   part of the design rather than printed on top. Its font/size default
   to tracking `state.textBlocks[0]` live (see resolveBrandingFont/
   resolveBrandingFontSize) so it stays visually symmetric with the main
   text with zero extra sync code, but can be independently overridden
   for branding only via `state.brandingFont`/`brandingFontSize`
   (useDebossStudio.ts's setBrandingFont/setBrandingFontSize).
   `resolveBrandingFontSize` is the ONE formula shared by drawing
   (drawBranding, below, via measureBrandingBox) and by the drag
   overlay's hit-box sizing (BrandingHandle.tsx): they must stay
   identical or the draggable hit-box drifts from what's actually drawn,
   the same principle already documented for letterSpacing/
   lineHeightFactor's measure-vs-draw match.
   ------------------------------------------------------------------- */
/** Perceived luminance (ITU-R BT.601), 0 (black) - 255 (white). */
function paperLuminance({ r, g, b }: PaperColor): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/**
 * PAPER_TONES includes "Black", not just light stock: any fixed-colour UI
 * overlaid on top of the paper (the in-place text editor's plain preview
 * colour while typing) needs to pick light-on-dark or dark-on-light per
 * paper, or it goes invisible on it.
 */
export function isPaperDark(paper: PaperColor): boolean {
  return paperLuminance(paper) < BRANDING_PAPER_LUMINANCE_THRESHOLD;
}

/** null brandingFont means "auto-track the first text block's font"; falls back to DEFAULT_TEXT_BLOCK's font only for the edge case of zero text blocks. */
export function resolveBrandingFont(state: DebossState): FontFamily {
  return state.brandingFont ?? state.textBlocks[0]?.font ?? DEFAULT_TEXT_BLOCK.font;
}

/** null brandingFontSize means "derive proportionally from the first text block's fontSize" (stays a smaller watermark, not the same scale); a manual override is clamped to the same range the auto-derived value is. */
export function resolveBrandingFontSize(state: DebossState): number {
  if (state.brandingFontSize != null) {
    return Math.min(BRANDING_FONT_SIZE_MAX, Math.max(BRANDING_FONT_SIZE_MIN, state.brandingFontSize));
  }
  const mainSize = state.textBlocks[0]?.fontSize ?? DEFAULT_TEXT_BLOCK.fontSize;
  return Math.min(
    BRANDING_FONT_SIZE_MAX,
    Math.max(BRANDING_FONT_SIZE_MIN, mainSize * BRANDING_DEFAULT_SIZE_RATIO),
  );
}

/** Logical (unscaled) px box for the branding text, single line, used both to draw it and to size/clamp its drag handle. */
export function measureBrandingBox(
  state: DebossState,
): { width: number; height: number } {
  const font = resolveBrandingFont(state);
  const fontSize = resolveBrandingFontSize(state);
  const measureCtx = getMeasureCtx();
  measureCtx.font = `${fontSize}px "${font}"`;
  const width = measureCtx.measureText(state.brandingText.trim()).width;
  return { width, height: fontSize * 1.2 };
}

/**
 * Composites one already-drawn glyph mask (solid black on transparent)
 * into the engraved look: recess floor, optional colour tint, dark inner
 * shadow, light inner highlight, all driven by the SAME document-level
 * depth/shadow/highlight/blur/tint/tintStrength/shadowColor every text
 * block already shares. Extracted so drawScene's per-block loop and
 * drawBranding (below) both go through identical compositing, no
 * duplicated engraving logic between "real" blocks and the watermark.
 */
function compositeEngravedGlyph(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  state: DebossState,
  pxW: number,
  pxH: number,
  s: number,
): void {
  const blur = state.blur * s;
  const off = Math.max(state.depth * s, 0.01);

  // Recess floor: seat the letters a hair into the sheet.
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

  // Optional colour tint.
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

  // Dark inner shadow on the upper-left walls (away from the light).
  const { r: sr, g: sg, b: sb } = state.shadowColor;
  const dark = innerShadow(mask, `rgb(${sr},${sg},${sb})`, blur, off, off);
  ctx.globalAlpha = state.shadow;
  ctx.drawImage(dark, 0, 0);

  // White inner highlight on the lower-right walls (facing the light).
  const light = innerShadow(mask, "rgb(255,255,255)", blur, -off, -off);
  ctx.globalAlpha = state.highlight;
  ctx.drawImage(light, 0, 0);

  ctx.globalAlpha = 1;
}

/**
 * Debossed watermark pass: no-op when there's no branding text. Drawn
 * last by drawScene, unconditionally, so it renders even when there are
 * no text blocks at all. Synthesizes a throwaway single-line TextBlock
 * (align:"center", textAnchorX/Y = brandingX/Y) and Layout, then reuses
 * buildBlockMask + compositeEngravedGlyph exactly like a real block. For
 * a center-aligned block these reduce to tx = textAnchorX*logicalW and
 * startY = textAnchorY*logicalH, i.e. bytewise identical positioning to
 * the flat pass this replaced (state.brandingX*pxW / brandingY*pxH), so
 * only the rendering technique changed, not where it lands.
 */
function drawBranding(
  ctx: CanvasRenderingContext2D,
  state: DebossState,
  layout: SceneLayout,
  pxW: number,
  pxH: number,
  s: number,
): void {
  const text = state.brandingText.trim();
  if (!text) return;

  const font = resolveBrandingFont(state);
  const fontSize = resolveBrandingFontSize(state);

  const brandingBlock: TextBlock = {
    id: "__branding__",
    text,
    font,
    align: "center",
    fontSize,
    letterSpacing: 0,
    lineHeightFactor: 1,
    textAnchorX: state.brandingX,
    textAnchorY: state.brandingY,
  };
  const brandingLayout: Layout = {
    lines: [text],
    lineHeight: fontSize * 1.2,
    logicalW: layout.logicalW,
    logicalH: layout.logicalH,
  };

  const mask = buildBlockMask(brandingBlock, pxW, pxH, s, brandingLayout);
  compositeEngravedGlyph(ctx, mask, state, pxW, pxH, s);
}

/* -------------------------------------------------------------------
   Glyph mask: one block's text drawn solid on a transparent canvas
   ------------------------------------------------------------------- */
function buildBlockMask(
  block: TextBlock,
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
  x.letterSpacing = `${block.letterSpacing * s}px`;

  // Draggable block position: (0.5, 0.5) is a no-op (today's always-
  // centered behaviour); dragging shifts textAnchorX/Y away from 0.5,
  // which shifts EVERY line/fragment by the same logical-px amount,
  // regardless of align. See CanvasTextOverlay.tsx and measureBlockBox
  // below, which must derive the identical box this paints.
  const dx = (block.textAnchorX - 0.5) * layout.logicalW;
  const dy = (block.textAnchorY - 0.5) * layout.logicalH;

  if (layout.richLines) {
    // DOM measurement already baked block.align into each fragment's x,
    // and resolved bidi visual order across mixed-style runs; draw each
    // fragment independently at its own measured position/size/style.
    x.textAlign = "left";
    for (const line of layout.richLines) {
      for (const frag of line.fragments) {
        const weight = frag.bold ? "700" : "400";
        const style = frag.italic ? "italic " : "";
        x.font = `${style}${weight} ${frag.size * s}px "${block.font}"`;
        const fx = (frag.x + dx) * s;
        const fy = (frag.y + dy) * s;
        // Display-only: the stored text keeps its original case (see
        // TextRun.uppercase); only the drawn (and, in measureRichLines,
        // measured) glyphs are uppercased.
        x.fillText(frag.uppercase ? frag.text.toUpperCase() : frag.text, fx, fy);
        if (frag.underline) {
          // Drawn into this same mask so it inherits the shared recess/
          // tint/shadow/highlight compositing exactly like the glyphs.
          // Offsets are tuned against "middle" baseline, not measured;
          // revisit if a specific font's underline reads off.
          const thickness = Math.max(frag.size * s * 0.06, 1);
          const underlineY = fy + frag.size * s * 0.38;
          x.fillRect(fx, underlineY, frag.width * s, thickness);
        }
        if (frag.strikethrough) {
          // Same drawn-line approach as underline, just positioned near
          // the vertical middle instead of below the baseline.
          const thickness = Math.max(frag.size * s * 0.06, 1);
          const strikeY = fy - frag.size * s * 0.05;
          x.fillRect(fx, strikeY, frag.width * s, thickness);
        }
      }
    }
    return c;
  }

  // Plain path: byte-identical to before this feature existed, aside from
  // the +dx/+dy offset.
  x.direction = detectTextDirection(block.text); // full bidi shaping for the detected script
  x.font = `${block.fontSize * s}px "${block.font}"`;

  // Left/right align anchor at the SAME point center align always has
  // (logicalW/2 + dx, the block's own drag position), offset by the
  // block's own measured width, instead of the canvas-wide PAD_X/
  // logicalW-PAD_X margins. Without this, switching align would move the
  // whole block to a canvas edge instead of just re-justifying its text
  // in place (computeContentBox, CanvasTextOverlay.tsx, must derive the
  // identical box for the same reason).
  let tx: number;
  if (block.align === "center") {
    x.textAlign = "center";
    tx = (layout.logicalW / 2 + dx) * s;
  } else if (block.align === "right") {
    x.textAlign = "right";
    tx = (layout.logicalW / 2 + measureBlockBox(block, layout).width / 2 + dx) * s;
  } else {
    x.textAlign = "left";
    tx = (layout.logicalW / 2 - measureBlockBox(block, layout).width / 2 + dx) * s;
  }

  const blockH = layout.lines.length * layout.lineHeight;
  const startY = (layout.logicalH - blockH) / 2 + layout.lineHeight / 2 + dy;

  layout.lines.forEach((line, i) => {
    const y = (startY + i * layout.lineHeight) * s;
    if (line) x.fillText(line, tx, y);
  });
  return c;
}

/**
 * Logical (unscaled) bounding box of one text block, used both by
 * CanvasTextOverlay.tsx to position/size that block's in-place editor and
 * its drag clamp, and (implicitly, via the identical measurement setup) by
 * buildBlockMask above. Width is the widest line's rendered width; height
 * is the full block's stacked line height. Must use the exact same font/
 * letterSpacing/direction as layoutLines/measureRichLines, or the box
 * drifts from what's actually drawn.
 */
export function measureBlockBox(
  block: TextBlock,
  layout: Layout,
): { width: number; height: number } {
  if (layout.richLines) {
    let width = 0;
    let height = 0;
    for (const line of layout.richLines) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const frag of line.fragments) {
        minX = Math.min(minX, frag.x);
        maxX = Math.max(maxX, frag.x + frag.width);
      }
      if (line.fragments.length > 0) width = Math.max(width, maxX - minX);
      height += line.height;
    }
    return { width, height };
  }

  const measureCtx = getMeasureCtx();
  measureCtx.font = `${block.fontSize}px "${block.font}"`;
  measureCtx.direction = detectTextDirection(block.text);
  measureCtx.letterSpacing = `${block.letterSpacing}px`;

  let width = 0;
  for (const line of layout.lines) {
    if (!line) continue;
    width = Math.max(width, measureCtx.measureText(line).width);
  }
  const height = layout.lines.length * layout.lineHeight;
  return { width, height };
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
  layout: SceneLayout,
  s: number,
  transparent: boolean,
  // Live-preview-only: the id of whichever TextBlock CanvasTextOverlay.tsx
  // has focused for in-place editing (or null), so the flat DOM overlay is
  // the only visible copy of THAT block instead of doubling up with the
  // debossed render underneath; every other block still draws normally.
  // Callers that produce a committed result (buildExportCanvas, MiniPreview,
  // GalleryPreview) never pass this, so it's always null there — export/
  // other read-only contexts are unaffected, satisfying the preview/export
  // parity rule (CLAUDE.md hard rule #1): same function, same code path,
  // one explicit ephemeral-UI parameter that every non-live-preview caller
  // defaults away.
  suppressBlockId: string | null = null,
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

  // (b)-(e) One engraving pass per text block: skipped for a block with
  // nothing to engrave (strip tags first, so a document that's only markup
  // with no visible text, e.g. "<b></b>", still counts as empty, not as
  // non-whitespace content), or while THAT SPECIFIC block is being edited
  // in place (suppressBlockId). Depth/shadow/highlight/blur/texture/tint
  // are document-level, shared by every block; only the glyph mask differs
  // per block.
  for (const { id, layout: blockLayout } of layout.blocks) {
    if (id === suppressBlockId) continue;
    const block = state.textBlocks.find((b) => b.id === id);
    if (!block || !stripTags(block.text).trim()) continue;

    // (b) Glyph mask, (c)-(e) recess/tint/shadow/highlight.
    const mask = buildBlockMask(block, pxW, pxH, s, blockLayout);
    compositeEngravedGlyph(ctx, mask, state, pxW, pxH, s);
  }

  // (f) Branding watermark: always last, on top, regardless of whether
  // there are any text blocks (see drawBranding's own comment).
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

/**
 * Domain types for the deboss rendering engine.
 * The engine is framework-agnostic: it only knows about these types and
 * the Canvas 2D API. React never reaches into the engine's internals.
 */

/** RGB paper colour, 0-255 per channel. */
export interface PaperColor {
  r: number;
  g: number;
  b: number;
}

export type TextAlign = "left" | "center" | "right";

export type FontFamily =
  | "Noto Nastaliq Urdu"
  | "Gulzar"
  | "Noto Naskh Arabic"
  | "Playfair Display"
  | "Noto Serif Devanagari"
  | "Jameel Noori Nastaleeq"
  | "Jameel Noori Nastaleeq Kasheeda";

/** IDs of the numeric slider-controlled parameters (document-level/shared across all text blocks). */
export type SliderId =
  | "depth"
  | "shadow"
  | "highlight"
  | "blur"
  | "texture"
  | "tintStrength";

/** Fixed canvas shapes; "auto" sizes the canvas to fit the text. */
export type AspectId = "auto" | "1:1" | "4:5" | "9:16" | "16:9";

/**
 * One independently-positioned, independently-styled text layer (Canva-
 * style block). `DebossState.textBlocks` holds one or more of these; a
 * fresh/migrated document always has exactly one, at the default centered
 * anchor, so nothing about single-block behaviour changes.
 */
export interface TextBlock {
  id: string;
  /** The text to deboss, in any script; hard line breaks are honoured. */
  text: string;
  font: FontFamily;
  align: TextAlign;
  /** CSS px (24-150): base size for any run without its own per-selection size override. */
  fontSize: number;
  /** Extra tracking between characters, in CSS px; negative tightens. */
  letterSpacing: number;
  /** Multiplier applied to fontSize to get line-to-line spacing (replaces the old fixed LINE_FACTOR constant). */
  lineHeightFactor: number;
  /** Normalized (0-1) center position of this block within the canvas; (0.5, 0.5) = centered. */
  textAnchorX: number;
  textAnchorY: number;
}

/** The single source of truth for a render. */
export interface DebossState {
  /** One or more independently-positioned/styled text layers; see TextBlock. */
  textBlocks: TextBlock[];
  /** Export/preview with a transparent background instead of paper. */
  transparent: boolean;
  paper: PaperColor;
  /** Stroke-wall offset, in CSS px (0-8). */
  depth: number;
  /** Dark inner-shadow opacity (0-1). */
  shadow: number;
  /** Light inner-highlight opacity (0-1). */
  highlight: number;
  /** Edge softness, in CSS px (0-12). */
  blur: number;
  /** Paper grain intensity (0-1). */
  texture: number;
  /** Text tint colour. */
  tint: PaperColor;
  /** 0 = natural paper-colour deboss, 1 = fully tinted (0-1). */
  tintStrength: number;
  /** Dark inner-shadow colour. */
  shadowColor: PaperColor;
  /** Canvas shape; "auto" fits textBlocks[0] only (see engine.ts computeLayout). */
  aspect: AspectId;
  /** Optional small watermark-style label (e.g. an Instagram handle); empty string renders nothing. */
  brandingText: string;
  /** Normalized (0-1) center position of the branding text within the canvas. */
  brandingX: number;
  brandingY: number;
}

export type PresetId = "soft" | "deep" | "letterpress" | "luxury";

/** A preset adjusts every engraving parameter plus the paper tone at once. */
export interface Preset {
  id: PresetId;
  label: string;
  depth: number;
  shadow: number;
  highlight: number;
  blur: number;
  texture: number;
  /** "r,g,b": matches the swatch key format so the UI can sync. */
  paper: string;
}

/**
 * A user-saved snapshot of the full look (font, layout, engraving, and
 * colours), everything in `DebossState` except the typed text. Distinct
 * from the built-in `Preset`s: these are created, named, and deleted by
 * the user, and persisted client-side (see `CUSTOM_SETS_STORAGE_KEY`).
 */
export interface CustomSet {
  id: string;
  name: string;
  createdAt: number;
  /** Excludes `textBlocks` entirely (a Set is a reusable look, not pinned content, styling, or position) and the branding fields (personal metadata orthogonal to "the look," not part of a saved style). */
  state: Omit<DebossState, "textBlocks" | "brandingText" | "brandingX" | "brandingY">;
}

/**
 * A curated, bespoke gallery look: the full render state, including its own
 * specific text. Unlike `CustomSet`, which deliberately excludes text so a
 * user's saved style survives retyping, a `GalleryExample` exists to pin one
 * exact text as part of its identity.
 */
/** One named body section of a GalleryExample's on-page SEO content. */
export interface GalleryExampleSection {
  heading: string;
  body: string;
}

export interface GalleryExample {
  slug: string;
  title: string;
  blurb: string;
  /** Decorative topic tags shown as chips on the example page (not wired to real filtering). */
  tags: string[];
  /** On-page long-form content, rendered as h2/p pairs below the hero. */
  sections: GalleryExampleSection[];
  state: DebossState;
}

export interface PaperTone {
  /** "r,g,b" key used to match a preset's paper value. */
  key: string;
  /** CSS hex colour shown in the swatch. */
  css: string;
  label: string;
}

export interface SliderDef {
  id: SliderId;
  label: string;
  min: number;
  max: number;
  step: number;
}

/** IDs of the numeric slider-controlled parameters that live on a TextBlock (per-block, not shared). */
export type TextBlockSliderId = "letterSpacing" | "lineHeightFactor";

export interface TextBlockSliderDef {
  id: TextBlockSliderId;
  label: string;
  min: number;
  max: number;
  step: number;
}

/**
 * A styled run of text with no internal formatting boundary: `size` is
 * always concrete (falls back to the owning `TextBlock.fontSize` when
 * unset), never a "default" sentinel, so downstream measurement/drawing
 * never needs to re-resolve it.
 */
export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: number;
}

/** One word-or-subword fragment, positioned after DOM measurement (see richtext.ts). Logical (unscaled) px. */
export interface MeasuredFragment extends TextRun {
  x: number;
  y: number;
  width: number;
}

export interface MeasuredLine {
  fragments: MeasuredFragment[];
  height: number;
}

/** Result of laying the text out at a given logical width. */
export interface Layout {
  lines: string[];
  lineHeight: number;
  logicalW: number;
  logicalH: number;
  /**
   * Present only when `text` contains styled runs (see `hasRichRuns` in
   * richtext.ts); `buildBlockMask` draws per-fragment instead of one
   * fillText per line when this is set. Absent for any plain-text render,
   * which stays on the original single-font-per-line path unchanged.
   */
  richLines?: MeasuredLine[];
}

/**
 * One full scene's worth of layout: the shared canvas dimensions (derived
 * from `textBlocks[0]` only when `aspect === "auto"`, see engine.ts
 * `computeLayout`) plus each block's own `Layout`, all measured against
 * those same dimensions/wrap width. `drawScene` and the in-canvas editor
 * (`CanvasTextOverlay.tsx`) both work off this, never a bare `Layout`.
 */
export interface SceneLayout {
  logicalW: number;
  logicalH: number;
  blocks: { id: string; layout: Layout }[];
}

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
  | "Noto Serif Devanagari";

/** IDs of the numeric slider-controlled parameters. */
export type SliderId =
  | "depth"
  | "shadow"
  | "highlight"
  | "blur"
  | "texture"
  | "fontSize"
  | "tintStrength";

/** Fixed canvas shapes; "auto" sizes the canvas to fit the text. */
export type AspectId = "auto" | "1:1" | "4:5" | "9:16" | "16:9";

/** The single source of truth for a render. */
export interface DebossState {
  /** The text to deboss, in any script; hard line breaks are honoured. */
  text: string;
  font: FontFamily;
  align: TextAlign;
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
  /** CSS px (24-150). */
  fontSize: number;
  /** Text tint colour. */
  tint: PaperColor;
  /** 0 = natural paper-colour deboss, 1 = fully tinted (0-1). */
  tintStrength: number;
  /** Dark inner-shadow colour. */
  shadowColor: PaperColor;
  /** Canvas shape; "auto" fits the text. */
  aspect: AspectId;
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
  state: Omit<DebossState, "text">;
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

/** Result of laying the text out at a given logical width. */
export interface Layout {
  lines: string[];
  lineHeight: number;
  logicalW: number;
  logicalH: number;
}

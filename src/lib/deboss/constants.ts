import type {
  AspectId,
  DebossState,
  FontFamily,
  PaperTone,
  Preset,
  SliderDef,
} from "@/types/deboss";

/** Download resolution multiplier. */
export const EXPORT_SCALE = 3;
/** Logical horizontal padding (CSS px). */
export const PAD_X = 56;
/** Logical vertical padding (CSS px). */
export const PAD_Y = 52;
/** Generous line spacing — tall scripts like Nastaliq need the room, and it reads comfortably for other scripts too. */
export const LINE_FACTOR = 1.9;
/** Cap preview backing-store DPR so huge canvases stay cheap. */
export const MAX_PREVIEW_DPR = 2;
/** Logical canvas height clamps. */
export const MIN_LOGICAL_H = 300;
export const MAX_LOGICAL_H = 1100;
/** Minimum logical preview width. */
export const MIN_LOGICAL_W = 240;
/** Hard cap on input length — a canvas-render DoS guard, generous for real use. */
export const MAX_TEXT_LENGTH = 2000;

export const DEFAULT_TEXT = "بسمِ اللہ\nالرحمٰن الرحیم";

export const DEFAULT_STATE: DebossState = {
  text: DEFAULT_TEXT,
  font: "Noto Nastaliq Urdu",
  align: "center",
  transparent: false,
  paper: { r: 244, g: 240, b: 232 }, // ivory
  depth: 3,
  shadow: 0.55,
  highlight: 0.7,
  blur: 3,
  texture: 0.35,
  fontSize: 72,
  tint: { r: 60, g: 50, b: 38 }, // #3c3226
  tintStrength: 0,
  shadowColor: { r: 64, g: 52, b: 38 }, // #403426
  aspect: "auto",
};

export const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: "Noto Nastaliq Urdu", label: "Noto Nastaliq Urdu" },
  { value: "Gulzar", label: "Gulzar (Nastaliq)" },
  { value: "Noto Naskh Arabic", label: "Noto Naskh Arabic" },
  { value: "Playfair Display", label: "Playfair Display (Latin)" },
  { value: "Noto Serif Devanagari", label: "Noto Serif Devanagari" },
];

export const SLIDER_DEFS: SliderDef[] = [
  { id: "depth", label: "Depth", min: 0, max: 8, step: 0.1 },
  { id: "shadow", label: "Shadow strength", min: 0, max: 1, step: 0.01 },
  { id: "highlight", label: "Highlight strength", min: 0, max: 1, step: 0.01 },
  { id: "blur", label: "Edge blur", min: 0, max: 12, step: 0.1 },
  { id: "texture", label: "Paper texture", min: 0, max: 1, step: 0.01 },
  { id: "fontSize", label: "Font size", min: 24, max: 150, step: 1 },
  { id: "tintStrength", label: "Text tint strength", min: 0, max: 1, step: 0.01 },
];

export const PAPER_TONES: PaperTone[] = [
  { key: "244,240,232", css: "#f4f0e8", label: "Ivory" },
  { key: "248,247,244", css: "#f8f7f4", label: "Cool white" },
  { key: "240,232,218", css: "#f0e8da", label: "Warm cream" },
  { key: "234,236,238", css: "#eaecee", label: "Cotton grey" },
  { key: "24,22,20", css: "#181614", label: "Black" },
];

/** width / height for each fixed canvas shape. */
export const ASPECT_RATIOS: Record<Exclude<AspectId, "auto">, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "9:16": 9 / 16,
  "16:9": 16 / 9,
};

export const ASPECT_OPTIONS: { value: AspectId; label: string }[] = [
  { value: "auto", label: "Auto (fits text)" },
  { value: "1:1", label: "Square 1:1" },
  { value: "4:5", label: "Portrait 4:5" },
  { value: "9:16", label: "Story 9:16" },
  { value: "16:9", label: "Landscape 16:9" },
];

export const PRESETS: Preset[] = [
  {
    id: "soft",
    label: "Soft Deboss",
    depth: 2.2,
    shadow: 0.4,
    highlight: 0.8,
    blur: 5.0,
    texture: 0.3,
    paper: "244,240,232",
  },
  {
    id: "deep",
    label: "Deep Deboss",
    depth: 6.0,
    shadow: 0.75,
    highlight: 0.55,
    blur: 2.0,
    texture: 0.35,
    paper: "244,240,232",
  },
  {
    id: "letterpress",
    label: "Premium Letterpress",
    depth: 3.4,
    shadow: 0.62,
    highlight: 0.48,
    blur: 1.6,
    texture: 0.18,
    paper: "248,247,244",
  },
  {
    id: "luxury",
    label: "Luxury Paper",
    depth: 3.0,
    shadow: 0.5,
    highlight: 0.7,
    blur: 3.4,
    texture: 0.55,
    paper: "240,232,218",
  },
];

export const DEFAULT_HINT =
  "Tip: presets adjust every slider at once — then fine-tune to taste.";

/** Parse an "r,g,b" swatch key into a PaperColor, with a safe fallback. */
export function parsePaperKey(key: string): { r: number; g: number; b: number } {
  const parts = key.split(",").map((n) => Number.parseInt(n, 10));
  const [r, g, b] = parts;
  const clamp = (v: number | undefined) =>
    Number.isFinite(v) ? Math.min(255, Math.max(0, v as number)) : 244;
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

/** Parse a "#rrggbb" string into an {r,g,b} object, with a safe fallback. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Format an {r,g,b} object as a "#rrggbb" string for <input type="color">. */
export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (v: number) =>
    Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

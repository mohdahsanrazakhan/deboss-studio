import type {
  AspectId,
  CustomSet,
  DebossState,
  FontFamily,
  GalleryExample,
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
/** Generous line spacing: tall scripts like Nastaliq need the room, and it reads comfortably for other scripts too. */
export const LINE_FACTOR = 1.9;
/** Cap preview backing-store DPR so huge canvases stay cheap. */
export const MAX_PREVIEW_DPR = 2;
/** Logical canvas height clamps. */
export const MIN_LOGICAL_H = 300;
export const MAX_LOGICAL_H = 1100;
/** Minimum logical preview width. */
export const MIN_LOGICAL_W = 240;
/** Hard cap on input length: a canvas-render DoS guard, generous for real use. */
export const MAX_TEXT_LENGTH = 2000;
/** localStorage key for user-saved custom sets (see CustomSet in types/deboss.ts). */
export const CUSTOM_SETS_STORAGE_KEY = "textDebossStudio.customSets";
/** localStorage key for which custom set (if any) auto-applies its style on load. */
export const DEFAULT_SET_STORAGE_KEY = "textDebossStudio.defaultSetId";
/** Max length for a custom set's name. */
export const MAX_SET_NAME_LENGTH = 40;
/** Cap on saved custom sets: keeps the list usable and storage bounded. */
export const MAX_CUSTOM_SETS = 24;
/** Filename used for both the download and native-share export. */
export const EXPORT_FILENAME = "text-deboss.png";

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
    label: "Fine Letterpress",
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

/**
 * Curated gallery examples (SEO Phase 3, docs/SEO-PLAN.md): each is a
 * bespoke full look, unlike PRESETS, which only cover engraving+paper.
 * Engraving numbers borrow from PRESETS as a reference starting point
 * where they fit; that's a data coincidence, not a structural link.
 */
export const GALLERY_EXAMPLES: GalleryExample[] = [
  {
    slug: "bismillah-calligraphy-png",
    title: "Bismillah Calligraphy PNG",
    blurb: "A fine letterpress deboss of the Bismillah in Noto Nastaliq Urdu on cool white paper.",
    tags: ["Arabic", "Urdu", "Letterpress"],
    sections: [
      {
        heading: "About this design",
        body: "This example presses the Bismillah, a phrase widely used at the start of Islamic texts, prayers, and recitations, into a cool white sheet using Noto Nastaliq Urdu. Nastaliq is a flowing, cursive calligraphic style closely associated with Urdu and Persian writing, built from long connecting strokes, steep diagonal descenders, and a rhythmic rise and fall across each line, rather than the more upright, evenly spaced letterforms of a script like Naskh. Text Deboss Studio's rendering engine treats every stroke as a true blind impression rather than printed ink: the glyph itself stays the exact same colour as the paper beneath it, and what actually reads as text to the eye is a soft dark shadow along the upper left edge of each stroke paired with a light highlight along its lower right edge, mimicking how a real pressed impression catches light from above.",
      },
      {
        heading: "Why this pairing works",
        body: "Nastaliq's curved, connected strokes catch light unevenly along their length, and that variation is exactly what a debossed impression needs in order to read clearly. Straighter, more geometric letterforms can look comparatively flat once pressed, whereas Nastaliq's natural swelling and tapering gives the shadow and highlight layers real texture to work with. Cool white paper keeps the piece bright and contemporary rather than warm or aged, which suits calligraphy meant for a phone screen or a social post just as well as a printed page. The engraving itself uses a shallow depth with a tight blur radius, a fine letterpress setting that keeps delicate strokes crisp instead of letting them soften into an indistinct smudge, since Nastaliq's already thin connecting strokes would lose definition entirely under a deeper, blurrier setting.",
      },
      {
        heading: "Where to use it",
        body: "A square export like this one works well as a standalone social media post, a printable card insert, or a small framed print for a hallway or desk. Because the background stays a flat, even paper tone rather than a busy scene, it also crops cleanly into a profile image, a greeting card front, or a single section on a larger printed page without fighting for attention. Turning on transparency before exporting drops the paper entirely, leaving only the debossed glyph shape on a clear background, which is useful if you would rather place the text over your own photograph, fabric texture, or brand colour instead of the studio's own paper tones. The same PNG also works well layered into a slideshow, a video overlay, or a printed invitation you are designing elsewhere.",
      },
      {
        heading: "Customize it in the studio",
        body: "Every value shown on this page, the font, paper tone, engraving depth, shadow and highlight strength, edge blur, and canvas shape, is adjustable once you open this look in the studio. Swap Noto Nastaliq Urdu for Gulzar or Noto Naskh Arabic to compare calligraphic styles side by side on the exact same phrase, try a warmer ivory or cream paper tone instead of cool white, or add a subtle colour tint to shift the glyph away from a pure paper match toward gold, bronze, or any colour you choose. The typed text itself can be replaced too, so this configuration is just as useful as a starting point for any other short phrase, name, or line you want rendered the same way, in the same font and paper pairing.",
      },
    ],
    state: {
      ...DEFAULT_STATE,
      paper: { r: 248, g: 247, b: 244 },
      depth: 1.80,
      shadow: 0.63,
      highlight: 0.55,
      blur: 2.0,
      texture: 0.18,
      tintStrength: 0.20,
      aspect: "1:1",
    },
  },
  {
    slug: "engraved-plaque-arabic-text",
    title: "Engraved Plaque Arabic Text",
    blurb: "The same Bismillah phrase in Noto Naskh Arabic, deeply engraved into black paper with a gold tint.",
    tags: ["Arabic", "Deboss", "Luxury"],
    sections: [
      {
        heading: "About this design",
        body: "This example presses the same Bismillah phrase used in the calligraphy example above, this time set in Noto Naskh Arabic on a near black paper tone with a warm gold tint. Naskh is a more upright, rounded Arabic script than Nastaliq, with clearer separation between letterforms, which is part of why it reads well at a smaller size and in more formal or printed contexts such as books and signage. Here the engraving runs much deeper than the calligraphy example: a larger depth value, stronger shadow, and lower highlight combine to carve the text further into the sheet, while a gold tint is blended into the glyph itself so the letters read as a warm metallic colour rather than the plain black of the paper beneath them.",
      },
      {
        heading: "Why this pairing works",
        body: "Deep engraving reads best on a dark, matte feeling paper tone, since a strong shadow needs somewhere dark to recede into and a bright highlight needs real contrast to stand out against. Black paper gives both of those effects plenty of room to work, which is why this configuration looks closer to an engraved metal or wood plaque than a paper card. The gold tint is blended in at a moderate strength, enough to read clearly as colour without flattening the underlying shadow and highlight work that gives the letters their sense of depth; a tint pushed too strong would start to look printed on top rather than engraved into the surface. Naskh's more geometric, upright strokes also hold up better than a flowing script under this much depth and shadow, since there is less delicate curve detail for the deeper engraving to obscure.",
      },
      {
        heading: "Where to use it",
        body: "This look is suited to anything meant to feel premium or permanent: a nameplate, an award or recognition plaque, a framed piece for an office or majlis, or packaging for a gift that should feel more substantial than an ordinary printed card. The dark paper and gold tint combination also photographs well under warm indoor lighting, which is worth keeping in mind if the export is headed for a product photo or a social media post rather than a physical print. Because the paper itself is dark, exporting with a transparent background is less useful here than for a light paper example, since most of what reads as background in the final image is actually the tinted glyph and its shadow, not the paper underneath.",
      },
      {
        heading: "Customize it in the studio",
        body: "Depth, shadow strength, highlight strength, edge blur, paper tone, and tint colour and strength are all independent sliders in the studio, so you can push this look further toward a subtle bronze engraving or dial it back toward a lighter, less dramatic tint. Swapping the paper tone to ivory or cool white while keeping the same gold tint gives a very different, softer result worth comparing side by side. The font can also be swapped to Noto Nastaliq Urdu or Gulzar if you would rather see this same deep engraving, gold tint treatment applied to a more flowing calligraphic style instead of Naskh's straighter strokes. As with every example here, the typed text is not locked to this phrase, so the same settings work for a name, a date, or a short line of your own.",
      },
    ],
    state: {
      ...DEFAULT_STATE,
      font: "Noto Naskh Arabic",
      paper: { r: 24, g: 22, b: 20 },
      depth: 2.40,
      shadow: 0.70,
      highlight: 0.20,
      blur: 2,
      texture: 0.35,
      tint: { r: 196, g: 160, b: 90 },
      tintStrength: 0.4,
      aspect: "1:1",
    },
  },
  {
    slug: "wedding-invitation-letterpress-text",
    title: "Wedding Invitation Letterpress Text",
    blurb: "A fine letterpress look for invitation wording, in Playfair Display on cool white paper.",
    tags: ["English", "Letterpress", "Wedding"],
    sections: [
      {
        heading: "About this design",
        body: "This example sets \"You Are Cordially Invited\" in Playfair Display, a high contrast serif typeface with elegant, tapered strokes, on a cool white paper tone with a fine, shallow engraving. Playfair Display's thin hairlines and pronounced contrast between thick and thin strokes are closely modelled on the classical serif faces used in formal print for well over a century, which is part of why it reads as wedding stationery almost immediately even before the deboss effect is applied. The text is set across three lines rather than one long line, since invitation wording like this reads more comfortably broken at natural phrase boundaries than crammed onto a single row, and the font size here is tuned down from the studio's default so the full phrase sits comfortably within a portrait canvas shape without crowding the edges.",
      },
      {
        heading: "Why this pairing works",
        body: "Fine letterpress engraving, meaning a shallow depth, a moderate shadow, and a tight blur radius, is the traditional look real letterpress wedding stationery is going for: crisp, shallow impressions rather than the deep, heavy engraving that suits a plaque or nameplate. Playfair Display's thin serifs would lose their delicate detail entirely under a deeper, blurrier setting, so keeping the depth shallow is what lets the typeface's actual letterforms stay legible and elegant rather than smudging into a rounded blob. Cool white paper reads as clean and formal without tipping into the yellow toned nostalgia of a warm ivory or cream tone, which suits a modern wedding aesthetic as easily as a traditional one. The portrait canvas shape mirrors the proportions of a real printed invitation card rather than a square social media tile.",
      },
      {
        heading: "Where to use it",
        body: "This export is sized for a portrait layout, which maps naturally onto a printed invitation insert, a save the date card, or a printable PDF a couple might hand to a local print shop themselves. It also works as a standalone image for a wedding website, a save the date social post, or a digital invitation sent directly rather than printed. Because the wording here is generic, \"You Are Cordially Invited\" rather than any specific names or a date, it is meant as a starting point: open it in the studio, retype the exact wording, names, and date you need, and the same font, paper, and engraving settings carry over automatically so the finished piece keeps this same fine letterpress look.",
      },
      {
        heading: "Customize it in the studio",
        body: "Alignment, font size, and canvas shape are all worth adjusting once your own wording is in place, since a longer line of names and a date will wrap differently than the short phrase shown here. Try centring versus left aligning the text, or switching the canvas shape to square or landscape if you are designing for a specific print size rather than a portrait insert. Playfair Display pairs well with a warmer cream or ivory paper if you want a softer, more traditional feel instead of this cool white tone, and a small amount of tint strength can add a subtle colour without losing the shallow, crisp engraving that makes this particular look read as letterpress rather than a heavier deboss.",
      },
    ],
    state: {
      ...DEFAULT_STATE,
      text: "You Are\nCordially Invited",
      font: "Playfair Display",
      paper: { r: 248, g: 247, b: 244 },
      depth: 3.4,
      shadow: 0.62,
      highlight: 0.48,
      blur: 1.6,
      texture: 0.18,
      fontSize: 40,
      aspect: "4:5",
    },
  },
  {
    slug: "thank-you-card-soft-deboss",
    title: "Thank You Card Soft Deboss",
    blurb: "A gentle soft deboss in Playfair Display on warm cream paper, ready to export and print.",
    tags: ["English", "Deboss", "Stationery"],
    sections: [
      {
        heading: "About this design",
        body: "This example sets a short \"Thank You\" in Playfair Display on a warm cream paper tone, using a soft, shallow deboss with a wide blur radius and a strong highlight. Soft deboss settings like these trade the crisp, defined edge of a letterpress look for something gentler and more rounded, which suits a short, warm message better than a sharp engraved one would. Warm cream paper adds to that same cosy feeling, sitting between the brightness of cool white and the darker weight of a deep tone, and pairs naturally with a soft engraving rather than a stark, high contrast one. The text is split across two short lines rather than set on one, giving each word its own visual weight within the square canvas.",
      },
      {
        heading: "Why this pairing works",
        body: "A wide blur radius softens the transition between the dark shadow and light highlight along each stroke, so the letters read as gently rounded rather than sharply cut, closer to a worn wax seal than a fresh engraving. Pairing that with a strong highlight and a comparatively shallow depth keeps the whole effect light rather than heavy, appropriate for a message meant to feel warm rather than formal. Playfair Display's serif detail still comes through at this softness since the letterforms are simple and short, two words rather than a long phrase, so there is less fine detail for the wider blur to lose. A deeper, sharper letterpress setting would read as more corporate or formal, which is the opposite of what a handwritten feeling thank you card is usually going for.",
      },
      {
        heading: "Where to use it",
        body: "A square export like this one works well as a printable thank you card, a gift tag, a sticker, or a small insert tucked into a package alongside a purchase. The warm, soft look suits small business packaging, wedding or event favour tags, and personal notes equally well, since nothing about the design reads as tied to one specific occasion. Because the paper tone here is a warm, opaque cream rather than transparent, this example is best exported as is for print, though switching on transparency in the studio still works if you would rather place the debossed words over your own card stock, wrapping paper, or product photo instead of the built-in paper texture.",
      },
      {
        heading: "Customize it in the studio",
        body: "Blur and highlight strength are the two sliders that matter most for softening or sharpening this particular look: pull blur down and depth up for something closer to the deeper, crisper engraved plaque example instead, or push blur even further for an even softer, more diffuse impression. The two word message here is easy to swap for any other short phrase, a name, a date, or a single word, and shorter text generally suits this soft setting better than a long paragraph would, since the wide blur is more forgiving on large, simple letterforms than on small, dense text. Try a different paper tone alongside these same engraving values to see how much the paper colour alone changes the finished mood.",
      },
    ],
    state: {
      ...DEFAULT_STATE,
      text: "Thank\nYou",
      font: "Playfair Display",
      paper: { r: 240, g: 232, b: 218 },
      depth: 2.2,
      shadow: 0.4,
      highlight: 0.8,
      blur: 5,
      texture: 0.3,
      aspect: "1:1",
    },
  },
];

export const DEFAULT_HINT =
  "Tip: presets adjust every slider at once, then fine-tune to taste.";

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

/** Strip `text` from a DebossState to build a CustomSet snapshot (a Set excludes the typed text). */
export function toSetSnapshot(s: DebossState): CustomSet["state"] {
  const {
    font, align, transparent, paper, depth, shadow, highlight, blur,
    texture, fontSize, tint, tintStrength, shadowColor, aspect,
  } = s;
  return {
    font, align, transparent, paper, depth, shadow, highlight, blur,
    texture, fontSize, tint, tintStrength, shadowColor, aspect,
  };
}

/** Generate a locally-unique id for a new CustomSet. */
export function generateSetId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

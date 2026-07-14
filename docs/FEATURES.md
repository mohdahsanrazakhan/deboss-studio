# Feature Inventory

Complete feature list, mapped 1:1 against the original vanilla app. Nothing here may regress without a deliberate decision.

## Text & typography

- [x] Script-agnostic textarea with automatic RTL/LTR direction detection (`detectTextDirection`) and a Urdu default text (بسمِ اللہ / الرحمٰن الرحیم)
- [x] Hard line breaks honoured; automatic direction-aware word wrap to canvas width
- [x] Five fonts: Noto Nastaliq Urdu (default), Gulzar, Noto Naskh Arabic, Playfair Display, Noto Serif Devanagari; loaded and awaited before first canvas paint
- [x] Font size slider (24-150 px)
- [x] Alignment: right / center (default) / left segmented control
- [x] Generous line spacing (LINE_FACTOR 1.9), tuned for Nastaliq's steep descenders but comfortable for other scripts too

## Engraving controls (sliders with live numeric readouts)

- [x] Depth (0-8, step 0.1)
- [x] Shadow strength (0-1, step 0.01)
- [x] Highlight strength (0-1, step 0.01)
- [x] Edge blur (0-12, step 0.1)
- [x] Paper texture (0-1, step 0.01)
- [x] Value formatting identical to original (`3.0`, `0.55`, integer font size)

## Presets

- [x] Soft Deboss · Deep Deboss · Fine Letterpress · Luxury Paper
- [x] A preset sets all five engraving params + paper tone, syncs sliders + swatch, and highlights its chip
- [x] Any manual slider/swatch change clears the active chip

## My sets (user-saved, distinct from Presets)

- [x] Save the *entire* current look (font, alignment, aspect, engraving params, paper, tint, tint strength, shadow colour) under a name, excluding the typed text
- [x] Persisted client-side in `localStorage` (`CUSTOM_SETS_STORAGE_KEY`); survives reloads, never sent to a server
- [x] Apply a saved set with one click; delete (with confirm dialog) via the × on its chip
- [x] Star one set as the **default on load** (★ on its chip): its style (not its text) auto-applies on every future visit, before the first canvas paint so there's no flash of the built-in look; persisted separately (`DEFAULT_SET_STORAGE_KEY`); deleting the default set clears the default too
- [x] Any manual tweak (slider, font, align, paper, tint, aspect, transparency) clears the active set chip, same as Presets
- [x] Capped at `MAX_CUSTOM_SETS` (24) with a hint when the limit is hit; name capped at `MAX_SET_NAME_LENGTH` (40 chars)

## Paper

- [x] Four tones: Ivory (default), Cool white, Warm cream, Cotton grey
- [x] Grain texture from a cached 220×220 noise tile
- [x] Soft directional lighting gradient (bright top-left → warm dark bottom-right)

## Rendering

- [x] True debossed (pressed-in) effect: paper-coloured glyphs + dark top-left inner shadow + white bottom-right inner highlight + subtle recess floor
- [x] DPR-aware preview (capped at 2×), presented at logical CSS size
- [x] rAF-coalesced renders (one paint per frame during slider drags)
- [x] Fluid re-layout on stage resize (ResizeObserver, 120 ms debounce; upgrade over the original's window-resize listener)
- [x] Checkerboard stage background revealing transparency

## Export

- [x] Download PNG at 3× resolution, pixel-identical render path, filename `text-deboss.png`
- [x] Copy image to clipboard (ClipboardItem) with busy state and graceful fallback message
- [x] Native share (Web Share API `files`) hands the exported PNG to the OS share sheet: Instagram, WhatsApp, Messages, etc. appear there on supported mobile browsers. Feature-detected on mount; the button only renders where it can actually work (mostly desktop browsers lack it), so there's never a dead-end click
- [x] Transparent background toggle (affects preview AND export)
- [x] Hint line flashes status messages (saved / copied / not supported) and reverts after 2.6 s

## UI chrome

- [x] Brand header with debossed-dot mark and tagline
- [x] Sticky control panel (desktop), single-column responsive layout ≤ 880 px, stacked actions ≤ 460 px
- [x] Visible keyboard focus, reduced-motion support
- [x] Original visual design preserved exactly (globals.css is the original stylesheet)

## Additions over the original (Next.js port)

- [x] Strict security headers incl. CSP (docs/SECURITY.md)
- [x] Full SEO surface: metadata, canonical, OG/Twitter, robots.txt, sitemap.xml, manifest, JSON-LD (docs/SEO-PLAN.md)
- [x] Strict TypeScript domain model (`types/deboss.ts`)
- [x] Input length guard (2000 chars) as a client-DoS control
- [x] ARIA: `aria-pressed` on toggles, `aria-live` hint, labelled groups, canvas `role="img"`
- [x] Full offline-capable PWA: manifest with SVG + PNG (192/512) + maskable + apple-touch icons, `appleWebApp` metadata for iOS, and a hand-rolled service worker (`public/sw.js`, no next-pwa/serwist dependency) that caches the app shell and static assets so the whole studio keeps working with no connection

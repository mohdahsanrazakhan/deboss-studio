# Feature Inventory

Complete feature list, mapped 1:1 against the original vanilla app. Nothing here may regress without a deliberate decision.

## Text & typography

- [x] Script-agnostic rich-text editor with automatic RTL/LTR direction detection (`detectTextDirection`) and a Urdu default text (بسمِ اللہ / الرحمٰن الرحیم)
- [x] Multiple independent text blocks on one canvas (Canva-style layers), each with its own content, font, alignment, size, letter spacing, line height, and position. Edited directly in place on the canvas, not a sidebar box: click a rendered block to select and open a true in-place editor pixel-matched to the debossed rendering, click away (or Escape) to commit; click genuinely empty canvas to create a new block there, copying the currently-selected block's style; a keyboard-focusable "Edit text" button in the stage bar opens the same editor for the selected (or first) block as an accessibility fallback. Any block can be dragged anywhere on the canvas as one unit (clamped fully inside), disambiguated from editing by a small movement threshold rather than a separate select step. A selected, non-editing block shows a persistent outline and a small delete button; Delete/Backspace also removes it. While a block is being edited, only that block's debossed render is suppressed (a flat overlay stands in for it); every other block, the paper, and the branding watermark keep rendering normally underneath. Capped at `MAX_TEXT_BLOCKS` (20) with a hint when the limit is hit. A document with a single block at the default centered position renders identically to the original single-text app

- [x] Hard line breaks honoured; automatic direction-aware word wrap to canvas width
- [x] Five fonts: Noto Nastaliq Urdu (default), Gulzar, Noto Naskh Arabic, Playfair Display, Noto Serif Devanagari; loaded and awaited before first canvas paint
- [x] Per-selection rich-text formatting: select any text and toggle Bold / Italic / Underline, or set its size with a pill-shaped -/[value]/+ stepper (1px steps, editable input for typing an exact px value, Enter or blur to commit, clamped 8-400px) (replaces the old single global font-size slider, and before that the plain A-/A+ buttons). Bold is disabled per font where there's no real loaded bold face (Gulzar only), to avoid a browser-synthesized ("faux") weight on that calligraphic script; Italic is available for every font (only Playfair Display has a real italic face, every other font renders a browser-synthesized oblique slant). A style change is snapped to the nearest word boundary for Arabic-script fonts, since a boundary landing mid-word would break letter-joining. The whole toolbar is a selection toolbar (Google Docs/Medium-style): hidden until text is selected, anchored to the selection, finger-friendly on touch (44x44px targets)
- [x] Alignment: right / center (default) / left segmented control
- [x] Letter spacing (-5 to 20 px) and line height (1.0-3.0×, default 1.9×) sliders, adjustable per document in the Type & Paper section
- [x] Draggable branding watermark: an optional second, independently-positioned text (e.g. an Instagram handle), entered in the Type & Paper section and dragged anywhere directly on the canvas preview (pointer-capture, touch-friendly, clamped so it can never end up partially clipped in the export). Rendered as a flat, subtle overlay after the main debossed effect, not pushed through the glyph-mask pipeline, so it works even with no main text at all. The text is remembered across sessions (its own `localStorage` key); its position is per-document and excluded from Custom Sets, like the main text

## Engraving controls (sliders with live numeric readouts)

- [x] Depth (0-8, step 0.1)
- [x] Shadow strength (0-1, step 0.01)
- [x] Highlight strength (0-1, step 0.01)
- [x] Edge blur (0-12, step 0.1)
- [x] Paper texture (0-1, step 0.01)
- [x] Value formatting identical to original (`3.0`, `0.55`)

## Presets

- [x] Soft Deboss · Deep Deboss · Fine Letterpress · Luxury Paper
- [x] A preset sets all five engraving params + paper tone, syncs sliders + swatch, and highlights its chip
- [x] Any manual slider/swatch change clears the active chip
- [x] Deep links: `?preset=<id>` applies a preset before first paint and gets its own title/description/canonical; picking a preset updates the URL, a manual tweak strips it, listed in `sitemap.xml` (docs/SEO-PLAN.md)

## My sets (user-saved, distinct from Presets)

- [x] Save the current shared/document-level look (aspect, engraving params, paper, tint, tint strength, shadow colour) under a name, excluding the text blocks entirely (font/alignment/spacing now live per block, so a single Set can't map onto N independently-styled blocks)
- [x] Persisted client-side in `localStorage` (`CUSTOM_SETS_STORAGE_KEY`); survives reloads, never sent to a server
- [x] Apply a saved set with one click; delete (with confirm dialog) via the × on its chip
- [x] Star one set as the **default on load** (★ on its chip): its style (not any text block) auto-applies on every future visit, before the first canvas paint so there's no flash of the built-in look; persisted separately (`DEFAULT_SET_STORAGE_KEY`); deleting the default set clears the default too
- [x] Any manual tweak (slider, a block's font/align/spacing, paper, tint, aspect, transparency) clears the active set chip, same as Presets
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
- [x] Full SEO surface: metadata, canonical, OG/Twitter (backed by a generated `opengraph-image.tsx`), robots.txt, sitemap.xml, manifest, JSON-LD (docs/SEO-PLAN.md)
- [x] On-page "How it works" + FAQ section with `FAQPage` JSON-LD (`components/layout/FAQ.tsx`), native `<details>`/`<summary>` disclosure with no added client JS
- [x] Strict TypeScript domain model (`types/deboss.ts`)
- [x] Input length guard (2000 chars) as a client-DoS control
- [x] ARIA: `aria-pressed` on toggles, `aria-live` hint, labelled groups, canvas `role="img"`
- [x] Full offline-capable PWA: manifest with SVG + PNG (192/512) + maskable + apple-touch icons, `appleWebApp` metadata for iOS, and a hand-rolled service worker (`public/sw.js`, no next-pwa/serwist dependency) that caches the app shell and static assets so the whole studio keeps working with no connection
- [x] Preset deep links: `?preset=<id>` applies a built-in preset before first paint and gets its own per-preset title/description, listed in `sitemap.xml`; picking a preset updates the URL, a manual tweak strips it (`docs/SEO-PLAN.md` Phase 2)
- [x] Gallery/examples pages (SEO Phase 3): `/gallery` (index) and `/gallery/<slug>` (one per curated `GalleryExample`), each with a real engine-rendered hero (`components/studio/GalleryPreview.tsx`), unique title/description/canonical, a per-example OG image, and a "Try this look" link into the studio via `?example=<slug>` (a bespoke full look, font/paper/engraving/tint/align/aspect/text included, not just the 5 fields a preset covers). Listed in `sitemap.xml`. See `docs/SEO-PLAN.md`, Phase 3.
- [x] MDX blog (SEO Phase 3): `/blog` (index) and `/blog/<slug>`, content-driven from `content/blog/*.mdx` (frontmatter + MDX body, `lib/blog/posts.ts`), rendered server-side via `next-mdx-remote/rsc` with zero added client JS. Adding a post is dropping a file, no route changes needed. Unique title/description/canonical/OG image and `BlogPosting` JSON-LD per post; an optional `coverExampleSlug` reuses a `GalleryExample` as a real engine-rendered cover. Listed in `sitemap.xml`. See `docs/SEO-PLAN.md`, Phase 3.

## Planned (not yet implemented)

- [ ] Localized landing pages (SEO Phase 2 #3): `/ur` and similar routes with translated UI copy, deferred pending native-speaker review. See `docs/SEO-PLAN.md`, Phase 2.

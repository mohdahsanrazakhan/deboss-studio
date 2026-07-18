---
name: text-deboss-engine
description: Use this skill when modifying, debugging, or extending the canvas deboss rendering engine in src/lib/deboss/, including the inner-shadow compositing trick, multi-script RTL/LTR text layout and wrapping (auto-detected via direction.ts), glyph masks, paper texture, font loading for canvas, preview/export parity, or performance of the render loop. Also use when adding presets, sliders, paper tones, fonts, or user-saved custom sets, since those flow through the engine's constants and types.
---

# Text Deboss Engine

## Mental model

The engine turns a `DebossState` into pixels in five stages, all inside `drawScene()` (`src/lib/deboss/engine.ts`):

```
paper background → glyph mask → recess floor → dark inner shadow → white inner highlight
     (a)              (b)           (c)              (d)                  (e)
```

The deboss illusion is purely light logic with a **top-left light source**:

- The text is NEVER given a contrasting colour. It stays paper-coloured, like a blind letterpress impression.
- Upper-left inner walls face *away* from the light → dark inner shadow, offset `(+off, +off)`.
- Lower-right inner walls face *toward* the light → white inner highlight, offset `(-off, -off)`.
- A very faint uniform darkening inside the glyph ("recess floor") seats the letters into the sheet: `alpha = 0.05 + depth / 90`.

## The inner-shadow trick (most fragile code in the repo)

`innerShadow(mask, color, blur, offX, offY)`:

1. Flood a tile with the shadow colour.
2. Switch to `destination-out` and draw the glyph mask at `(-push, -push)`, far off-canvas, while setting `shadowOffsetX/Y = off + push`. The glyph itself never lands on the tile; **only its shadow does**, exactly at the desired offset. That shadow erases the flood, leaving a soft band of colour hugging the inner edge *opposite* the offset direction.
3. Switch to `destination-in` and draw the mask at `(0,0)` to clip everything to the glyph interior → a true inner shadow.

`push = max(w, h) + 200`. If you change canvas sizing, verify push still exceeds every dimension plus blur, or the mask edge will bleed onto the tile and produce hard dark rectangles.

## RTL / LTR correctness rules

- `ctx.direction` must be set to `detectTextDirection(text)` (from `src/lib/deboss/direction.ts`) on BOTH the measuring context (`layoutLines`) and the mask context (`buildMask`), or wrapping widths and shaping disagree. Never hardcode `"rtl"` or `"ltr"` in the engine; direction must always come from the detector so both Urdu/Arabic text and Latin/Devanagari text shape correctly.
- `state.text` may contain rich-text markup (see "Rich-text dual path" below): always call `detectTextDirection(stripTags(state.text))`, never `detectTextDirection(state.text)` directly on possibly-tagged content. Tag names like `span`/`style` are Latin characters that would misdetect LTR on genuinely RTL content.
- `detectTextDirection` is a first-strong-character scan (simplified Unicode BiDi P2/P3): the first strongly-directional character in the text decides. Falls back to `"rtl"` for empty/neutral text, matching this app's Urdu-first default.
- Font strings must quote the family: `` `${px}px "${family}"` ``. Family names must byte-match the loaded Google Fonts families: `Noto Nastaliq Urdu`, `Gulzar`, `Noto Naskh Arabic`, `Playfair Display`, `Noto Serif Devanagari`.
- Nastaliq descends steeply; that's why `LINE_FACTOR = 1.9`. Reducing it clips diagonal word-stacks (and still reads comfortably for other scripts).
- Word-wrap splits on whitespace only. Never split inside a word; Arabic-script joining would break, and it also keeps Devanagari conjuncts intact.
- Canvas cannot shape a face that isn't loaded. Always `await document.fonts.load(size + 'px "Family"')` (see `ensureFont`) before first draw with a new family, and re-render after it resolves. `ensureFont` takes an optional `style: "normal" | "italic"` third argument; italic is a SEPARATE font resource from the upright weight range for the one font that has a real italic face (Playfair Display), not covered by loading the upright range.

## Rich-text dual path (bold/italic/underline/per-selection size)

`DebossState.text` is still a plain `string`, optionally containing a small closed tag vocabulary (`<b>`, `<i>`, `<u>`, `<span style="font-size:Npx">`) generated only by `lib/deboss/richtext.ts`'s serializer, paragraphs still joined by `\n`. `computeLayout`/`buildMask` branch on `hasRichRuns(state.text)`:

- **No runs** (every `GALLERY_EXAMPLES` entry, the default text, anyone who never opens the toolbar): the ORIGINAL scalar path above, byte-identical to before this feature existed. Never touch this path when working on rich text; it's the pixel-parity safety net for all existing content.
- **Has runs**: `measureRichLines` renders the same tagged markup into a hidden, singleton DOM container (lazy-created once, same pattern as `_measureCtx`/`_noiseTile`) and reads back the real browser's bidi-correct, wrap-correct positions via `getBoundingClientRect`, because canvas has no native mixed-run text layout API and hand-rolling bidi-aware wrapping risks exactly the RTL regressions this file warns against elsewhere. `buildMask` then does one `fillText` per word/sub-word fragment at its measured position/size/weight/style, plus a manually-filled rectangle for `underline` fragments drawn into the SAME mask (so it inherits recess/tint/shadow/highlight compositing for free, no special-casing elsewhere in `drawScene`).
- **Hard limitation, not a bug**: a style boundary landing mid-word still visibly breaks Arabic/Urdu letter-joining, because each `fillText` call shapes its substring in isolation regardless of positioning accuracy. Mitigated in the UI layer (`RichTextEditor.tsx` snaps a partial-word selection to word boundaries for `CURSIVE_SCRIPT_FONTS`), not fixable in the engine.
- `FONT_CAPABILITIES` (`constants.ts`) gates which fonts even offer Bold/Italic in the toolbar, since Gulzar has no bold face loaded and only Playfair Display has a real italic face; don't relax this table without also updating the Google Fonts URL in `layout.tsx`.

## Preview vs export: parity invariant

Both go through `drawScene(target, state, layout, scale, transparent)`:

- Preview: `scale = min(devicePixelRatio, MAX_PREVIEW_DPR=2)`, canvas presented at logical CSS size via `style.width/height`.
- Export: `scale = EXPORT_SCALE = 3`, offscreen canvas → `toBlob('image/png')`.

Any visual change made in only one path is a bug. Everything scale-dependent (offsets, blur, font size, padding, line positions) must be multiplied by `s` inside the draw code; check this whenever adding a visual element.

## Layout math

`computeLayout(state, logicalW)`:

- Wrap width: `logicalW - 2*PAD_X` (PAD_X=56).
- `logicalH = clamp(lines*lineHeight + 2*PAD_Y, 300, 1100)`.
- Text block is vertically centred; `textBaseline = "middle"` with per-line y at line centre.
- Alignment maps: center → x at `logicalW/2`; right → `logicalW - PAD_X`; left → `PAD_X` (all × `s`).

## Performance rules

- One paint per frame: every state change goes through `scheduleRender()` (cancel + `requestAnimationFrame`). Never call `renderPreview()` directly from an input handler.
- The noise tile (220×220) is generated once and cached (`getNoiseTile`); regenerating per frame will visibly shimmer and cost ~ms per paint. If you want animated grain, do it deliberately.
- ResizeObserver re-render is debounced 120 ms.
- `MAX_TEXT_LENGTH = 2000` caps layout cost. Keep it.

## Extending safely

- **New slider**: add to `SliderId` + `DebossState` (`types/deboss.ts`), `DEFAULT_STATE` + `SLIDER_DEFS` (`constants.ts`), consume in `engine.ts`. The panel renders from `SLIDER_DEFS` automatically. Manual slider changes must keep calling `setActivePreset(null)`.
- **New preset**: append to `PRESETS`. Presets set all five engraving params + paper; the `paper` string must match a `PAPER_TONES.key` for swatch sync.
- **New font**: `FontFamily` union → `FONT_OPTIONS` + `FONT_CAPABILITIES` (real bold/italic face availability) → add to the Google Fonts URL in `app/layout.tsx` → add to the preload `Promise.all` in `useDebossStudio.ts` → add to the font stack in `globals.css`'s `.rich-text-input .ProseMirror` and to `RichTextEditor.tsx`'s font-family effect. Confirm the face actually supports the target script's glyph coverage.
- **Custom sets** (`CustomSet` in `types/deboss.ts`) are user-saved, not built-in; don't add to `PRESETS` for these. A set is a full `DebossState` snapshot minus `text`, built by `toSetSnapshot()` (`constants.ts`) and persisted to `localStorage`. If you add a field to `DebossState`, add it to `toSetSnapshot()` too or it silently won't be captured by sets. One set's id can be starred as the default (`defaultSetId`, separately persisted); its style is applied to `state` inside the SAME `useEffect` that loads `customSets`, before the first canvas paint; keep that ordering if you touch that effect, or the default will flash in a frame late.

## Debug checklist

- Tofu/disconnected letters → font not loaded when drawn; check `ensureFont` and the exact family string.
- Effect looks embossed (raised) instead of debossed → shadow/highlight offsets swapped; dark must be `(+off,+off)`, light `(-off,-off)`.
- Blank export but fine preview → export ran before fonts ready, or `toBlob` returned null (see `canvasToPngBlob` rejection).
- Hard rectangles at glyph edges → `push` no longer clears canvas bounds (see above).
- Blurry preview on hi-DPI → `canvas.style.width/height` not set to logical size after resize.

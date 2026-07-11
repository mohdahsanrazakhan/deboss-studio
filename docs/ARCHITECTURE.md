# Architecture

Text Deboss Studio is a fully client-rendered canvas application wrapped in a server-rendered Next.js shell. There is no backend: no API routes, no database, no server state. The server's only jobs are delivering the static shell, SEO surfaces, and security headers.

## Layering

```
┌──────────────────────────────────────────────────────────┐
│ app/ (App Router)                                        │
│   layout.tsx  — metadata, fonts, JSON-LD   [server]      │
│   page.tsx    — shell: Header + Studio     [server]      │
│   robots.ts / sitemap.ts / manifest.ts     [build-time]  │
├──────────────────────────────────────────────────────────┤
│ components/studio/            [client, presentational]   │
│   Studio → ControlPanel + PreviewStage                   │
│   No state of their own; everything arrives via `studio` │
├──────────────────────────────────────────────────────────┤
│ hooks/useDebossStudio.ts      [client, stateful]         │
│   DebossState + activePreset + hint + isCopying          │
│   rAF render loop · font loading · ResizeObserver        │
│   downloadPng() · copyImage()                            │
├──────────────────────────────────────────────────────────┤
│ lib/deboss/engine.ts          [client-only, pure]        │
│   computeLayout · drawScene · ensureFont ·               │
│   buildExportCanvas · canvasToPngBlob                    │
│ lib/deboss/constants.ts       [isomorphic data]          │
│ types/deboss.ts               [types only]               │
└──────────────────────────────────────────────────────────┘
```

Dependency direction is strictly downward. The engine never imports React; components never import the engine directly (they go through the hook).

## Rendering pipeline

1. **State change** (slider, text, font, preset, swatch, transparency) → `setState` in the hook.
2. An effect calls `scheduleRender()`, which cancels any pending frame and books a new `requestAnimationFrame` — so a burst of slider events costs exactly one paint.
3. `renderPreview()` measures the stage's inner width, calls `computeLayout()` (direction-aware word wrap + height clamp — direction is auto-detected per `lib/deboss/direction.ts`), then `drawScene()` at `min(devicePixelRatio, 2)`.
4. `drawScene()` composites: paper (colour + cached noise tile + directional light gradient) → glyph mask → recess floor → dark inner shadow (top-left walls) → white inner highlight (bottom-right walls). See the engine skill file for the inner-shadow compositing trick.
5. The canvas backing store is physical pixels; CSS `width/height` present it at logical size for crispness.

**Export** reuses steps 3–4 with `EXPORT_SCALE = 3` on an offscreen canvas, then `toBlob('image/png')` → object-URL download or `ClipboardItem` copy. This guarantees the PNG is pixel-identical (×3) to the preview.

## Why fonts load via Google Fonts `<link>` instead of `next/font`

`next/font` rewrites family names to hashed private names. The canvas engine must address faces by real family name in `ctx.font` and `document.fonts.load()` for correct shaping across scripts, so the app keeps the real families ("Noto Nastaliq Urdu", "Gulzar", "Noto Naskh Arabic", "Playfair Display", "Noto Serif Devanagari", "Inter") and the CSP allowlists exactly the two Google Fonts origins. First paint of the canvas waits on `document.fonts.ready` plus explicit `fonts.load()` calls per family.

## Direction detection (RTL vs LTR)

`lib/deboss/direction.ts` exports `detectTextDirection(text)`, a first-strong-character scan over `DebossState.text`. Both the engine (`ctx.direction` in `layoutLines`/`buildMask`) and the UI (`dir` on the textarea in `ControlPanel.tsx`) call it — there is no manual toggle and no hardcoded direction anywhere. This lets the same app render Urdu/Arabic (RTL) and Latin/Devanagari (LTR) text correctly, script-switching live as the user types.

## State model

`DebossState` (in `types/deboss.ts`) is the single source of truth for a render. It is mirrored into `stateRef` so the rAF callback and export handlers always see current values without re-subscribing. UI-only state (`activePreset`, `hint`, `hintFlash`, `isCopying`) lives beside it in the hook but never enters the engine.

Preset semantics: applying a preset overwrites the five engraving parameters + paper tone and marks the preset chip active; any manual slider/swatch change clears the active chip (the values remain).

## Server vs client boundary

`page.tsx` and `Header` are server components — the header, landmarks, and metadata are in the HTML for crawlers. `Studio` is the single `"use client"` island; hydration cost is limited to it (First Load JS ≈ 107 kB total).

## Build & quality gates

`npm run build` runs ESLint (`next/core-web-vitals` + TS rules) and strict type-checking (`strict`, `noUncheckedIndexedAccess`). All routes are statically prerendered.

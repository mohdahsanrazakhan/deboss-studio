# Architecture

Text Deboss Studio is a fully client-rendered canvas application wrapped in a server-rendered Next.js shell. There is no backend: no API routes, no database, no server state. The server's only jobs are delivering the static shell, SEO surfaces, and security headers.

## Layering

```
┌──────────────────────────────────────────────────────────┐
│ middleware.ts - per-request CSP nonce         [edge]      │
├──────────────────────────────────────────────────────────┤
│ app/ (App Router)                                        │
│   layout.tsx  - metadata, fonts, JSON-LD   [server, async]│
│   page.tsx    - shell: Header + Studio     [server]      │
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
2. An effect calls `scheduleRender()`, which cancels any pending frame and books a new `requestAnimationFrame`, so a burst of slider events costs exactly one paint.
3. `renderPreview()` measures the stage's inner width, calls `computeLayout()` (direction-aware word wrap + height clamp; direction is auto-detected per `lib/deboss/direction.ts`), then `drawScene()` at `min(devicePixelRatio, 2)`.
4. `drawScene()` composites: paper (colour + cached noise tile + directional light gradient) → glyph mask → recess floor → dark inner shadow (top-left walls) → white inner highlight (bottom-right walls). See the engine skill file for the inner-shadow compositing trick.
5. The canvas backing store is physical pixels; CSS `width/height` present it at logical size for crispness.

**Export** reuses steps 3-4 with `EXPORT_SCALE = 3` on an offscreen canvas, then `toBlob('image/png')` → object-URL download or `ClipboardItem` copy. This guarantees the PNG is pixel-identical (×3) to the preview.

## Why fonts load via Google Fonts `<link>` instead of `next/font`

`next/font` rewrites family names to hashed private names. The canvas engine must address faces by real family name in `ctx.font` and `document.fonts.load()` for correct shaping across scripts, so the app keeps the real families ("Noto Nastaliq Urdu", "Gulzar", "Noto Naskh Arabic", "Playfair Display", "Noto Serif Devanagari", "Inter") and the CSP allowlists exactly the two Google Fonts origins. First paint of the canvas waits on `document.fonts.ready` plus explicit `fonts.load()` calls per family.

## Direction detection (RTL vs LTR)

`lib/deboss/direction.ts` exports `detectTextDirection(text)`, a first-strong-character scan over `DebossState.text`. Both the engine (`ctx.direction` in `layoutLines`/`buildMask`) and the UI (`dir` on the textarea in `ControlPanel.tsx`) call it; there is no manual toggle and no hardcoded direction anywhere. This lets the same app render Urdu/Arabic (RTL) and Latin/Devanagari (LTR) text correctly, script-switching live as the user types.

## State model

`DebossState` (in `types/deboss.ts`) is the single source of truth for a render. It is mirrored into `stateRef` so the rAF callback and export handlers always see current values without re-subscribing. UI-only state (`activePreset`, `activeCustomSet`, `hint`, `hintFlash`, `isCopying`) lives beside it in the hook but never enters the engine.

Preset semantics: applying a preset overwrites the five engraving parameters + paper tone and marks the preset chip active; any manual slider/swatch change clears the active chip (the values remain).

**Deep links**: `page.tsx` awaits `searchParams`, validates a `?preset=<id>` value against `PRESETS`, and passes the result down as `Studio`'s `initialPresetId` prop; `useDebossStudio.ts` applies it in a mount effect declared after the custom-sets/default-set load effect, so a shared link wins over a starred default. `page.tsx` also exports a `generateMetadata` that returns a per-preset title/description/canonical for that same value. Picking a preset client-side afterward calls `router.replace` to keep the URL in sync (`setPresetInUrl`); the same mutators that already clear `activePreset` (slider, paper swatch, applying a Set) also strip the query param (`clearPresetFromUrl`).

## Custom sets (client-side persistence)

`CustomSet` (`types/deboss.ts`) is a user-named snapshot of `DebossState` minus `text`: font, alignment, aspect, engraving, paper, tint, shadow colour. Unlike `Preset`s (built-in, four fixed configurations, engraving+paper only), sets are created by the user and cover the *entire* look.

They're the app's only persisted data, stored as JSON in `localStorage` under `CUSTOM_SETS_STORAGE_KEY`; still no server, no cookies, no network write. `useDebossStudio.ts` loads them once on mount and re-persists on every change, guarded by a `customSetsLoadedRef` so the pre-load empty array can't clobber storage before the initial read resolves. Every `localStorage` call is wrapped in `try/catch` since it can throw (private browsing, quota, disabled storage); a set then just lives for the current session instead of failing the app.

**Default set**: one set's id can be stored separately under `DEFAULT_SET_STORAGE_KEY` (`defaultSetId` state, toggled via `toggleDefaultSet`). The load effect that reads `customSets` also looks up this id and, if it still matches a saved set, applies that set's `state` to `DebossState` *in the same effect*, not a later one, so the change lands before the font-loading promise resolves and the first real canvas paint happens (`renderPreview` is gated on `fontsReadyRef`, which is far slower than a synchronous `localStorage.getItem`). That ordering is what avoids a visible flash of the built-in default before the user's default appears. `deleteCustomSet` clears `defaultSetId` if the deleted set was the default.

## Server vs client boundary

`page.tsx` and `Header` are server components; the header, landmarks, and metadata are in the HTML for crawlers. `Studio` is the single `"use client"` island; hydration cost is limited to it (First Load JS ≈ 107 kB total).

## CSP nonce + why the root route isn't static

`middleware.ts` runs on every request, generates a random nonce, and sets it as both the `x-nonce` request header and the response's `Content-Security-Policy` header (see `docs/SECURITY.md` for the full rationale: Next's App Router needs a nonced/trusted `script-src` for its own scripts, and a static `script-src 'self'` blocks them entirely in production). `layout.tsx` calls `headers()`; reading a Dynamic API is what makes Next render this route per-request rather than serving a cached static shell, which is the only way its renderer can see this request's nonce and stamp it onto the scripts it manages. Skip that call and every script gets blocked (we hit this once already). The nonce value itself is **not** applied to the one inline script the app authors (the JSON-LD block): it's `type="application/ld+json"`, which browsers never enforce `script-src` against (inert data, not executed), and nonce'ing it caused a hydration mismatch (browsers strip a script's `nonce` attribute from the DOM right after insertion). Net effect: `layout.tsx` is `async` and the root route renders dynamically (`ƒ` in the build output) instead of being statically prerendered; an accepted, required trade-off, and there's no expensive data fetching on this route, so the cost is negligible.

## Offline PWA (public/sw.js)

`public/sw.js` is a hand-rolled service worker (no `next-pwa`/`serwist` dependency): network-first for navigations (falls back to the cached shell offline), cache-first for same-origin hashed assets, stale-while-revalidate for cross-origin Google Fonts requests. Since this app has no backend and no data fetching, everything runs off client-side canvas + `localStorage`, so once the shell is cached the whole studio keeps working with no connection at all.

`src/components/layout/ServiceWorkerRegister.tsx` registers it, gated to `NODE_ENV === "production"` only; registering it in dev would let its cache-first strategy serve stale JS chunks over Fast Refresh's freshly rebuilt ones. The manifest (`app/manifest.ts`) lists SVG, PNG (192/512), and maskable (512, `purpose: "maskable"`) icons; `layout.tsx`'s `appleWebApp` metadata plus an `apple-touch-icon.png` cover iOS's separate "Add to Home Screen" icon convention. See `docs/SECURITY.md` for the CSP's `worker-src 'self'` and the service worker's (minimal) threat-model impact.

## Build & quality gates

`npm run build` runs ESLint (`next/core-web-vitals` + TS rules) and strict type-checking (`strict`, `noUncheckedIndexedAccess`). The root route (`/`) renders dynamically because of the CSP nonce (see above); `robots.txt`, `sitemap.xml`, and `manifest.webmanifest` remain statically generated since they're separate route handlers outside the React tree.

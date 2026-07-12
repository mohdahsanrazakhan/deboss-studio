# CLAUDE.md — Text Deboss Studio

This file orients Claude Code (and any AI coding agent) working in this repository. Read it fully before making changes.

## What this project is

A single-page Next.js 15 (App Router, TypeScript, React 19) web app that renders any text — Urdu, Arabic, Hindi, English, and more — as a **debossed / blind-letterpress effect** on textured paper using the HTML5 Canvas 2D API, and exports it as a high-resolution PNG. There is **no backend, no server database, no auth, no API routes** — all rendering happens in the user's browser. User-saved "sets" (see below) persist client-side in `localStorage` only; nothing is ever sent to a server. The default sample text is Urdu (`بسمِ اللہ / الرحمٰن الرحیم`), reflecting the app's origin, but the engine and UI are script-agnostic.

It was ported 1:1 from a vanilla HTML/CSS/JS app. Feature parity with the original is documented in `docs/FEATURES.md`; do not remove or regress any feature listed there.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build (runs lint + types)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (strict mode, noUncheckedIndexedAccess)
```

**Don't run `npm run build` or `npm run dev` yourself in this project** — the user runs both after you finish changes and reports back if something errors. Review the diff statically (types, imports, logic) instead of launching either command.

## Architecture in one paragraph

`src/lib/deboss/engine.ts` is a **framework-agnostic, client-only** canvas engine: pure functions that take a `DebossState` and draw onto a canvas (glyph mask → inner shadows → composite onto paper). `src/hooks/useDebossStudio.ts` is the **only** place interactive state lives; it owns the rAF-coalesced render loop, font loading, ResizeObserver, and export/copy actions. Components under `src/components/studio/` are presentational and receive everything via the `studio` object. Full details: `docs/ARCHITECTURE.md` and `.claude/skills/text-deboss-engine/SKILL.md`.

## Hard rules (do not violate)

1. **Preview/export parity.** Preview and PNG export MUST share the same `drawScene()` path. Never add a preview-only or export-only visual tweak.
2. **The engine stays framework-free.** No React imports in `src/lib/deboss/`. It touches `document` only lazily (functions, not module top-level side effects), so importing it during SSR stays safe.
3. **Security headers stay strict.** The Content-Security-Policy lives in `src/middleware.ts` (nonce-based `script-src`, generated per-request — NOT a static header in `next.config.mjs`; see the comment in `middleware.ts` for why). It allowlists only self + Google Fonts. If you add an external resource, you must update the CSP deliberately and document why in `docs/SECURITY.md`. Never widen `script-src` in production. Never re-add a `Content-Security-Policy` entry to `next.config.mjs`'s `headers()` — a second CSP header there combines with middleware's via intersection and silently blocks Next's own hydration scripts again (this shipped broken to production once already). Never re-enable `poweredByHeader`.
4. **No secrets in `NEXT_PUBLIC_*`** — those are shipped to the browser.
5. **Direction is auto-detected, not hardcoded.** `src/lib/deboss/direction.ts` (`detectTextDirection`) picks `"rtl"` or `"ltr"` from the first strong-directional character in `state.text`. Both `ctx.direction` in the engine (`layoutLines`, `buildMask`) and `dir` on the textarea in `ControlPanel.tsx` MUST derive from this function — never hardcode `"rtl"` or `"ltr"` again, that would regress either script. Font family names in `types/deboss.ts` must exactly match the Google Fonts CSS families, or `document.fonts.load()` silently falls back and the canvas renders tofu/incorrect shaping.
6. **All SEO strings flow from `src/config/site.ts`.** Don't hardcode the site name/URL/description elsewhere.
7. **Strict TypeScript stays on.** Don't loosen `tsconfig.json`; fix the types instead.

## Common tasks — where to go

| Task                            | Files to touch                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| Add/adjust a preset             | `src/lib/deboss/constants.ts` (`PRESETS`) — UI maps over it automatically |
| Add a paper tone                | `constants.ts` (`PAPER_TONES`)                                        |
| Add a slider parameter          | `types/deboss.ts` (`SliderId`, `DebossState`) → `constants.ts` (`SLIDER_DEFS`, `DEFAULT_STATE`) → use it in `engine.ts` |
| Add a font                      | `types/deboss.ts` (`FontFamily`) → `constants.ts` (`FONT_OPTIONS`) → Google Fonts URL in `app/layout.tsx` → preload list in `useDebossStudio.ts` → font stack in `globals.css` `#text-input` |
| Adjust RTL/LTR detection        | `src/lib/deboss/direction.ts` (`detectTextDirection`) only — engine and `ControlPanel.tsx` both call it |
| Change what a "set" saves       | `CustomSet` (`types/deboss.ts`) + `toSetSnapshot()` (`constants.ts`) — keep both in sync when `DebossState` grows |
| Change default-on-load behavior | `useDebossStudio.ts` — the custom-sets load `useEffect` (applies `defaultSetId`'s style before first paint) and `toggleDefaultSet` |
| Change the visual effect        | `src/lib/deboss/engine.ts` only                                       |
| UI styling                      | `src/app/globals.css` (design tokens in `:root`)                      |
| SEO/meta changes                | `src/config/site.ts`, `src/app/layout.tsx`, see `docs/SEO-PLAN.md`    |

## Gotchas learned the hard way

- The **inner-shadow trick** in `engine.ts` (`innerShadow()`) draws the glyph mask far off-canvas and lets only its *shadow* land on the tile, then clips with `destination-in`. The `push` offset math is delicate — read the comments before editing.
- `document.fonts.ready` can resolve before a newly selected face is usable at a specific size; that's why `setFont` awaits `ensureFont()` and then forces a fresh rAF.
- Preview DPR is capped at 2 (`MAX_PREVIEW_DPR`) to keep large canvases fast; export uses `EXPORT_SCALE = 3` regardless.
- `state` is mirrored into `stateRef` so the render loop and export handlers always read fresh values without re-binding listeners.
- Clipboard copy (`ClipboardItem`) is not supported in every browser/context; the catch branch must keep showing the "use Download instead" hint.
- Text input is capped at `MAX_TEXT_LENGTH` (2000 chars) as a canvas-DoS guard — keep the cap if you touch text handling.
- Custom sets (`useDebossStudio.ts`) persist to `localStorage` behind a `customSetsLoadedRef` guard: the load effect sets it after reading storage, and the persist effect bails out until it's true — otherwise the initial empty `customSets` array would overwrite whatever was already saved before the load effect ran. All `localStorage` calls are wrapped in `try/catch` (private browsing, quota, disabled storage all throw).
- One set can be starred as the default (`defaultSetId`, its own `localStorage` key). Its *style* (never its text — `CustomSet.state` excludes `text` by design) is applied to `state` inside the SAME load effect that reads `customSets` from storage, synchronously with the load rather than in a later render — this is what avoids a flash of the built-in default before the user's default appears, since the canvas doesn't paint at all until fonts are ready (much slower than a localStorage read). Deleting the default set clears `defaultSetId` too.
- **`layout.tsx` MUST stay `async` and call `await headers()`, even though the value looks unused.** That call is what makes the route render per-request instead of being served as a cached static shell — the only way Next's renderer can see `middleware.ts`'s fresh nonce and stamp it onto the scripts it manages. Remove it and every script gets blocked in production (happened twice already: once by never adding it, once by "cleaning up" what looked like dead code).
- **Never add a `nonce` prop to the JSON-LD `<script>` in `layout.tsx`.** It's `type="application/ld+json"`, which browsers don't enforce `script-src` against (inert data, never executed) — it doesn't need one, even though `layout.tsx` does read the nonce (see above). A nonce on THIS specific script previously caused a hydration mismatch, because browsers strip a script's `nonce` attribute from the DOM right after insertion, so React's SSR-rendered value can never match what it reads back client-side.

## Style conventions

- Named exports for components (no default exports except Next.js route files, which require them).
- Path alias `@/*` → `src/*`.
- Comments explain *why*, not *what*. The engine is intentionally heavily commented — preserve that.
- Keep components presentational; new interactive logic goes in the hook or a new hook, not in JSX files.

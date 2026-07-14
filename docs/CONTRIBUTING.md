# Contributing

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Make the change; keep the engine (`src/lib/deboss/`) React-free and the components presentational.
3. Run the full gate locally; a PR is ready only when all pass:

```bash
npm run lint
npm run typecheck
npm run build
```

4. Manually verify in the browser: type text in a couple of scripts (e.g. Urdu and English, to exercise direction auto-detection), drag each slider, switch fonts/alignment/paper, apply each preset, toggle transparency, then Download PNG and Copy image. Compare the PNG against the preview.
5. Update docs in the same PR: `docs/FEATURES.md` for any behaviour change, `docs/SECURITY.md` + the CSP for any new external origin, `docs/SEO-PLAN.md` + `sitemap.ts` for any new page.

## Commit style

Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`. Imperative mood, ≤ 72-char subject.

## Code conventions

- TypeScript strict mode; no `any`, no non-null assertions where a guard is possible.
- Named exports everywhere except Next.js route files.
- `@/` path alias for all internal imports.
- CSS lives in `globals.css` with the `:root` token block; don't introduce CSS-in-JS or Tailwind piecemeal.
- Comments explain intent, not mechanics; especially in the engine.

## Non-negotiables (see CLAUDE.md for the full list)

- Preview/export share one render path.
- CSP stays strict; no new origins without a security review note.
- RTL correctness: `dir="rtl"` on the textarea, `ctx.direction = "rtl"` in the engine, exact font family names.
- No feature in `docs/FEATURES.md` may silently regress.

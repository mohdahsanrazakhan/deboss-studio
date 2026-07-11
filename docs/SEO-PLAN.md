# SEO Plan

## Goal

Rank for tool-intent queries around text effects and letterpress/deboss generators — broad, script-agnostic queries first, with Urdu/Arabic/calligraphy long-tail as a strong secondary audience (the app's origin and default sample text) — and earn rich results as a free web application.

Primary keyword themes (already wired into `src/config/site.ts`):

- text generator, png text generator, typography tool, text effect generator
- debossed text / embossed text online, letterpress effect generator
- urdu text generator, calligraphy generator, nastaliq, naskh, اردو

## Implemented (phase 1 — shipped in this codebase)

| Surface                       | Where                                    | Notes                                                        |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Title + template              | `app/layout.tsx` `metadata.title`        | Brand + primary keyword in default title                     |
| Meta description              | `config/site.ts`                         | Benefit-led, < 160 chars of core message                     |
| Canonical URL                 | `metadata.alternates.canonical` + `metadataBase` | Driven by `NEXT_PUBLIC_SITE_URL`                     |
| Open Graph + Twitter cards    | `app/layout.tsx`                         | `summary_large_image`; add a real OG image (phase 2)         |
| Robots meta                   | `metadata.robots`                        | index/follow, large image preview                            |
| `robots.txt`                  | `app/robots.ts`                          | Allows all, points to sitemap                                |
| `sitemap.xml`                 | `app/sitemap.ts`                         | Single URL today; extend as pages are added                  |
| Web app manifest              | `app/manifest.ts`                        | Installable PWA metadata                                     |
| JSON-LD structured data       | `app/layout.tsx`                         | `WebApplication` schema, price 0, `inLanguage: [en, ur, ar, hi]` |
| Server-rendered shell         | `app/page.tsx`                           | H1, description, landmarks in HTML — crawlable without JS    |
| Performance                   | static prerender, ~107 kB First Load JS, preconnect to font origins, `display=swap` | Core Web Vitals friendly |
| Accessibility (SEO-adjacent)  | labels, aria-pressed, aria-live hint, reduced-motion CSS | Quality signal + usability            |

## Phase 2 — content & rich results (next)

1. **OG image**: add a designed 1200×630 `opengraph-image.png` (or an `opengraph-image.tsx` ImageResponse) showing a real debossed sample — dramatically improves social CTR.
2. **On-page copy**: add a short, crawlable "How it works" + FAQ section below the studio (what is debossing, how to export transparent PNGs, which fonts are included). Mark up the FAQ with `FAQPage` JSON-LD.
3. **Localized landing pages**: `/ur` and similar routes with translated UI copy, `hreflang` alternates, and `lang`/`dir` set per locale (the app already auto-detects RTL/LTR per input, so this is UI-copy translation, not an engine change) — high-leverage for the Urdu/Arabic audience specifically.
4. **Preset deep links**: encode state in the URL query (`?preset=letterpress`) so preset pages can be linked, shared, and listed in the sitemap.

## Phase 3 — growth

- Gallery/examples pages targeting long-tail queries ("bismillah calligraphy png", "urdu poetry image maker") — each with unique copy and pre-rendered sample images.
- Blog posts: letterpress history, Nastaliq vs Naskh, how the canvas effect works (developer audience earns backlinks).
- Submit to tool directories; monitor Search Console for query gaps.

## Guardrails

- Every new page: unique title/description, canonical, added to `sitemap.ts`.
- Keep First Load JS lean — the studio should stay the only client island per page.
- Never block rendering on fonts (keep `display=swap`).
- All URLs/names flow from `config/site.ts`; set `NEXT_PUBLIC_SITE_URL` in production or canonicals will point at localhost.

## Measurement

Search Console + Core Web Vitals (field data) once deployed. If analytics are added later, prefer a cookieless, script-light option and update the CSP + SECURITY.md accordingly.

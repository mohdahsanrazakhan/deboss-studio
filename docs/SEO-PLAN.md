# SEO Plan

## Goal

Rank for tool-intent queries around text effects and letterpress/deboss generators: broad, script-agnostic queries first, with Urdu/Arabic/calligraphy long-tail as a strong secondary audience (the app's origin and default sample text), and earn rich results as a free web application.

Primary keyword themes (already wired into `src/config/site.ts`):

- text generator, png text generator, typography tool, text effect generator
- debossed text / embossed text online, letterpress effect generator
- urdu text generator, calligraphy generator, nastaliq, naskh, اردو

## Implemented (phase 1: shipped in this codebase)

| Surface                       | Where                                    | Notes                                                        |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Title + template              | `app/layout.tsx` `metadata.title`        | Brand + primary keyword in default title                     |
| Meta description              | `config/site.ts`                         | Benefit-led, < 160 chars of core message                     |
| Canonical URL                 | `metadata.alternates.canonical` + `metadataBase` | Driven by `NEXT_PUBLIC_SITE_URL`                     |
| Open Graph + Twitter cards    | `app/layout.tsx`                         | `summary_large_image`, backed by the generated OG image below |
| OG image                      | `app/opengraph-image.tsx`                | Generated (Next's `ImageResponse`/Satori, not a static file) at 1200×630; auto-wires both `og:image` and `twitter:image`; dual text-shadow approximates the real deboss look |
| Robots meta                   | `metadata.robots`                        | index/follow, large image preview                            |
| `robots.txt`                  | `app/robots.ts`                          | Allows all, points to sitemap                                |
| `sitemap.xml`                 | `app/sitemap.ts`                         | Homepage, one entry per preset deep link, `/gallery`, and one entry per gallery example |
| Web app manifest + service worker | `app/manifest.ts`, `public/sw.js`    | Full offline-capable PWA: PNG/maskable/apple icons, `appleWebApp` metadata, hand-rolled offline caching (docs/SECURITY.md) |
| JSON-LD structured data       | `app/layout.tsx`, `components/layout/FAQ.tsx` | `WebApplication` schema (price 0, `inLanguage: [en, ur, ar, hi]`) plus a separate `FAQPage` schema for the on-page FAQ |
| On-page copy                  | `components/layout/FAQ.tsx`              | "How it works" (4 steps) + 6-question FAQ, rendered below the studio in `app/page.tsx`; native `<details>`/`<summary>`, zero added client JS |
| Server-rendered shell         | `app/page.tsx`                           | H1, description, landmarks, FAQ in HTML; crawlable without JS |
| Performance                   | `/` renders dynamically per request (required for the CSP nonce, see `docs/SECURITY.md`), ~107 kB First Load JS, preconnect to font origins, `display=swap` | Core Web Vitals friendly; no expensive data fetching on the dynamic route, so the cost is negligible |
| Accessibility (SEO-adjacent)  | labels, aria-pressed, aria-live hint, reduced-motion CSS | Quality signal + usability            |

## Phase 2: content & rich results

1. ~~**OG image**~~: done, see `app/opengraph-image.tsx` in the table above.
2. ~~**On-page copy**~~: done, see `components/layout/FAQ.tsx` in the table above.
3. **Localized landing pages** (not started): `/ur` and similar routes with translated UI copy, `hreflang` alternates, and `lang`/`dir` set per locale (the app already auto-detects RTL/LTR per input, so this is UI-copy translation, not an engine change), high-leverage for the Urdu/Arabic audience specifically. Needs a native speaker to review the translated copy before it ships.
4. ~~**Preset deep links**~~: done. `?preset=<id>` (`soft`, `deep`, `letterpress`, `luxury`) is validated server-side in `app/page.tsx`, which resolves a per-preset `generateMetadata` (unique title, description) and hands the id to `Studio`/`useDebossStudio` so the preset applies before first paint, exactly like a starred default set but with the URL taking priority. Picking a preset client-side updates the URL via `router.replace` (`useDebossStudio.ts`); any manual tweak that already cleared `activePreset` today (slider, paper, applying a Set) also strips the query param. Listed in `app/sitemap.ts`, one entry per preset.
   - **Known limitation, accepted deliberately**: `alternates.canonical` and `openGraph.url` both resolve to the bare homepage URL for every preset page instead of `<url>/?preset=<id>`, because of a bug in Next.js 15.5.20's own metadata resolver (`resolveAbsoluteUrlWithPathname` in `next/dist/lib/metadata/resolvers/resolve-url.js`): whenever a resolved URL's `pathname` is exactly `/`, it discards the query string and returns bare `origin`, regardless of whether the source value was a string or a `URL` instance. Since preset pages live at the root path with only a query string distinguishing them, this collapses their canonical/og:url to `/`, meaning search engines will likely treat them as duplicates of the homepage rather than indexing them separately. Title, description, and the OG image remain correctly per-preset; only these two machine-readable URL fields are affected. Fixing this properly would mean moving presets to real path segments (e.g. `/preset/soft`); deferred as a bigger, separate decision if this limitation turns out to matter for actual search visibility.

## Phase 3: growth

- ~~**Gallery/examples pages**~~: done. `/gallery` (index) plus one route per example, `/gallery/<slug>` (`GALLERY_EXAMPLES` in `lib/deboss/constants.ts`: `bismillah-calligraphy-png`, `engraved-plaque-arabic-text`, `wedding-invitation-letterpress-text`, `thank-you-card-soft-deboss`). Each example is a bespoke full look (its own font, paper, engraving, tint, alignment, aspect, and specific sample text), not anchored to the 4 built-in presets, since presets alone don't carry font/text/alignment. Each `/gallery/<slug>` page has its own title/description/canonical (a real path segment, so the canonical-collapse bug affecting `?preset=` pages, above, does NOT apply here) and a per-example OG image (`app/gallery/[slug]/opengraph-image.tsx`) approximating that example's own text/paper via the same Satori trick as the homepage's. The on-page hero (`components/studio/GalleryPreview.tsx`) is a real, engine-rendered preview (`computeLayout`/`drawScene`, not a CSS approximation), since it's the app's own visitor-facing display, unlike the OG image (built for crawlers that can't run JS). "Try this look" links to `/?example=<slug>`, a new deep link (mirrors `?preset=<id>`, extended to a full state including text) resolved in `app/page.tsx` and applied in `useDebossStudio.ts`. Listed in `sitemap.ts`.
- Blog posts: letterpress history, Nastaliq vs Naskh, how the canvas effect works (developer audience earns backlinks).
- Submit to tool directories; monitor Search Console for query gaps.

## Guardrails

- Every new page: unique title/description, canonical, added to `sitemap.ts`.
- Keep First Load JS lean; the studio should stay the only client island per page. The rich-text editor (Tiptap, `RichTextEditor.tsx`) is a real exception to "no new heavy dependencies," accepted deliberately for the formatting feature; it's loaded via `next/dynamic({ ssr: false })` specifically to keep its bytes in a separate chunk rather than the tracked First Load JS number.
- Never block rendering on fonts (keep `display=swap`).
- All URLs/names flow from `config/site.ts`; set `NEXT_PUBLIC_SITE_URL` in production or canonicals will point at localhost.

## Measurement

Search Console + Core Web Vitals (field data) once deployed. If analytics are added later, prefer a cookieless, script-light option and update the CSP + SECURITY.md accordingly.

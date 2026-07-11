# Security

## Threat model

This is a static, client-only tool: no authentication, no server-side state, no persistence, no user data leaving the browser. The text a user types is rendered onto a local canvas and exported locally — it is never transmitted anywhere. The remaining attack surface is therefore:

1. **XSS / script injection** into the page.
2. **Supply chain** (dependencies, third-party origins).
3. **Clickjacking / framing** abuse.
4. **Client-side DoS** (pathological inputs freezing the render loop).
5. **Information leakage** via headers/referrers.

## Controls in place

### Content-Security-Policy (src/middleware.ts)

The CSP is generated **per-request in middleware**, not as a static header in `next.config.mjs`. Reason: Next.js App Router injects several inline `<script>` tags into every page (RSC flight-data pushes + the hydration bootstrap) — a static `script-src 'self'` with no `'unsafe-inline'`/nonce/hash blocks every one of them in production, and the page renders blank (dev mode masked this because dev CSP added `'unsafe-inline'`; this shipped broken to the first production deploy until caught). The fix is Next's documented nonce pattern:

```
default-src 'self';
script-src 'self' 'nonce-<random-per-request>' 'strict-dynamic';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' blob: data:;
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

Rationale:

- `middleware.ts` generates a fresh random nonce every request and sets it as the `x-nonce` request header plus the `Content-Security-Policy` header (request AND response). `app/layout.tsx` reads `headers()` — this is **required**, not optional: calling a Dynamic API is what makes the route render per-request instead of being cached as a static build-time shell, which is the only way Next's renderer can see THIS request's nonce and stamp it onto the scripts it manages (webpack/RSC chunk loaders, flight-data pushes, hydration bootstrap). Skip that call and Next has nothing to stamp scripts with, so the strict CSP blocks every script — we hit exactly this after an earlier, over-eager cleanup removed the call.
- `'strict-dynamic'` lets scripts trusted via the nonce load their own child chunks (webpack/RSC chunk loading) — required for the app to run at all with a nonce-based policy. Browsers that honor it then ignore `'self'` for `script-src`; the resulting "Ignoring 'self' within script-src" console line is informational, not an error.
- **Do not** add a `Content-Security-Policy` header back into `next.config.mjs`. Two CSP headers on one response are enforced as an intersection (most restrictive per directive wins), so a static `script-src 'self'` there would silently defeat the nonce and reintroduce the blank-page bug.
- **Don't apply the nonce to the JSON-LD script.** `layout.tsx` reads the nonce (required, see above) but must NOT put it on the JSON-LD `<script type="application/ld+json">` (developer-controlled constants only — no user input ever flows into it). That script doesn't need a nonce in the first place — browsers only enforce `script-src` against executable script MIME types, and `application/ld+json` is inert data that's never executed. Nonce'ing it anyway caused a hydration mismatch, since browsers hide a script's `nonce` attribute from the DOM right after insertion (so React's SSR-rendered value can never match what it reads back client-side). Keep that one script nonce-free while still calling `headers()`.
- Google Fonts is the **only** external origin (styles + font binaries), required for multi-script shaping. Nothing else may be added without updating this document.
- `blob:` in `img-src` supports the PNG download flow (`URL.createObjectURL`).
- `'unsafe-inline'` in `style-src` is required by Next.js critical-CSS injection; scripts remain locked down via the nonce, which is what matters for XSS.
- Dev builds add `'unsafe-eval'` to `script-src` for Fast Refresh only — gated on `NODE_ENV !== 'production'`.
- **Trade-off**: because `layout.tsx` must call `headers()`, the root route renders dynamically per request instead of being statically prerendered at build time. This is the accepted, necessary cost of a working nonce-based CSP; there's no expensive data fetching on this route, so the cost is negligible.

### Other headers

| Header                      | Value                                            | Purpose                       |
| --------------------------- | ------------------------------------------------ | ----------------------------- |
| `X-Frame-Options`           | `DENY` (+ CSP `frame-ancestors 'none'`)          | Clickjacking                  |
| `X-Content-Type-Options`    | `nosniff`                                        | MIME sniffing                 |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                | Leakage                       |
| `Permissions-Policy`        | all sensitive features off; `clipboard-write=(self)` | Least privilege (copy button needs clipboard-write) |
| `Strict-Transport-Security` | 2 years, includeSubDomains, preload              | Force HTTPS                   |
| `poweredByHeader: false`    | —                                                | Don't advertise the framework |

### Application-level

- **No `dangerouslySetInnerHTML` with dynamic data.** User text goes only into a controlled `<textarea>` value and into `ctx.fillText()` — canvas text drawing cannot execute markup.
- **Input bounding**: text capped at `MAX_TEXT_LENGTH = 2000` (plus `maxLength` on the textarea) and canvas height clamped to 1100 logical px, preventing render-loop DoS from megabyte pastes.
- **Numeric inputs** are range-bounded by slider defs; paper keys are parsed defensively (`parsePaperKey` clamps to 0–255 with fallbacks).
- **No secrets**: the only env var is `NEXT_PUBLIC_SITE_URL` (public by design). `.env*` is gitignored; `.env.example` documents the contract.
- **Strict TypeScript** (`strict`, `noUncheckedIndexedAccess`) removes a class of undefined-access bugs.

## Operational guidance

- Run `npm audit` in CI and keep Next.js/React patched — the framework is the largest dependency surface (there are only 3 runtime deps: next, react, react-dom).
- If you add ANY external origin (fonts, analytics, CDN), update the CSP and this file in the same PR.
- Serve over HTTPS only; HSTS preload assumes the apex domain is HTTPS-committed.
- Consider adding a `security.txt` (`/.well-known/security.txt`) once there's a disclosure contact.

## Known accepted risks

- `'unsafe-inline'` styles (Next.js requirement) — low impact given scripts are locked.
- Google Fonts as a third-party dependency — accepted for typography correctness; self-hosting the four families under `public/fonts/` with `@font-face` would remove it and allow tightening `style-src`/`font-src` to `'self'` (tracked as a hardening follow-up).

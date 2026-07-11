# Security

## Threat model

This is a static, client-only tool: no authentication, no server-side state, no persistence, no user data leaving the browser. The text a user types is rendered onto a local canvas and exported locally — it is never transmitted anywhere. The remaining attack surface is therefore:

1. **XSS / script injection** into the page.
2. **Supply chain** (dependencies, third-party origins).
3. **Clickjacking / framing** abuse.
4. **Client-side DoS** (pathological inputs freezing the render loop).
5. **Information leakage** via headers/referrers.

## Controls in place

### Content-Security-Policy (next.config.mjs)

Production policy:

```
default-src 'self';
script-src 'self';
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

- `script-src 'self'` — no inline scripts, no third-party JS, no analytics. The only inline `<script>` is the JSON-LD block, which is `type="application/ld+json"` (data, not executable) and built from developer-controlled constants only — no user input ever flows into it.
- Google Fonts is the **only** external origin (styles + font binaries), required for Nastaliq shaping. Nothing else may be added without updating this document.
- `blob:` in `img-src` supports the PNG download flow (`URL.createObjectURL`).
- `'unsafe-inline'` in `style-src` is required by Next.js critical-CSS injection; scripts remain locked down, which is what matters for XSS.
- Dev builds add `'unsafe-eval'`/`'unsafe-inline'` to `script-src` for Fast Refresh only — gated on `NODE_ENV !== 'production'`.

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

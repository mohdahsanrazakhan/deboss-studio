import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Per-request, nonce-based Content-Security-Policy.
 *
 * Next.js App Router injects several inline/external <script> tags into
 * every page (webpack/RSC chunk loaders + flight-data pushes + the
 * hydration bootstrap); a static `script-src 'self'` with no
 * 'unsafe-inline'/nonce/hash blocks ALL of them in production, so React
 * never hydrates and the page renders blank (this bit us on the first
 * real deploy; dev mode masks it because dev CSP adds 'unsafe-inline').
 *
 * A random nonce per request, forwarded on the *request's*
 * Content-Security-Policy header, lets Next.js's renderer see it and
 * automatically apply it to every script it manages, but only if
 * something in the render tree actually calls `headers()` (see the
 * comment in `app/layout.tsx`). Skip that call and Next has no signal to
 * stamp the nonce onto its own scripts, so the strict CSP blocks
 * everything again (we hit this too, so don't remove that `headers()` call
 * even though its return value looks unused there).
 *
 * `'strict-dynamic'` lets those nonce-trusted scripts load their own
 * child chunks; browsers that support it then ignore `'self'` for
 * script-src (that's the "Ignoring 'self'" console message: informational,
 * not an error).
 *
 * This REPLACES the CSP that used to live in next.config.mjs; do not
 * reintroduce a static Content-Security-Policy header there, or the
 * response will carry two CSP headers and browsers enforce the
 * intersection (the old 'self'-only script-src would win again).
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and metadata files: they don't render HTML,
    // so there's no inline script to nonce and no benefit to the CSP header.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt|manifest.webmanifest).*)",
  ],
};

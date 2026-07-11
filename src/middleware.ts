import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Per-request, nonce-based Content-Security-Policy.
 *
 * Next.js App Router injects several inline <script> tags into every page
 * (RSC flight-data pushes + the hydration bootstrap) — a static
 * `script-src 'self'` with no 'unsafe-inline'/nonce/hash blocks ALL of
 * them in production, so React never hydrates and the page renders blank
 * (this bit us on the first real deploy; dev mode masks it because dev
 * CSP adds 'unsafe-inline'). A random nonce per request, forwarded on the
 * *request's* Content-Security-Policy header, lets Next.js's renderer see
 * it and automatically apply it to the scripts it manages. `'strict-dynamic'`
 * lets those trusted scripts load their own child chunks (webpack/RSC
 * chunk loading).
 *
 * Nothing in `app/` needs the nonce directly — our own inline script
 * (the JSON-LD block in layout.tsx) is `type="application/ld+json"`,
 * which browsers don't enforce script-src against (it's inert data,
 * never executed), so it doesn't need one. Giving it one anyway caused a
 * hydration mismatch, since browsers hide a script's `nonce` attribute
 * from the DOM right after insertion — don't re-add it.
 *
 * This REPLACES the CSP that used to live in next.config.mjs — do not
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
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and metadata files — they don't render HTML,
    // so there's no inline script to nonce and no benefit to the CSP header.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt|manifest.webmanifest).*)",
  ],
};

/**
 * Next.js configuration — Text Deboss Studio
 *
 * Security posture (see docs/SECURITY.md):
 *  - Content-Security-Policy is NOT set here — it lives in `src/middleware.ts`
 *    because it needs a fresh nonce per request (Next.js App Router requires
 *    inline <script> tags for RSC streaming/hydration; a static
 *    `script-src 'self'` blocks them all in production and renders a blank
 *    page). Do not add a Content-Security-Policy header to this file — a
 *    second CSP header would combine with middleware's via intersection and
 *    reintroduce that bug.
 *  - The other headers below don't need per-request values, so they stay
 *    static here.
 *  - blob: in the middleware's img-src is required for the PNG download flow
 *    (canvas.toBlob -> URL.createObjectURL).
 */

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // clipboard-write is required for the "Copy image" button.
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-write=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

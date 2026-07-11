/**
 * Next.js configuration — Text Deboss Studio
 *
 * Security posture (see docs/SECURITY.md):
 *  - Strict Content-Security-Policy. The app is 100% client-rendered canvas
 *    work with NO user-generated markup, no third-party scripts, and no
 *    analytics. The only external origins are Google Fonts (stylesheet +
 *    font binaries), required for correct multi-script (Nastaliq, Naskh,
 *    Devanagari, Latin) shaping.
 *  - `script-src 'self'` in production. Dev mode needs 'unsafe-eval' for
 *    React Fast Refresh, so it is added ONLY when NODE_ENV !== 'production'.
 *  - `style-src` requires 'unsafe-inline' because Next.js injects inline
 *    <style> tags for critical CSS; this is standard for Next apps.
 *  - blob: in img-src is required for the PNG download flow
 *    (canvas.toBlob -> URL.createObjectURL).
 */

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
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

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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

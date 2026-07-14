/**
 * Central site configuration.
 * All SEO surfaces (metadata, sitemap, robots, manifest, JSON-LD) read
 * from this single object so nothing drifts out of sync.
 */

export const siteConfig = {
  name: "Text Deboss Studio",
  shortName: "Text Deboss",
  description:
    "Press any text into premium textured paper. A free online debossed & letterpress text generator with live preview, presets, paper tones, and high-resolution PNG export. Works beautifully with Urdu, Arabic, Hindi, English, and more.",
  /**
   * Set NEXT_PUBLIC_SITE_URL in the deployment environment.
   * Falls back to localhost so local builds never break.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "en_US",
  keywords: [
    "text generator",
    "debossed text",
    "letterpress effect",
    "embossed text online",
    "letterpress text generator",
    "png text generator",
    "typography tool",
    "calligraphy generator",
    "urdu text generator",
    "text effect generator",
  ],
  creator: "Text Deboss Studio",
} as const;

export type SiteConfig = typeof siteConfig;

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { siteConfig } from "@/config/site";
import "./globals.css";

/**
 * Fonts are loaded from Google Fonts at runtime (not next/font) on purpose:
 * the canvas engine addresses faces by their REAL family names
 * ("Noto Nastaliq Urdu", "Gulzar", "Noto Naskh Arabic", "Playfair Display",
 * "Noto Serif Devanagari") for correct shaping via document.fonts.load(),
 * across RTL (Urdu/Arabic) and LTR (Latin/Devanagari) scripts alike. The
 * CSP (src/middleware.ts) allowlists exactly fonts.googleapis.com (styles)
 * and fonts.gstatic.com (font binaries), nothing else.
 *
 * Playfair Display requests BOTH its upright (`0`) and italic (`1`) axis:
 * it's the only font in this app with a real designed italic face, and
 * FONT_CAPABILITIES (lib/deboss/constants.ts) gates the rich-text
 * toolbar's Italic button on that exact fact, so it must stay loaded here.
 * Every other font keeps only its upright weight range: Arabic/Urdu/
 * Devanagari faces have no meaningful "italic" form, and requesting one
 * would only ever render as a browser-synthesized oblique.
 */
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Gulzar&family=Noto+Naskh+Arabic:wght@400..700&family=Noto+Nastaliq+Urdu:wght@400..700&family=Playfair+Display:ital,wght@0,400..700;1,400..700&family=Noto+Serif+Devanagari:wght@400..700&family=Inter:wght@400;500;600&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name}: Debossed Text Generator`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.name,
  creator: siteConfig.creator,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteConfig.shortName,
  },
  openGraph: {
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name}: Debossed Text Generator`,
    description: siteConfig.description,
    locale: siteConfig.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name}: Debossed Text Generator`,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "design tools",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e9e6df",
};

/** JSON-LD structured data: WebApplication schema for rich results. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  applicationCategory: "DesignApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript and HTML5 Canvas",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  inLanguage: ["en", "ur", "ar", "hi"],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // This read is REQUIRED even though the value below is unused: calling
  // headers() (a Dynamic API) is what makes Next.js render this route
  // per-request instead of statically, which is the only way it can pick
  // up src/middleware.ts's fresh-per-request nonce and stamp it onto the
  // scripts it renders. Skip this call and every script gets blocked in
  // production: Next has no per-request nonce to apply, and a
  // build-time-static shell can never match middleware's ever-changing
  // nonce anyway. Do not remove it, and do not apply the value to the
  // JSON-LD <script> below (see that comment for why).
  await headers();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
        <script
          type="application/ld+json"
          // Static, developer-controlled JSON: no user input flows here.
          // No CSP nonce needed: browsers don't enforce script-src against
          // non-JS script types like application/ld+json (it's inert data,
          // never executed); adding one caused a hydration mismatch,
          // since browsers hide a script's nonce attribute from the DOM
          // right after insertion.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

import { ImageResponse } from "next/og";
import { GALLERY_EXAMPLES } from "@/lib/deboss/constants";
import { siteConfig } from "@/config/site";

/**
 * Per-example OG image: unlike the homepage's and /gallery's generic
 * branded OG images, this uses the SPECIFIC example's own paper/tint
 * colour and title, via the same Satori dual-text-shadow trick, so a
 * shared gallery link actually previews what it points to.
 *
 * Deliberately renders `example.title` (always plain English), never
 * `example.state.text`: Satori (next/og's renderer) has no font of its
 * own for non-Latin scripts, so it auto-fetches a fallback font for any
 * Arabic/Urdu characters, and that fallback's GSUB table isn't fully
 * supported by Satori's font parser. Rendering the raw multi-script text
 * of the Bismillah examples here crashed the entire production build
 * with "lookupType: 5 - substFormat: 3 is not yet supported", not just a
 * bad image, since these routes are statically generated at build time.
 *
 * Next's generated wrapper for dynamic image-metadata routes (verified in
 * next/dist/build/webpack/loaders/next-metadata-route-loader.js) resolves
 * `ctx.params` itself before calling this handler, so `params` here is
 * already a plain object, NOT a Promise, unlike page.tsx/generateMetadata
 * in this same folder.
 */
export const alt = "Debossed text example preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return GALLERY_EXAMPLES.map((example) => ({ slug: example.slug }));
}

export default function ExampleOpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const example = GALLERY_EXAMPLES.find((e) => e.slug === params.slug);
  const paper = example?.state.paper ?? { r: 244, g: 240, b: 232 };
  const paperCss = `rgb(${paper.r}, ${paper.g}, ${paper.b})`;
  const textCss = `rgba(${paper.r}, ${paper.g}, ${paper.b}, 0.55)`;
  const title = example?.title ?? siteConfig.name;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: paperCss,
          fontFamily: "sans-serif",
          padding: "0 90px",
        }}
      >
        <div
          style={{
            display: "flex",
            textAlign: "center",
            fontSize: 64,
            fontWeight: 700,
            color: textCss,
            textShadow:
              "1px 1.5px 1px rgba(255,255,255,0.85), -1.5px -2px 2px rgba(40,35,25,0.45)",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 28, color: "#6f6a60" }}>
          {siteConfig.name}
        </div>
      </div>
    ),
    { ...size },
  );
}

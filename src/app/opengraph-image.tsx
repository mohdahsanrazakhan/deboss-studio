import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

/**
 * Next.js's file-convention OG image: this auto-generates /opengraph-image
 * and wires up both og:image and twitter:image (Next falls back to the OG
 * image for Twitter when there's no separate twitter-image.tsx) with no
 * changes needed in layout.tsx's metadata object.
 *
 * Built with next/og's ImageResponse (Satori under the hood) rather than a
 * static PNG, so it stays in sync with the brand automatically. The
 * headline uses the classic dual text-shadow "letterpress" trick (light
 * shadow down-right, dark shadow up-left) as a CSS approximation of the
 * canvas engine's real inner-shadow deboss effect, since Satori's CSS
 * subset can't reproduce that compositing trick exactly.
 */
export const alt = `${siteConfig.name}: debossed text preview`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
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
          background: "linear-gradient(135deg, #f4f1ea 0%, #e9e6df 65%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand mark: rounded square with a debossed ring, matching Header.tsx / icon.svg */}
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 28,
            background: "linear-gradient(145deg, #f6f4ef, #dfdacd)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 44,
            boxShadow: "0 12px 30px rgba(40,35,25,0.16)",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "5px solid #ffffff",
              boxShadow: "inset -2px -2px 3px rgba(120,110,90,0.4)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 700,
            color: "#ded7c4",
            textShadow:
              "1px 1.5px 1px rgba(255,255,255,0.9), -1.5px -2px 2px rgba(90,78,58,0.45)",
            letterSpacing: -2,
          }}
        >
          {siteConfig.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            color: "#6f6a60",
          }}
        >
          Press any text into premium textured paper
        </div>
      </div>
    ),
    { ...size },
  );
}

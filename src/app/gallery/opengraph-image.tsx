import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

/**
 * OG image for the /gallery index. Same Satori dual-text-shadow
 * approximation as the homepage's opengraph-image.tsx (see that file's
 * comment for why it's an approximation, not the real canvas engine).
 */
export const alt = `${siteConfig.name} gallery: debossed text examples`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function GalleryOpengraphImage() {
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
        <div
          style={{
            display: "flex",
            fontSize: 88,
            fontWeight: 700,
            color: "#ded7c4",
            textShadow:
              "1px 1.5px 1px rgba(255,255,255,0.9), -1.5px -2px 2px rgba(90,78,58,0.45)",
            letterSpacing: -2,
          }}
        >
          Gallery
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            color: "#6f6a60",
          }}
        >
          Debossed text examples from {siteConfig.name}
        </div>
      </div>
    ),
    { ...size },
  );
}

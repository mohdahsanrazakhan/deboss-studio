import { ImageResponse } from "next/og";
import { GALLERY_EXAMPLES } from "@/lib/deboss/constants";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog/posts";
import { siteConfig } from "@/config/site";

/**
 * Per-post OG image: uses the post's own cover example's paper/tint colour
 * when it has one (coverExampleSlug), falling back to a neutral paper tone
 * otherwise, via the same Satori dual-text-shadow trick as
 * src/app/gallery/[slug]/opengraph-image.tsx.
 *
 * Deliberately renders post.meta.title, which stays Latin/English by
 * convention (see content/blog/*.mdx): Satori has no font of its own for
 * non-Latin scripts and its fallback-font GSUB support is incomplete,
 * exactly the crash documented in the gallery example's own
 * opengraph-image.tsx comment.
 *
 * Next's generated wrapper for dynamic image-metadata routes resolves
 * `ctx.params` itself before calling this handler, so `params` here is
 * already a plain object, NOT a Promise, unlike page.tsx/generateMetadata
 * in this same folder.
 */
export const alt = "Blog post preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export default function BlogPostOpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getPostBySlug(params.slug);
  const cover = post?.meta.coverExampleSlug
    ? GALLERY_EXAMPLES.find((e) => e.slug === post.meta.coverExampleSlug)
    : undefined;
  const paper = cover?.state.paper ?? { r: 244, g: 240, b: 232 };
  const paperCss = `rgb(${paper.r}, ${paper.g}, ${paper.b})`;
  const textCss = `rgba(${paper.r}, ${paper.g}, ${paper.b}, 0.55)`;
  const title = post?.meta.title ?? siteConfig.name;

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
          {siteConfig.name} Blog
        </div>
      </div>
    ),
    { ...size },
  );
}

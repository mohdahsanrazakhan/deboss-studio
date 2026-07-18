import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { GalleryPreview } from "@/components/studio/GalleryPreview";
import { GALLERY_EXAMPLES } from "@/lib/deboss/constants";
import { getAllPostsMeta, getReadingTime, getPostBySlug } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes on letterpress and deboss design, script and typography choices, and how the studio's rendering engine works.",
  alternates: {
    canonical: "/blog",
  },
};

/**
 * Blog index: lists every post found under content/blog/*.mdx (src/lib/blog/posts.ts),
 * newest first. A post card shows a real engine-rendered cover when its
 * frontmatter's coverExampleSlug matches a GALLERY_EXAMPLES entry, otherwise
 * falls back to a plain text card. Server component; only the canvas covers
 * are client islands (GalleryPreview).
 */
export default function BlogPage() {
  const posts = getAllPostsMeta();

  return (
    <div className="app">
      <Header brandIsH1={false} />
      <main className="blog-index">
        <h1 className="blog-heading">Blog</h1>
        <p className="blog-intro">
          Notes on letterpress and deboss design, script and typography choices, and how the studio&apos;s rendering engine works.
        </p>

        <div className="gallery-grid">
          {posts.map((post) => {
            const cover = post.coverExampleSlug
              ? GALLERY_EXAMPLES.find((e) => e.slug === post.coverExampleSlug)
              : undefined;
            const readingTime = getReadingTime(getPostBySlug(post.slug)?.content ?? "");

            return (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="gallery-card">
                {cover ? (
                  <div className="gallery-card-media">
                    <GalleryPreview
                      state={cover.state}
                      width={360}
                      label={`${post.title} cover`}
                      className="gallery-card-canvas"
                    />
                  </div>
                ) : null}
                <div className="gallery-card-body">
                  <h2>{post.title}</h2>
                  <p>{post.description}</p>
                  <p className="blog-card-meta">
                    <span>{post.date}</span>
                    <span>{readingTime} min read</span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

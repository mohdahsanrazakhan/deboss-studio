import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Header } from "@/components/layout/Header";
import { GalleryPreview } from "@/components/studio/GalleryPreview";
import { GALLERY_EXAMPLES } from "@/lib/deboss/constants";
import { getAllPostsMeta, getAllPostSlugs, getPostBySlug, getReadingTime } from "@/lib/blog/posts";
import { siteConfig } from "@/config/site";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const canonical = `/blog/${slug}`;
  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.meta.title,
      description: post.meta.description,
      url: canonical,
      publishedTime: post.meta.date,
      modifiedTime: post.meta.updated ?? post.meta.date,
    },
    twitter: {
      title: post.meta.title,
      description: post.meta.description,
    },
  };
}

/**
 * A single blog post: content lives in content/blog/<slug>.mdx (src/lib/blog/posts.ts),
 * rendered server-side via next-mdx-remote/rsc, zero added client JS. Cover
 * image is optional (frontmatter's coverExampleSlug, reusing GALLERY_EXAMPLES
 * + GalleryPreview exactly like the blog index card). Mirrors the layout of
 * src/app/gallery/[slug]/page.tsx: back link, header/meta, body, related list.
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const cover = post.meta.coverExampleSlug
    ? GALLERY_EXAMPLES.find((e) => e.slug === post.meta.coverExampleSlug)
    : undefined;
  const readingTime = getReadingTime(post.content);
  const related = getAllPostsMeta().filter((p) => p.slug !== slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.meta.title,
    description: post.meta.description,
    datePublished: post.meta.date,
    dateModified: post.meta.updated ?? post.meta.date,
    author: { "@type": "Organization", name: siteConfig.creator },
    publisher: { "@type": "Organization", name: siteConfig.creator },
    mainEntityOfPage: new URL(`/blog/${slug}`, siteConfig.url).toString(),
  };

  return (
    <div className="app">
      <Header brandIsH1={false} />
      <main className="blog-detail">
        <p className="gallery-back">
          <Link href="/blog">Back to blog</Link>
        </p>

        {cover ? (
          <div className="blog-cover">
            <GalleryPreview state={cover.state} width={520} label={`${post.meta.title} cover`} />
          </div>
        ) : null}

        <h1>{post.meta.title}</h1>
        <p className="blog-byline">
          <span>{post.meta.date}</span>
          <span>{readingTime} min read</span>
        </p>
        {post.meta.tags.length > 0 && (
          <ul className="gallery-tags">
            {post.meta.tags.map((tag) => (
              <li key={tag} className="gallery-tag">{tag}</li>
            ))}
          </ul>
        )}

        <article className="blog-content">
          <MDXRemote
            source={post.content}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
                rehypePlugins: [rehypeSlug],
              },
            }}
          />
        </article>

        {related.length > 0 && (
          <section className="blog-related">
            <h2>More posts</h2>
            <div className="gallery-grid">
              {related.map((r) => (
                <Link key={r.slug} href={`/blog/${r.slug}`} className="gallery-card">
                  <div className="gallery-card-body">
                    <h3>{r.title}</h3>
                    <p>{r.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <script
          type="application/ld+json"
          // Static, developer-controlled JSON: no CSP nonce needed (see the
          // matching comment in app/layout.tsx for why one must never be
          // added to this specific script type).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </main>
    </div>
  );
}

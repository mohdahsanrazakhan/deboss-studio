/**
 * MDX blog post loader: reads `content/blog/*.mdx` from disk via Node's
 * `fs`/`path`, so this module is server-only. Never import it from a
 * "use client" component or from `src/lib/deboss/*` (that tree stays
 * framework-free and touches `document` only lazily, never `fs`).
 *
 * Content is file-driven, not a data array like `GALLERY_EXAMPLES`: adding
 * a post means dropping a new `.mdx` file under `content/blog/`, with no
 * route or component changes needed. `src/app/blog/page.tsx`,
 * `src/app/blog/[slug]/page.tsx`, and `src/app/sitemap.ts` all discover
 * posts through the functions below.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const POSTS_DIR = path.join(process.cwd(), "content", "blog");
const WORDS_PER_MINUTE = 200;

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  tags: string[];
  /** Optional GALLERY_EXAMPLES slug reused as this post's cover image (src/lib/deboss/constants.ts). */
  coverExampleSlug?: string;
}

export interface Post {
  meta: PostMeta;
  content: string;
}

function readSlugs(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

function readPost(slug: string): Post | null {
  const filePath = path.join(POSTS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);

  return {
    meta: {
      slug,
      title: String(data.title ?? slug),
      description: String(data.description ?? ""),
      date: String(data.date ?? ""),
      updated: data.updated ? String(data.updated) : undefined,
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      coverExampleSlug: data.coverExampleSlug ? String(data.coverExampleSlug) : undefined,
    },
    content,
  };
}

export function getAllPostSlugs(): string[] {
  return readSlugs();
}

export function getPostBySlug(slug: string): Post | null {
  return readPost(slug);
}

export function getAllPostsMeta(): PostMeta[] {
  return readSlugs()
    .map((slug) => readPost(slug)?.meta)
    .filter((meta): meta is PostMeta => meta !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Minutes, rounded up, hand-rolled rather than pulling in a dependency for one division. */
export function getReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

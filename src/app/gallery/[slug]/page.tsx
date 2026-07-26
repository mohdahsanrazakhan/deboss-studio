import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { GalleryPreview } from "@/components/studio/GalleryPreview";
import {
  ASPECT_OPTIONS,
  FONT_OPTIONS,
  GALLERY_EXAMPLES,
  PAPER_TONES,
} from "@/lib/deboss/constants";
import type { DebossState } from "@/types/deboss";

type ExamplePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return GALLERY_EXAMPLES.map((example) => ({ slug: example.slug }));
}

export async function generateMetadata({
  params,
}: ExamplePageProps): Promise<Metadata> {
  const { slug } = await params;
  const example = GALLERY_EXAMPLES.find((e) => e.slug === slug);
  if (!example) return {};

  const canonical = `/gallery/${example.slug}`;
  return {
    title: example.title,
    description: example.blurb,
    alternates: { canonical },
    openGraph: {
      title: example.title,
      description: example.blurb,
      url: canonical,
    },
    twitter: {
      title: example.title,
      description: example.blurb,
    },
  };
}

/** Human-readable font/paper/aspect labels for the spec list, from the same option lists ControlPanel.tsx uses. Font comes from the primary (first) text block, same convention "auto" aspect sizing uses. */
function describeState(state: DebossState) {
  const primaryFont = state.textBlocks[0]?.font;
  const font = FONT_OPTIONS.find((f) => f.value === primaryFont)?.label ?? primaryFont ?? "";
  const paperKey = `${state.paper.r},${state.paper.g},${state.paper.b}`;
  const paper = PAPER_TONES.find((p) => p.key === paperKey)?.label ?? "Custom";
  const aspect = ASPECT_OPTIONS.find((a) => a.value === state.aspect)?.label ?? state.aspect;
  return { font, paper, aspect };
}

/**
 * A single gallery example: a real, engine-rendered hero (GalleryPreview) in
 * a sticky left column, identity/spec/CTA in the right column, long-form
 * design copy below (SEO content, docs/SEO-PLAN.md Phase 3), and a link
 * back into the live studio via the `?example=<slug>` deep link (see
 * useDebossStudio.ts), which applies this example's full bespoke look,
 * text included, on load.
 */
export default async function ExamplePage({ params }: ExamplePageProps) {
  const { slug } = await params;
  const example = GALLERY_EXAMPLES.find((e) => e.slug === slug);
  if (!example) notFound();

  const { font, paper, aspect } = describeState(example.state);
  const related = GALLERY_EXAMPLES.filter((e) => e.slug !== example.slug);

  return (
    <div className="app">
      <Header brandIsH1={false} />
      <main className="gallery-detail">
        <p className="gallery-back">
          <Link href="/gallery">Back to gallery</Link>
        </p>

        <div className="gallery-detail-layout">
          <div className="gallery-detail-media">
            <GalleryPreview
              state={example.state}
              width={520}
              label={`${example.title} preview`}
            />
          </div>

          <div className="gallery-detail-info">
            <h1>{example.title}</h1>
            <ul className="gallery-tags">
              {example.tags.map((tag) => (
                <li key={tag} className="gallery-tag">{tag}</li>
              ))}
            </ul>
            <p className="gallery-detail-blurb">{example.blurb}</p>
            <Link href={`/?example=${example.slug}`} className="btn primary gallery-cta">
              Try this look in the studio
            </Link>
            <dl className="gallery-specs">
              <div>
                <dt>Font</dt>
                <dd>{font}</dd>
              </div>
              <div>
                <dt>Paper</dt>
                <dd>{paper}</dd>
              </div>
              <div>
                <dt>Canvas shape</dt>
                <dd>{aspect}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="gallery-content">
          {example.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>

        {related.length > 0 && (
          <section className="gallery-related">
            <h2>More examples</h2>
            <div className="gallery-grid">
              {related.map((r) => (
                <Link key={r.slug} href={`/gallery/${r.slug}`} className="gallery-card">
                  <div className="gallery-card-media">
                    <GalleryPreview
                      state={r.state}
                      width={360}
                      label={`${r.title} preview`}
                      className="gallery-card-canvas"
                    />
                    <span className="gallery-card-open" aria-hidden="true">
                      <ArrowUpRight size={16} />
                    </span>
                  </div>
                  <div className="gallery-card-body">
                    <h3>{r.title}</h3>
                    <p>{r.blurb}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

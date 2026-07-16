import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { GalleryPreview } from "@/components/studio/GalleryPreview";
import { GALLERY_EXAMPLES } from "@/lib/deboss/constants";

export const metadata: Metadata = {
  title: "Gallery: Debossed Text Examples",
  description:
    "Browse curated debossed and letterpress text examples, from Bismillah calligraphy to wedding invitations, and try any look in the live studio.",
  alternates: {
    canonical: "/gallery",
  },
};

// Purely a visual affordance for now, not wired to real filtering/sorting
// (only 4 examples exist today, so filtering has little value yet); revisit
// once GALLERY_EXAMPLES grows and there's a real taxonomy worth filtering by.
const FILTER_CHIPS = ["All", "Arabic", "Urdu", "English", "Letterpress", "Deboss", "Luxury"];

/**
 * Gallery index: lists every curated GalleryExample as a card with a real,
 * engine-rendered preview (GalleryPreview), linking through to its own
 * page. Server component; only the canvas previews are client islands.
 */
export default function GalleryPage() {
  return (
    <div className="app">
      <Header brandIsH1={false} />
      <main className="gallery-index">
        <h1 className="gallery-heading">Gallery</h1>
        <p className="gallery-intro">
          Explore curated deboss and letterpress designs. Browse inspirations, preview styles, and open any design in the studio.
        </p>

        {/* Uncomment it when we implement the funcationality */}
        {/* <div className="gallery-toolbar" aria-hidden="true">
          <div className="gallery-filters">
            {FILTER_CHIPS.map((chip, i) => (
              <span key={chip} className={`gallery-chip${i === 0 ? " is-active" : ""}`}>
                {chip}
              </span>
            ))}
          </div>
          <span className="gallery-sort">
            Latest
            <ChevronDown size={14} />
          </span>
        </div> */}

        <div className="gallery-grid">
          {GALLERY_EXAMPLES.map((example) => (
            <Link
              key={example.slug}
              href={`/gallery/${example.slug}`}
              className="gallery-card"
            >
              <div className="gallery-card-media">
                <GalleryPreview
                  state={example.state}
                  width={360}
                  label={`${example.title} preview`}
                  className="gallery-card-canvas"
                />
                <span className="gallery-card-open" aria-hidden="true">
                  <ArrowUpRight size={16} />
                </span>
              </div>
              <div className="gallery-card-body">
                <h2>{example.title}</h2>
                <p>{example.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

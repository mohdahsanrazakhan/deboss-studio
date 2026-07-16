import type { Metadata } from "next";
import { FAQ } from "@/components/layout/FAQ";
import { Header } from "@/components/layout/Header";
import { Studio } from "@/components/studio/Studio";
import { GALLERY_EXAMPLES, PRESETS } from "@/lib/deboss/constants";
import type { PresetId } from "@/types/deboss";

type PageProps = {
  searchParams: Promise<{
    preset?: string | string[];
    example?: string | string[];
  }>;
};

/** Resolves the (validated) preset id from a raw query value, or null when absent/unknown. */
async function resolvePresetId(
  searchParams: PageProps["searchParams"],
): Promise<PresetId | null> {
  const { preset } = await searchParams;
  const raw = Array.isArray(preset) ? preset[0] : preset;
  const match = PRESETS.find((p) => p.id === raw);
  return match ? match.id : null;
}

/** Resolves the (validated) gallery example slug from a raw query value, or null when absent/unknown. */
async function resolveExampleSlug(
  searchParams: PageProps["searchParams"],
): Promise<string | null> {
  const { example } = await searchParams;
  const raw = Array.isArray(example) ? example[0] : example;
  const match = GALLERY_EXAMPLES.find((e) => e.slug === raw);
  return match ? match.slug : null;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const exampleSlug = await resolveExampleSlug(searchParams);
  const example = exampleSlug
    ? GALLERY_EXAMPLES.find((e) => e.slug === exampleSlug)
    : undefined;

  if (example) {
    const title = example.title;
    const description = example.blurb;
    const canonical = `/?example=${example.slug}`;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title, description, url: canonical },
      twitter: { title, description },
    };
  }

  const presetId = await resolvePresetId(searchParams);
  const preset = presetId ? PRESETS.find((p) => p.id === presetId) : undefined;
  if (!preset) return {};

  const title = `${preset.label} Text Generator`;
  const description = `Create a ${preset.label.toLowerCase()} effect on your text, ready to fine-tune and export as a high-resolution PNG. Works with Urdu, Arabic, Hindi, English, and more.`;
  const canonical = `/?preset=${preset.id}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
    },
    twitter: {
      title,
      description,
    },
  };
}

/**
 * Home page: server component.
 * The static chrome (header, landmarks, FAQ) renders on the server for SEO;
 * only the Studio itself hydrates on the client. A validated `?preset=` or
 * `?example=` query param (see docs/SEO-PLAN.md, Phase 2 #4 and Phase 3) is
 * resolved here and handed to the client so a shared/linked URL applies
 * that look on first paint. If both are present, the example wins (it's
 * handled second, inside useDebossStudio.ts).
 */
export default async function HomePage({ searchParams }: PageProps) {
  const initialPresetId = await resolvePresetId(searchParams);
  const initialExampleSlug = await resolveExampleSlug(searchParams);

  return (
    <div className="app">
      <Header />
      <Studio
        initialPresetId={initialPresetId}
        initialExampleSlug={initialExampleSlug}
      />
      <FAQ />
    </div>
  );
}

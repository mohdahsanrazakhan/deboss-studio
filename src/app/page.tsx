import type { Metadata } from "next";
import { FAQ } from "@/components/layout/FAQ";
import { Header } from "@/components/layout/Header";
import { Studio } from "@/components/studio/Studio";
import { PRESETS } from "@/lib/deboss/constants";
import type { PresetId } from "@/types/deboss";

type PageProps = {
  searchParams: Promise<{ preset?: string | string[] }>;
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

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const presetId = await resolvePresetId(searchParams);
  if (!presetId) return {};

  const preset = PRESETS.find((p) => p.id === presetId);
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
 * only the Studio itself hydrates on the client. A validated `?preset=` query
 * param (see docs/SEO-PLAN.md, Phase 2 #4) is resolved here and handed to the
 * client so a shared/linked preset URL applies that look on first paint.
 */
export default async function HomePage({ searchParams }: PageProps) {
  const initialPresetId = await resolvePresetId(searchParams);

  return (
    <div className="app">
      <Header />
      <Studio initialPresetId={initialPresetId} />
      <FAQ />
    </div>
  );
}

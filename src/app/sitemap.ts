import type { MetadataRoute } from "next";
import { PRESETS } from "@/lib/deboss/constants";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const presetEntries: MetadataRoute.Sitemap = PRESETS.map((preset) => ({
    url: new URL(`/?preset=${preset.id}`, siteConfig.url).toString(),
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...presetEntries,
  ];
}

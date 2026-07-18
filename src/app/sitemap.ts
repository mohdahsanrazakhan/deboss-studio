import type { MetadataRoute } from "next";
import { GALLERY_EXAMPLES, PRESETS } from "@/lib/deboss/constants";
import { getAllPostsMeta } from "@/lib/blog/posts";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const presetEntries: MetadataRoute.Sitemap = PRESETS.map((preset) => ({
    url: new URL(`/?preset=${preset.id}`, siteConfig.url).toString(),
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const galleryEntries: MetadataRoute.Sitemap = GALLERY_EXAMPLES.map((example) => ({
    url: new URL(`/gallery/${example.slug}`, siteConfig.url).toString(),
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const blogEntries: MetadataRoute.Sitemap = getAllPostsMeta().map((post) => ({
    url: new URL(`/blog/${post.slug}`, siteConfig.url).toString(),
    lastModified: new Date(post.updated ?? post.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...presetEntries,
    {
      url: new URL("/gallery", siteConfig.url).toString(),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...galleryEntries,
    {
      url: new URL("/blog", siteConfig.url).toString(),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...blogEntries,
  ];
}

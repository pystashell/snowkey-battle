import type { MetadataRoute } from "next";

const PRIMARY_SITE_URL = "https://snow-fighting-game.pystashell.workers.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: PRIMARY_SITE_URL,
      lastModified: new Date("2026-07-29"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${PRIMARY_SITE_URL}/privacy`,
      lastModified: new Date("2026-07-29"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

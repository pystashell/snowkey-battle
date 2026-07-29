import type { MetadataRoute } from "next";

const PRIMARY_SITE_URL = "https://snow-fighting-game.pystashell.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${PRIMARY_SITE_URL}/sitemap.xml`,
  };
}

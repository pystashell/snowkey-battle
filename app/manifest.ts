import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SnowKey Battle",
    short_name: "SnowKey",
    description: "A real-time typing snowball fight across a frozen river.",
    start_url: "/",
    display: "standalone",
    background_color: "#102742",
    theme_color: "#173153",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

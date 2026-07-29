import type { Metadata } from "next";
import "./globals.css";
import { getRequestLanguage } from "./server-language";

const PRIMARY_SITE_URL = "https://snow-fighting-game.pystashell.workers.dev";

export async function generateMetadata(): Promise<Metadata> {
  const language = await getRequestLanguage();
  const title = language === "zh" ? "SnowKey Battle · 河岸雪仗" : "SnowKey Battle";
  const description = language === "zh"
    ? "隔着冰河打英文单词、抢雪花、投雪球，支持本机 AI 与最多 8 人实时联机。"
    : "Type falling English words, claim snowballs, and battle across a frozen river with local AI or up to eight online players.";

  return {
    metadataBase: new URL(PRIMARY_SITE_URL),
    applicationName: "SnowKey Battle",
    title: { default: title, template: "%s · SnowKey Battle" },
    description,
    alternates: { canonical: "/" },
    category: "game",
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: "SnowKey Battle",
      title,
      description,
      locale: language === "zh" ? "zh_CN" : "en_US",
      alternateLocale: language === "zh" ? ["en_US"] : ["zh_CN"],
      images: [
        {
          url: "/og.png",
          width: 1733,
          height: 909,
          alt: "SnowKey Battle — Type, Claim, Throw",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language = await getRequestLanguage();
  return (
    <html lang={language === "zh" ? "zh-CN" : "en"}>
      <body>{children}</body>
    </html>
  );
}

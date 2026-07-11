import type { Metadata } from "next";
import "./globals.css";
import { getRequestLanguage } from "./server-language";

export async function generateMetadata(): Promise<Metadata> {
  const language = await getRequestLanguage();
  return language === "zh"
    ? {
        title: { default: "河岸雪仗", template: "%s · 河岸雪仗" },
        description: "一场隔着冰河、靠英文打字抢雪花的可变阵容战术雪仗。",
      }
    : {
        title: { default: "Riverbank Snow Battle", template: "%s · Riverbank Snow Battle" },
        description: "A tactical snowball fight where teams type English words across a frozen river.",
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

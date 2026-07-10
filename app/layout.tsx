import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "河岸雪仗",
    template: "%s · 河岸雪仗",
  },
  description: "一场隔着冰河、靠打字抢雪花的童年 4v4 雪仗。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

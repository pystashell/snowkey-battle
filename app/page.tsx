import type { Metadata } from "next";
import { LanguageProvider } from "./LanguageContext";
import SnowballGame from "./SnowballGame";
import { getRequestLanguage } from "./server-language";

export async function generateMetadata(): Promise<Metadata> {
  const language = await getRequestLanguage();
  return language === "zh"
    ? {
        title: { absolute: "SnowKey Battle · 河岸雪仗" },
        description: "打出飘落的英文单词，调整 1–4 人阵型，与好友隔着冰河实时打雪仗。",
      }
    : {
        title: { absolute: "SnowKey Battle · Riverbank Snow Battle" },
        description: "Type falling English words, arrange teams of 1–4, and battle friends across a frozen river in real time.",
      };
}

export default async function Home() {
  const language = await getRequestLanguage();
  return (
    <LanguageProvider initialLanguage={language}>
      <SnowballGame />
    </LanguageProvider>
  );
}

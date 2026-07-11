import type { Metadata } from "next";
import { LanguageProvider } from "./LanguageContext";
import SnowballGame from "./SnowballGame";
import { getRequestLanguage } from "./server-language";

export async function generateMetadata(): Promise<Metadata> {
  const language = await getRequestLanguage();
  return language === "zh"
    ? {
        title: { absolute: "河岸雪仗 · Snow Type Battle" },
        description: "打出飘落的英文单词，调整 1–4 人阵型，用前排替队友挡住隔河飞来的雪球。",
      }
    : {
        title: { absolute: "Riverbank Snow Battle · Snow Type Battle" },
        description: "Type falling English words, arrange teams of 1–4, and let the frontline shield teammates from incoming snowballs.",
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

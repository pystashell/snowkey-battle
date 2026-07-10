import type { Metadata } from "next";
import SnowballGame from "./SnowballGame";

export const metadata: Metadata = {
  title: { absolute: "河岸雪仗 · Snow Type Battle" },
  description: "打出飘落的英文单词，调整 1–4 人阵型，用前排替队友挡住隔河飞来的雪球。",
};

export default function Home() {
  return <SnowballGame />;
}

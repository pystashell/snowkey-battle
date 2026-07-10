import type { Metadata } from "next";
import SnowballGame from "./SnowballGame";

export const metadata: Metadata = {
  title: "河岸雪仗 · Snow Type Battle",
  description: "打出飘落的单词，把雪花攥成雪球，和 8 位雪友隔河开战。",
};

export default function Home() {
  return <SnowballGame />;
}

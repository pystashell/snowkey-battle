import {
  ECDICT_CET4_WORDS,
  ECDICT_CET6_WORDS,
  ECDICT_POSTGRADUATE_WORDS,
} from "./wordbooks-data/exam-wordbooks.ts";
import { normalizePlayableWords } from "../shared/word-rules.ts";

export type WordbookId =
  | "winter"
  | "cet4"
  | "cet6"
  | "postgraduate"
  | "conceptStarter"
  | "conceptProgress"
  | "mixed";

export type Wordbook = {
  id: WordbookId;
  label: string;
  labelEn: string;
  shortLabel: string;
  shortLabelEn: string;
  description: string;
  descriptionEn: string;
  sourceNote: string;
  sourceNoteEn: string;
  words: readonly string[];
};

function normalizeWords(words: readonly string[]) {
  return normalizePlayableWords(words);
}

const winterWords = normalizeWords([
  "snow", "coat", "warm", "tree", "star", "moon", "river", "cocoa", "skate", "scarf",
  "glove", "winter", "frozen", "silver", "forest", "holiday", "blizzard", "mittens", "snowman",
  "sledding", "sparkle", "crystal", "powder", "icicle", "penguin", "mountain", "fireplace",
  "blanket", "marshmallow", "evergreen", "snowflake", "wonderland", "cabin", "boots", "chilly",
  "flurry", "glacier", "huddle", "lantern", "shiver", "snowball", "weather", "whiteout", "frost",
  "sleigh", "jacket", "bonfire", "chimney", "candle", "sunset", "twinkle", "carol", "present",
  "reindeer", "north", "storm", "cloud", "breeze", "valley", "meadow", "fleece", "button",
  "pocket", "hood", "shelter", "footprint", "freezing", "slippery", "windy", "cozy", "thermos",
  "campfire", "sunrise", "iceberg", "snowfall", "firewood", "sweater", "beanie", "skating",
]);

// These extra-long entries come from ECDICT's general dictionary rather than its
// exam tags. They are deliberately separated so the UI can describe them honestly
// as game challenge additions, not as official CET or postgraduate syllabus words.
const cet4LongChallengeWords = [
  "telecommunications", "characteristically", "disproportionately", "institutionalization",
  "uncharacteristically", "counterintelligence", "internationalization", "oversimplification",
  "interconnectedness", "professionalization", "underrepresentation", "neuropsychological",
] as const;

const cet6LongChallengeWords = [
  "gastroenterologist", "representativeness", "disenfranchisement", "chlorofluorocarbon",
  "overrepresentation", "neurophysiological", "unconstitutionally", "reconceptualization",
  "immunofluorescence", "interdenominational", "deindustrialization", "operationalization",
  "compartmentalization",
] as const;

const postgraduateLongChallengeWords = [
  "phosphatidylcholine", "cholangiopancreatography", "incommensurability", "transubstantiation",
  "psychophysiological", "disproportionality", "incomprehensibility", "paleoanthropologist",
  "psychopharmacology", "straightforwardness", "psychopathological", "interorganizational",
  "interchangeability", "electroencephalogram", "electrophysiological",
  "psychopharmacological", "dehydroepiandrosterone",
] as const;

const cet4Words = normalizeWords([
  "ability", "academic", "access", "achieve", "adapt", "advance", "affect", "analyze", "approach",
  "argument", "available", "benefit", "career", "challenge", "community", "compare", "complex",
  "concern", "conduct", "confirm", "consume", "contact", "context", "contrast", "contribute",
  "culture", "decline", "define", "demand", "develop", "digital", "economy", "education", "effective",
  "environment", "establish", "evidence", "exchange", "experience", "factor", "feature", "finance",
  "function", "generate", "global", "graduate", "identify", "impact", "improve", "indicate", "industry",
  "influence", "inform", "involve", "issue", "maintain", "measure", "method", "obvious", "opportunity",
  "participate", "perform", "policy", "positive", "potential", "practice", "pressure", "prevent",
  "process", "produce", "project", "promote", "protect", "provide", "quality", "reduce", "region",
  "require", "research", "resource", "respond", "result", "schedule", "significant", "similar",
  "society", "specific", "strategy", "structure", "support", "technology", "theory", "tradition",
  "transport", "variety", "volunteer", "welfare", "attitude", "balance", "capacity", "communication",
  "competition", "creative", "efficient", "frequent", "independent", "responsible", "solution",
  ...ECDICT_CET4_WORDS,
  ...cet4LongChallengeWords,
]);

// ECDICT 的考试标签词汇加上原有游戏精选词；并非官方考试大纲原文。
const cet6Words = normalizeWords([
  "abstract", "abundant", "accelerate", "accommodate", "accumulate", "acknowledge", "adequate",
  "advocate", "allocate", "alter", "ambiguous", "anticipate", "apparent", "articulate", "assess",
  "attain", "attribute", "authentic", "automate", "barrier", "bias", "capacity", "cease", "clarify",
  "coherent", "collaborate", "compensate", "compile", "complement", "comprehensive", "comprise",
  "conceive", "consecutive", "constrain", "consult", "controversy", "convert", "coordinate", "crucial",
  "cumulative", "debate", "dedicate", "demonstrate", "derive", "detect", "diminish", "discrete",
  "distribute", "diverse", "domestic", "dominate", "elaborate", "eliminate", "emerge", "empirical",
  "encounter", "enhance", "equivalent", "ethical", "evaluate", "exceed", "exclude", "explicit",
  "exploit", "facilitate", "flexible", "fluctuate", "formulate", "framework", "fundamental",
  "hypothesis", "illustrate", "imply", "incentive", "inevitable", "infer", "inhibit", "initiate",
  "innovate", "integrate", "interpret", "intervene", "intrinsic", "justify", "legislate", "mature",
  "mechanism", "modify", "monitor", "motivate", "neutral", "nevertheless", "objective", "obtain",
  "occupy", "orient", "overlap", "perceive", "persist", "phenomenon", "preliminary", "presume",
  "priority", "prohibit", "prospect", "reinforce", "reject", "relevant", "reluctant", "resolve",
  "retain", "reveal", "rigorous", "sector", "simulate", "stable", "substitute", "sustain",
  "transform", "transmit", "valid", "violate", "virtual",
  ...ECDICT_CET6_WORDS,
  ...cet6LongChallengeWords,
]);

// ECDICT 的考研标签词汇加上原有游戏精选词；并非特定教材原文。
const postgraduateWords = normalizeWords([
  "abstraction", "accountability", "adjacent", "adversity", "aesthetic", "analogy", "anomaly",
  "arbitrary", "architecture", "ascertain", "assimilate", "autonomy", "bureaucracy", "categorical",
  "chronology", "cognition", "compatible", "compelling", "compliance", "compound", "concession",
  "concurrent", "configuration", "consensus", "constituent", "contemplate", "contradict", "conventional",
  "correlate", "credibility", "criterion", "deficiency", "delineate", "demographic", "deploy",
  "deteriorate", "dialectical", "differentiate", "dilemma", "discourse", "discriminate", "ecosystem",
  "endeavor", "equilibrium", "eradicate", "evolution", "excerpt", "feasible", "fiscal", "foster",
  "hierarchy", "ideology", "implicit", "indispensable", "infrastructure", "inherent", "intellectual",
  "legitimate", "marginal", "mediate", "metaphor", "methodology", "mitigate", "narrative", "normative",
  "nuance", "paradigm", "paradox", "parameter", "perspective", "plausible", "pluralism", "pragmatic",
  "premise", "prevalence", "profound", "qualitative", "quantify", "rational", "reciprocal", "reconcile",
  "refine", "resilient", "rhetoric", "scholarship", "skeptical", "socioeconomic", "sovereignty",
  "spectrum", "structural", "subordinate", "successive", "synthesis", "systematic", "tentative",
  "theoretical", "threshold", "trajectory", "transcend", "undermine", "validity", "variable", "vulnerable",
  ...ECDICT_POSTGRADUATE_WORDS,
  ...postgraduateLongChallengeWords,
]);

const conceptStarterWords = normalizeWords([
  "family", "friend", "school", "teacher", "student", "lesson", "question", "answer", "picture", "window",
  "garden", "kitchen", "bedroom", "morning", "evening", "breakfast", "dinner", "coffee", "market",
  "station", "ticket", "street", "village", "country", "office", "doctor", "nurse", "driver", "farmer",
  "engineer", "waiter", "letter", "newspaper", "magazine", "camera", "bottle", "basket", "umbrella",
  "bicycle", "airplane", "journey", "holiday", "weekend", "yesterday", "tomorrow", "always", "sometimes",
  "usually", "quickly", "slowly", "careful", "hungry", "thirsty", "tired", "busy", "ready", "beautiful",
  "interesting", "different", "favorite", "remember", "understand", "describe", "listen", "speak", "write",
  "carry", "choose", "finish", "follow", "happen", "invite", "learn", "leave", "meet", "open", "return",
  "send", "travel", "visit", "watch", "welcome", "weather", "season", "spring", "summer", "autumn",
]);

const conceptProgressWords = normalizeWords([
  "accident", "adventure", "airport", "ancient", "attention", "audience", "behavior", "business", "captain",
  "century", "certain", "circus", "conversation", "crowd", "dangerous", "decision", "discover", "distance",
  "electric", "enormous", "entrance", "explain", "famous", "fortune", "government", "habit", "immediately",
  "journey", "machine", "manager", "message", "museum", "mystery", "necessary", "notice", "ordinary",
  "passenger", "perfect", "performance", "photograph", "police", "prison", "private", "promise", "public",
  "receive", "recently", "record", "repair", "report", "restaurant", "secret", "serious", "service",
  "situation", "successful", "surprise", "theater", "throughout", "traffic", "valuable", "wonderful",
  "abroad", "accept", "afford", "appear", "believe", "borrow", "complain", "continue", "deliver", "expect",
  "experience", "fail", "imagine", "improve", "manage", "offer", "prepare", "realize", "recognize",
  "refuse", "remind", "save", "search", "seem", "spend", "suggest", "survive", "throw", "worry",
  "although", "however", "perhaps", "suddenly", "towards", "without", "already", "almost", "enough",
]);

const mixedWords = normalizeWords([
  ...winterWords,
  ...cet4Words,
  ...cet6Words,
  ...postgraduateWords,
  ...conceptStarterWords,
  ...conceptProgressWords,
]);

export const WORD_BOOKS: Record<WordbookId, Wordbook> = {
  winter: {
    id: "winter",
    label: "冬日基础",
    labelEn: "Winter Basics",
    shortLabel: "冬日基础",
    shortLabelEn: "Winter Basics",
    description: "雪景、服装、天气与节日主题，单词较短，适合熟悉玩法。",
    descriptionEn: "Short words about snow, clothing, weather, and holidays. A friendly place to learn the game.",
    sourceNote: "游戏原创主题词包",
    sourceNoteEn: "Original themed game word pack",
    words: winterWords,
  },
  cet4: {
    id: "cet4",
    label: "大学四级 · 大型词库",
    labelEn: "CET-4 · Large Wordbook",
    shortLabel: "四级词库",
    shortLabelEn: "CET-4",
    description: "覆盖 3,800+ 个四级标签词，并加入一组游戏长词挑战，重复率大幅降低。",
    descriptionEn: "Over 3,800 CET-4-tagged words plus a game-only long-word challenge set for far fewer repeats.",
    sourceNote: "ECDICT（MIT）考试标签数据 + 游戏长词挑战补充；非官方考试大纲",
    sourceNoteEn: "ECDICT exam-tag data (MIT) + game-only long-word additions; not an official syllabus",
    words: cet4Words,
  },
  cet6: {
    id: "cet6",
    label: "大学六级 · 大型词库",
    labelEn: "CET-6 · Large Wordbook",
    shortLabel: "六级词库",
    shortLabelEn: "CET-6",
    description: "覆盖 5,300+ 个六级标签词，并加入 18–20 字母的游戏长词挑战。",
    descriptionEn: "Over 5,300 CET-6-tagged words plus game-only 18–20 letter challenge words.",
    sourceNote: "ECDICT（MIT）考试标签数据 + 游戏长词挑战补充；非官方考试大纲",
    sourceNoteEn: "ECDICT exam-tag data (MIT) + game-only long-word additions; not an official syllabus",
    words: cet6Words,
  },
  postgraduate: {
    id: "postgraduate",
    label: "考研英语 · 大型词库",
    labelEn: "Postgraduate English · Large Wordbook",
    shortLabel: "考研词库",
    shortLabelEn: "Postgraduate",
    description: "覆盖 4,800+ 个考研标签词，并加入最高 24 字母的游戏长词挑战。",
    descriptionEn: "Over 4,800 postgraduate-exam-tagged words plus game-only challenges up to 24 letters.",
    sourceNote: "ECDICT（MIT）考试标签数据 + 游戏长词挑战补充；非官方大纲或特定教材",
    sourceNoteEn: "ECDICT exam-tag data (MIT) + game-only long-word additions; not an official syllabus or textbook",
    words: postgraduateWords,
  },
  conceptStarter: {
    id: "conceptStarter",
    label: "经典情景英语 · 入门",
    labelEn: "Classic Situational English · Starter",
    shortLabel: "情景入门",
    shortLabelEn: "Situational Starter",
    description: "日常人物、地点、动作和时间表达，按循序渐进的课文式场景整理。",
    descriptionEn: "Everyday people, places, actions, and time expressions arranged as progressive scenes.",
    sourceNote: "独立整理，不复制特定教材词表",
    sourceNoteEn: "Independently organized, not copied from a textbook",
    words: conceptStarterWords,
  },
  conceptProgress: {
    id: "conceptProgress",
    label: "经典情景英语 · 进阶",
    labelEn: "Classic Situational English · Advanced",
    shortLabel: "情景进阶",
    shortLabelEn: "Situational Advanced",
    description: "故事叙述、旅行和社会场景常用词，长词比例更高。",
    descriptionEn: "Vocabulary for storytelling, travel, and social situations, with a larger share of long words.",
    sourceNote: "独立整理，不复制特定教材词表",
    sourceNoteEn: "Independently organized, not copied from a textbook",
    words: conceptProgressWords,
  },
  mixed: {
    id: "mixed",
    label: "全词库混合挑战",
    labelEn: "Mixed Wordbook Challenge",
    shortLabel: "混合挑战",
    shortLabelEn: "Mixed Challenge",
    description: "从所有内置词包中随机抽取，变化最大，也最不容易遇到重复。",
    descriptionEn: "Draws from every built-in pack for the widest variety and the fewest repeats.",
    sourceNote: "合并全部内置精选词包",
    sourceNoteEn: "Combines every built-in curated word pack",
    words: mixedWords,
  },
};

export const WORD_BOOK_OPTIONS = Object.values(WORD_BOOKS);

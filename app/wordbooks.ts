export type WordbookId = "winter" | "cet4" | "conceptStarter" | "conceptProgress" | "mixed";

export type Wordbook = {
  id: WordbookId;
  label: string;
  shortLabel: string;
  description: string;
  sourceNote: string;
  words: readonly string[];
};

function normalizeWords(words: readonly string[]) {
  return Array.from(
    new Set(
      words
        .map((word) => word.trim().toLowerCase())
        .filter((word) => /^[a-z]{2,14}$/.test(word)),
    ),
  );
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
  ...conceptStarterWords,
  ...conceptProgressWords,
]);

export const WORD_BOOKS: Record<WordbookId, Wordbook> = {
  winter: {
    id: "winter",
    label: "冬日基础",
    shortLabel: "冬日基础",
    description: "雪景、服装、天气与节日主题，单词较短，适合熟悉玩法。",
    sourceNote: "游戏原创主题词包",
    words: winterWords,
  },
  cet4: {
    id: "cet4",
    label: "大学四级 · 常用精选",
    shortLabel: "四级精选",
    description: "校园、社会与学术场景中的常用词，整体长度和难度更高。",
    sourceNote: "自主整理，非官方考试词表",
    words: cet4Words,
  },
  conceptStarter: {
    id: "conceptStarter",
    label: "经典情景英语 · 入门",
    shortLabel: "情景入门",
    description: "日常人物、地点、动作和时间表达，按循序渐进的课文式场景整理。",
    sourceNote: "独立整理，不复制特定教材词表",
    words: conceptStarterWords,
  },
  conceptProgress: {
    id: "conceptProgress",
    label: "经典情景英语 · 进阶",
    shortLabel: "情景进阶",
    description: "故事叙述、旅行和社会场景常用词，长词比例更高。",
    sourceNote: "独立整理，不复制特定教材词表",
    words: conceptProgressWords,
  },
  mixed: {
    id: "mixed",
    label: "全词库混合挑战",
    shortLabel: "混合挑战",
    description: "从所有内置词包中随机抽取，变化最大，也最不容易遇到重复。",
    sourceNote: "合并全部内置精选词包",
    words: mixedWords,
  },
};

export const WORD_BOOK_OPTIONS = Object.values(WORD_BOOKS);

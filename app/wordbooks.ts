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

// 按六级常见的学术、社会与论证场景自主精选，不对应或复制任何官方词表。
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
]);

// 围绕研究阅读、抽象论证与人文社科语境自主精选，不对应或复制任何教材词表。
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
  cet6: {
    id: "cet6",
    label: "大学六级 · 进阶精选",
    shortLabel: "六级精选",
    description: "偏重学术阅读、社会议题与抽象表达，长词更多，适合进阶打字挑战。",
    sourceNote: "自主精选，非官方考试词表",
    words: cet6Words,
  },
  postgraduate: {
    id: "postgraduate",
    label: "考研英语 · 阅读精选",
    shortLabel: "考研精选",
    description: "覆盖研究阅读、人文社科与复杂论证语境，整体难度和长词比例最高。",
    sourceNote: "自主精选，不复制特定教材词表",
    words: postgraduateWords,
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

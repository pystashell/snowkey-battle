export const FROST_WORD_POOL_SIZE = 10;

type RandomSource = () => number;

export type WordPools = {
  frostWords: string[];
  regularWords: string[];
};

export type DrawWordInput = {
  bag: readonly string[];
  pool: readonly string[];
  activeWords: ReadonlySet<string>;
  recentWords?: ReadonlySet<string>;
  avoidImmediateWord?: string | null;
  random?: RandomSource;
};

export type DrawWordResult = {
  word: string | null;
  bag: string[];
};

function normalizeRandom(value: number) {
  if (!Number.isFinite(value)) return 0;
  const fraction = value - Math.floor(value);
  return Math.max(0, Math.min(0.9999999999999999, fraction));
}

function hasPrefixCollision(candidate: string, activeWords: ReadonlySet<string>) {
  return [...activeWords].some(
    (activeWord) => candidate.startsWith(activeWord) || activeWord.startsWith(candidate),
  );
}

export function buildWordPools(words: readonly string[], frostPoolSize = FROST_WORD_POOL_SIZE): WordPools {
  const uniqueWords = Array.from(new Set(words));
  const rankedWords = uniqueWords
    .map((word, sourceIndex) => ({ word, sourceIndex }))
    .sort((left, right) => right.word.length - left.word.length || left.sourceIndex - right.sourceIndex)
    .map(({ word }) => word);
  const frostWords = rankedWords.slice(0, Math.max(0, frostPoolSize));
  const frostSet = new Set(frostWords);
  const regularOnly = uniqueWords.filter((word) => !frostSet.has(word));

  return {
    frostWords,
    regularWords: regularOnly.length ? regularOnly : uniqueWords,
  };
}

export function shuffleWordPool(words: readonly string[], random: RandomSource = Math.random) {
  const shuffled = [...words];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(normalizeRandom(random()) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function drawWordFromBag({
  bag,
  pool,
  activeWords,
  recentWords = new Set<string>(),
  avoidImmediateWord = null,
  random = Math.random,
}: DrawWordInput): DrawWordResult {
  const nextBag = bag.length ? [...bag] : shuffleWordPool(pool, random);
  const canAppear = (word: string) => !activeWords.has(word) && !hasPrefixCollision(word, activeWords);
  let candidateIndex = nextBag.findIndex((word) => canAppear(word) && !recentWords.has(word));
  if (candidateIndex < 0 && avoidImmediateWord) {
    candidateIndex = nextBag.findIndex((word) => canAppear(word) && word !== avoidImmediateWord);
  }
  if (candidateIndex < 0) candidateIndex = nextBag.findIndex(canAppear);
  if (candidateIndex < 0) return { word: null, bag: nextBag };

  const [word] = nextBag.splice(candidateIndex, 1);
  return { word, bag: nextBag };
}

export function wordHistorySize(poolSize: number) {
  if (poolSize <= 0) return 0;
  const minimum = Math.min(4, poolSize);
  const maximum = Math.min(48, Math.max(4, poolSize));
  return Math.max(minimum, Math.min(maximum, Math.round(poolSize * 0.2)));
}

export const MIN_WORD_LENGTH = 2;
export const MAX_WORD_LENGTH = 24;

export function isPlayableWord(word: string) {
  return (
    word.length >= MIN_WORD_LENGTH
    && word.length <= MAX_WORD_LENGTH
    && /^[a-z]+$/.test(word)
  );
}

export function normalizePlayableWords(words: readonly string[]) {
  return Array.from(new Set(
    words
      .map((word) => word.trim().toLowerCase())
      .filter(isPlayableWord),
  ));
}

export function wordSpawnRange(wordLength: number): [number, number] {
  if (wordLength >= 20) return [30, 70];
  if (wordLength >= 15) return [24, 76];
  return [17, 83];
}

import assert from "node:assert/strict";
import test from "node:test";
import { WORD_BOOKS } from "../app/wordbooks.ts";
import {
  FROST_WORD_POOL_SIZE,
  buildWordPools,
  drawWordFromBag,
  wordHistorySize,
} from "../shared/word-pools.ts";
import {
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  isPlayableWord,
} from "../shared/word-rules.ts";

const ACADEMIC_WORDBOOK_IDS = ["cet4", "cet6", "postgraduate", "toefl", "sat"];
const GAME_LONG_WORD_CHALLENGE_IDS = new Set(["cet4", "cet6", "postgraduate"]);

test("academic wordbooks contain thousands of unique playable words", () => {
  for (const id of ACADEMIC_WORDBOOK_IDS) {
    const wordbook = WORD_BOOKS[id];
    const uniqueWords = new Set(wordbook.words);

    assert.ok(wordbook.words.length >= 500, `${id}: ${wordbook.words.length} words`);
    assert.equal(uniqueWords.size, wordbook.words.length, `${id}: duplicate word`);
    assert.ok(wordbook.words.every(isPlayableWord), `${id}: invalid word`);
    assert.ok(
      wordbook.words.every((word) => word.length >= MIN_WORD_LENGTH && word.length <= MAX_WORD_LENGTH),
      `${id}: word outside ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH} letters`,
    );
    if (GAME_LONG_WORD_CHALLENGE_IDS.has(id)) {
      const longWords = wordbook.words.filter((word) => word.length >= 18);
      const pools = buildWordPools(wordbook.words);
      assert.ok(longWords.length >= FROST_WORD_POOL_SIZE, `${id}: too few 18+ letter challenge words`);
      assert.ok(
        pools.frostWords.every((word) => word.length >= 18),
        `${id}: the longest-word rotation should consist of genuine long words`,
      );
    }
  }
});

test("the mixed challenge is the deduplicated union of the six source wordbooks", () => {
  const sourceIds = ["winter", "cet4", "cet6", "postgraduate", "toefl", "sat"];
  const expected = new Set(sourceIds.flatMap((id) => WORD_BOOKS[id].words));
  const actual = new Set(WORD_BOOKS.mixed.words);

  assert.equal(actual.size, WORD_BOOKS.mixed.words.length);
  assert.deepEqual(actual, expected);
});

test("retired situational books are absent while SAT and TOEFL are selectable", () => {
  assert.deepEqual(
    Object.keys(WORD_BOOKS),
    ["winter", "cet4", "cet6", "postgraduate", "toefl", "sat", "mixed"],
  );
  assert.equal("conceptStarter" in WORD_BOOKS, false);
  assert.equal("conceptProgress" in WORD_BOOKS, false);
});

test("every built-in wordbook reserves its ten longest unique words for frost snowflakes", () => {
  for (const wordbook of Object.values(WORD_BOOKS)) {
    const uniqueWords = Array.from(new Set(wordbook.words));
    const expectedFrostWords = uniqueWords
      .map((word, sourceIndex) => ({ word, sourceIndex }))
      .sort((left, right) => right.word.length - left.word.length || left.sourceIndex - right.sourceIndex)
      .slice(0, FROST_WORD_POOL_SIZE)
      .map(({ word }) => word);
    const pools = buildWordPools(wordbook.words);

    assert.deepEqual(pools.frostWords, expectedFrostWords, wordbook.id);
    assert.equal(new Set(pools.frostWords).size, FROST_WORD_POOL_SIZE, wordbook.id);
    assert.ok(pools.regularWords.every((word) => !pools.frostWords.includes(word)), wordbook.id);
  }
});

test("a frost bag uses every candidate once and avoids an immediate repeat across refills", () => {
  const pool = buildWordPools(WORD_BOOKS.winter.words).frostWords;
  let bag = [];
  let recent = [];
  const firstCycle = [];

  for (let index = 0; index < pool.length; index += 1) {
    const draw = drawWordFromBag({
      bag,
      pool,
      activeWords: new Set(),
      recentWords: new Set(recent),
      random: () => 0,
    });
    assert.ok(draw.word);
    bag = draw.bag;
    firstCycle.push(draw.word);
    recent = [...recent, draw.word].slice(-3);
  }

  assert.equal(new Set(firstCycle).size, pool.length);
  assert.deepEqual(new Set(firstCycle), new Set(pool));

  const nextCycle = drawWordFromBag({
    bag,
    pool,
    activeWords: new Set(),
    recentWords: new Set(recent),
    random: () => 0,
  });
  assert.ok(nextCycle.word);
  assert.notEqual(nextCycle.word, firstCycle.at(-1));
});

test("a regular bag keeps recent words in the bag while drawing every word exactly once per cycle", () => {
  const pool = Array.from({ length: 15 }, (_, index) => `word${String.fromCharCode(97 + index)}`);
  let bag = [];
  let recent = [];
  const drawn = [];

  for (let index = 0; index < pool.length; index += 1) {
    const draw = drawWordFromBag({
      bag,
      pool,
      activeWords: new Set(),
      recentWords: new Set(recent),
      random: () => 0.5,
    });
    assert.ok(draw.word);
    bag = draw.bag;
    drawn.push(draw.word);
    recent = [...recent, draw.word].slice(-wordHistorySize(pool.length));
  }

  assert.equal(bag.length, 0);
  assert.equal(new Set(drawn).size, pool.length);
  assert.deepEqual(new Set(drawn), new Set(pool));
});

test("temporarily blocked prefix candidates stay in their bag for a later draw", () => {
  const blocked = drawWordFromBag({
    bag: ["snowflake", "river"],
    pool: ["snowflake", "river"],
    activeWords: new Set(["snow"]),
  });
  assert.equal(blocked.word, "river");
  assert.deepEqual(blocked.bag, ["snowflake"]);

  const available = drawWordFromBag({
    bag: blocked.bag,
    pool: ["snowflake", "river"],
    activeWords: new Set(),
  });
  assert.equal(available.word, "snowflake");
  assert.deepEqual(available.bag, []);
});

test("the recent-word fallback still avoids repeating the immediately previous word", () => {
  const draw = drawWordFromBag({
    bag: ["marshmallow", "wonderland"],
    pool: ["marshmallow", "wonderland"],
    activeWords: new Set(),
    recentWords: new Set(["marshmallow", "wonderland"]),
    avoidImmediateWord: "marshmallow",
  });

  assert.equal(draw.word, "wonderland");
});

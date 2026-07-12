import assert from "node:assert/strict";
import test from "node:test";

import {
  ROOM_ENGINE_CONSTANTS,
  RoomEngine,
  calculateAiTiming,
  calculateWordDamage,
} from "../shared/room-engine.ts";
import { buildWordPools } from "../shared/word-pools.ts";
import { MAX_WORD_LENGTH } from "../shared/word-rules.ts";

const CODE = "ABC234";
const HOST_SESSION = "host-session";
const HOST_TOKEN = "host-token";

const TEST_BOOK = ["snow", "star", "river", "planet", "cocoa", "winter", "forest", "glove"];

function createEngine({ random = () => 0.5, words = TEST_BOOK, name = "房主" } = {}) {
  return RoomEngine.create({
    code: CODE,
    sessionId: HOST_SESSION,
    reconnectToken: HOST_TOKEN,
    name,
    now: 0,
    random,
    wordbooks: { winter: words },
  });
}

function join(engine, index, now = index) {
  return engine.join({
    sessionId: `guest-${index}`,
    reconnectToken: `guest-token-${index}`,
    name: `好友${index}`,
    now,
  });
}

function start(engine, guests = [], now = 100) {
  for (const guest of guests) {
    const ready = engine.handleCommand(guest, { op: "presence.ready", ready: true }, now - 1);
    assert.equal(ready.ok, true);
  }
  const requested = engine.handleCommand(HOST_SESSION, { op: "match.start" }, now);
  assert.equal(requested.ok, true);
  const countdownEndsAt = engine.snapshot(now).countdownEndsAt;
  assert.equal(typeof countdownEndsAt, "number");
  const begun = engine.advance(countdownEndsAt);
  assert.equal(begun.ok, true);
  assert.equal(begun.events.length, 1);
  assert.equal(begun.events[0].type, "match.started");
  return countdownEndsAt;
}

function typeWord(engine, sessionId, word, now) {
  let result;
  for (const key of word) {
    result = engine.handleCommand(sessionId, { op: "type.key", key }, now);
    assert.equal(result.ok, true);
  }
  return result;
}

test("creates a six-character room with eight stable seats and admits at most eight humans", () => {
  const engine = createEngine();
  assert.equal(engine.snapshot(0, HOST_SESSION).selfPlayerId, "pine-0");
  assert.equal(engine.snapshot(0, HOST_SESSION).players.find((player) => player.id === "pine-0")?.position, 2);
  assert.equal(engine.serialize().state.players.length, 8);

  for (let index = 1; index <= 7; index += 1) {
    const result = join(engine, index);
    assert.equal(result.ok, true);
    assert.equal(result.resumed, false);
  }

  const full = engine.snapshot(10);
  assert.equal(full.humanCount, 8);
  assert.equal(full.players.filter((player) => player.controller.kind === "human").length, 8);
  assert.equal(full.players.filter((player) => player.team === "pine").length, 4);
  assert.equal(full.players.filter((player) => player.team === "berry").length, 4);
  assert.ok(full.players.every((player) => player.maxHealth === 100 && player.health === 100));
  assert.ok(engine.serialize().state.players.every((player) => player.maxHealth === 100));

  const ninth = join(engine, 8, 11);
  assert.equal(ninth.ok, false);
  assert.equal(ninth.code, "ROOM_FULL");
  assert.equal(engine.snapshot(11).humanCount, 8);
});

test("custom human names are unique while colliding AI names receive a distinct suffix", () => {
  const engine = createEngine({ name: "阿澄" });
  let snapshot = engine.snapshot(0, HOST_SESSION);
  assert.equal(snapshot.players.find((player) => player.id === "pine-0")?.name, "阿澄");
  assert.equal(snapshot.players.find((player) => player.id === "pine-1")?.name, "阿澄AI");
  assert.equal(new Set(snapshot.players.map((player) => player.name.toLowerCase())).size, snapshot.players.length);

  const duplicate = engine.join({
    sessionId: "duplicate-name",
    reconnectToken: "duplicate-name-token",
    name: "阿澄",
    now: 1,
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "NAME_TAKEN");

  const custom = engine.join({
    sessionId: "custom-name",
    reconnectToken: "custom-name-token",
    name: "雪梨",
    now: 2,
  });
  assert.equal(custom.ok, true);
  snapshot = engine.snapshot(2, "custom-name");
  assert.equal(snapshot.players.find((player) => player.id === custom.playerId)?.name, "雪梨");
});

test("a guest can move their own seat but cannot reorder another player", () => {
  const engine = createEngine();
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);
  assert.equal(engine.snapshot(10).players.find((player) => player.id === guest.playerId)?.position, 2);

  const ownMove = engine.handleCommand(
    "guest-1",
    { op: "lobby.move", playerId: guest.playerId, direction: -1 },
    11,
  );
  assert.equal(ownMove.ok, true);
  assert.equal(engine.snapshot(11).players.find((player) => player.id === guest.playerId)?.position, 1);

  const otherPlayer = engine.snapshot(11).players.find((player) => player.team === "berry" && player.position === 0);
  assert.ok(otherPlayer);
  const before = engine.snapshot(11).players.map((player) => [player.id, player.position]);
  const forbidden = engine.handleCommand(
    "guest-1",
    { op: "lobby.move", playerId: otherPlayer.id, direction: 1 },
    12,
  );
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.code, "SELF_ONLY");
  assert.deepEqual(engine.snapshot(12).players.map((player) => [player.id, player.position]), before);
});

test("host can shrink a team around a human in the last position but not below its human count", () => {
  const engine = createEngine();
  let changed = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 2, berrySize: 4, snowfallLevel: "light" } },
    10,
  );
  assert.equal(changed.ok, true);
  let snapshot = engine.snapshot(10);
  assert.equal(snapshot.players.filter((player) => player.team === "pine").length, 2);
  assert.equal(snapshot.players.filter((player) => player.team === "berry").length, 4);
  assert.equal(snapshot.players.find((player) => player.id === "pine-0")?.position, 1);

  changed = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 1 } },
    11,
  );
  assert.equal(changed.ok, true);
  snapshot = engine.snapshot(11);
  assert.equal(snapshot.players.filter((player) => player.team === "pine").length, 1);
  assert.equal(snapshot.players.find((player) => player.id === "pine-0")?.position, 0);

  const guest = join(engine, 1, 12);
  assert.equal(guest.ok, true);
  assert.equal(engine.handleCommand("guest-1", { op: "lobby.set_team", team: "pine" }, 13).ok, true);
  snapshot = engine.snapshot(13, "guest-1");
  assert.equal(snapshot.players.filter((player) => player.team === "pine" && player.controller.kind === "human").length, 2);
  assert.equal(
    snapshot.players.find((player) => player.id === snapshot.selfPlayerId)?.position,
    snapshot.players.filter((player) => player.team === "pine").length - 1,
  );

  const rejected = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 1 } },
    14,
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "TEAM_HAS_HUMANS");
});

test("the host can remove active AI seats while guests, humans, inactive seats, and last seats are protected", () => {
  const engine = createEngine();
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);

  let snapshot = engine.snapshot(10);
  const removable = snapshot.players.find((player) => player.team === "pine" && player.position === 0);
  assert.equal(removable?.controller.kind, "ai");

  const guestAttempt = engine.handleCommand(
    "guest-1",
    { op: "lobby.remove_ai", playerId: removable.id },
    11,
  );
  assert.equal(guestAttempt.ok, false);
  assert.equal(guestAttempt.code, "HOST_ONLY");

  const removed = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.remove_ai", playerId: removable.id },
    12,
  );
  assert.equal(removed.ok, true);
  snapshot = engine.snapshot(12);
  const pine = snapshot.players.filter((player) => player.team === "pine").sort((a, b) => a.position - b.position);
  assert.equal(snapshot.config.pineSize, 2);
  assert.deepEqual(pine.map((player) => player.position), [0, 1]);
  assert.equal(pine.at(-1)?.id, "pine-0");

  const inactiveAttempt = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.remove_ai", playerId: removable.id },
    13,
  );
  assert.equal(inactiveAttempt.ok, false);
  assert.equal(inactiveAttempt.code, "NOT_AN_AI");

  const humanAttempt = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.remove_ai", playerId: guest.playerId },
    14,
  );
  assert.equal(humanAttempt.ok, false);
  assert.equal(humanAttempt.code, "NOT_AN_AI");

  assert.equal(engine.handleCommand(HOST_SESSION, { op: "lobby.set_config", config: { berrySize: 1 } }, 15).ok, true);
  snapshot = engine.snapshot(15);
  const berryOnly = snapshot.players.find((player) => player.team === "berry");
  assert.equal(berryOnly?.controller.kind, "human");
  assert.equal(engine.handleCommand("guest-1", { op: "lobby.set_team", team: "pine" }, 16).ok, true);
  snapshot = engine.snapshot(16);
  const lastAi = snapshot.players.find((player) => player.team === "berry" && player.controller.kind === "ai");
  assert.ok(lastAi);
  const lastSeatAttempt = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.remove_ai", playerId: lastAi.id },
    17,
  );
  assert.equal(lastSeatAttempt.ok, false);
  assert.equal(lastSeatAttempt.code, "MIN_TEAM_SIZE");

  const startedAt = start(engine, ["guest-1"], 20);
  const playingAi = engine.snapshot(startedAt).players.find((player) => player.controller.kind === "ai");
  assert.ok(playingAi);
  const duringMatch = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.remove_ai", playerId: playingAi.id },
    startedAt + 1,
  );
  assert.equal(duringMatch.ok, false);
  assert.equal(duringMatch.code, "WRONG_STAGE");
});

test("initial, reactivated, and departed-human AI seats default to steady", () => {
  const engine = createEngine();
  let snapshot = engine.snapshot(0);
  assert.ok(snapshot.players
    .filter((player) => player.controller.kind === "ai")
    .every((player) => player.controller.level === "steady"));

  const berryTail = snapshot.players
    .filter((player) => player.team === "berry" && player.controller.kind === "ai")
    .sort((a, b) => b.position - a.position)[0];
  assert.ok(berryTail);
  assert.equal(engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_ai_level", playerId: berryTail.id, level: "expert" },
    1,
  ).ok, true);
  assert.equal(engine.handleCommand(HOST_SESSION, { op: "lobby.set_config", config: { berrySize: 2 } }, 2).ok, true);
  assert.equal(engine.handleCommand(HOST_SESSION, { op: "lobby.set_config", config: { berrySize: 3 } }, 3).ok, true);
  snapshot = engine.snapshot(3);
  assert.equal(snapshot.players.find((player) => player.id === berryTail.id)?.controller.level, "steady");

  const guest = join(engine, 1, 4);
  assert.equal(guest.ok, true);
  assert.equal(engine.handleCommand("guest-1", { op: "presence.leave" }, 5).ok, true);
  snapshot = engine.snapshot(5);
  const replacement = snapshot.players.find((player) => player.id === guest.playerId);
  assert.equal(replacement?.controller.kind, "ai");
  assert.equal(replacement?.controller.level, "steady");
});

test("join with the same credentials reconnects to the same seat during the grace period", () => {
  const engine = createEngine();
  const first = join(engine, 1, 10);
  assert.equal(first.ok, true);
  const playerId = first.playerId;
  const originalPosition = engine.snapshot(10).players.find((player) => player.id === playerId)?.position;
  assert.equal(originalPosition, 2);

  const disconnected = engine.disconnect("guest-1", 20);
  assert.equal(disconnected.ok, true);
  assert.equal(engine.nextDueAt(), 20 + ROOM_ENGINE_CONSTANTS.disconnectGraceMs);

  const resumed = engine.join({
    sessionId: "guest-1",
    reconnectToken: "guest-token-1",
    name: "好友归来",
    now: 30,
  });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.playerId, playerId);
  assert.equal(resumed.snapshot.players.find((player) => player.id === playerId)?.controller.kind, "human");
  assert.equal(resumed.snapshot.players.find((player) => player.id === playerId)?.position, originalPosition);
  assert.equal(engine.nextDueAt(), null);

  const wrongToken = engine.join({
    sessionId: "guest-1",
    reconnectToken: "wrong-token",
    name: "冒名者",
    now: 31,
  });
  assert.equal(wrongToken.ok, false);
  assert.equal(wrongToken.code, "INVALID_RECONNECT_TOKEN");
});

test("a disconnected human is replaced by AI exactly at 60 seconds", () => {
  const engine = createEngine();
  const joined = join(engine, 1, 10);
  assert.equal(joined.ok, true);
  engine.disconnect("guest-1", 20);

  const early = engine.advance(20 + ROOM_ENGINE_CONSTANTS.disconnectGraceMs - 1);
  assert.equal(early.events.length, 0);
  assert.equal(engine.snapshot(60_019).players.find((player) => player.id === joined.playerId)?.controller.kind, "human");

  const due = engine.advance(20 + ROOM_ENGINE_CONSTANTS.disconnectGraceMs);
  assert.equal(due.events.length, 1);
  assert.deepEqual(due.events[0], { type: "player.replaced_by_ai", playerId: joined.playerId });
  const replacement = engine.snapshot(60_020).players.find((player) => player.id === joined.playerId);
  assert.equal(replacement?.controller.kind, "ai");
  assert.equal(replacement?.controller.level, "steady");
  assert.equal(replacement?.name, "团子");
  assert.equal(replacement?.badge, "团");
});

test("a join arriving when the last reconnect deadline expires cannot revive an empty room", () => {
  const engine = createEngine();
  assert.equal(engine.disconnect(HOST_SESSION, 20).ok, true);

  const tooLate = engine.join({
    sessionId: "late-session",
    reconnectToken: "late-reconnect-token-123456789",
    name: "迟到者",
    now: 20 + ROOM_ENGINE_CONSTANTS.disconnectGraceMs,
  });
  assert.equal(tooLate.ok, false);
  assert.equal(tooLate.code, "ROOM_NOT_FOUND");
  assert.equal(engine.snapshot(20 + ROOM_ENGINE_CONSTANTS.disconnectGraceMs).humanCount, 0);
  assert.equal(engine.snapshot(20 + ROOM_ENGINE_CONSTANTS.disconnectGraceMs).hostPlayerId, null);
});

test("an explicitly departing host immediately promotes the earliest remaining human", () => {
  const engine = createEngine();
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);

  const left = engine.handleCommand(HOST_SESSION, { op: "presence.leave" }, 20);
  assert.equal(left.ok, true);
  const snapshot = engine.snapshot(20, "guest-1");
  assert.equal(snapshot.humanCount, 1);
  assert.equal(snapshot.hostPlayerId, guest.playerId);
  assert.equal(snapshot.players.find((player) => player.id === guest.playerId)?.controller.isHost, true);
  assert.equal(snapshot.players.find((player) => player.id === guest.playerId)?.controller.ready, true);

  const configured = engine.handleCommand(
    "guest-1",
    { op: "lobby.set_config", config: { pineSize: 1, berrySize: 2 } },
    21,
  );
  assert.equal(configured.ok, true);
});

test("host transfer includes a human inside the reconnect grace period", () => {
  const engine = createEngine();
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);
  assert.equal(engine.disconnect("guest-1", 20).ok, true);
  assert.equal(engine.handleCommand(HOST_SESSION, { op: "presence.leave" }, 21).ok, true);

  let snapshot = engine.snapshot(21);
  assert.equal(snapshot.hostPlayerId, guest.playerId);
  assert.equal(snapshot.players.find((player) => player.id === guest.playerId)?.controller.isHost, true);
  assert.equal(snapshot.players.find((player) => player.id === guest.playerId)?.controller.connected, false);

  const resumed = engine.join({
    sessionId: "guest-1",
    reconnectToken: "guest-token-1",
    name: "好友归来",
    now: 30,
  });
  assert.equal(resumed.ok, true);
  snapshot = engine.snapshot(30, "guest-1");
  assert.equal(snapshot.hostPlayerId, guest.playerId);
  assert.equal(snapshot.selfPlayerId, guest.playerId);
});

test("the last explicit human departure leaves no owner for the worker to retire", () => {
  const engine = createEngine();
  const left = engine.leave(HOST_SESSION, 10);
  assert.equal(left.ok, true);
  const snapshot = engine.snapshot(10);
  assert.equal(snapshot.humanCount, 0);
  assert.equal(snapshot.hostPlayerId, null);
  assert.equal(snapshot.players.some((player) => player.controller.kind === "human"), false);
});

test("restoring a legacy hostless room repairs a single valid host invariant", () => {
  const engine = createEngine();
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);
  const serialized = engine.serialize();
  serialized.state.hostPlayerId = "pine-3";
  for (const player of serialized.state.players) {
    if (player.controller.kind === "human") player.controller.isHost = false;
  }

  const restored = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: TEST_BOOK },
  });
  const snapshot = restored.snapshot(10);
  const hosts = snapshot.players.filter((player) => player.controller.kind === "human" && player.controller.isHost);
  assert.equal(hosts.length, 1);
  assert.equal(snapshot.hostPlayerId, "pine-0");
  assert.equal(hosts[0].id, "pine-0");
});

test("switching teams keeps the human name and gives the vacated AI a unique name", () => {
  const engine = createEngine({ name: "小雪球" });
  const switched = engine.handleCommand(HOST_SESSION, { op: "lobby.set_team", team: "berry" }, 5);
  assert.equal(switched.ok, true);
  const snapshot = engine.snapshot(5, HOST_SESSION);
  const self = snapshot.players.find((player) => player.id === snapshot.selfPlayerId);
  assert.equal(self?.name, "小雪球");
  assert.equal(self?.position, snapshot.players.filter((player) => player.team === "berry").length - 1);
  const names = snapshot.players.map((player) => player.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  assert.equal(snapshot.players.find((player) => player.id === "pine-0")?.name, "小雪球AI");
});

test("prefix matching stays ambiguous, locks at one candidate, and rejects a bad key without changing the buffer", () => {
  const engine = createEngine({ words: ["snow", "star", "river"] });
  const startedAt = start(engine);

  engine.handleCommand(HOST_SESSION, { op: "type.key", key: "s" }, startedAt + 1);
  let typing = engine.snapshot(startedAt + 1, HOST_SESSION).typingByPlayer["pine-0"];
  assert.deepEqual(typing, { buffer: "s", targetWordId: null });

  engine.handleCommand(HOST_SESSION, { op: "type.key", key: "n" }, startedAt + 2);
  typing = engine.snapshot(startedAt + 2, HOST_SESSION).typingByPlayer["pine-0"];
  assert.equal(typing.buffer, "sn");
  assert.equal(engine.snapshot(startedAt + 2).words.find((word) => word.id === typing.targetWordId)?.text, "snow");

  const bad = engine.handleCommand(HOST_SESSION, { op: "type.key", key: "x" }, startedAt + 3);
  assert.equal(bad.events.length, 1);
  assert.equal(bad.events[0].type, "typing.rejected");
  typing = engine.snapshot(startedAt + 3, HOST_SESSION).typingByPlayer["pine-0"];
  assert.equal(typing.buffer, "sn");

  engine.handleCommand(HOST_SESSION, { op: "type.cancel" }, startedAt + 4);
  assert.deepEqual(engine.snapshot(startedAt + 4).typingByPlayer["pine-0"], { buffer: "", targetWordId: null });
});

test("a 24-letter word can fall and be typed, while a 25-letter word is rejected", () => {
  const longestPlayableWord = "disestablishmentarianism";
  const overLimitWord = "antidisestablishmentarian";
  assert.equal(longestPlayableWord.length, MAX_WORD_LENGTH);
  assert.equal(overLimitWord.length, MAX_WORD_LENGTH + 1);

  const words = [longestPlayableWord, "snow", "star", "river", "planet"];
  let engine = createEngine({ words });
  const startedAt = start(engine);
  const serialized = engine.serialize();
  serialized.state.words = [];
  serialized.state.nextSpawnAt = null;
  serialized.state.deferredEvents = [];
  engine = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: words },
  });

  const spawned = engine.spawnWord(startedAt + 1, longestPlayableWord, "normal");
  assert.ok(spawned);
  assert.equal(spawned.text, longestPlayableWord);
  assert.ok(spawned.x >= 30 && spawned.x <= 70);
  assert.equal(engine.spawnWord(startedAt + 2, overLimitWord, "normal"), null);

  const claim = typeWord(engine, HOST_SESSION, longestPlayableWord, startedAt + 3);
  assert.equal(claim.events[0]?.type, "word.claimed");
  assert.equal(claim.events[0]?.word.text, longestPlayableWord);
  assert.equal(claim.events[0]?.damage, 13);
});

test("each match starts with one visible frost word and never keeps two frost words on the field", () => {
  const words = ["snow", "river", "planet", "accountability", "counterpoint"];
  const engine = createEngine({
    words,
  });
  const startedAt = start(engine);
  let snapshot = engine.snapshot(startedAt);
  const frostWords = snapshot.words.filter((word) => word.kind === "frost");
  assert.equal(frostWords.length, 1);
  assert.ok(buildWordPools(words).frostWords.includes(frostWords[0].text));

  engine.spawnWord(startedAt + 1);
  engine.spawnWord(startedAt + 2);
  snapshot = engine.snapshot(startedAt + 2);
  assert.equal(snapshot.words.filter((word) => word.kind === "frost").length, 1);
});

test("the authoritative frost bag rotates through the ten longest words before repeating", () => {
  const words = [
    "accountability", "infrastructure", "configuration", "socioeconomic", "comprehensive",
    "indispensable", "differentiate", "architecture", "conventional", "intellectual",
    "snow", "river", "planet", "harbor", "quartz", "winter", "forest", "glove", "cocoa", "star",
  ];
  const expectedPool = buildWordPools(words).frostWords;
  const engine = createEngine({ words });
  const startedAt = start(engine);
  const drawn = [];

  for (let index = 0; index < expectedPool.length; index += 1) {
    let frostWord = engine.snapshot(startedAt + index).words.find((word) => word.kind === "frost");
    if (!frostWord) frostWord = engine.spawnWord(startedAt + index, undefined, "frost");
    assert.ok(frostWord);
    drawn.push(frostWord.text);
    const claim = typeWord(engine, HOST_SESSION, frostWord.text, startedAt + index);
    assert.equal(claim.events[0]?.type, "word.claimed");
  }

  assert.equal(new Set(drawn).size, ROOM_ENGINE_CONSTANTS.frostWordPoolSize);
  assert.deepEqual(new Set(drawn), new Set(expectedPool));
  const next = engine.spawnWord(startedAt + expectedPool.length, undefined, "frost");
  assert.ok(next);
  assert.notEqual(next.text, drawn.at(-1));
});

test("a frost word deals 15 area damage and freezes every surviving opponent for exactly one second", () => {
  const engine = createEngine({
    words: ["snow", "river", "planet", "accountability", "counterpoint"],
  });
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);
  const configured = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 1, berrySize: 3 } },
    11,
  );
  assert.equal(configured.ok, true);
  const startedAt = start(engine, ["guest-1"], 100);
  const frostWord = engine.snapshot(startedAt).words.find((word) => word.kind === "frost");
  assert.ok(frostWord);
  const opponentsBefore = engine.snapshot(startedAt).players
    .filter((player) => player.team === "berry")
    .sort((left, right) => left.position - right.position);
  assert.equal(opponentsBefore.length, 3);

  const claim = typeWord(engine, HOST_SESSION, frostWord.text, startedAt + 1);
  assert.equal(claim.events[0]?.type, "word.claimed");
  assert.equal(claim.events[0]?.damage, ROOM_ENGINE_CONSTANTS.frostDamage);
  const resolveAt = claim.events[0].resolveAt;
  const resolved = engine.advance(resolveAt);
  assert.equal(resolved.events[0]?.type, "attack.resolved");
  assert.equal(resolved.events[0]?.kind, "frost");
  assert.deepEqual(resolved.events[0]?.hits.map((hit) => hit.targetId), opponentsBefore.map((player) => player.id));
  assert.equal(resolved.events[0]?.hits.length, 3);
  assert.ok(resolved.events[0]?.hits.every((hit) => hit.actualDamage === ROOM_ENGINE_CONSTANTS.frostDamage));
  assert.ok(resolved.events[0]?.hits.every((hit) => hit.frozenUntil === resolveAt + ROOM_ENGINE_CONSTANTS.frostFreezeMs));
  assert.equal(resolved.events[0]?.actualDamage, ROOM_ENGINE_CONSTANTS.frostDamage);
  assert.equal(resolved.events[0]?.frozenUntil, resolveAt + ROOM_ENGINE_CONSTANTS.frostFreezeMs);
  const afterImpact = engine.snapshot(resolveAt);
  assert.ok(afterImpact.players
    .filter((player) => player.team === "berry")
    .every((player) => player.health === player.maxHealth - ROOM_ENGINE_CONSTANTS.frostDamage
      && player.frozenUntil === resolveAt + ROOM_ENGINE_CONSTANTS.frostFreezeMs));
  assert.equal(afterImpact.players.find((player) => player.id === "pine-0")?.damage,
    ROOM_ENGINE_CONSTANTS.frostDamage * 3);

  const blocked = engine.handleCommand("guest-1", { op: "type.key", key: "s" }, resolveAt + 999);
  assert.equal(blocked.ok, true);
  assert.deepEqual(blocked.events[0], { type: "typing.rejected", playerId: guest.playerId, reason: "FROZEN" });

  const thawedAt = resolveAt + ROOM_ENGINE_CONSTANTS.frostFreezeMs;
  const allowed = engine.handleCommand("guest-1", { op: "type.key", key: "s" }, thawedAt);
  assert.equal(allowed.ok, true);
  assert.notEqual(allowed.events[0]?.type === "typing.rejected" ? allowed.events[0].reason : null, "FROZEN");
});

test("freezing an AI delays its current word claim by the freeze duration", () => {
  const engine = createEngine({
    words: ["snow", "river", "planet", "accountability", "counterpoint"],
  });
  const configured = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 1, berrySize: 1 } },
    10,
  );
  assert.equal(configured.ok, true);
  const startedAt = start(engine, [], 100);
  const initial = engine.snapshot(startedAt);
  const frostWord = initial.words.find((word) => word.kind === "frost");
  const normalWord = initial.words.find((word) => word.kind === "normal" && word.aiPlayerId === "berry-0");
  assert.ok(frostWord);
  assert.ok(normalWord);
  assert.equal(typeof normalWord.aiClaimAt, "number");

  const claim = typeWord(engine, HOST_SESSION, frostWord.text, startedAt + 1);
  assert.equal(claim.events[0]?.type, "word.claimed");
  engine.advance(claim.events[0].resolveAt);
  const delayed = engine.snapshot(claim.events[0].resolveAt).words.find((word) => word.id === normalWord.id);
  assert.equal(delayed?.aiClaimAt, normalWord.aiClaimAt + ROOM_ENGINE_CONSTANTS.frostFreezeMs);

  engine.advance(normalWord.aiClaimAt);
  assert.ok(engine.snapshot(normalWord.aiClaimAt).words.some((word) => word.id === normalWord.id));
});

test("all due impacts resolve before a same-time input command can slip past a later frost hit", () => {
  const engine = createEngine();
  const configured = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 2, berrySize: 1 } },
    1,
  );
  assert.equal(configured.ok, true);
  const pineGuest = join(engine, 1, 2);
  assert.equal(pineGuest.ok, true);
  const switched = engine.handleCommand("guest-1", { op: "lobby.set_team", team: "pine" }, 3);
  assert.equal(switched.ok, true);
  const berryGuest = join(engine, 2, 4);
  assert.equal(berryGuest.ok, true);

  const startedAt = start(engine, ["guest-1", "guest-2"], 100);
  const normal = engine.spawnWord(startedAt + 1, "lamp", "normal");
  const frost = engine.spawnWord(startedAt + 1, "counterpoint", "frost");
  assert.ok(normal);
  assert.ok(frost);
  const normalClaim = typeWord(engine, HOST_SESSION, normal.text, startedAt + 2);
  const frostClaim = typeWord(engine, "guest-1", frost.text, startedAt + 2);
  assert.equal(normalClaim.events[0]?.type, "word.claimed");
  assert.equal(frostClaim.events[0]?.type, "word.claimed");
  assert.equal(normalClaim.events[0].resolveAt, frostClaim.events[0].resolveAt);

  const impactAt = normalClaim.events[0].resolveAt;
  const attempted = engine.handleCommand("guest-2", { op: "type.key", key: "s" }, impactAt);
  assert.equal(attempted.ok, true);
  const target = engine.snapshot(impactAt, "guest-2").players.find((player) => player.id === berryGuest.playerId);
  assert.ok(target);
  assert.equal(target?.health, target.maxHealth - 10 - ROOM_ENGINE_CONSTANTS.frostDamage);
  assert.equal(target?.frozenUntil, impactAt + ROOM_ENGINE_CONSTANTS.frostFreezeMs);
  assert.deepEqual(engine.snapshot(impactAt, "guest-2").typingByPlayer[berryGuest.playerId], {
    buffer: "",
    targetWordId: null,
  });
});

test("two humans racing the same word produce exactly one claim and one attack", () => {
  const engine = createEngine({ words: ["snow", "star", "river"] });
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);
  const startedAt = start(engine, ["guest-1"]);

  for (const key of "sno") {
    engine.handleCommand(HOST_SESSION, { op: "type.key", key }, startedAt + 10);
    engine.handleCommand("guest-1", { op: "type.key", key }, startedAt + 10);
  }
  const winner = engine.handleCommand(HOST_SESSION, { op: "type.key", key: "w" }, startedAt + 11);
  const loser = engine.handleCommand("guest-1", { op: "type.key", key: "w" }, startedAt + 11);

  assert.equal(winner.events.length, 1);
  assert.equal(winner.events[0].type, "word.claimed");
  assert.equal(loser.events.length, 1);
  assert.deepEqual(loser.events[0], { type: "typing.rejected", playerId: guest.playerId, reason: "NO_MATCH" });

  const snapshot = engine.snapshot(startedAt + 11);
  assert.equal(snapshot.players.reduce((total, player) => total + player.claims, 0), 1);
  assert.equal(snapshot.pendingAttacks.length, 1);
  assert.equal(snapshot.words.some((word) => word.text === "snow"), false);
});

test("three words completed quickly create three attacks spaced by 1.85 seconds", () => {
  const engine = createEngine({ words: ["snow", "star", "river"] });
  const startedAt = start(engine);
  const results = [
    typeWord(engine, HOST_SESSION, "snow", startedAt + 10),
    typeWord(engine, HOST_SESSION, "river", startedAt + 110),
    typeWord(engine, HOST_SESSION, "star", startedAt + 210),
  ];
  assert.deepEqual(results.map((result) => result.events[0]?.type), ["word.claimed", "word.claimed", "word.claimed"]);

  const attacks = engine.snapshot(startedAt + 210).pendingAttacks.sort((left, right) => left.startsAt - right.startsAt);
  assert.equal(attacks.length, 3);
  assert.equal(attacks[1].startsAt - attacks[0].startsAt, ROOM_ENGINE_CONSTANTS.actorQueueIntervalMs);
  assert.equal(attacks[2].startsAt - attacks[1].startsAt, ROOM_ENGINE_CONSTANTS.actorQueueIntervalMs);
  assert.equal(new Set(attacks.map((attack) => attack.id)).size, 3);
});

test("knocking out an attacker preserves an in-flight snowball but cancels every unthrown snowball", () => {
  let engine = createEngine({ words: ["snow", "star", "river", "planet", "cocoa", "winter"] });
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);
  const configured = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 2, berrySize: 1 } },
    20,
  );
  assert.equal(configured.ok, true);
  assert.equal(engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.move", playerId: "pine-0", direction: -1 },
    21,
  ).ok, true);
  const startedAt = start(engine, ["guest-1"], 100);
  const availableWords = engine.snapshot(startedAt).words.map((word) => word.text);
  assert.ok(availableWords.length >= 4);

  typeWord(engine, "guest-1", availableWords[3], startedAt + 1);
  typeWord(engine, HOST_SESSION, availableWords[0], startedAt + 10);
  typeWord(engine, HOST_SESSION, availableWords[1], startedAt + 110);
  typeWord(engine, HOST_SESSION, availableWords[2], startedAt + 210);

  const serialized = engine.serialize();
  const host = serialized.state.players.find((player) => player.sessionId === HOST_SESSION);
  assert.ok(host);
  host.health = 1;
  engine = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: ["snow", "star", "river", "planet", "cocoa", "winter"] },
  });

  const attacks = engine.serialize().state.pendingAttacks;
  const hostAttacks = attacks
    .filter((attack) => attack.attackerId === host.id)
    .sort((left, right) => left.resolveAt - right.resolveAt);
  const guestAttack = attacks.find((attack) => attack.attackerId === guest.playerId);
  assert.equal(hostAttacks.length, 3);
  assert.ok(guestAttack);

  const guestBeforeKnockout = engine.snapshot(guestAttack.resolveAt).players
    .find((player) => player.id === guest.playerId);
  assert.ok(guestBeforeKnockout);
  const knockout = engine.advance(guestAttack.resolveAt);
  assert.equal(knockout.events[0]?.type, "attack.resolved");
  assert.equal(knockout.events[0]?.targetId, host.id);
  assert.equal(knockout.events[0]?.targetHealth, 0);
  assert.equal(engine.snapshot(guestAttack.resolveAt).phase, "playing");
  assert.equal(
    engine.snapshot(guestAttack.resolveAt).players.find((player) => player.id === guest.playerId)?.health,
    guestBeforeKnockout.health,
  );
  assert.equal(
    engine.snapshot(guestAttack.resolveAt).players.find((player) => player.id === host.id)?.claims,
    3,
  );

  const afterKnockout = engine.serialize().state.pendingAttacks;
  const hostAfterKnockout = afterKnockout
    .filter((attack) => attack.attackerId === host.id)
    .sort((left, right) => left.resolveAt - right.resolveAt);
  assert.equal(hostAfterKnockout[0].resolved, false);
  assert.ok(hostAfterKnockout.slice(1).every((attack) => attack.resolved));
  assert.equal(engine.snapshot(guestAttack.resolveAt).pendingAttacks
    .filter((attack) => attack.attackerId === host.id).length, 1);

  const inFlightHit = engine.advance(hostAfterKnockout[0].resolveAt);
  assert.equal(inFlightHit.events[0]?.type, "attack.resolved");
  assert.equal(inFlightHit.events[0]?.attackerId, host.id);
  assert.equal(inFlightHit.events[0]?.missed, false);
  assert.equal(inFlightHit.events[0]?.targetId, guest.playerId);
  assert.equal(
    engine.snapshot(hostAfterKnockout[0].resolveAt).players.find((player) => player.id === guest.playerId)?.health,
    guestBeforeKnockout.health - hostAfterKnockout[0].damage,
  );
});

test("a normal snowball hits only its locked frontline, clamps overkill, and exposes the next position", () => {
  let engine = createEngine({ words: ["snow", "star", "river", "planet"] });
  const configured = engine.handleCommand(HOST_SESSION, { op: "lobby.set_config", config: { pineSize: 1, berrySize: 2 } }, 1);
  assert.equal(configured.ok, true);
  const startedAt = start(engine);
  const claim = typeWord(engine, HOST_SESSION, "snow", startedAt + 10);
  assert.equal(claim.events[0].type, "word.claimed");
  const firstTargetId = claim.events[0].targetId;
  const serialized = engine.serialize();
  const firstTarget = serialized.state.players.find((player) => player.id === firstTargetId);
  assert.ok(firstTarget);
  firstTarget.health = 4;
  engine = RoomEngine.restore(serialized, { random: () => 0.5, wordbooks: { winter: ["snow", "star", "river", "planet"] } });

  const resolved = engine.advance(claim.events[0].resolveAt);
  assert.equal(resolved.events.length, 1);
  assert.equal(resolved.events[0].type, "attack.resolved");
  assert.equal(resolved.events[0].targetId, firstTargetId);
  assert.equal(resolved.events[0].actualDamage, 4);
  assert.equal(resolved.events[0].targetHealth, 0);
  assert.equal(resolved.events[0].hits.length, 1);

  const nextFront = engine.snapshot(claim.events[0].resolveAt).players
    .filter((player) => player.team === "berry" && player.health > 0)
    .sort((left, right) => left.position - right.position)[0];
  assert.equal(nextFront.position, 1);
});

test("snowballs locked to a fallen frontline miss instead of retargeting, while a new claim locks the next player", () => {
  let engine = createEngine({ words: ["snow", "star", "river", "planet", "cocoa", "winter", "quartz"] });
  const configured = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 3, berrySize: 2, snowfallLevel: "light" } },
    1,
  );
  assert.equal(configured.ok, true);
  for (let index = 1; index <= 4; index += 1) assert.equal(join(engine, index, 1 + index).ok, true);
  const startedAt = start(engine, ["guest-1", "guest-2", "guest-3", "guest-4"], 100);
  const spawned = [
    engine.spawnWord(startedAt + 1, "lamp", "normal"),
    engine.spawnWord(startedAt + 1, "quartz", "normal"),
    engine.spawnWord(startedAt + 1, "harbor", "normal"),
  ];
  assert.ok(spawned.every(Boolean));

  const claims = [
    typeWord(engine, HOST_SESSION, "lamp", startedAt + 2),
    typeWord(engine, "guest-2", "quartz", startedAt + 2),
    typeWord(engine, "guest-4", "harbor", startedAt + 2),
  ];
  assert.ok(claims.every((claim) => claim.events[0]?.type === "word.claimed"));
  assert.equal(new Set(claims.map((claim) => claim.events[0].targetId)).size, 1);
  assert.equal(new Set(claims.map((claim) => claim.events[0].resolveAt)).size, 1);

  const lockedTargetId = claims[0].events[0].targetId;
  const serialized = engine.serialize();
  const lockedTarget = serialized.state.players.find((player) => player.id === lockedTargetId);
  const nextTarget = serialized.state.players
    .filter((player) => player.team === "berry" && player.id !== lockedTargetId)
    .sort((left, right) => left.position - right.position)[0];
  assert.ok(lockedTarget);
  assert.ok(nextTarget);
  lockedTarget.health = 1;
  const nextTargetHealth = nextTarget.health;
  engine = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: ["snow", "star", "river", "planet", "cocoa", "winter", "quartz"] },
  });

  const impactAt = claims[0].events[0].resolveAt;
  const events = [
    engine.advance(impactAt).events[0],
    engine.advance(impactAt).events[0],
    engine.advance(impactAt).events[0],
  ];
  assert.equal(events[0]?.type, "attack.resolved");
  assert.equal(events[0]?.targetId, lockedTargetId);
  assert.equal(events[0]?.actualDamage, 1);
  assert.equal(events[0]?.missed, false);
  for (const missed of events.slice(1)) {
    assert.equal(missed?.type, "attack.resolved");
    assert.equal(missed?.targetId, lockedTargetId);
    assert.equal(missed?.actualDamage, 0);
    assert.equal(missed?.missed, true);
    assert.deepEqual(missed?.hits, []);
  }
  assert.equal(
    engine.snapshot(impactAt).players.find((player) => player.id === nextTarget.id)?.health,
    nextTargetHealth,
  );

  const freshWord = engine.spawnWord(impactAt + 1, "signal", "normal");
  assert.ok(freshWord);
  const freshClaim = typeWord(engine, HOST_SESSION, freshWord.text, impactAt + 2);
  assert.equal(freshClaim.events[0]?.type, "word.claimed");
  assert.equal(freshClaim.events[0]?.targetId, nextTarget.id);
});

test("AI claims only at its authoritative deadline and wins an exact-time tie", () => {
  const engine = createEngine({ words: ["snow", "star", "river"] });
  const startedAt = start(engine);
  const word = engine.snapshot(startedAt).words
    .filter((candidate) => candidate.aiClaimAt !== null)
    .sort((left, right) => left.aiClaimAt - right.aiClaimAt)[0];
  assert.ok(word);
  const claimAt = word.aiClaimAt;

  for (const key of word.text.slice(0, -1)) {
    engine.handleCommand(HOST_SESSION, { op: "type.key", key }, claimAt - 1);
  }
  const tied = engine.handleCommand(HOST_SESSION, { op: "type.key", key: word.text.at(-1) }, claimAt);
  assert.equal(tied.events.length, 1);
  assert.equal(tied.events[0].type, "word.claimed");
  assert.notEqual(tied.events[0].attackerId, "pine-0");
  assert.equal(engine.snapshot(claimAt).players.find((player) => player.id === tied.events[0].attackerId)?.controller.kind, "ai");
});

test("a word remains claimable before expiry, then melts exactly two seconds after landing", () => {
  let engine = createEngine({ words: ["snow", "star", "river", "quartz", "harbor"] });
  const startedAt = start(engine);
  let serialized = engine.serialize();
  serialized.state.words = [];
  serialized.state.nextSpawnAt = null;
  serialized.state.deferredEvents = [];
  engine = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: ["snow", "star", "river", "quartz", "harbor"] },
  });

  const word = engine.spawnWord(startedAt + 1, "quartz", "normal");
  assert.ok(word);
  assert.equal(word.expiresAt - word.landedAt, ROOM_ENGINE_CONSTANTS.wordGroundTtlMs);
  assert.equal(
    word.landedAt,
    word.bornAt + Math.ceil(((word.restY - ROOM_ENGINE_CONSTANTS.wordStartY) / word.speed) * 1_000),
  );

  serialized = engine.serialize();
  const storedWord = serialized.state.words.find((candidate) => candidate.id === word.id);
  storedWord.aiPlayerId = null;
  storedWord.aiStartedAt = null;
  storedWord.aiClaimAt = null;
  engine = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: ["snow", "star", "river", "quartz", "harbor"] },
  });

  for (const key of "quart") {
    assert.equal(engine.handleCommand(HOST_SESSION, { op: "type.key", key }, word.expiresAt - 1).ok, true);
  }
  assert.equal(engine.snapshot(word.expiresAt - 1).words.some((candidate) => candidate.id === word.id), true);
  const expired = engine.handleCommand(HOST_SESSION, { op: "type.key", key: "z" }, word.expiresAt);
  assert.equal(expired.ok, true);
  assert.deepEqual(expired.events[0], { type: "typing.rejected", playerId: "pine-0", reason: "NO_MATCH" });
  assert.equal(engine.snapshot(word.expiresAt).words.some((candidate) => candidate.id === word.id), false);
  assert.deepEqual(engine.snapshot(word.expiresAt).typingByPlayer["pine-0"], { buffer: "", targetWordId: null });
  assert.equal(engine.snapshot(word.expiresAt).pendingAttacks.length, 0);
});

test("melting wins an exact-time tie with AI and old stored words receive expiry timestamps", () => {
  let engine = createEngine({ words: ["snow", "star", "river", "quartz"] });
  const startedAt = start(engine);
  let serialized = engine.serialize();
  serialized.state.words = [];
  serialized.state.nextSpawnAt = null;
  serialized.state.deferredEvents = [];
  engine = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: ["snow", "star", "river", "quartz"] },
  });
  const word = engine.spawnWord(startedAt + 1, "quartz", "normal");
  assert.ok(word);

  serialized = engine.serialize();
  const storedWord = serialized.state.words.find((candidate) => candidate.id === word.id);
  delete storedWord.landedAt;
  delete storedWord.expiresAt;
  storedWord.aiClaimAt = word.expiresAt;
  const restored = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: ["snow", "star", "river", "quartz"] },
  });
  const migrated = restored.snapshot(startedAt + 1).words.find((candidate) => candidate.id === word.id);
  assert.equal(migrated.expiresAt - migrated.landedAt, ROOM_ENGINE_CONSTANTS.wordGroundTtlMs);
  assert.equal(migrated.expiresAt, word.expiresAt);

  const due = restored.advance(migrated.expiresAt);
  assert.equal(due.events.length, 0);
  assert.equal(restored.snapshot(migrated.expiresAt).words.some((candidate) => candidate.id === word.id), false);
  assert.equal(restored.snapshot(migrated.expiresAt).pendingAttacks.length, 0);
});

test("match-ending attack emits at most one event per advance and defers match.ended", () => {
  let engine = createEngine({ words: ["snow", "star", "river"] });
  engine.handleCommand(HOST_SESSION, { op: "lobby.set_config", config: { pineSize: 1, berrySize: 1 } }, 1);
  const startedAt = start(engine);
  const claim = typeWord(engine, HOST_SESSION, "snow", startedAt + 10);
  const serialized = engine.serialize();
  const target = serialized.state.players.find((player) => player.id === claim.events[0].targetId);
  assert.ok(target);
  target.health = 1;
  engine = RoomEngine.restore(serialized, { random: () => 0.5, wordbooks: { winter: ["snow", "star", "river"] } });

  const hit = engine.advance(claim.events[0].resolveAt);
  assert.equal(hit.events.length, 1);
  assert.equal(hit.events[0].type, "attack.resolved");
  assert.equal(hit.events[0].winner, "pine");
  assert.equal(engine.snapshot(claim.events[0].resolveAt).phase, "ended");
  assert.equal(engine.nextDueAt(), 0);

  const ending = engine.advance(claim.events[0].resolveAt);
  assert.deepEqual(ending.events, [{ type: "match.ended", winner: "pine" }]);
  assert.equal(ending.events.length, 1);
});

test("damage and AI timing helpers preserve the existing game balance", () => {
  assert.deepEqual([1, 5, 6, 8, 9, 11, 12, 14, 24].map(calculateWordDamage), [10, 10, 11, 11, 12, 12, 13, 13, 13]);

  const midpoint = () => 0.5;
  const rookie = calculateAiTiming("rookie", "winter", 1_000, midpoint);
  const steady = calculateAiTiming("steady", "winter", 1_000, midpoint);
  const expert = calculateAiTiming("expert", "winter", 1_000, midpoint);
  assert.ok(expert.claimAt < steady.claimAt);
  assert.ok(steady.claimAt < rookie.claimAt);
  assert.ok(expert.startedAt >= 1_650 && expert.startedAt <= 2_150);
});

test("serialized state restores snapshots and scheduled deadlines", () => {
  const engine = createEngine();
  join(engine, 1, 10);
  engine.disconnect("guest-1", 20);
  const before = engine.snapshot(30, "guest-1");
  const restored = RoomEngine.restore(engine.serialize(), { random: () => 0.5, wordbooks: { winter: TEST_BOOK } });
  const after = restored.snapshot(30, "guest-1");
  assert.deepEqual(after, before);
  assert.equal(restored.nextDueAt(), 20 + ROOM_ENGINE_CONSTANTS.disconnectGraceMs);
});

test("restoring an old room migrates every role-based health pool to 100 HP proportionally", () => {
  const engine = createEngine();
  const serialized = engine.serialize();
  serialized.state.players[0].maxHealth = 130;
  serialized.state.players[0].health = 65;
  serialized.state.players[0].role = "tank";
  serialized.state.players[1].maxHealth = 70;
  serialized.state.players[1].health = 0;
  serialized.state.players[1].role = "striker";
  delete serialized.state.wordPoolVersion;
  delete serialized.state.frostWordBag;
  delete serialized.state.recentFrostWords;
  serialized.state.wordBag = ["legacy"];

  const restored = RoomEngine.restore(serialized, {
    random: () => 0.5,
    wordbooks: { winter: TEST_BOOK },
  });
  const players = restored.serialize().state.players;
  assert.ok(players.every((player) => player.maxHealth === 100 && !("role" in player)));
  assert.equal(players[0].health, 50);
  assert.equal(players[1].health, 0);
  assert.equal(restored.serialize().state.wordPoolVersion, ROOM_ENGINE_CONSTANTS.wordPoolVersion);
  assert.deepEqual(restored.serialize().state.wordBag, []);
  assert.deepEqual(restored.serialize().state.frostWordBag, []);
});

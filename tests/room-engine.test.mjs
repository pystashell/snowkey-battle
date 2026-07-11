import assert from "node:assert/strict";
import test from "node:test";

import {
  ROOM_ENGINE_CONSTANTS,
  RoomEngine,
  calculateAiTiming,
  calculateWordDamage,
} from "../shared/room-engine.ts";

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

  const ownMove = engine.handleCommand(
    "guest-1",
    { op: "lobby.move", playerId: guest.playerId, direction: 1 },
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

test("host can configure an asymmetric 1v4 room but cannot shrink over a human", () => {
  const engine = createEngine();
  const changed = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 1, berrySize: 4, snowfallLevel: "light" } },
    10,
  );
  assert.equal(changed.ok, true);
  const snapshot = engine.snapshot(10);
  assert.equal(snapshot.players.filter((player) => player.team === "pine").length, 1);
  assert.equal(snapshot.players.filter((player) => player.team === "berry").length, 4);

  const guest = join(engine, 1, 11);
  assert.equal(guest.ok, true);
  const moved = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.move", playerId: guest.playerId, direction: 1 },
    11,
  );
  assert.equal(moved.ok, true);
  const rejected = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { berrySize: 1 } },
    12,
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "TEAM_HAS_HUMANS");
});

test("join with the same credentials reconnects to the same seat during the grace period", () => {
  const engine = createEngine();
  const first = join(engine, 1, 10);
  assert.equal(first.ok, true);
  const playerId = first.playerId;

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
  assert.equal(replacement?.name, "团子");
  assert.equal(replacement?.badge, "团");
});

test("switching teams keeps the human name and gives the vacated AI a unique name", () => {
  const engine = createEngine({ name: "小雪球" });
  const switched = engine.handleCommand(HOST_SESSION, { op: "lobby.set_team", team: "berry" }, 5);
  assert.equal(switched.ok, true);
  const snapshot = engine.snapshot(5, HOST_SESSION);
  const self = snapshot.players.find((player) => player.id === snapshot.selfPlayerId);
  assert.equal(self?.name, "小雪球");
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

test("knocking out an attacker cancels every queued snowball that has not landed", () => {
  let engine = createEngine({ words: ["snow", "star", "river", "planet", "cocoa", "winter"] });
  const guest = join(engine, 1, 10);
  assert.equal(guest.ok, true);
  const configured = engine.handleCommand(
    HOST_SESSION,
    { op: "lobby.set_config", config: { pineSize: 2, berrySize: 1 } },
    20,
  );
  assert.equal(configured.ok, true);
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
  assert.ok(afterKnockout
    .filter((attack) => attack.attackerId === host.id)
    .every((attack) => attack.resolved));
});

test("damage uses the current frontline, clamps overkill, and advances to the next position", () => {
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

  const nextFront = engine.snapshot(claim.events[0].resolveAt).players
    .filter((player) => player.team === "berry" && player.health > 0)
    .sort((left, right) => left.position - right.position)[0];
  assert.equal(nextFront.position, 1);
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
  assert.deepEqual([1, 5, 6, 8, 9, 11, 12, 14].map(calculateWordDamage), [10, 10, 11, 11, 12, 12, 13, 13]);

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

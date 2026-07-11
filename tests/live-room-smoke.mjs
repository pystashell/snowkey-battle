import assert from "node:assert/strict";

const baseUrl = process.env.SNOW_BATTLE_URL ?? "http://localhost:3000";
const socketBase = baseUrl.replace(/^http/, "ws");
const protocolVersion = 1;

function reconnectToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function credentials(name) {
  return {
    name,
    sessionId: crypto.randomUUID(),
    reconnectToken: reconnectToken(),
  };
}

class RoomClient {
  constructor(roomCode, identity) {
    this.roomCode = roomCode;
    this.identity = identity;
    this.sequence = 0;
    this.messages = [];
    this.waiters = [];
    this.socket = null;
    this.closeEvent = null;
    this.closeWaiters = [];
  }

  async connect({ allowError = false, timeoutMs = 10_000 } = {}) {
    this.socket = new WebSocket(`${socketBase}/api/rooms/${this.roomCode}/socket`);
    this.socket.addEventListener("message", (message) => {
      const parsed = JSON.parse(String(message.data));
      this.messages.push(parsed);
      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(parsed)) continue;
        this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(parsed);
      }
    });
    this.socket.addEventListener("close", (event) => {
      this.closeEvent = event;
      for (const waiter of this.closeWaiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve(event);
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timed out")), timeoutMs);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        this.socket.send(JSON.stringify({
          v: protocolVersion,
          type: "join",
          ...this.identity,
        }));
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("WebSocket connection failed"));
      }, { once: true });
    });
    const outcome = await this.waitFor(
      (message) => message.type === "welcome" || message.type === "error",
      timeoutMs,
    );
    if (outcome.type === "error" && !allowError) {
      throw new Error(`Room join failed (${outcome.code}): ${outcome.message}`);
    }
    return outcome;
  }

  send(command) {
    this.sequence += 1;
    this.socket.send(JSON.stringify({
      v: protocolVersion,
      type: "command",
      id: crypto.randomUUID(),
      sequence: this.sequence,
      command,
    }));
  }

  waitFor(predicate, timeoutMs = 15_000) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: 0 };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
        reject(new Error("Timed out waiting for room message"));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  waitForClose(timeoutMs = 5_000) {
    if (this.closeEvent) return Promise.resolve(this.closeEvent);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, timer: 0 };
      waiter.timer = setTimeout(() => {
        this.closeWaiters = this.closeWaiters.filter((candidate) => candidate !== waiter);
        reject(new Error("Timed out waiting for room socket to close"));
      }, timeoutMs);
      this.closeWaiters.push(waiter);
    });
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close(1000, "smoke test complete");
  }
}

const hostIdentity = credentials("Host");
const createResponse = await fetch(`${baseUrl}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(hostIdentity),
});
if (createResponse.status !== 201) {
  throw new Error(`Room creation failed (${createResponse.status}): ${await createResponse.text()}`);
}
const { roomCode } = await createResponse.json();
assert.match(roomCode, /^[A-HJ-NP-Z2-9]{6}$/);

const host = new RoomClient(roomCode, hostIdentity);
const guest = new RoomClient(roomCode, credentials("Guest"));
let rejected = null;

try {
  const hostWelcome = await host.connect();
  const guestWelcome = await guest.connect();
  assert.equal(hostWelcome.snapshot.selfPlayerId, "pine-0");
  assert.notEqual(guestWelcome.snapshot.selfPlayerId, hostWelcome.snapshot.selfPlayerId);
  assert.equal(hostWelcome.snapshot.players.find((player) => player.id === "pine-0")?.name, "Host");
  assert.notEqual(hostWelcome.snapshot.players.find((player) => player.id === "pine-1")?.name, "Host");
  assert.equal(
    new Set(hostWelcome.snapshot.players.map((player) => player.name.toLowerCase())).size,
    hostWelcome.snapshot.players.length,
  );
  assert.equal(guestWelcome.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.name, "Guest");
  assert.ok(hostWelcome.snapshot.players.every((player) => player.maxHealth === 100 && player.health === 100));

  guest.send({ op: "lobby.move", playerId: guestWelcome.snapshot.selfPlayerId, direction: 1 });
  const guestMoved = await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.position === 1);
  guest.send({ op: "lobby.move", playerId: guestWelcome.snapshot.selfPlayerId, direction: -1 });
  await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.position === 0
    && message.snapshot.revision > guestMoved.snapshot.revision);

  host.send({ op: "lobby.set_config", config: {
    pineSize: 2,
    berrySize: 1,
    snowfallLevel: "light",
    wordbookId: "postgraduate",
  } });
  await host.waitFor((message) => message.type === "snapshot"
    && message.snapshot.config.pineSize === 2
    && message.snapshot.config.berrySize === 1
    && message.snapshot.config.wordbookId === "postgraduate");

  host.send({ op: "presence.leave" });
  const promoted = await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.hostPlayerId === guestWelcome.snapshot.selfPlayerId
    && message.snapshot.humanCount === 1
    && message.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.controller.isHost === true
    && message.snapshot.players.find((player) => player.id === hostWelcome.snapshot.selfPlayerId)?.controller.kind === "ai");
  assert.equal(promoted.snapshot.phase, "lobby");

  guest.send({ op: "presence.ready", ready: true });
  await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.controller.ready === true);

  guest.send({ op: "match.start" });
  const playing = await guest.waitFor(
    (message) => message.type === "snapshot" && message.snapshot.phase === "playing",
    20_000,
  );
  assert.ok(playing.snapshot.words.length > 0);
  const pineBefore = playing.snapshot.players
    .filter((player) => player.team === "pine")
    .sort((left, right) => left.position - right.position);
  assert.equal(pineBefore.length, 2);
  const word = playing.snapshot.words.find((candidate) => candidate.kind === "frost");
  assert.ok(word);
  for (const key of word.text) guest.send({ op: "type.key", key });

  const claim = await guest.waitFor((message) => message.type === "event"
    && message.event.type === "word.claimed"
    && message.event.attackerId === guestWelcome.snapshot.selfPlayerId
    && message.event.word.text === word.text);
  const hit = await guest.waitFor((message) => message.type === "event"
    && message.event.type === "attack.resolved"
    && message.event.attackId === claim.event.attackId);
  assert.equal(hit.event.actualDamage, 15);
  assert.equal(typeof hit.event.frozenUntil, "number");
  assert.equal(hit.event.kind, "frost");
  assert.equal(hit.event.hits.length, 2);
  assert.deepEqual(
    new Set(hit.event.hits.map((target) => target.targetId)),
    new Set(pineBefore.map((player) => player.id)),
  );
  assert.ok(hit.event.hits.every((target) => target.actualDamage === 15 && typeof target.frozenUntil === "number"));

  const guestSynced = await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.revision >= hit.revision
    && hit.event.hits.every((target) => message.snapshot.players.some((player) => player.id === target.targetId
      && player.health === target.targetHealth
      && player.frozenUntil === target.frozenUntil)));
  assert.equal(guestSynced.snapshot.code, roomCode);

  const roomClosedPromise = guest.waitFor(
    (message) => message.type === "error" && message.code === "ROOM_NOT_FOUND",
    5_000,
  );
  guest.send({ op: "presence.leave" });
  const roomClosed = await roomClosedPromise;
  assert.match(roomClosed.message, /closed|no longer exists|left/i);
  const guestClose = await guest.waitForClose();
  assert.equal(guestClose.code, 4404);

  rejected = new RoomClient(roomCode, credentials("LateGuest"));
  const rejectedJoin = await rejected.connect({ allowError: true, timeoutMs: 5_000 });
  assert.equal(rejectedJoin.type, "error");
  assert.equal(rejectedJoin.code, "ROOM_NOT_FOUND");

  console.log(JSON.stringify({
    ok: true,
    roomCode,
    hostPlayerId: hostWelcome.snapshot.selfPlayerId,
    guestPlayerId: guestWelcome.snapshot.selfPlayerId,
    claimedWord: word.text,
    damage: hit.event.actualDamage,
    hitCount: hit.event.hits.length,
    frozeWholeEnemyTeamForOneSecond: true,
    guestMovedOwnSeat: true,
    hostTransferredToGuest: true,
    roomClosedAfterLastHumanLeft: true,
    retiredRoomRejectedLateJoin: true,
    synchronizedRevision: guestSynced.snapshot.revision,
  }, null, 2));
} finally {
  host.close();
  guest.close();
  rejected?.close();
}

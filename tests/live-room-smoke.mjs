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
  }

  async connect() {
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
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timed out")), 10_000);
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
    return this.waitFor((message) => message.type === "welcome");
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

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close(1000, "smoke test complete");
  }
}

const hostIdentity = credentials("阿澄");
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
const guest = new RoomClient(roomCode, credentials("好友测试"));

try {
  const hostWelcome = await host.connect();
  const guestWelcome = await guest.connect();
  assert.equal(hostWelcome.snapshot.selfPlayerId, "pine-0");
  assert.notEqual(guestWelcome.snapshot.selfPlayerId, hostWelcome.snapshot.selfPlayerId);
  assert.equal(hostWelcome.snapshot.players.find((player) => player.id === "pine-0")?.name, "阿澄");
  assert.equal(hostWelcome.snapshot.players.find((player) => player.id === "pine-1")?.name, "阿澄AI");
  assert.equal(guestWelcome.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.name, "好友测试");
  assert.ok(hostWelcome.snapshot.players.every((player) => player.maxHealth === 100 && player.health === 100));

  guest.send({ op: "lobby.move", playerId: guestWelcome.snapshot.selfPlayerId, direction: 1 });
  const guestMoved = await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.position === 1);
  guest.send({ op: "lobby.move", playerId: guestWelcome.snapshot.selfPlayerId, direction: -1 });
  await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.players.find((player) => player.id === guestWelcome.snapshot.selfPlayerId)?.position === 0
    && message.snapshot.revision > guestMoved.snapshot.revision);

  host.send({ op: "lobby.set_config", config: {
    pineSize: 1,
    berrySize: 2,
    snowfallLevel: "light",
    wordbookId: "postgraduate",
  } });
  await host.waitFor((message) => message.type === "snapshot"
    && message.snapshot.config.pineSize === 1
    && message.snapshot.config.berrySize === 2
    && message.snapshot.config.wordbookId === "postgraduate");

  host.send({ op: "presence.ready", ready: true });
  guest.send({ op: "presence.ready", ready: true });
  await host.waitFor((message) => message.type === "snapshot" && message.snapshot.players
    .filter((player) => player.controller.kind === "human")
    .every((player) => player.controller.connected && player.controller.ready));

  host.send({ op: "match.start" });
  const playing = await host.waitFor((message) => message.type === "snapshot" && message.snapshot.phase === "playing", 20_000);
  assert.ok(playing.snapshot.words.length > 0);
  const berryBefore = playing.snapshot.players
    .filter((player) => player.team === "berry")
    .sort((left, right) => left.position - right.position);
  assert.equal(berryBefore.length, 2);
  const word = playing.snapshot.words.find((candidate) => candidate.kind === "frost");
  assert.ok(word);
  for (const key of word.text) host.send({ op: "type.key", key });

  const claim = await host.waitFor((message) => message.type === "event"
    && message.event.type === "word.claimed"
    && message.event.attackerId === hostWelcome.snapshot.selfPlayerId
    && message.event.word.text === word.text);
  const hit = await host.waitFor((message) => message.type === "event"
    && message.event.type === "attack.resolved"
    && message.event.attackId === claim.event.attackId);
  assert.equal(hit.event.actualDamage, 15);
  assert.equal(typeof hit.event.frozenUntil, "number");
  assert.equal(hit.event.kind, "frost");
  assert.equal(hit.event.hits.length, 2);
  assert.deepEqual(new Set(hit.event.hits.map((target) => target.targetId)), new Set(berryBefore.map((player) => player.id)));
  assert.ok(hit.event.hits.every((target) => target.actualDamage === 15 && typeof target.frozenUntil === "number"));

  const guestSynced = await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.revision >= hit.revision
    && hit.event.hits.every((target) => message.snapshot.players.some((player) => player.id === target.targetId
      && player.health === target.targetHealth
      && player.frozenUntil === target.frozenUntil)));
  assert.equal(guestSynced.snapshot.code, roomCode);

  host.send({ op: "presence.leave" });
  guest.send({ op: "presence.leave" });
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
    synchronizedRevision: guestSynced.snapshot.revision,
  }, null, 2));
} finally {
  host.close();
  guest.close();
}

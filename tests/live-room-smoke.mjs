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

const hostIdentity = credentials("房主测试");
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

  host.send({ op: "lobby.set_config", config: { pineSize: 1, berrySize: 1, snowfallLevel: "light" } });
  await host.waitFor((message) => message.type === "snapshot" && message.snapshot.config.pineSize === 1 && message.snapshot.config.berrySize === 1);

  host.send({ op: "presence.ready", ready: true });
  guest.send({ op: "presence.ready", ready: true });
  await host.waitFor((message) => message.type === "snapshot" && message.snapshot.players
    .filter((player) => player.controller.kind === "human")
    .every((player) => player.controller.connected && player.controller.ready));

  host.send({ op: "match.start" });
  const playing = await host.waitFor((message) => message.type === "snapshot" && message.snapshot.phase === "playing", 20_000);
  assert.ok(playing.snapshot.words.length > 0);
  const word = playing.snapshot.words[0];
  for (const key of word.text) host.send({ op: "type.key", key });

  const claim = await host.waitFor((message) => message.type === "event"
    && message.event.type === "word.claimed"
    && message.event.attackerId === hostWelcome.snapshot.selfPlayerId
    && message.event.word.text === word.text);
  const hit = await host.waitFor((message) => message.type === "event"
    && message.event.type === "attack.resolved"
    && message.event.attackId === claim.event.attackId);
  assert.ok(hit.event.actualDamage >= 10 && hit.event.actualDamage <= 15);

  const guestSynced = await guest.waitFor((message) => message.type === "snapshot"
    && message.snapshot.revision >= hit.revision
    && message.snapshot.players.some((player) => player.id === hit.event.targetId && player.health === hit.event.targetHealth));
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
    synchronizedRevision: guestSynced.snapshot.revision,
  }, null, 2));
} finally {
  host.close();
  guest.close();
}

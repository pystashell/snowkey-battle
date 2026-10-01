import assert from "node:assert/strict";
import test from "node:test";
import { GameRoom } from "../worker/GameRoom.ts";
import worker from "../worker/index.ts";
import { isCommandMessage } from "../shared/command-validation.ts";
import { COMMAND_BUDGET } from "../worker/rate-limit.ts";

const identity = { sessionId: "host-session", reconnectToken: "a".repeat(48), name: "Alice" };
const command = (op, sequence = 1) => ({ v: 1, type: "command", id: `cmd-${sequence}`, sequence, command: op });

class MemoryStorage {
  data = new Map();
  alarm = null;
  writes = 0;
  roomWrites = 0;
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) {
    this.writes++;
    for (const [entryKey, entryValue] of typeof key === "string" ? [[key, value]] : Object.entries(key)) {
      if (entryKey === "room") this.roomWrites++;
      this.data.set(entryKey, structuredClone(entryValue));
    }
  }
  async delete(key) { return this.data.delete(key); }
  async deleteAll() { this.data.clear(); }
  async getAlarm() { return this.alarm; }
  async setAlarm(value) { this.alarm = value; }
  async deleteAlarm() { this.alarm = null; }
  async transaction(callback) { return callback(this); }
}

class Socket {
  readyState = 1;
  sent = [];
  attachment = { joined: false, connectedAt: Date.now() };
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close(code) { this.readyState = 3; this.closeCode = code; }
}

async function instance(storage = new MemoryStorage(), sockets = []) {
  let ready;
  const context = { storage, blockConcurrencyWhile: (callback) => { ready = callback(); },
    getWebSockets: () => sockets.filter((socket) => socket.readyState !== 3),
    acceptWebSocket: (socket) => sockets.push(socket) };
  const room = new GameRoom(context, {});
  await ready;
  return { room, storage, sockets };
}

async function joined() {
  const harness = await instance();
  const response = await harness.room.fetch(new Request("https://game.test/internal/init", {
    method: "POST", headers: { "X-Room-Code": "ABC234" }, body: JSON.stringify(identity),
  }));
  assert.equal(response.status, 201);
  const socket = new Socket();
  harness.sockets.push(socket);
  await harness.room.webSocketMessage(socket, JSON.stringify({ v: 1, type: "join", ...identity }));
  assert.ok(socket.sent.some((message) => message.type === "welcome"));
  return { ...harness, socket };
}

async function reconnect(harness, credentials = identity) {
  const socket = new Socket();
  harness.sockets.push(socket);
  await harness.room.webSocketMessage(socket, JSON.stringify({ v: 1, type: "join", ...credentials }));
  return socket;
}

async function readyBurst(room, socket, first, count) {
  for (let sequence = first; sequence < first + count; sequence++) {
    await room.webSocketMessage(socket, JSON.stringify(command({ op: "presence.ready", ready: true }, sequence)));
  }
}

test("runtime validator rejects malformed arguments for every command family", () => {
  for (const op of [
    { op: "presence.ready", ready: "true" }, { op: "lobby.set_team", team: "constructor" },
    { op: "lobby.move", playerId: "pine-1", direction: 0 }, { op: "lobby.remove_ai", playerId: {} },
    { op: "lobby.remove_player", playerId: "__proto__" }, { op: "lobby.set_config", config: null },
    { op: "lobby.set_config", config: [] }, { op: "lobby.set_config", config: { pineSize: 1.5 } },
    { op: "lobby.set_config", config: { surprise: 1 } }, { op: "type.key", key: 1 },
    { op: "type.key", key: "snow" }, { op: "unknown" },
    ...["constructor", "toString", "__proto__"].flatMap((value) => [
      { op: "lobby.set_config", config: { wordbookId: value } },
      { op: "lobby.set_config", config: { snowfallLevel: value } },
      { op: "lobby.set_ai_level", playerId: "pine-1", level: value },
    ]),
  ]) assert.equal(isCommandMessage(command(op)), false, JSON.stringify(op));
  for (const sequence of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) assert.equal(isCommandMessage(command({ op: "ping" }, sequence)), false);
  for (const op of [
    { op: "presence.ready", ready: true }, { op: "presence.leave" }, { op: "lobby.set_team", team: "berry" },
    { op: "lobby.move", playerId: "pine-1", direction: -1 }, { op: "lobby.remove_ai", playerId: "berry-3" },
    { op: "lobby.remove_player", playerId: "pine-2" }, { op: "lobby.set_config", config: { wordbookId: "sat", pineSize: 4 } },
    { op: "lobby.set_ai_level", playerId: "pine-1", level: "expert" }, { op: "match.start" },
    { op: "match.restart" }, { op: "type.key", key: "S" }, { op: "type.cancel" }, { op: "sync.request" }, { op: "ping" },
  ]) assert.equal(isCommandMessage(command(op)), true, JSON.stringify(op));
});

test("invalid wire commands are refused before engine, storage or broadcast work", async () => {
  const { room, socket, storage } = await joined();
  const writes = storage.writes;
  const before = room.engine.serialize();
  socket.sent = [];
  await room.webSocketMessage(socket, JSON.stringify(command({ op: "lobby.set_config", config: { wordbookId: "constructor" } })));
  assert.equal(socket.sent.at(-1).code, "INVALID_COMMAND");
  assert.equal(storage.writes, writes);
  assert.deepEqual(room.engine.serialize(), before);
  assert.equal(socket.sent.some((message) => message.type === "snapshot"), false);
});

test("processed sequence is persisted and included in reconnect welcome and snapshots", async () => {
  const { room, socket, storage } = await joined();
  await room.webSocketMessage(socket, JSON.stringify(command({ op: "presence.ready", ready: true }, 500)));
  assert.equal(socket.sent.findLast((message) => message.type === "snapshot").snapshot.lastProcessedSequence, 500);
  const restored = await instance(storage);
  const next = new Socket();
  restored.sockets.push(next);
  await restored.room.webSocketMessage(next, JSON.stringify({ v: 1, type: "join", ...identity }));
  assert.equal(next.sent.find((message) => message.type === "welcome").snapshot.lastProcessedSequence, 500);
  await restored.room.webSocketMessage(next, JSON.stringify(command({ op: "lobby.set_config", config: { pineSize: 2 } }, 501)));
  assert.equal(next.sent.findLast((message) => message.type === "snapshot").snapshot.config.pineSize, 2);
});

test("a joined non-host cannot make malformed typing escape the WebSocket handler", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { room, socket: host, sockets, storage } = await joined();
  const guest = new Socket();
  sockets.push(guest);
  await room.webSocketMessage(guest, JSON.stringify({ v: 1, type: "join", ...identity, sessionId: "guest-session", name: "Bob" }));
  await room.webSocketMessage(guest, JSON.stringify(command({ op: "presence.ready", ready: true })));
  await room.webSocketMessage(host, JSON.stringify(command({ op: "match.start" })));
  t.mock.timers.tick(3000);
  await room.alarm();
  const writes = storage.writes;
  const before = room.engine.serialize();
  host.sent = [];
  await assert.doesNotReject(() => room.webSocketMessage(guest, JSON.stringify(command({ op: "type.key", key: { toString: null } }, 2))));
  assert.equal(guest.sent.at(-1).code, "INVALID_COMMAND");
  assert.equal(storage.writes, writes);
  assert.deepEqual(room.engine.serialize(), before);
  assert.equal(host.sent.length, 0);
});

test("the review's 200-cancel burst stops storage and fan-out at the socket budget", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { room, socket: host, sockets, storage } = await joined();
  const guest = new Socket();
  sockets.push(guest);
  await room.webSocketMessage(guest, JSON.stringify({ v: 1, type: "join", ...identity, sessionId: "guest-session", name: "Bob" }));
  await room.webSocketMessage(guest, JSON.stringify(command({ op: "presence.ready", ready: true })));
  await room.webSocketMessage(host, JSON.stringify(command({ op: "match.start" })));
  t.mock.timers.tick(3000);
  await room.alarm();
  const writes = storage.writes;
  const available = COMMAND_BUDGET.burst; // The countdown fully refilled the bucket.
  host.sent = [];
  guest.sent = [];
  for (let sequence = 2; sequence < 202; sequence++) {
    await room.webSocketMessage(guest, JSON.stringify(command({ op: "type.cancel" }, sequence)));
  }
  const accepted = guest.sent.filter((message) => message.type === "ack");
  const snapshots = host.sent.filter((message) => message.type === "snapshot").length;
  assert.equal(accepted.length, available);
  assert.equal(storage.writes - writes, available);
  assert.equal(snapshots, available);
  assert.equal(guest.closeCode, 4429);
  assert.equal(guest.sent.at(-1).code, "RATE_LIMITED");
  assert.equal(storage.data.get("room").lastSequenceBySession["guest-session"], accepted.at(-1).sequence);
  t.diagnostic(JSON.stringify({ commands: 200, accepted: accepted.length, storageWrites: storage.writes - writes,
    peerSnapshots: snapshots, note: "Fixed-clock runtime mock, not production throughput or billing." }));
});

test("command flood is refused before repeated persistence, and budget survives hibernation", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { room, socket, storage } = await joined();
  for (let i = 1; i < COMMAND_BUDGET.burst; i++) await room.webSocketMessage(socket, JSON.stringify(command({ op: "ping" }, i)));
  const restored = await instance(storage);
  restored.sockets.push(socket);
  const writes = storage.writes;
  await restored.room.webSocketMessage(socket, JSON.stringify(command({ op: "presence.ready", ready: true }, 100)));
  assert.equal(socket.sent.at(-1).code, "RATE_LIMITED");
  assert.equal(socket.closeCode, 4429);
  assert.equal(storage.writes, writes);
});

test("replacing a socket cannot reset the session's exhausted command budget", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const harness = await joined();
  const peer = await reconnect(harness, { ...identity, sessionId: "peer-session", name: "Bob" });
  await readyBurst(harness.room, harness.socket, 1, 79);
  assert.equal(harness.socket.sent.filter((message) => message.type === "ack").length, 79);
  const before = harness.room.engine.serialize();
  const writes = harness.storage.writes;
  peer.sent = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = await reconnect(harness);
    await readyBurst(harness.room, next, 80, 79);
    assert.equal(next.sent.at(-1).code, "RATE_LIMITED");
    assert.equal(next.closeCode, 4429);
    assert.equal(next.sent.some((message) => message.type === "welcome" || message.type === "ack"), false);
  }
  assert.equal(harness.storage.writes, writes);
  assert.equal(peer.sent.length, 0);
  assert.deepEqual(harness.room.engine.serialize(), before);
  assert.equal(harness.storage.data.get("room").lastSequenceBySession[identity.sessionId], 79);
});

test("session budgets survive reconstruction, refill by elapsed time, and preserve reconnect watermarks", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { room, socket, storage } = await joined();
  const self = socket.sent.find((message) => message.type === "welcome").snapshot.selfPlayerId;
  await readyBurst(room, socket, 1, 79);
  let restored = await instance(storage); // No old socket attachment to recover from.
  assert.equal((await reconnect(restored)).sent.at(-1).code, "RATE_LIMITED");
  t.mock.timers.tick(100); // Exactly three tokens: one rejoin and two commands.
  restored = await instance(storage);
  const next = await reconnect(restored);
  const welcome = next.sent.find((message) => message.type === "welcome");
  assert.equal(welcome.snapshot.selfPlayerId, self);
  assert.equal(welcome.snapshot.lastProcessedSequence, 79);
  await readyBurst(restored.room, next, 80, 3);
  assert.equal(next.sent.filter((message) => message.type === "ack").length, 2);
  assert.equal(next.sent.at(-1).code, "RATE_LIMITED");
  assert.equal(storage.data.get("room").lastSequenceBySession[identity.sessionId], 81);
  t.mock.timers.tick(3000);
  restored = await instance(storage);
  const refilled = await reconnect(restored);
  await readyBurst(restored.room, refilled, 82, 79);
  assert.equal(refilled.sent.filter((message) => message.type === "ack").length, 79);
});

test("read-only commands also retain their session budget after socket loss and reconstruction", async (t) => {
  for (const op of ["ping", "sync.request", "replay"]) {
    await t.test(op, async (subtest) => {
      subtest.mock.timers.enable({ apis: ["Date"], now: 100_000 });
      const { room, socket, storage } = await joined();
      const before = room.engine.serialize();
      for (let sequence = 1; sequence <= 79; sequence++) {
        await room.webSocketMessage(socket, JSON.stringify(command(
          op === "replay" ? { op: "presence.ready", ready: true } : { op },
          op === "replay" ? 1 : sequence,
        )));
      }
      const restored = await instance(storage);
      assert.equal((await reconnect(restored)).sent.at(-1).code, "RATE_LIMITED");
      if (op !== "replay") assert.deepEqual(room.engine.serialize(), before);
    });
  }
});

test("partial budgets are shared across authenticated sockets but independent between players", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const harness = await joined();
  await readyBurst(harness.room, harness.socket, 1, 70);
  const invalid = await reconnect(harness, { ...identity, reconnectToken: "b".repeat(48) });
  assert.equal(invalid.sent.at(-1).code, "INVALID_RECONNECT_TOKEN");
  assert.equal(harness.socket.readyState, 1);
  const next = await reconnect(harness);
  assert.equal(next.sent.find((message) => message.type === "welcome").snapshot.lastProcessedSequence, 70);
  await readyBurst(harness.room, next, 71, 9);
  assert.equal(next.sent.filter((message) => message.type === "ack").length, 8);
  assert.equal(next.sent.at(-1).code, "RATE_LIMITED");
  const peer = await reconnect(harness, { ...identity, sessionId: "peer-session", name: "Bob" });
  await readyBurst(harness.room, peer, 1, 79);
  assert.equal(peer.sent.filter((message) => message.type === "ack").length, 79);
});

test("leaving does not refresh a budget, and fully refilled or retired room budgets are cleaned up", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const harness = await joined();
  const peer = await reconnect(harness, { ...identity, sessionId: "peer-session", name: "Bob" });
  await readyBurst(harness.room, harness.socket, 1, 77);
  await harness.room.webSocketMessage(harness.socket, JSON.stringify(command({ op: "presence.leave" }, 78)));
  const next = await reconnect(harness);
  assert.ok(next.sent.some((message) => message.type === "welcome"));
  await readyBurst(harness.room, next, 79, 1);
  assert.equal(next.sent.at(-1).code, "RATE_LIMITED");
  assert.ok(harness.storage.alarm <= 102_667);
  t.mock.timers.tick(3000);
  await harness.room.alarm();
  assert.deepEqual(harness.storage.data.get("command-budgets"), {});
  const refilled = await reconnect(harness);
  await harness.room.webSocketMessage(refilled, JSON.stringify(command({ op: "presence.leave" }, 80)));
  await harness.room.webSocketMessage(peer, JSON.stringify(command({ op: "presence.leave" }, 1)));
  assert.equal(harness.storage.data.size, 0);
});

test("read-only traffic and budget cleanup never write or broadcast the full room", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const harness = await joined();
  const peer = await reconnect(harness, { ...identity, sessionId: "peer-session", name: "Bob" });
  const roomWrites = harness.storage.roomWrites;
  peer.sent = [];
  await harness.room.webSocketMessage(harness.socket, JSON.stringify(command({ op: "ping" })));
  assert.equal(harness.storage.roomWrites, roomWrites);
  t.mock.timers.tick(100);
  await harness.room.alarm();
  assert.equal(harness.storage.roomWrites, roomWrites);
  assert.equal(peer.sent.length, 0);
  assert.deepEqual(harness.storage.data.get("command-budgets"), {});
});

test("an existing room upgrades its hibernating socket budget without granting a new burst", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { room, socket, storage } = await joined();
  await readyBurst(room, socket, 1, 79);
  storage.data.delete("command-budgets"); // Storage format before session budgets existed.
  const upgraded = await instance(storage, [socket]);
  assert.equal((await reconnect(upgraded)).sent.at(-1).code, "RATE_LIMITED");
  assert.equal(storage.data.get("room").lastSequenceBySession[identity.sessionId], 79);
});

test("concurrent reconnects share the last available session token", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const harness = await joined();
  await readyBurst(harness.room, harness.socket, 1, 78);
  const results = await Promise.all([reconnect(harness), reconnect(harness)]);
  assert.equal(results.filter((socket) => socket.sent.some((message) => message.type === "welcome")).length, 1);
  assert.equal(results.filter((socket) => socket.sent.at(-1).code === "RATE_LIMITED").length, 1);
});

test("Worker upgrade admission and room session budgets independently constrain reconnections", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  // Real Worker routing and GameRoom handlers, with only runtime I/O replaced.
  // This is an integration harness, not a deployed WebSocket/network test.
  const NativeResponse = globalThis.Response;
  const originalPair = Object.getOwnPropertyDescriptor(globalThis, "WebSocketPair");
  globalThis.Response = class extends NativeResponse {
    constructor(body, init) {
      if (init?.status === 101) return { status: 101, webSocket: init.webSocket };
      super(body, init);
    }
  };
  globalThis.WebSocketPair = class {
    constructor() {
      this[0] = new Socket();
      this[1] = new Socket();
      this[0].peer = this[1];
    }
  };
  t.after(() => {
    globalThis.Response = NativeResponse;
    if (originalPair) Object.defineProperty(globalThis, "WebSocketPair", originalPair);
    else delete globalThis.WebSocketPair;
  });
  const objects = new Map();
  const routed = [];
  const env = { GAME_ROOMS: { getByName(name) {
    routed.push(name);
    return { fetch: async (request) => {
      if (!objects.has(name)) objects.set(name, await instance());
      return objects.get(name).room.fetch(request);
    } };
  } } };
  const headers = { Origin: "https://game.test", "CF-Connecting-IP": "192.0.2.10" };
  const created = await worker.fetch(new Request("https://game.test/api/rooms", {
    method: "POST", headers, body: JSON.stringify(identity),
  }), env, {});
  assert.equal(created.status, 201);
  const { roomCode } = await created.json();
  const target = `https://game.test/api/rooms/${roomCode}/socket`;
  const upgrade = (address = "192.0.2.10") => worker.fetch(new Request(target, {
    headers: { ...headers, Upgrade: "websocket", "CF-Connecting-IP": address },
  }), env, {});
  const first = await upgrade();
  assert.equal(first.status, 101);
  const harness = objects.get(roomCode);
  await harness.room.webSocketMessage(first.webSocket.peer, JSON.stringify({ v: 1, type: "join", ...identity }));
  await readyBurst(harness.room, first.webSocket.peer, 1, 79);
  const writes = harness.storage.writes;
  const second = await upgrade("192.0.2.11"); // Fresh address budget still cannot reset the session.
  assert.equal(second.status, 101);
  await harness.room.webSocketMessage(second.webSocket.peer, JSON.stringify({ v: 1, type: "join", ...identity }));
  assert.equal(second.webSocket.peer.sent.at(-1).code, "RATE_LIMITED");
  assert.equal(harness.storage.writes, writes);
  for (let index = 1; index < 30; index++) {
    const admitted = await upgrade();
    assert.equal(admitted.status, 101);
    admitted.webSocket.peer.close(1000);
  }
  const beforeDenied = routed.length;
  const denied = await upgrade();
  assert.equal(denied.status, 429);
  assert.equal(routed.length, beforeDenied + 1); // Only admission; no room route.
  assert.match(routed.at(-1), /^admission:join:/);
  const beforeForeign = routed.length;
  const foreign = await worker.fetch(new Request(target, {
    headers: { ...headers, Upgrade: "websocket", Origin: "https://other.test" },
  }), env, {});
  assert.equal(foreign.status, 403);
  assert.equal(routed.length, beforeForeign);
});

test("admission budgets survive object reconstruction, refill, and expire", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { room, storage } = await instance();
  const request = () => new Request("https://room.internal/internal/admission/create", { method: "POST" });
  for (let i = 0; i < 8; i++) assert.equal((await room.fetch(request())).status, 200);
  const restored = await instance(storage);
  const limited = await restored.room.fetch(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "10");
  t.mock.timers.tick(10_000);
  assert.equal((await restored.room.fetch(request())).status, 200);
  t.mock.timers.tick(600_000);
  await restored.room.alarm();
  assert.equal(storage.data.has("admission"), false);
});

test("Worker rejects cross-origin requests first and checks budgets before routing to rooms", async () => {
  const names = [];
  const env = { GAME_ROOMS: { getByName(name) {
    names.push(name);
    return { fetch: async () => new Response("limited", { status: 429 }) };
  } } };
  for (const [path, method, headers] of [["/api/rooms", "POST", {}], ["/api/rooms/ABC234/socket", "GET", { Upgrade: "websocket" }]]) {
    const foreign = await worker.fetch(new Request(`https://game.test${path}`, { method, headers: { ...headers, Origin: "https://other.test" } }), env, {});
    assert.equal(foreign.status, 403);
    assert.equal(names.length, 0);
    const limited = await worker.fetch(new Request(`https://game.test${path}`, { method, headers: { ...headers, Origin: "https://game.test", "CF-Connecting-IP": "192.0.2.10" } }), env, {});
    assert.equal(limited.status, 429);
    assert.match(names.pop(), /^admission:(create|join):[a-f0-9]{64}$/);
  }
});

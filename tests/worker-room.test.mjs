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
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.writes++; this.data.set(key, structuredClone(value)); }
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

async function instance(storage = new MemoryStorage()) {
  let ready;
  const sockets = [];
  const context = { storage, blockConcurrencyWhile: (callback) => { ready = callback(); }, getWebSockets: () => sockets };
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

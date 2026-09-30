import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act, useEffect } from "react";
import { createRoot } from "react-dom/client";
const { useRoomSocket } = await import(process.env.SNOW_SOCKET_TEST_MODULE ?? "../app/useRoomSocket.ts");

class Socket {
  static OPEN = 1;
  static CLOSING = 2;
  static instances = [];
  readyState = 0;
  sent = [];
  listeners = new Map();
  constructor() { Socket.instances.push(this); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  emit(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  send(data) { this.sent.push(JSON.parse(data)); }
  open() { this.readyState = 1; this.emit("open"); }
  message(message) { this.emit("message", { data: JSON.stringify({ v: 1, ...message }) }); }
  close() { this.readyState = 2; } // Deliberately never fires close: simulates a half-open network.
  disconnect() { this.readyState = 3; this.emit("close", { code: 1006 }); }
}

const snapshot = (revision = 1, lastProcessedSequence = -1) => ({
  revision, serverTime: Date.now(), code: "ABC234", lastProcessedSequence,
  phase: "lobby", words: [], players: [], typingByPlayer: {}, pendingAttacks: [],
});

async function mount(t, options = {}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/" });
  const restoreGlobals = [];
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, WebSocket: Socket, IS_REACT_ACT_ENVIRONMENT: true })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restoreGlobals.push(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  if (options.storageBlocked) {
    Object.defineProperty(dom.window, "localStorage", { get() { throw new Error("storage denied"); } });
  }
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  dom.window.setTimeout = (...args) => setTimeout(...args);
  dom.window.clearTimeout = (...args) => clearTimeout(...args);
  dom.window.setInterval = (...args) => setInterval(...args);
  dom.window.clearInterval = (...args) => clearInterval(...args);
  Socket.instances = [];
  let room;
  const events = [];
  const renderedEvents = [];
  const seen = new Set();
  function Harness() {
    room = useRoomSocket({ onEvent: (event) => events.push(event) });
    const deliveries = room.events;
    const legacyEvent = room.lastEvent;
    useEffect(() => {
      const pending = deliveries?.map((delivery) => delivery.event) ?? (legacyEvent ? [legacyEvent] : []);
      for (const event of pending) {
        if (!seen.has(event)) { seen.add(event); renderedEvents.push(event); }
      }
    }, [deliveries, legacyEvent]);
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root"));
  await act(() => root.render(createElement(Harness)));
  t.after(async () => { await act(() => root.unmount()); dom.window.close(); restoreGlobals.forEach((restore) => restore()); });
  await act(() => { room.joinRoom("ABC234", "Alice"); });
  const socket = Socket.instances.at(-1);
  await act(() => {
    socket.open();
    socket.message({ type: "welcome", reconnectToken: "token", snapshot: snapshot() });
  });
  return { get room() { return room; }, socket, events, renderedEvents };
}

test("same-session reconnect retains sequence when storage throws", async (t) => {
  const client = await mount(t, { storageBlocked: true });
  for (let i = 0; i < 50; i++) client.room.sendCommand({ op: "type.key", key: "s" });
  await act(() => { client.socket.disconnect(); t.mock.timers.tick(600); });
  const next = Socket.instances.at(-1);
  assert.notEqual(next, client.socket);
  await act(() => { next.open(); next.message({ type: "welcome", reconnectToken: "token", snapshot: snapshot() }); });
  assert.equal(client.room.sendCommand({ op: "type.key", key: "r" }).sequence, 51);
});

test("welcome reconciles a restored server sequence before allowing input", async (t) => {
  const client = await mount(t);
  await act(() => client.socket.message({ type: "welcome", reconnectToken: "token", snapshot: snapshot(2, 500) }));
  assert.equal(client.room.sendCommand({ op: "type.key", key: "s" }).sequence, 501);
  await act(() => { client.room.joinRoom("DEF234", "Alice"); });
  const next = Socket.instances.at(-1);
  await act(() => { next.open(); next.message({ type: "welcome", reconnectToken: "token", snapshot: snapshot() }); });
  assert.equal(client.room.sendCommand({ op: "ping" }).sequence, 1);
});

test("an OPEN socket receiving no frames reconnects even without a close event", async (t) => {
  const client = await mount(t);
  await act(() => t.mock.timers.tick(46_000));
  assert.equal(client.room.connected, false);
  await act(() => t.mock.timers.tick(11_000));
  assert.ok(Socket.instances.length > 1);
});

test("all events in a revision survive both filtering and React batching", async (t) => {
  const client = await mount(t);
  const events = [
    { type: "match.started", startedAt: Date.now() },
    { type: "typing.rejected", playerId: "pine-0", reason: "FROZEN" },
  ];
  await act(() => {
    events.forEach((event, eventIndex) => client.socket.message({ type: "event", revision: 5, eventIndex, serverTime: Date.now(), event }));
    client.socket.message({ type: "event", revision: 5, eventIndex: 1, serverTime: Date.now(), event: events[1] });
  });
  assert.deepEqual(client.events, events);
  assert.deepEqual(client.room.events.map((delivery) => delivery.event), events);
  await act(() => client.room.consumeEvents(client.room.events.at(-1).id));
  assert.deepEqual(client.room.events, []);
});

test("consecutive revisions in one React batch both reach the rendered consumer", async (t) => {
  const client = await mount(t);
  const events = [
    { type: "match.started", startedAt: Date.now() },
    { type: "typing.rejected", playerId: "pine-0", reason: "FROZEN" },
  ];
  await act(() => events.forEach((event, index) => client.socket.message({
    type: "event", revision: 5 + index, eventIndex: 0, serverTime: Date.now(), event,
  })));
  assert.deepEqual(client.renderedEvents, events);
});

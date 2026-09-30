import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { RoomEngine } from "../shared/room-engine.ts";

// Mount the actual game, socket hook and input; only browser transport/time are fake.
const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/", pretendToBeVisual: true });
for (const key of ["window", "document", "Element", "HTMLElement", "KeyboardEvent"]) {
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.self = window;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: SnowballGame } = await import("../app/SnowballGame.tsx");
const { LanguageProvider } = await import("../app/LanguageContext.tsx");

class Socket {
  static OPEN = 1;
  static CLOSING = 2;
  static instances = [];
  readyState = 0;
  listeners = new Map();
  sent = [];
  constructor() { Socket.instances.push(this); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; }
  message(message) { this.emit("message", { data: JSON.stringify({ v: 1, ...message }) }); }
}
globalThis.WebSocket = Socket;

async function mount(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: 100_000 });
  window.setTimeout = (...args) => setTimeout(...args);
  window.clearTimeout = (...args) => clearTimeout(...args);
  window.setInterval = (...args) => setInterval(...args);
  window.clearInterval = (...args) => clearInterval(...args);
  window.requestAnimationFrame = (callback) => setTimeout(callback, 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.localStorage.clear();
  Socket.instances = [];
  const root = createRoot(document.getElementById("root"));
  t.after(async () => { await act(() => root.unmount()); });
  await act(() => root.render(createElement(LanguageProvider, { initialLanguage: "en" }, createElement(SnowballGame))));
  await act(() => t.mock.timers.tick(0)); // Finish initial auto-resume before a user can join.
  const click = async (name) => act(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === name);
    assert.ok(button, `button ${name}`);
    button.click();
  });
  const input = async (label, value) => act(() => {
    const node = document.querySelector(`input[aria-label="${label}"]`);
    assert.ok(node, `input ${label}`);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(node, value);
    node.dispatchEvent(new window.InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  });
  await click("Online with Friends");
  await input("Online player name", "Tester");
  await input("Enter room code", "ABC234");
  await click("→ Join Room");
  const socket = Socket.instances.at(-1);
  await act(() => { socket.readyState = 1; socket.emit("open"); });
  const identity = socket.sent[0];
  const engine = RoomEngine.create({ code: "ABC234", ...identity, now: 96_000,
    random: () => 0.5, wordbooks: { cet4: ["snow", "river", "planet", "accountability", "counterpoint"] } });
  engine.handleCommand(identity.sessionId, { op: "lobby.set_config", config: { pineSize: 1, berrySize: 1 } }, 96_001);
  engine.handleCommand(identity.sessionId, { op: "match.start" }, 97_000);
  engine.advance(100_000);
  let snapshot = engine.snapshot(100_000, identity.sessionId);
  let revision = snapshot.revision;
  await act(() => socket.message({ type: "welcome", reconnectToken: identity.reconnectToken, snapshot }));
  const receive = async (patch = {}, events = []) => act(() => {
    revision++;
    for (const { event, serverTime = Date.now() } of events) socket.message({ type: "event", revision, serverTime, event });
    snapshot = { ...snapshot, ...patch, revision, serverTime: Date.now() };
    socket.message({ type: "snapshot", snapshot });
  });
  const advance = async (ms) => act(() => t.mock.timers.tick(ms));
  const pending = (id, startsAt, word = "oldround") => ({ id, word, kind: "normal", damage: 10,
    attackerId: "pine-0", targetId: "berry-0", targetIds: ["berry-0"],
    startsAt, throwAt: startsAt + 900, resolveAt: startsAt + 1510, resolved: false });
  const accuracy = () => document.querySelector(".stat-card--right strong")?.textContent;
  const welcomeAgain = async () => act(() => socket.message({ type: "welcome", reconnectToken: identity.reconnectToken,
    snapshot: { ...snapshot, serverTime: Date.now() } }));
  return { receive, advance, pending, accuracy, input, welcomeAgain, get snapshot() { return snapshot; } };
}

test("online rematch cancels queued animations before returning to the lobby", async (t) => {
  const game = await mount(t);
  await game.receive({ pendingAttacks: Array.from({ length: 8 }, (_, id) => game.pending(id, Date.now() + id * 1850)) });
  await game.advance(1);
  assert.ok(document.querySelector(".catch-effect"), "the original round really scheduled animation");
  await game.receive({ phase: "ended", winner: "pine", pendingAttacks: [] });
  await game.receive({ phase: "lobby", startedAt: null, winner: null });
  await game.advance(1900);
  assert.equal(document.querySelectorAll(".catch-effect, .projectile, .kid.is-catch, .kid.is-hold, .kid.is-windup, .kid.is-throw").length, 0);
  await game.receive({ phase: "countdown", countdownEndsAt: Date.now() + 3000 });
  assert.equal(document.querySelectorAll(".catch-effect, .projectile, .kid.is-catch, .kid.is-hold, .kid.is-windup, .kid.is-throw").length, 0, "lobby callbacks must not reappear when the arena remounts");
  await game.advance(3000);
  await game.receive({ phase: "playing", startedAt: Date.now(), countdownEndsAt: null, pendingAttacks: [game.pending(100, Date.now(), "newround")] });
  await game.advance(901);
  assert.equal(document.querySelectorAll(".projectile").length, 1, "the next round throws at server time");
  assert.match(document.querySelector(".projectile").textContent, /newround/);
});

test("online rematch resets both key counters but same-match snapshots preserve accuracy", async (t) => {
  const game = await mount(t);
  const word = game.snapshot.words.find((item) => item.kind === "normal");
  await game.input("English word input", word.text[0]);
  await game.input("English word input", word.text[0] + "z");
  assert.equal(game.accuracy(), "50%");
  await game.receive();
  assert.equal(game.accuracy(), "50%", "same-round synchronization must preserve statistics");
  await game.welcomeAgain();
  assert.equal(game.accuracy(), "50%", "same-round reconnect must preserve statistics");
  await game.receive({ phase: "ended", winner: "pine", pendingAttacks: [] });
  await game.receive({ phase: "lobby", startedAt: null, winner: null });
  await game.advance(3000);
  await game.receive({ phase: "playing", startedAt: Date.now() });
  assert.equal(game.accuracy(), "100%");
  await game.input("English word input", "z");
  assert.equal(game.accuracy(), "0%", "correct keys from the old round must also be cleared");
});

test("a new match snapshot rejects old callbacks and batched events even if lobby was missed", async (t) => {
  const game = await mount(t);
  const oldAttack = game.pending(1, Date.now() + 2000);
  await game.receive({ pendingAttacks: [oldAttack] });
  await game.advance(100);
  const oldTime = Date.now() - 1;
  await game.receive({ startedAt: Date.now(), pendingAttacks: [] }, [{ serverTime: oldTime,
    event: { type: "word.claimed", ...oldAttack, attackId: 2, playerId: "pine-0", word: { ...game.snapshot.words[0], text: "staleevent" } } }]);
  await game.advance(3000);
  assert.equal(document.querySelectorAll(".catch-effect, .projectile, .kid.is-catch, .kid.is-hold, .kid.is-windup, .kid.is-throw").length, 0);
});

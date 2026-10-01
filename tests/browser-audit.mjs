import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { finishMatchByTyping } from "./helpers/browser-match.mjs";

const baseUrl = process.env.SNOW_BATTLE_URL;
if (!baseUrl) throw new Error("Set SNOW_BATTLE_URL to the explicitly selected local/test server.");
const { chromium } = await import(process.env.SNOW_PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.SNOW_BROWSER_PATH ? { executablePath: process.env.SNOW_BROWSER_PATH } : {}) });
await mkdir("test-results", { recursive: true });
const errors = [];
const evidence = { target: baseUrl, checks: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(20); }
  throw new Error(`Timed out: ${label}`);
}

async function client(name) {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const state = { context, page, snapshot: null, messages: [], holdNextKey: false, held: null, outgoing: [] };
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${name}: ${message.text()}`); });
  await page.routeWebSocket("**/api/rooms/*/socket", (route) => {
    const server = route.connectToServer();
    state.route = route;
    state.server = server;
    route.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "command") state.outgoing.push(message);
      if (state.holdNextKey && message.command?.op === "type.key") {
        state.holdNextKey = false;
        state.held = raw;
      } else server.send(raw);
    });
    server.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      state.messages.push(message);
      if (message.snapshot) {
        state.snapshot = message.snapshot;
        if (message.snapshot.phase === "playing") state.lastPlayingSnapshot = message.snapshot;
      }
      // Release a real final keystroke only after the real server frost impact.
      if (state.held && message.event?.type === "attack.resolved" && message.event.kind === "frost") {
        server.send(state.held);
        state.held = null;
      }
      route.send(raw);
    });
  });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Online with Friends", exact: true }).click();
  await page.getByRole("textbox", { name: "Online player name", exact: true }).fill(name);
  return state;
}

try {
  const host = await client("AuditA");
  await host.page.getByRole("button", { name: "+ Create New Room", exact: true }).click();
  await until(() => host.snapshot?.phase === "lobby", "host welcome");
  const guest = await client("AuditB");
  await guest.page.getByRole("textbox", { name: "Enter room code", exact: true }).fill(host.snapshot.code);
  await guest.page.getByRole("button", { name: "→ Join Room", exact: true }).click();
  await until(() => guest.snapshot?.humanCount === 2, "two humans");
  await host.page.getByLabel("Online Pine team size", { exact: true }).selectOption("1");
  await host.page.getByLabel("Online Berry team size", { exact: true }).selectOption("1");
  await host.page.getByLabel("Online wordbook", { exact: true }).selectOption("winter");
  await host.page.getByLabel("Online snowfall density", { exact: true }).selectOption("light");
  await until(() => guest.snapshot?.config.wordbookId === "winter" && guest.snapshot?.config.snowfallLevel === "light", "config synchronization");
  await guest.page.getByRole("button", { name: "I'm Ready", exact: true }).click();
  await host.page.getByRole("button", { name: /Host Starts Match/ }).click();
  await until(() => host.snapshot?.phase === "playing" && guest.snapshot?.phase === "playing", "both clients playing");
  const hostInput = host.page.getByRole("textbox", { name: "English word input", exact: true });
  const guestInput = guest.page.getByRole("textbox", { name: "English word input", exact: true });
  const normal = host.snapshot.words.find((word) => word.kind === "normal");
  const frost = host.snapshot.words.find((word) => word.kind === "frost");
  assert.ok(normal && frost);
  await hostInput.pressSequentially(normal.text.slice(0, -1), { delay: 30 });
  await until(() => host.snapshot.typingByPlayer[host.snapshot.selfPlayerId]?.buffer === normal.text.slice(0, -1), "prefix accepted");
  host.holdNextKey = true;
  await hostInput.pressSequentially(normal.text.at(-1));
  await until(() => host.held, "final letter delayed");
  const visibleWord = host.page.locator(".snow-word").filter({ hasText: normal.text });
  await until(async () => await visibleWord.count() === 0, "optimistic word hidden");
  await guestInput.fill(frost.text); // Text input only, with no letter keydown.
  await until(() => host.messages.some((message) => message.event?.type === "typing.rejected" && message.event.reason === "FROZEN"), "real server rejects delayed final letter");
  await until(async () => await visibleWord.count() === 1, "rejected prediction visible again");
  assert.ok(host.snapshot.words.some((word) => word.id === normal.id));
  evidence.checks.push("physical keyboard input; text-only input; real frost rejection restores a hidden word");
  await host.page.screenshot({ path: "test-results/audit-prediction-restored.png", fullPage: true });

  await until(() => Date.now() >= host.snapshot.players.find((player) => player.id === host.snapshot.selfPlayerId).frozenUntil, "freeze ends");
  await hostInput.press("Escape");
  const nextWord = host.snapshot.words.find((word) => word.kind === "normal");
  await hostInput.fill(nextWord.text);
  await until(() => host.snapshot.pendingAttacks.some((attack) => attack.attackerId === host.snapshot.selfPlayerId), "host claim accepted");
  const attack = host.snapshot.pendingAttacks.find((item) => item.attackerId === host.snapshot.selfPlayerId);
  // Reload after launch: welcome must recover flight progress, without replaying catch/pack.
  await until(() => Date.now() >= attack.throwAt + 80, "attack is already in flight");
  guest.snapshot = null;
  await guest.page.reload();
  await until(() => guest.snapshot?.phase === "playing", "guest resumes match");
  assert.ok(guest.snapshot.pendingAttacks.some((item) => item.id === attack.id));
  await until(async () => await guest.page.locator(".projectile").count() > 0, "resumed throw animates", 4_000);
  const animationDelay = await guest.page.locator(".projectile").first().evaluate((node) => parseFloat(node.style.animationDelay));
  assert.ok(animationDelay < 0, "reconnected flight starts at its elapsed progress");
  await guest.page.screenshot({ path: "test-results/audit-reconnected-throw.png", fullPage: true });
  await until(() => guest.snapshot.players.find((player) => player.id === guest.snapshot.selfPlayerId).health < 100, "resumed attack hits");
  evidence.checks.push("reload restores a pending authoritative throw and both clients receive the impact");

  // Exercise the existing compact keyboard through pointer input at a mobile viewport.
  await guest.page.setViewportSize({ width: 390, height: 844 });
  const compactToggle = guest.page.getByRole("button", { name: "Switch to compact keyboard", exact: true });
  const compactInput = guest.page.getByRole("textbox", { name: "Compact keyboard English input", exact: true });
  // Resize-driven React state can render after setViewportSize resolves.
  await until(async () => await compactToggle.count() > 0 || await compactInput.count() > 0, "mobile keyboard controls");
  if (await compactToggle.count()) await compactToggle.click();
  await until(async () => await compactInput.count() === 1, "compact keyboard");
  const compactWord = guest.snapshot.words.find((word) => word.kind === "normal");
  assert.ok(compactWord);
  const guestClaims = guest.snapshot.players.find((player) => player.id === guest.snapshot.selfPlayerId).claims;
  for (const letter of compactWord.text) await guest.page.locator(".compact-keyboard").getByRole("button", { name: letter, exact: true }).click();
  await until(() => guest.snapshot.players.find((player) => player.id === guest.snapshot.selfPlayerId).claims > guestClaims, "compact keyboard claim");
  await guest.page.screenshot({ path: "test-results/audit-mobile-keyboard.png", fullPage: true });
  evidence.checks.push("mobile compact keyboard claims a word through the real server");

  // Make first-round accuracy observably imperfect before checking the rematch.
  await hostInput.press("Escape");
  const wrongInitial = [..."abcdefghijklmnopqrstuvwxyz"].find((letter) => !host.snapshot.words.some((word) => word.text.startsWith(letter)));
  assert.ok(wrongInitial);
  await hostInput.fill(wrongInitial.repeat(10));

  // Finish a real 1v1 match; the two browsers must agree on health and winner.
  await finishMatchByTyping({ input: hostInput, getSnapshot: () => host.snapshot });
  await until(() => host.snapshot.phase === "ended" && guest.snapshot.phase === "ended", "both browsers finish", 15_000);
  assert.equal(host.snapshot.winner, guest.snapshot.winner);
  assert.deepEqual(host.snapshot.players.map((player) => [player.id, player.health]), guest.snapshot.players.map((player) => [player.id, player.health]));
  evidence.checks.push("two isolated browsers complete a match with identical health and winner");
  evidence.winner = host.snapshot.winner;
  evidence.health = host.snapshot.players.map((player) => ({ id: player.id, health: player.health }));
  await host.page.screenshot({ path: "test-results/audit-match-ended.png", fullPage: true });
  const accuracy = () => host.page.locator(".stat-card--right strong").innerText();
  const previousAccuracy = await accuracy();
  assert.notEqual(previousAccuracy, "100%");
  const previousStart = host.snapshot.startedAt;
  const queuedBeforeEnd = host.lastPlayingSnapshot.pendingAttacks.filter((item) => item.throwAt > host.lastPlayingSnapshot.serverTime).length;
  assert.ok(queuedBeforeEnd > 0, "the finished match had unthrown attacks to cancel");
  await host.page.getByRole("button", { name: "Return to Room Lobby", exact: true }).click();
  await until(() => host.snapshot.phase === "lobby" && guest.snapshot.phase === "lobby", "both clients return to lobby");
  await guest.page.getByRole("button", { name: "I'm Ready", exact: true }).click();
  await host.page.getByRole("button", { name: /Host Starts Match/ }).click();
  await until(() => host.snapshot.phase === "countdown", "rematch countdown");
  const countdownDeadline = Date.now() + 6000;
  while (host.snapshot.phase === "countdown" && Date.now() < countdownDeadline) {
    assert.equal(await host.page.locator(".catch-effect, .projectile").count(), 0, "no old animation during countdown");
    await sleep(50);
  }
  await until(() => host.snapshot.phase === "playing" && guest.snapshot.phase === "playing", "both clients rematch");
  assert.notEqual(host.snapshot.startedAt, previousStart);
  assert.equal(await accuracy(), "100%");
  const rematchWord = host.snapshot.words.find((word) => word.kind === "normal");
  await hostInput.fill(rematchWord.text);
  await until(() => host.snapshot.pendingAttacks.some((item) => item.attackerId === host.snapshot.selfPlayerId), "new round claim");
  await until(async () => await host.page.locator(".projectile").count() === 1, "new round throws without old queue delay", 3000);
  await until(() => guest.snapshot.players.find((player) => player.id === guest.snapshot.selfPlayerId).health < 100, "new round impact");
  evidence.rematch = { queuedBeforeEnd, previousAccuracy, accuracyAtStart: "100%", recoveredThrow: true };
  evidence.checks.push("online rematch clears queued effects, resets accuracy, and throws on the new server timeline");
  await host.page.screenshot({ path: "test-results/audit-rematch.png", fullPage: true });
  // Existing canonical metadata points local preview favicons at the production
  // origin; the existing same-origin CSP blocks that icon. Keep it in evidence.
  const knownPreviewWarning = (message) => message.includes("Loading the image 'https://snow-fighting-game.pystashell.workers.dev/favicon.svg' violates the following Content Security Policy directive:");
  evidence.knownPreviewWarnings = [...new Set(errors.filter(knownPreviewWarning))];
  evidence.consoleErrors = errors.filter((message) => !knownPreviewWarning(message));
  assert.deepEqual(evidence.consoleErrors, []);
  evidence.ok = true;
  await writeFile("test-results/audit-browser.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.ok = false;
  evidence.error = error.message;
  evidence.consoleErrors = errors;
  await writeFile("test-results/audit-browser.json", JSON.stringify(evidence, null, 2));
  for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    if (page) {
      await page.screenshot({ path: `test-results/audit-failure-${index}.png`, fullPage: true }).catch(() => {});
      console.error((await page.locator("body").innerText()).slice(-3000));
    }
  }
  throw error;
} finally {
  await browser.close();
}

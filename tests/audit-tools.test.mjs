import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";
import { finishMatchByTyping } from "./helpers/browser-match.mjs";
import { AuditInconclusiveError, recordAuditEvidence } from "./helpers/audit-evidence.mjs";

function matchHarness() {
  let time = 100_000;
  const snapshot = { phase: "playing", words: [{ text: "flurry", expiresAt: time + 10_000 }] };
  const calls = [];
  const input = {
    async isEnabled() { return true; },
    async press(key) { calls.push(key); },
    async fill(word) { calls.push(word); snapshot.phase = "ended"; },
  };
  return {
    input, snapshot, calls,
    run: () => finishMatchByTyping({ input, getSnapshot: () => snapshot, now: () => time, sleep: async (ms) => { time += ms; } }),
  };
}

function inputTimeout() {
  return Object.assign(new Error("locator.fill: element is not enabled"), { name: "TimeoutError" });
}

test("a match ending after isEnabled does not attempt another input", async () => {
  const harness = matchHarness();
  harness.input.isEnabled = async () => { harness.snapshot.phase = "ended"; return true; };
  await harness.run();
  assert.deepEqual(harness.calls, []);
});

test("a match ending during Escape skips fill without aborting the caller", async () => {
  const harness = matchHarness();
  let fillCalled = false;
  harness.input.press = async () => { harness.snapshot.phase = "ended"; };
  harness.input.fill = async () => { fillCalled = true; throw inputTimeout(); };
  await harness.run();
  assert.equal(harness.snapshot.phase, "ended");
  assert.equal(fillCalled, false);
});

test("an in-flight fill that loses the end-of-match race has a short bounded timeout", async () => {
  const harness = matchHarness();
  let waited = 0;
  harness.input.fill = async (_word, options) => {
    harness.snapshot.phase = "ended";
    waited += options?.timeout ?? 30_000;
    throw inputTimeout();
  };
  await harness.run();
  assert.ok(waited > 0 && waited <= 1500, `Input would have waited ${waited} ms`);
  assert.equal(harness.snapshot.phase, "ended");
});

test("input timeouts while the server is still playing remain failures", async () => {
  const harness = matchHarness();
  const error = inputTimeout();
  harness.input.fill = async () => { throw error; };
  await assert.rejects(harness.run(), (actual) => actual === error);
});

test("unrelated errors are not hidden even if the match has ended", async () => {
  const harness = matchHarness();
  const error = new Error("Browser connection closed");
  harness.input.fill = async () => { harness.snapshot.phase = "ended"; throw error; };
  await assert.rejects(harness.run(), (actual) => actual === error);
});

test("normal match input continues through the same helper", async () => {
  const harness = matchHarness();
  await harness.run();
  assert.deepEqual(harness.calls, ["Escape", "flurry"]);
  assert.equal(harness.snapshot.phase, "ended");
});

async function artifactDirectory(t) {
  const root = resolve("test-results");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "audit-tools-"));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), root);
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("inconclusive and failed diagnostics survive a subsequent successful retry", async (t) => {
  const directory = await artifactDirectory(t);
  const reports = [];
  const options = { directory, report: (json) => reports.push(JSON.parse(json)) };
  const evidence = { target: "http://game.test", elapsedMs: 2300, debits: 116,
    availableUpperBound: 149, rounds: [{ joined: true, accepted: 112 }, { joined: true, accepted: 2 }] };
  const slow = new AuditInconclusiveError("Rapid reconnect window exceeded two seconds");
  const first = structuredClone(evidence);
  await assert.rejects(recordAuditEvidence(first, async () => { throw slow; }, options), (error) => error === slow);
  const failure = new Error("Unexpected room response");
  const second = structuredClone(evidence);
  await assert.rejects(recordAuditEvidence(second, async () => { throw failure; }, options), (error) => error === failure);
  const success = { ...structuredClone(evidence), elapsedMs: 1300, availableUpperBound: 119 };
  await recordAuditEvidence(success, async () => {}, options);

  for (const [record, status] of [[first, "inconclusive"], [second, "failed"], [success, "passed"]]) {
    const saved = JSON.parse(await readFile(record.artifact, "utf8"));
    assert.equal(saved.status, status);
    assert.equal(saved.elapsedMs, record.elapsedMs);
    assert.equal(saved.debits, 116);
    assert.deepEqual(saved.rounds, evidence.rounds);
  }
  assert.equal((await readdir(directory)).length, 4); // Three attempts plus latest.
  assert.equal(JSON.parse(await readFile(join(directory, "session-budget-live.json"), "utf8")).status, "passed");
  assert.deepEqual(reports.map((report) => report.status), ["inconclusive", "failed", "passed"]);
});

test("early audit failures still save partial diagnostics and remain failures", async (t) => {
  const directory = await artifactDirectory(t);
  const evidence = { target: "http://game.test", stage: "create-room", elapsedMs: null, debits: 0, rounds: [] };
  await assert.rejects(recordAuditEvidence(evidence, async () => { throw new Error("HTTP 429"); }, {
    directory, report: () => {},
  }), /HTTP 429/);
  const saved = JSON.parse(await readFile(evidence.artifact, "utf8"));
  assert.equal(saved.status, "failed");
  assert.equal(saved.stage, "create-room");
  assert.equal(saved.elapsedMs, null);
  assert.equal(saved.debits, 0);
  assert.deepEqual(saved.rounds, []);
});

test("the live CLI preserves diagnostics and fails when its real reconnect window is inconclusive", { timeout: 15_000 }, async (t) => {
  const directory = await artifactDirectory(t);
  // A controlled network fixture, not the GameRoom implementation. Delay the
  // first welcome so the unchanged two-second cutoff must reject the run.
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(201, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ roomCode: "ABC234" }));
  });
  const sockets = new WebSocketServer({ server });
  let connections = 0;
  sockets.on("connection", (socket) => {
    const index = ++connections;
    let delay;
    socket.on("close", () => clearTimeout(delay));
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "join") {
        const welcome = () => socket.send(JSON.stringify({ type: "welcome",
          snapshot: { selfPlayerId: "pine-0", lastProcessedSequence: -1 } }));
        if (index === 1) delay = setTimeout(welcome, 2100);
        else welcome();
      } else socket.close(4429, "Fixture budget exhausted");
    });
  });
  t.after(async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const target = `http://127.0.0.1:${server.address().port}`;
  const script = resolve("tests/live-room-rate-limit.mjs");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: directory, env: { ...process.env, SNOW_BATTLE_URL: target }, windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /AuditInconclusiveError/);
  const saved = JSON.parse(await readFile(join(directory, "test-results/session-budget-live.json"), "utf8"));
  assert.equal(saved.status, "inconclusive");
  assert.equal(saved.stage, "rapid-reconnect");
  assert.ok(saved.elapsedMs >= 2000);
  assert.equal(saved.debits, 2);
  assert.ok(saved.availableUpperBound >= saved.debits);
  assert.equal(saved.rounds.length, 2);
  assert.ok(saved.rounds.every((round) => round.joined && round.accepted === 0 && round.closeCode === 4429));
  assert.equal(connections, 2, "Inconclusive runs must not proceed to refill/admission or pass");
  assert.deepEqual(JSON.parse(await readFile(join(directory, saved.artifact), "utf8")), saved);
});

import assert from "node:assert/strict";
import WebSocket from "ws";
import { AuditInconclusiveError, recordAuditEvidence } from "./helpers/audit-evidence.mjs";

const baseUrl = process.env.SNOW_BATTLE_URL;
if (!baseUrl) throw new Error("Set SNOW_BATTLE_URL to the explicitly selected test server.");
const identity = { sessionId: crypto.randomUUID(), reconnectToken: crypto.randomUUID(), name: "Budget" };
let socketUrl;
const clients = [];

function connect({ rapid = false } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl, { origin: new URL(baseUrl).origin });
    const messages = [];
    const client = { socket, messages, rapid, status: null, outcome: null, closeCode: null };
    clients.push(client);
    const timeout = setTimeout(() => reject(new Error("Room connection timed out")), 10_000);
    client.closed = new Promise((done) => {
      socket.once("close", (code) => {
        clearTimeout(timeout);
        client.closeCode = code;
        if (!client.outcome && (client.status === null || client.status === 101)) {
          reject(new Error(`WebSocket closed before welcome (${code})`));
        }
        done(code);
      });
    });
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      client.status = response.statusCode;
      response.resume();
      socket.terminate();
      resolve(client);
    });
    socket.once("open", () => {
      client.status = 101;
      socket.send(JSON.stringify({ v: 1, type: "join", ...identity }));
    });
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      messages.push(message);
      if (!client.outcome && (message.type === "welcome" || message.type === "error")) {
        clearTimeout(timeout);
        client.outcome = message;
        resolve(client);
      }
    });
  });
}

async function within(promise) {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Room response timed out")), 10_000);
    })]);
  } finally { clearTimeout(timeout); }
}

function send(socket, sequence, op = { op: "presence.ready", ready: true }) {
  socket.send(JSON.stringify({ v: 1, type: "command", id: `budget-${sequence}`, sequence, command: op }));
}

const evidence = { target: baseUrl, stage: "create-room", rounds: [], elapsedMs: null, debits: 0, availableUpperBound: null };
let rapidStarted = null;
let rapidFinished = null;

function captureRapidEvidence() {
  if (rapidStarted === null) return;
  const elapsedMs = (rapidFinished ?? performance.now()) - rapidStarted;
  evidence.rounds = clients.filter((client) => client.rapid).map((client) => ({
    joined: client.messages.some((message) => message.type === "welcome"),
    accepted: client.messages.filter((message) => message.type === "ack").length,
    status: client.status,
    closeCode: client.closeCode,
    errorCode: client.messages.findLast((message) => message.type === "error")?.code ?? null,
  }));
  evidence.elapsedMs = Math.round(elapsedMs);
  evidence.debits = evidence.rounds.reduce((total, round) => total + Number(round.joined) + round.accepted, 0);
  evidence.availableUpperBound = 80 + Math.ceil(elapsedMs * 30 / 1000);
}

async function runAudit() {
  const created = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(baseUrl).origin },
    body: JSON.stringify(identity),
  });
  assert.equal(created.status, 201);
  const { roomCode } = await created.json();
  socketUrl = `${baseUrl.replace(/^http/, "ws")}/api/rooms/${roomCode}/socket`;
  evidence.stage = "rapid-reconnect";
  rapidStarted = performance.now();
  let nextSequence = 1;
  let lastProcessed = -1;
  let self;
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = await connect({ rapid: true });
    assert.equal(client.status, 101, "The admission budget should allow these first two connections");
    if (client.outcome.type === "welcome") {
      self ??= client.outcome.snapshot.selfPlayerId;
      assert.equal(client.outcome.snapshot.selfPlayerId, self);
      assert.equal(client.outcome.snapshot.lastProcessedSequence, lastProcessed);
      for (let index = 0; index < 200; index++) send(client.socket, nextSequence++);
    }
    assert.equal(await within(client.closed), 4429);
    const accepted = client.messages.filter((message) => message.type === "ack");
    lastProcessed = accepted.at(-1)?.sequence ?? lastProcessed;
  }
  rapidFinished = performance.now();
  captureRapidEvidence(); // Capture before assertions, including inconclusive runs.
  assert.ok(evidence.debits <= evidence.availableUpperBound,
    `Reconnect reset the budget: ${evidence.debits} debits exceed ${evidence.availableUpperBound} available tokens`);
  // A slow run may legitimately refill an entire burst and cannot prove this regression.
  if (rapidFinished - rapidStarted >= 2000) {
    throw new AuditInconclusiveError("Test took too long to distinguish a reset from refill; rerun on an idle local server");
  }

  evidence.stage = "refill";
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const recovered = await connect();
  assert.equal(recovered.status, 101);
  assert.equal(recovered.outcome.type, "welcome");
  assert.equal(recovered.outcome.snapshot.selfPlayerId, self);
  assert.equal(recovered.outcome.snapshot.lastProcessedSequence, lastProcessed);
  const acknowledged = new Promise((resolve) => recovered.socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === "ack" && message.sequence === nextSequence) resolve(message);
  }));
  send(recovered.socket, nextSequence, { op: "presence.leave" });
  await within(acknowledged);
  await within(recovered.closed);
  evidence.refillAndWatermark = "passed";

  // Actual HTTP upgrade requests must still hit the address admission budget.
  // The room is already retired, so accepted upgrades cannot mutate a live game.
  evidence.stage = "admission";
  for (let attempt = 1; attempt <= 60; attempt++) {
    const client = await connect();
    if (client.status === 429) {
      evidence.admissionRejectedAfter = attempt;
      break;
    }
    assert.equal(client.status, 101);
    assert.equal(client.outcome.code, "ROOM_NOT_FOUND");
    await within(client.closed);
  }
  assert.ok(evidence.admissionRejectedAfter, "Address admission did not reject repeated upgrades");
  evidence.stage = "complete";
}

await recordAuditEvidence(evidence, async () => {
  try {
    await runAudit();
  } finally {
    captureRapidEvidence();
    for (const { socket } of clients) if (socket.readyState < WebSocket.CLOSING) socket.terminate();
  }
});

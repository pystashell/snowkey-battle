import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import WebSocket from "ws";

const baseUrl = process.env.SNOW_BATTLE_URL;
if (!baseUrl) throw new Error("Set SNOW_BATTLE_URL to the explicitly selected test server.");
const identity = { sessionId: crypto.randomUUID(), reconnectToken: crypto.randomUUID(), name: "Budget" };
const created = await fetch(`${baseUrl}/api/rooms`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(baseUrl).origin },
  body: JSON.stringify(identity),
});
assert.equal(created.status, 201);
const { roomCode } = await created.json();
const socketUrl = `${baseUrl.replace(/^http/, "ws")}/api/rooms/${roomCode}/socket`;
const clients = [];

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl, { origin: new URL(baseUrl).origin });
    const messages = [];
    const client = { socket, messages };
    clients.push(client);
    const timeout = setTimeout(() => reject(new Error("Room connection timed out")), 10_000);
    client.closed = new Promise((done) => {
      socket.once("close", (code) => { clearTimeout(timeout); done(code); });
    });
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      response.resume();
      socket.terminate();
      resolve({ ...client, status: response.statusCode });
    });
    socket.once("open", () => socket.send(JSON.stringify({ v: 1, type: "join", ...identity })));
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      messages.push(message);
      if (message.type === "welcome" || message.type === "error") {
        clearTimeout(timeout);
        resolve({ ...client, status: 101, outcome: message });
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

const evidence = { target: baseUrl, rounds: [] };
try {
  const started = performance.now();
  let nextSequence = 1;
  let spent = 0;
  let lastProcessed = -1;
  let self;
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = await connect();
    assert.equal(client.status, 101, "The admission budget should allow these first two connections");
    if (client.outcome.type === "welcome") {
      spent++;
      self ??= client.outcome.snapshot.selfPlayerId;
      assert.equal(client.outcome.snapshot.selfPlayerId, self);
      assert.equal(client.outcome.snapshot.lastProcessedSequence, lastProcessed);
      for (let index = 0; index < 200; index++) send(client.socket, nextSequence++);
    }
    assert.equal(await within(client.closed), 4429);
    const accepted = client.messages.filter((message) => message.type === "ack");
    spent += accepted.length;
    lastProcessed = accepted.at(-1)?.sequence ?? lastProcessed;
    evidence.rounds.push({ accepted: accepted.length, joined: client.outcome.type === "welcome" });
  }
  const elapsedMs = performance.now() - started;
  const available = 80 + Math.ceil(elapsedMs * 30 / 1000);
  assert.ok(spent <= available, `Reconnect reset the budget: ${spent} debits exceed ${available} available tokens`);
  // A slow run may legitimately refill an entire burst and cannot prove this regression.
  assert.ok(elapsedMs < 2000, "Test took too long to distinguish a reset from refill; rerun on an idle local server");
  evidence.elapsedMs = Math.round(elapsedMs);
  evidence.debits = spent;
  evidence.availableUpperBound = available;

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
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/session-budget-live.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  for (const { socket } of clients) if (socket.readyState < WebSocket.CLOSING) socket.terminate();
}

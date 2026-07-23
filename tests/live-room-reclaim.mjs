import assert from "node:assert/strict";
import WebSocket from "ws";

const baseUrl = process.env.SNOW_BATTLE_URL ?? "http://localhost:3000";
const socketBase = baseUrl.replace(/^http/, "ws");
const protocolVersion = 1;
const disconnectGraceMs = 60_000;
const alarmSettleMs = 8_000;

function credentials(name) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
  return {
    name,
    sessionId: crypto.randomUUID(),
    reconnectToken: Array.from(
      tokenBytes,
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}

function waitForOpen(socket, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timed out")), timeoutMs);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket connection failed"));
    }, { once: true });
  });
}

function waitForMessage(socket, predicate, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for room message"));
    }, timeoutMs);
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

function waitForClose(socket, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket close timed out")), timeoutMs);
    socket.addEventListener("close", (event) => {
      clearTimeout(timer);
      resolve(event);
    }, { once: true });
  });
}

async function connect(roomCode, identity) {
  const socket = new WebSocket(`${socketBase}/api/rooms/${roomCode}/socket`);
  await waitForOpen(socket);
  const outcomePromise = waitForMessage(
    socket,
    (message) => message.type === "welcome" || message.type === "error",
  );
  socket.send(JSON.stringify({
    v: protocolVersion,
    type: "join",
    ...identity,
  }));
  return { socket, outcome: await outcomePromise };
}

const hostIdentity = credentials("ReclaimProbe");
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

let hostSocket = null;
let lateSocket = null;
try {
  const host = await connect(roomCode, hostIdentity);
  hostSocket = host.socket;
  assert.equal(host.outcome.type, "welcome");
  assert.equal(host.outcome.snapshot.humanCount, 1);

  const closePromise = waitForClose(hostSocket);
  hostSocket.terminate();
  await closePromise;
  const disconnectedAt = Date.now();

  await new Promise((resolve) => {
    setTimeout(resolve, disconnectGraceMs + alarmSettleMs);
  });

  const late = await connect(roomCode, credentials("LateProbe"));
  lateSocket = late.socket;
  assert.equal(late.outcome.type, "error");
  assert.equal(late.outcome.code, "ROOM_NOT_FOUND");

  console.log(JSON.stringify({
    ok: true,
    roomCode,
    disconnectedWithoutLeave: true,
    elapsedMs: Date.now() - disconnectedAt,
    lateJoinResult: late.outcome.code,
  }, null, 2));
} finally {
  if (hostSocket?.readyState === WebSocket.OPEN) hostSocket.terminate();
  if (lateSocket?.readyState === WebSocket.OPEN) lateSocket.terminate();
}

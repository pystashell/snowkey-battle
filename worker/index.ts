/** Cloudflare Worker entry point for the vinext-starter template. */
import handler from "vinext/server/app-router-entry";
import {
  type CreateRoomRequest,
  type CreateRoomResponse,
  isRoomCode,
} from "../shared/game-protocol";
import { GameRoom } from "./GameRoom";

export { GameRoom };

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CREATE_BODY_BYTES = 2 * 1024;
const MAX_ROOM_CODE_ATTEMPTS = 12;

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  GAME_ROOMS: DurableObjectNamespace;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function createRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte & 31]).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAllowedOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return origin === null || origin === new URL(request.url).origin;
}

function isCreateRoomRequest(value: unknown): value is CreateRoomRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.sessionId === "string" &&
    value.sessionId.length >= 8 &&
    value.sessionId.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value.sessionId) &&
    typeof value.reconnectToken === "string" &&
    value.reconnectToken.length >= 24 &&
    value.reconnectToken.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value.reconnectToken) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 64
  );
}

async function createRoom(request: Request, env: Env) {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CREATE_BODY_BYTES) {
    return jsonResponse({ error: "Request body is too large" }, 413);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_CREATE_BODY_BYTES) {
    return jsonResponse({ error: "Request body is too large" }, 413);
  }

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!isCreateRoomRequest(value)) {
    return jsonResponse({ error: "Invalid room credentials" }, 400);
  }

  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const roomCode = createRoomCode();
    const stub = env.GAME_ROOMS.getByName(roomCode);
    const initRequest = new Request(new URL("/internal/init", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Room-Code": roomCode,
      },
      body: JSON.stringify(value),
    });
    const response = await stub.fetch(initRequest);

    if (response.status === 201) {
      const body: CreateRoomResponse = { roomCode };
      return jsonResponse(body, 201);
    }
    if (response.status !== 409) {
      console.error("Unable to initialize game room", response.status, await response.text());
      return jsonResponse({ error: "Unable to initialize room" }, 500);
    }
  }

  return jsonResponse({ error: "Unable to allocate a room code" }, 503);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") {
        return new Response(null, { status: 405, headers: { Allow: "POST" } });
      }
      if (!hasAllowedOrigin(request)) return jsonResponse({ error: "Origin not allowed" }, 403);
      return createRoom(request, env);
    }

    const socketMatch = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/socket$/.exec(url.pathname);
    if (socketMatch) {
      const roomCode = socketMatch[1];
      if (!isRoomCode(roomCode)) return jsonResponse({ error: "Invalid room code" }, 400);
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return jsonResponse({ error: "Expected WebSocket upgrade" }, 426);
      }
      if (!hasAllowedOrigin(request)) return jsonResponse({ error: "Origin not allowed" }, 403);
      return env.GAME_ROOMS.getByName(roomCode).fetch(request);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

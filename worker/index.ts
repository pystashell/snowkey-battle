/** Cloudflare Worker entry point for SnowKey Battle. */
import handler from "vinext/server/app-router-entry";
import {
  type CreateRoomRequest,
  type CreateRoomResponse,
  isRoomCode,
} from "../shared/game-protocol";
import { GameRoom } from "./GameRoom";
import { checkAdmission } from "./rate-limit";

export { GameRoom };

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CREATE_BODY_BYTES = 2 * 1024;
const MAX_ROOM_CODE_ATTEMPTS = 12;
const DOCUMENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const COMMON_SECURITY_HEADERS = {
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...COMMON_SECURITY_HEADERS,
    },
  });
}

function secureDocumentResponse(response: Response, requestUrl: URL) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (headers.get("Content-Type")?.toLowerCase().includes("text/html")) {
    const isChatGptSite = requestUrl.hostname.endsWith(".chatgpt.site");
    headers.set(
      "Content-Security-Policy",
      `${DOCUMENT_SECURITY_POLICY}${isChatGptSite ? "" : "; frame-ancestors 'none'"}`,
    );
    if (!isChatGptSite) {
      headers.set("X-Frame-Options", "DENY");
    }
  }
  if (requestUrl.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
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

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CREATE_BODY_BYTES) {
        await reader.cancel();
        return jsonResponse({ error: "Request body is too large" }, 413);
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const rawBody = new TextDecoder().decode(bytes);

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
      console.error(JSON.stringify({
        event: "room.initialize.failed",
        status: response.status,
        detail: await response.text(),
      }));
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

    if (url.pathname === "/api/rooms/health") {
      if (request.method !== "GET") {
        return new Response(null, { status: 405, headers: { Allow: "GET" } });
      }
      const room = env.GAME_ROOMS.getByName("room-health-check");
      return room.fetch(new Request(new URL("/internal/health", request.url)));
    }

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") {
        return new Response(null, { status: 405, headers: { Allow: "POST" } });
      }
      if (!hasAllowedOrigin(request)) return jsonResponse({ error: "Origin not allowed" }, 403);
      const admission = await checkAdmission(request, env, "create");
      if (!admission.ok) return admission;
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
      const admission = await checkAdmission(request, env, "join");
      if (!admission.ok) return admission;
      return env.GAME_ROOMS.getByName(roomCode).fetch(request);
    }

    const response = await handler.fetch(request, env, ctx);
    return secureDocumentResponse(response, url);
  },
} satisfies ExportedHandler<Env>;

export default worker;

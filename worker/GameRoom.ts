import { WORD_BOOKS } from "../app/wordbooks";
import { RoomEngine } from "../shared/room-engine";
import {
  GAME_PROTOCOL_VERSION,
  type CommandMessage,
  type CreateRoomRequest,
  type JoinMessage,
  type RoomEvent,
  type ServerMessage,
} from "../shared/game-protocol";

const STORED_ROOM_KEY = "room";
const STORED_ROOM_SCHEMA_VERSION = 1;
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const JOIN_TIMEOUT_MS = 10 * 1000;
const MAX_SOCKET_CONNECTIONS = 16;
const MAX_CLIENT_MESSAGE_BYTES = 4 * 1024;
const MAX_NAME_LENGTH = 8;
const ROOM_ENGINE_OPTIONS = {
  wordbooks: {
    winter: WORD_BOOKS.winter.words,
    cet4: WORD_BOOKS.cet4.words,
    cet6: WORD_BOOKS.cet6.words,
    postgraduate: WORD_BOOKS.postgraduate.words,
    toefl: WORD_BOOKS.toefl.words,
    sat: WORD_BOOKS.sat.words,
    mixed: WORD_BOOKS.mixed.words,
  },
} as const;

type GameRoomEnv = Record<string, never>;
type SerializedRoom = ReturnType<RoomEngine["serialize"]>;

type StoredRoom = {
  schemaVersion: typeof STORED_ROOM_SCHEMA_VERSION;
  engine: SerializedRoom;
  lastActivityAt: number;
  lastSequenceBySession: Record<string, number>;
  kickedSessionIds?: string[];
};

type SocketAttachment = {
  joined: boolean;
  sessionId: string | null;
  playerId: string | null;
  lastSequence: number;
  connectedAt: number;
};

type MutationResult = ReturnType<RoomEngine["advance"]>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCredential(value: unknown, minimumLength: number, maximumLength: number) {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

function isJoinMessage(value: unknown): value is JoinMessage {
  if (!isRecord(value)) return false;
  return (
    value.v === GAME_PROTOCOL_VERSION &&
    value.type === "join" &&
    isCredential(value.sessionId, 8, 128) &&
    isCredential(value.reconnectToken, 24, 128) &&
    normalizeName(value.name) !== null
  );
}

function isCommandMessage(value: unknown): value is CommandMessage {
  if (!isRecord(value) || !isRecord(value.command)) return false;
  return (
    value.v === GAME_PROTOCOL_VERSION &&
    value.type === "command" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    Number.isSafeInteger(value.sequence) &&
    Number(value.sequence) >= 0 &&
    typeof value.command.op === "string"
  );
}

function defaultAttachment(connectedAt = Date.now()): SocketAttachment {
  return {
    joined: false,
    sessionId: null,
    playerId: null,
    lastSequence: -1,
    connectedAt,
  };
}

export class GameRoom {
  private readonly ctx: DurableObjectState;
  private engine: RoomEngine | null = null;
  private retiring = false;
  private lastActivityAt = 0;
  private lastSequenceBySession: Record<string, number> = {};
  private kickedSessionIds: string[] = [];

  constructor(ctx: DurableObjectState, env: GameRoomEnv) {
    this.ctx = ctx;
    void env;

    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<StoredRoom>(STORED_ROOM_KEY);
      if (!stored || stored.schemaVersion !== STORED_ROOM_SCHEMA_VERSION) return;

      try {
        this.engine = RoomEngine.restore(stored.engine, ROOM_ENGINE_OPTIONS);
        this.lastActivityAt = stored.lastActivityAt;
        this.lastSequenceBySession = stored.lastSequenceBySession ?? {};
        this.kickedSessionIds = (stored.kickedSessionIds ?? []).filter((sessionId) => typeof sessionId === "string");
        const now = Date.now();
        if (now >= this.lastActivityAt + ROOM_IDLE_TTL_MS) {
          await this.retireRoom(
            "ROOM_EXPIRED",
            "This room expired after being idle.",
            "Room expired",
          );
          return;
        }
        const result = this.engine.advance(now);

        if (this.hasNoHumans(now)) {
          await this.retireRoom(
            "ROOM_NOT_FOUND",
            "This room closed because no human players remained.",
            "Room empty",
          );
          return;
        }

        await this.persist();
        this.broadcastMutation(result, now);
        await this.scheduleNextAlarm();
      } catch (error) {
        console.error("Unable to restore game room", error);
        this.engine = null;
        this.lastActivityAt = 0;
        this.lastSequenceBySession = {};
        this.kickedSessionIds = [];
        if ((await ctx.storage.getAlarm()) !== null) await ctx.storage.deleteAlarm();
        await ctx.storage.deleteAll();
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/internal/health") {
      return jsonResponse({ ok: true, service: "game-room" });
    }

    if (request.method === "POST" && url.pathname === "/internal/init") {
      return this.initialize(request);
    }

    if (request.method === "GET" && /\/api\/rooms\/[A-HJ-NP-Z2-9]{6}\/socket$/.test(url.pathname)) {
      return this.openSocket(request);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }

  async webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    if (typeof rawMessage !== "string") {
      this.sendError(socket, "UNSUPPORTED_MESSAGE", "Only JSON text messages are accepted.");
      this.closeSocket(socket, 4400, "JSON text required");
      return;
    }

    if (new TextEncoder().encode(rawMessage).byteLength > MAX_CLIENT_MESSAGE_BYTES) {
      this.sendError(socket, "MESSAGE_TOO_LARGE", "The message exceeds the 4 KiB limit.");
      this.closeSocket(socket, 4409, "Message too large");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      this.sendError(socket, "INVALID_JSON", "The message is not valid JSON.");
      this.closeSocket(socket, 4400, "Invalid JSON");
      return;
    }

    const attachment = this.readAttachment(socket);
    if (!attachment.joined) {
      if (!isJoinMessage(parsed)) {
        this.sendError(socket, "JOIN_REQUIRED", "The first message must be a valid join message.");
        this.closeSocket(socket, 4401, "Join required");
        return;
      }
      await this.join(socket, parsed);
      return;
    }

    if (!isCommandMessage(parsed)) {
      this.sendError(socket, "INVALID_COMMAND", "The command envelope is invalid.");
      return;
    }

    await this.handleCommand(socket, attachment, parsed);
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    void wasClean;
    const explicitlyLeft = code === 1000 && reason === "left room";
    await this.disconnectSocket(socket, explicitlyLeft);
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    console.error("Game room WebSocket error", error);
    await this.disconnectSocket(socket);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.closeExpiredPendingSockets(now);
    if (!this.engine) return;

    if (now >= this.lastActivityAt + ROOM_IDLE_TTL_MS) {
      await this.retireRoom("ROOM_EXPIRED", "This room expired after being idle.", "Room expired");
      return;
    }

    const result = this.engine.advance(now);
    if (this.hasNoHumans(now)) {
      this.broadcastMutation(result, now);
      await this.retireRoom(
        "ROOM_NOT_FOUND",
        "This room closed because no human players remained.",
        "Room empty",
      );
      return;
    }
    await this.persist();
    this.broadcastMutation(result, now);
    await this.scheduleNextAlarm();
  }

  private async initialize(request: Request): Promise<Response> {
    if (this.engine || this.retiring) return jsonResponse({ error: "Room code already exists" }, 409);

    const code = request.headers.get("X-Room-Code");
    if (!code || !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      return jsonResponse({ error: "Invalid internal room code" }, 400);
    }

    let value: unknown;
    try {
      value = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    if (!this.isCreateRoomRequest(value)) {
      return jsonResponse({ error: "Invalid room credentials" }, 400);
    }

    const now = Date.now();
    this.engine = RoomEngine.create({
      code,
      sessionId: value.sessionId,
      reconnectToken: value.reconnectToken,
      name: normalizeName(value.name) ?? "Player",
      now,
      ...ROOM_ENGINE_OPTIONS,
    });
    // Creation happens over HTTP before the host's WebSocket exists. Treat the
    // reserved host seat as reconnecting until its mandatory join message arrives.
    this.engine.disconnect(value.sessionId, now);
    this.lastActivityAt = now;
    await this.persist();
    await this.scheduleNextAlarm();

    return jsonResponse({ roomCode: code }, 201);
  }

  private async openSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "Expected WebSocket upgrade" }, 426);
    }

    if (this.retiring) return jsonResponse({ error: "Room no longer exists" }, 404);

    if (this.ctx.getWebSockets().length >= MAX_SOCKET_CONNECTIONS) {
      return jsonResponse({ error: "Room has too many open connections" }, 429);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ["game-room"]);
    server.serializeAttachment(defaultAttachment());
    await this.scheduleNextAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  private async join(socket: WebSocket, message: JoinMessage): Promise<void> {
    if (!this.engine || this.retiring) {
      this.sendError(socket, "ROOM_NOT_FOUND", "This room no longer exists.");
      this.closeSocket(socket, 4404, "Room not found");
      return;
    }

    if (this.kickedSessionIds.includes(message.sessionId)) {
      this.sendError(socket, "KICKED_FROM_ROOM", "你已被房主移出房间。");
      this.closeSocket(socket, 4403, "Removed by host");
      return;
    }

    const now = Date.now();
    const result = this.engine.join({
      sessionId: message.sessionId,
      reconnectToken: message.reconnectToken,
      name: normalizeName(message.name) ?? "Player",
      now,
    });

    if (!result.ok) {
      // Engine methods advance all already-due authoritative work before they
      // validate the requested action, so even a rejected join can carry state.
      if (this.hasNoHumans(now)) {
        this.broadcastMutation(result, now);
        this.sendError(socket, result.code ?? "ROOM_NOT_FOUND", result.message ?? "This room no longer exists.");
        this.closeSocket(socket, 4404, "Room not found");
        await this.retireRoom(
          "ROOM_NOT_FOUND",
          "This room closed because no human players remained.",
          "Room empty",
        );
        return;
      }
      await this.persist();
      await this.scheduleNextAlarm();
      this.broadcastMutation(result, now);
      this.sendError(socket, result.code ?? "JOIN_REJECTED", result.message ?? "Unable to join room.");
      this.closeSocket(socket, 4403, "Join rejected");
      return;
    }

    for (const existingSocket of this.ctx.getWebSockets()) {
      if (existingSocket === socket) continue;
      const existing = this.readAttachment(existingSocket);
      if (existing.joined && existing.sessionId === message.sessionId) {
        this.sendError(existingSocket, "SESSION_REPLACED", "This session reconnected elsewhere.");
        this.closeSocket(existingSocket, 4408, "Session replaced");
      }
    }

    const attachment: SocketAttachment = {
      joined: true,
      sessionId: message.sessionId,
      playerId: result.playerId,
      lastSequence: this.lastSequenceBySession[message.sessionId] ?? -1,
      connectedAt: this.readAttachment(socket).connectedAt,
    };
    socket.serializeAttachment(attachment);

    this.lastActivityAt = now;
    await this.persist();
    await this.scheduleNextAlarm();

    const welcome: ServerMessage = {
      v: GAME_PROTOCOL_VERSION,
      type: "welcome",
      reconnectToken: result.reconnectToken,
      snapshot: result.snapshot,
    };
    this.safeSend(socket, welcome);
    this.broadcastEvents(result.events, result.revision, now, socket);
    this.broadcastSnapshots(now, socket);
  }

  private async handleCommand(
    socket: WebSocket,
    attachment: SocketAttachment,
    message: CommandMessage,
  ): Promise<void> {
    if (!this.engine || !attachment.sessionId) {
      this.sendError(socket, "ROOM_NOT_FOUND", "This room no longer exists.", message.id);
      return;
    }

    const durableLastSequence = this.lastSequenceBySession[attachment.sessionId] ?? -1;
    if (message.sequence <= Math.max(attachment.lastSequence, durableLastSequence)) {
      const snapshot = this.engine.snapshot(Date.now(), attachment.sessionId);
      this.safeSend(socket, {
        v: GAME_PROTOCOL_VERSION,
        type: "ack",
        id: message.id,
        sequence: message.sequence,
        ok: true,
        revision: snapshot.revision,
      });
      return;
    }

    const now = Date.now();

    if (message.command.op === "ping") {
      attachment.lastSequence = message.sequence;
      socket.serializeAttachment(attachment);
      this.safeSend(socket, { v: GAME_PROTOCOL_VERSION, type: "pong", serverTime: now });
      this.acknowledge(socket, message, this.engine.snapshot(now, attachment.sessionId).revision);
      return;
    }

    if (message.command.op === "sync.request") {
      attachment.lastSequence = message.sequence;
      socket.serializeAttachment(attachment);
      this.safeSend(socket, {
        v: GAME_PROTOCOL_VERSION,
        type: "snapshot",
        snapshot: this.engine.snapshot(now, attachment.sessionId),
      });
      this.acknowledge(socket, message, this.engine.snapshot(now, attachment.sessionId).revision);
      return;
    }

    const kickedSessionId = message.command.op === "lobby.remove_player"
      ? this.engine.sessionIdForPlayer(message.command.playerId)
      : null;
    const result = this.engine.handleCommand(attachment.sessionId, message.command, now);
    const explicitlyLeft = result.ok && message.command.op === "presence.leave";
    if (explicitlyLeft) {
      attachment.joined = false;
      socket.serializeAttachment(attachment);
    }
    if (this.hasNoHumans(now)) {
      if (result.ok) {
        attachment.lastSequence = message.sequence;
        socket.serializeAttachment(attachment);
        this.lastSequenceBySession[attachment.sessionId] = message.sequence;
        this.acknowledge(socket, message, result.revision);
      } else {
        this.sendError(
          socket,
          result.code ?? "COMMAND_REJECTED",
          result.message ?? "The command was rejected.",
          message.id,
        );
      }
      this.broadcastMutation(result, now);
      await this.retireRoom(
        "ROOM_NOT_FOUND",
        "This room closed because the last human player left.",
        "Room empty",
      );
      return;
    }
    if (!result.ok) {
      await this.persist();
      await this.scheduleNextAlarm();
      this.broadcastMutation(result, now);
      this.sendError(
        socket,
        result.code ?? "COMMAND_REJECTED",
        result.message ?? "The command was rejected.",
        message.id,
      );
      return;
    }

    attachment.lastSequence = message.sequence;
    socket.serializeAttachment(attachment);
    this.lastSequenceBySession[attachment.sessionId] = message.sequence;
    if (kickedSessionId) {
      this.kickedSessionIds = [...this.kickedSessionIds.filter((sessionId) => sessionId !== kickedSessionId), kickedSessionId].slice(-64);
      delete this.lastSequenceBySession[kickedSessionId];
    }
    this.lastActivityAt = now;
    await this.persist();
    await this.scheduleNextAlarm();

    this.acknowledge(socket, message, result.revision);
    if (kickedSessionId) this.closeKickedSession(kickedSessionId);
    this.broadcastMutation(result, now);
  }

  private async disconnectSocket(socket: WebSocket, explicitlyLeft = false): Promise<void> {
    const attachment = this.readAttachment(socket);
    if (!this.engine || !attachment.joined || !attachment.sessionId) return;

    if (!explicitlyLeft) {
      const hasReplacement = this.ctx.getWebSockets().some((candidate) => {
        if (candidate === socket || candidate.readyState !== 1) return false;
        const candidateAttachment = this.readAttachment(candidate);
        return candidateAttachment.joined && candidateAttachment.sessionId === attachment.sessionId;
      });
      if (hasReplacement) return;
    }

    const now = Date.now();
    const result = explicitlyLeft
      ? this.engine.leave(attachment.sessionId, now)
      : this.engine.disconnect(attachment.sessionId, now);
    if (this.hasNoHumans(now)) {
      this.broadcastMutation(result, now);
      await this.retireRoom(
        "ROOM_NOT_FOUND",
        "This room closed because the last human player left.",
        "Room empty",
      );
      return;
    }
    if (!result.ok) {
      await this.persist();
      await this.scheduleNextAlarm();
      this.broadcastMutation(result, now);
      return;
    }

    this.lastActivityAt = now;
    await this.persist();
    await this.scheduleNextAlarm();
    this.broadcastMutation(result, now);
  }

  private hasNoHumans(now: number) {
    return this.engine?.snapshot(now).humanCount === 0;
  }

  private async retireRoom(errorCode: string, message: string, closeReason: string): Promise<void> {
    if (!this.engine || this.retiring) return;

    // Make the room unreachable before the first await. Durable Object handlers
    // can interleave at await boundaries, so this tombstone prevents a racing
    // join from reviving an empty room while its stored state is being deleted.
    this.retiring = true;
    this.engine = null;
    this.lastActivityAt = 0;
    this.lastSequenceBySession = {};
    this.kickedSessionIds = [];

    for (const socket of this.ctx.getWebSockets()) {
      this.sendError(socket, errorCode, message);
      this.closeSocket(socket, 4404, closeReason);
    }

    try {
      if ((await this.ctx.storage.getAlarm()) !== null) await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
    } finally {
      this.retiring = false;
    }
  }

  private async persist(): Promise<void> {
    if (!this.engine) return;
    const stored: StoredRoom = {
      schemaVersion: STORED_ROOM_SCHEMA_VERSION,
      engine: this.engine.serialize(),
      lastActivityAt: this.lastActivityAt,
      lastSequenceBySession: this.lastSequenceBySession,
      kickedSessionIds: this.kickedSessionIds,
    };
    await this.ctx.storage.put(STORED_ROOM_KEY, stored);
  }

  private async scheduleNextAlarm(): Promise<void> {
    if (this.retiring) return;
    const candidateDueAt = this.engine?.nextDueAt();
    const dueAt =
      typeof candidateDueAt === "number" && Number.isFinite(candidateDueAt)
        ? candidateDueAt
        : null;
    const expiryAt = this.engine
      ? this.lastActivityAt + ROOM_IDLE_TTL_MS
      : Number.POSITIVE_INFINITY;
    const pendingJoinAt = this.ctx.getWebSockets().reduce((earliest, socket) => {
      if (socket.readyState >= 2) return earliest;
      const attachment = this.readAttachment(socket);
      return attachment.joined
        ? earliest
        : Math.min(earliest, attachment.connectedAt + JOIN_TIMEOUT_MS);
    }, Number.POSITIVE_INFINITY);
    const nextAt = Math.min(dueAt ?? Number.POSITIVE_INFINITY, expiryAt, pendingJoinAt);
    if (!Number.isFinite(nextAt)) {
      if ((await this.ctx.storage.getAlarm()) !== null) await this.ctx.storage.deleteAlarm();
      return;
    }
    const scheduledAt = Math.max(Date.now() + 1, nextAt);
    const current = await this.ctx.storage.getAlarm();

    if (current === null || Math.abs(current - scheduledAt) > 5) {
      await this.ctx.storage.setAlarm(scheduledAt);
    }
  }

  private broadcastMutation(result: MutationResult, now: number) {
    this.broadcastEvents(result.events, result.revision, now);
    this.broadcastSnapshots(now);
  }

  private broadcastEvents(
    events: RoomEvent[],
    revision: number,
    now: number,
    excludedSocket?: WebSocket,
  ) {
    for (const event of events) {
      const message: ServerMessage = {
        v: GAME_PROTOCOL_VERSION,
        type: "event",
        revision,
        serverTime: now,
        event,
      };
      for (const socket of this.joinedSockets(excludedSocket)) this.safeSend(socket, message);
    }
  }

  private broadcastSnapshots(now: number, excludedSocket?: WebSocket) {
    if (!this.engine) return;

    for (const socket of this.joinedSockets(excludedSocket)) {
      const attachment = this.readAttachment(socket);
      this.safeSend(socket, {
        v: GAME_PROTOCOL_VERSION,
        type: "snapshot",
        snapshot: this.engine.snapshot(now, attachment.sessionId),
      });
    }
  }

  private joinedSockets(excludedSocket?: WebSocket) {
    return this.ctx.getWebSockets().filter((socket) => {
      if (socket === excludedSocket) return false;
      return this.readAttachment(socket).joined;
    });
  }

  private acknowledge(socket: WebSocket, message: CommandMessage, revision: number) {
    this.safeSend(socket, {
      v: GAME_PROTOCOL_VERSION,
      type: "ack",
      id: message.id,
      sequence: message.sequence,
      ok: true,
      revision,
    });
  }

  private sendError(socket: WebSocket, code: string, message: string, id?: string) {
    const payload: ServerMessage = {
      v: GAME_PROTOCOL_VERSION,
      type: "error",
      code,
      message,
      ...(id ? { id } : {}),
    };
    this.safeSend(socket, payload);
  }

  private closeKickedSession(sessionId: string) {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.readAttachment(socket);
      if (!attachment.joined || attachment.sessionId !== sessionId) continue;
      attachment.joined = false;
      socket.serializeAttachment(attachment);
      this.sendError(socket, "KICKED_FROM_ROOM", "你已被房主移出房间。");
      this.closeSocket(socket, 4403, "Removed by host");
    }
  }

  private safeSend(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("Unable to send game room message", error);
    }
  }

  private closeSocket(socket: WebSocket, code: number, reason: string) {
    if (socket.readyState >= 2) return;
    try {
      socket.close(code, reason.slice(0, 120));
    } catch (error) {
      console.error("Unable to close game room socket", error);
    }
  }

  private readAttachment(socket: WebSocket): SocketAttachment {
    const value = socket.deserializeAttachment();
    if (!isRecord(value)) return defaultAttachment();

    return {
      joined: value.joined === true,
      sessionId: typeof value.sessionId === "string" ? value.sessionId : null,
      playerId: typeof value.playerId === "string" ? value.playerId : null,
      lastSequence: Number.isSafeInteger(value.lastSequence) ? Number(value.lastSequence) : -1,
      connectedAt:
        typeof value.connectedAt === "number" && Number.isFinite(value.connectedAt)
          ? value.connectedAt
          : Date.now(),
    };
  }

  private closeExpiredPendingSockets(now: number) {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.readAttachment(socket);
      if (!attachment.joined && now >= attachment.connectedAt + JOIN_TIMEOUT_MS) {
        this.sendError(socket, "JOIN_TIMEOUT", "The join message was not received in time.");
        this.closeSocket(socket, 4401, "Join timeout");
      }
    }
  }

  private isCreateRoomRequest(value: unknown): value is CreateRoomRequest {
    if (!isRecord(value)) return false;
    return (
      isCredential(value.sessionId, 8, 128) &&
      isCredential(value.reconnectToken, 24, 128) &&
      normalizeName(value.name) !== null
    );
  }
}

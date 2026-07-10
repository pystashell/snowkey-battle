"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME_PROTOCOL_VERSION,
  createClientId,
  createReconnectToken,
  isRoomCode,
  sanitizeRoomCode,
  type ClientMessage,
  type CommandMessage,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomCommand,
  type RoomEvent,
  type RoomSnapshot,
  type ServerMessage,
  type StoredRoomCredentials,
} from "../shared/game-protocol";

const STORAGE_PREFIX = "snow-type-battle.room.v1";
const LAST_ROOM_KEY = `${STORAGE_PREFIX}.last`;
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 7_500, 10_000] as const;
const PING_INTERVAL_MS = 15_000;

export type RoomConnectionStatus =
  | "idle"
  | "creating"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type RoomSocketError = {
  code: string;
  message: string;
};

export type RoomEventMeta = {
  revision: number;
  serverTime: number;
};

export type UseRoomSocketOptions = {
  autoResume?: boolean;
  onSnapshot?: (snapshot: RoomSnapshot, source: "welcome" | "snapshot") => void;
  onEvent?: (event: RoomEvent, meta: RoomEventMeta) => void;
  onError?: (error: RoomSocketError) => void;
};

type LeaveOptions = {
  forgetCredentials?: boolean;
};

function credentialsKey(roomCode: string) {
  return `${STORAGE_PREFIX}.${roomCode}`;
}

function sequenceKey(sessionId: string) {
  return `${STORAGE_PREFIX}.sequence.${sessionId}`;
}

function safeReadStorage(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing; the live socket still works.
  }
}

function safeRemoveStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Treat storage cleanup as best-effort.
  }
}

function parseCredentials(value: string | null): StoredRoomCredentials | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredRoomCredentials>;
    if (
      typeof parsed.roomCode !== "string" ||
      !isRoomCode(parsed.roomCode) ||
      typeof parsed.sessionId !== "string" ||
      !parsed.sessionId ||
      typeof parsed.reconnectToken !== "string" ||
      !parsed.reconnectToken ||
      typeof parsed.playerName !== "string"
    ) return null;
    return parsed as StoredRoomCredentials;
  } catch {
    return null;
  }
}

function readCredentials(roomCode: string) {
  return parseCredentials(safeReadStorage(credentialsKey(roomCode)));
}

function readLastCredentials() {
  const roomCode = safeReadStorage(LAST_ROOM_KEY);
  return roomCode && isRoomCode(roomCode) ? readCredentials(roomCode) : null;
}

function saveCredentials(credentials: StoredRoomCredentials) {
  safeWriteStorage(credentialsKey(credentials.roomCode), JSON.stringify(credentials));
  safeWriteStorage(LAST_ROOM_KEY, credentials.roomCode);
}

function readSequence(sessionId: string) {
  const stored = Number(safeReadStorage(sequenceKey(sessionId)) ?? "0");
  return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
}

function saveSequence(sessionId: string, sequence: number) {
  safeWriteStorage(sequenceKey(sessionId), String(sequence));
}

function createCredentials(roomCode: string, playerName: string): StoredRoomCredentials {
  return {
    roomCode,
    sessionId: createClientId(),
    reconnectToken: createReconnectToken(),
    playerName,
  };
}

function createSocketUrl(roomCode: string) {
  const url = new URL(`/api/rooms/${roomCode}/socket`, window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { v?: unknown; type?: unknown };
  return candidate.v === GAME_PROTOCOL_VERSION && typeof candidate.type === "string";
}

function readResponseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const candidate = payload as { message?: unknown; error?: unknown };
    if (typeof candidate.message === "string" && candidate.message) return candidate.message;
    if (typeof candidate.error === "string" && candidate.error) return candidate.error;
  }
  return fallback;
}

export function useRoomSocket(options: UseRoomSocketOptions = {}) {
  const { autoResume = false } = options;
  const [status, setStatus] = useState<RoomConnectionStatus>("idle");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [lastEvent, setLastEvent] = useState<RoomEvent | null>(null);
  const [error, setError] = useState<RoomSocketError | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const credentialsRef = useRef<StoredRoomCredentials | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const connectionGenerationRef = useRef(0);
  const sequenceRef = useRef(0);
  const lastRevisionRef = useRef(0);
  const lastEventRevisionRef = useRef(0);
  const serverTimeOffsetRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const welcomedRef = useRef(false);
  const mountedRef = useRef(false);
  const openSocketRef = useRef<(credentials: StoredRoomCredentials, reconnecting: boolean) => void>(() => {});
  const callbacksRef = useRef(options);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const updateServerTime = useCallback((serverTime: number) => {
    if (!Number.isFinite(serverTime)) return;
    const nextOffset = serverTime - Date.now();
    serverTimeOffsetRef.current = nextOffset;
    setServerTimeOffsetMs(nextOffset);
  }, []);

  const reportError = useCallback((nextError: RoomSocketError, terminal = false) => {
    setError(nextError);
    if (terminal) setStatus("error");
    callbacksRef.current.onError?.(nextError);
  }, []);

  const persistCredentials = useCallback((credentials: StoredRoomCredentials) => {
    credentialsRef.current = credentials;
    saveCredentials(credentials);
  }, []);

  const sendRawCommand = useCallback((command: RoomCommand) => {
    const socket = socketRef.current;
    const credentials = credentialsRef.current;
    if (!credentials || !welcomedRef.current || !socket || socket.readyState !== WebSocket.OPEN) return null;

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    saveSequence(credentials.sessionId, sequence);
    const message: CommandMessage = {
      v: GAME_PROTOCOL_VERSION,
      type: "command",
      id: createClientId(),
      sequence,
      command,
    };
    socket.send(JSON.stringify(message));
    return message.id;
  }, []);

  const schedulePing = useCallback(() => {
    clearPingTimer();
    pingTimerRef.current = window.setInterval(() => {
      sendRawCommand({ op: "ping" });
    }, PING_INTERVAL_MS);
  }, [clearPingTimer, sendRawCommand]);

  const handleMessage = useCallback((message: ServerMessage) => {
    if (message.type === "welcome") {
      const current = credentialsRef.current;
      if (current && message.reconnectToken !== current.reconnectToken) {
        persistCredentials({ ...current, reconnectToken: message.reconnectToken });
      }
      lastRevisionRef.current = message.snapshot.revision;
      lastEventRevisionRef.current = message.snapshot.revision;
      updateServerTime(message.snapshot.serverTime);
      setSnapshot(message.snapshot);
      setLastEvent(null);
      setStatus("connected");
      setError(null);
      welcomedRef.current = true;
      reconnectAttemptRef.current = 0;
      callbacksRef.current.onSnapshot?.(message.snapshot, "welcome");
      schedulePing();
      return;
    }

    if (message.type === "snapshot") {
      if (message.snapshot.revision < lastRevisionRef.current) return;
      lastRevisionRef.current = message.snapshot.revision;
      updateServerTime(message.snapshot.serverTime);
      setSnapshot(message.snapshot);
      callbacksRef.current.onSnapshot?.(message.snapshot, "snapshot");
      return;
    }

    if (message.type === "event") {
      if (message.revision <= lastEventRevisionRef.current) return;
      lastEventRevisionRef.current = message.revision;
      lastRevisionRef.current = Math.max(lastRevisionRef.current, message.revision);
      updateServerTime(message.serverTime);
      setLastEvent(message.event);
      callbacksRef.current.onEvent?.(message.event, {
        revision: message.revision,
        serverTime: message.serverTime,
      });
      return;
    }

    if (message.type === "pong") {
      updateServerTime(message.serverTime);
      return;
    }

    if (message.type === "error") {
      reportError({ code: message.code, message: message.message });
    }
  }, [persistCredentials, reportError, schedulePing, updateServerTime]);

  const openSocket = useCallback((credentials: StoredRoomCredentials, reconnecting: boolean) => {
    if (typeof window === "undefined") return;
    clearReconnectTimer();
    clearPingTimer();

    intentionalCloseRef.current = false;
    welcomedRef.current = false;
    const generation = ++connectionGenerationRef.current;
    const previousSocket = socketRef.current;
    socketRef.current = null;
    if (previousSocket && previousSocket.readyState < WebSocket.CLOSING) previousSocket.close(1000, "replaced");

    persistCredentials(credentials);
    sequenceRef.current = readSequence(credentials.sessionId);
    setRoomCode(credentials.roomCode);
    setStatus(reconnecting ? "reconnecting" : "connecting");
    setError(null);

    let socket: WebSocket;
    try {
      socket = new WebSocket(createSocketUrl(credentials.roomCode));
    } catch {
      reportError({ code: "SOCKET_CREATE_FAILED", message: "无法建立房间连接。" }, true);
      return;
    }
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (generation !== connectionGenerationRef.current) return;
      const joinMessage: ClientMessage = {
        v: GAME_PROTOCOL_VERSION,
        type: "join",
        sessionId: credentials.sessionId,
        reconnectToken: credentials.reconnectToken,
        name: credentials.playerName,
      };
      socket.send(JSON.stringify(joinMessage));
    });

    socket.addEventListener("message", (event) => {
      if (generation !== connectionGenerationRef.current) return;
      try {
        const parsed: unknown = JSON.parse(String(event.data));
        if (!isServerMessage(parsed)) {
          reportError({ code: "BAD_SERVER_MESSAGE", message: "房间服务器返回了无法识别的消息。" });
          return;
        }
        handleMessage(parsed);
      } catch {
        reportError({ code: "BAD_SERVER_MESSAGE", message: "房间服务器消息解析失败。" });
      }
    });

    socket.addEventListener("error", () => {
      if (generation !== connectionGenerationRef.current) return;
      reportError({ code: "SOCKET_ERROR", message: "房间连接发生网络错误，正在尝试重连。" });
    });

    socket.addEventListener("close", (event) => {
      if (generation !== connectionGenerationRef.current) return;
      socketRef.current = null;
      welcomedRef.current = false;
      clearPingTimer();
      if (!mountedRef.current || intentionalCloseRef.current) return;

      if (event.code === 1000 || event.code === 1008 || (event.code >= 4000 && event.code <= 4999)) {
        setStatus(event.code === 1000 ? "disconnected" : "error");
        return;
      }

      setStatus("reconnecting");
      const attempt = reconnectAttemptRef.current;
      reconnectAttemptRef.current += 1;
      const baseDelay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      const jitteredDelay = Math.round(baseDelay * (0.85 + Math.random() * 0.3));
      reconnectTimerRef.current = window.setTimeout(() => {
        const latestCredentials = credentialsRef.current;
        if (latestCredentials && mountedRef.current && !intentionalCloseRef.current) {
          openSocketRef.current(latestCredentials, true);
        }
      }, jitteredDelay);
    });
  }, [clearPingTimer, clearReconnectTimer, handleMessage, persistCredentials, reportError]);

  useEffect(() => {
    openSocketRef.current = openSocket;
  }, [openSocket]);

  const joinRoom = useCallback((requestedRoomCode: string, requestedName: string) => {
    if (typeof window === "undefined") return false;
    const normalizedCode = sanitizeRoomCode(requestedRoomCode);
    const playerName = requestedName.trim().slice(0, 12);
    if (!isRoomCode(normalizedCode)) {
      reportError({ code: "INVALID_ROOM_CODE", message: "房间码应为 6 位字母或数字。" }, true);
      return false;
    }
    if (!playerName) {
      reportError({ code: "INVALID_NAME", message: "请先填写你的名字。" }, true);
      return false;
    }

    const stored = readCredentials(normalizedCode);
    const credentials = stored
      ? { ...stored, playerName }
      : createCredentials(normalizedCode, playerName);
    reconnectAttemptRef.current = 0;
    lastRevisionRef.current = 0;
    lastEventRevisionRef.current = 0;
    setSnapshot(null);
    setLastEvent(null);
    openSocket(credentials, false);
    return true;
  }, [openSocket, reportError]);

  const createRoom = useCallback(async (requestedName: string) => {
    if (typeof window === "undefined") return null;
    const playerName = requestedName.trim().slice(0, 12);
    if (!playerName) {
      reportError({ code: "INVALID_NAME", message: "请先填写你的名字。" }, true);
      return null;
    }

    intentionalCloseRef.current = true;
    const createGeneration = ++connectionGenerationRef.current;
    clearReconnectTimer();
    clearPingTimer();
    socketRef.current?.close(1000, "creating another room");
    socketRef.current = null;
    setStatus("creating");
    setError(null);

    const pendingCredentials = createCredentials("AAAAAA", playerName);
    const request: CreateRoomRequest = {
      sessionId: pendingCredentials.sessionId,
      reconnectToken: pendingCredentials.reconnectToken,
      name: playerName,
    };

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!mountedRef.current || connectionGenerationRef.current !== createGeneration) return null;
      if (!response.ok) {
        reportError({
          code: `CREATE_ROOM_${response.status}`,
          message: readResponseError(payload, "创建房间失败，请稍后再试。"),
        }, true);
        return null;
      }
      const created = payload as Partial<CreateRoomResponse> | null;
      const normalizedCode = sanitizeRoomCode(created?.roomCode ?? "");
      if (!isRoomCode(normalizedCode)) {
        reportError({ code: "BAD_CREATE_RESPONSE", message: "服务器没有返回有效的房间码。" }, true);
        return null;
      }

      const credentials: StoredRoomCredentials = {
        ...pendingCredentials,
        roomCode: normalizedCode,
      };
      reconnectAttemptRef.current = 0;
      lastRevisionRef.current = 0;
      lastEventRevisionRef.current = 0;
      setSnapshot(null);
      setLastEvent(null);
      openSocket(credentials, false);
      return normalizedCode;
    } catch {
      if (!mountedRef.current || connectionGenerationRef.current !== createGeneration) return null;
      reportError({ code: "CREATE_ROOM_NETWORK", message: "无法连接到房间服务器。" }, true);
      return null;
    }
  }, [clearPingTimer, clearReconnectTimer, openSocket, reportError]);

  const sendCommand = useCallback((command: RoomCommand) => sendRawCommand(command), [sendRawCommand]);

  const leave = useCallback((leaveOptions: LeaveOptions = {}) => {
    const { forgetCredentials = true } = leaveOptions;
    if (forgetCredentials) sendRawCommand({ op: "presence.leave" });
    intentionalCloseRef.current = true;
    ++connectionGenerationRef.current;
    clearReconnectTimer();
    clearPingTimer();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "left room");

    const credentials = credentialsRef.current;
    if (credentials && forgetCredentials) {
      safeRemoveStorage(credentialsKey(credentials.roomCode));
      safeRemoveStorage(sequenceKey(credentials.sessionId));
      if (safeReadStorage(LAST_ROOM_KEY) === credentials.roomCode) safeRemoveStorage(LAST_ROOM_KEY);
    }
    credentialsRef.current = null;
    sequenceRef.current = 0;
    lastRevisionRef.current = 0;
    lastEventRevisionRef.current = 0;
    welcomedRef.current = false;
    reconnectAttemptRef.current = 0;
    setRoomCode(null);
    setSnapshot(null);
    setLastEvent(null);
    setError(null);
    setStatus("idle");
  }, [clearPingTimer, clearReconnectTimer, sendRawCommand]);

  const resumeLastRoom = useCallback(() => {
    if (typeof window === "undefined") return false;
    const credentials = readLastCredentials();
    if (!credentials) return false;
    reconnectAttemptRef.current = 0;
    lastRevisionRef.current = 0;
    lastEventRevisionRef.current = 0;
    openSocket(credentials, false);
    return true;
  }, [openSocket]);

  const clearError = useCallback(() => setError(null), []);
  const getServerNow = useCallback(() => Date.now() + serverTimeOffsetRef.current, []);

  const disposeConnection = useCallback(() => {
    mountedRef.current = false;
    intentionalCloseRef.current = true;
    ++connectionGenerationRef.current;
    clearReconnectTimer();
    clearPingTimer();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "component unmounted");
  }, [clearPingTimer, clearReconnectTimer]);

  useEffect(() => {
    mountedRef.current = true;
    const resumeTimer = autoResume
      ? window.setTimeout(() => resumeLastRoom(), 0)
      : null;
    return () => {
      if (resumeTimer !== null) window.clearTimeout(resumeTimer);
      disposeConnection();
    };
  }, [autoResume, disposeConnection, resumeLastRoom]);

  return {
    status,
    connected: status === "connected",
    roomCode,
    snapshot,
    lastEvent,
    error,
    serverTimeOffsetMs,
    createRoom,
    joinRoom,
    resumeLastRoom,
    sendCommand,
    leave,
    clearError,
    getServerNow,
  };
}

export const GAME_PROTOCOL_VERSION = 1 as const;
export const PLAYER_MAX_HEALTH = 100 as const;

export type Team = "pine" | "berry";
export type AiLevel = "rookie" | "steady" | "expert";
export const DEFAULT_AI_LEVEL: AiLevel = "steady";
export type SnowfallLevel = "light" | "classic" | "blizzard";
export type SnowWordKind = "normal" | "frost";
export type WordbookId =
  | "winter"
  | "cet4"
  | "cet6"
  | "postgraduate"
  | "conceptStarter"
  | "conceptProgress"
  | "mixed";
export type RoomPhase = "lobby" | "countdown" | "playing" | "ended";

export type RoomConfig = {
  pineSize: number;
  berrySize: number;
  wordbookId: WordbookId;
  snowfallLevel: SnowfallLevel;
};

export type PublicController =
  | { kind: "ai"; level: AiLevel }
  | { kind: "human"; connected: boolean; ready: boolean; isHost: boolean };

export type RoomPlayer = {
  id: string;
  name: string;
  team: Team;
  position: number;
  badge: string;
  maxHealth: number;
  health: number;
  claims: number;
  damage: number;
  combo: number;
  bestCombo: number;
  frozenUntil: number;
  controller: PublicController;
};

export type RoomTypingState = {
  buffer: string;
  targetWordId: number | null;
};

export type RoomWord = {
  id: number;
  text: string;
  kind: SnowWordKind;
  x: number;
  restY: number;
  speed: number;
  drift: number;
  bornAt: number;
  landedAt: number;
  expiresAt: number;
  aiPlayerId: string | null;
  aiStartedAt: number | null;
  aiClaimAt: number | null;
};

export type PendingAttack = {
  id: string;
  claimId: string;
  attackerId: string;
  targetId: string | null;
  targetIds: string[];
  word: string;
  kind: SnowWordKind;
  damage: number;
  startsAt: number;
  throwAt: number;
  resolveAt: number;
  resolved: boolean;
};

export type AttackHit = {
  targetId: string;
  actualDamage: number;
  targetHealth: number;
  frozenUntil: number | null;
};

export type RoomSnapshot = {
  protocolVersion: typeof GAME_PROTOCOL_VERSION;
  code: string;
  revision: number;
  serverTime: number;
  phase: RoomPhase;
  config: RoomConfig;
  players: RoomPlayer[];
  words: RoomWord[];
  typingByPlayer: Record<string, RoomTypingState>;
  pendingAttacks: PendingAttack[];
  selfPlayerId: string | null;
  hostPlayerId: string | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  winner: Team | null;
  humanCount: number;
};

export type RoomEvent =
  | {
      type: "word.claimed";
      claimId: string;
      attackId: string;
      word: RoomWord;
      attackerId: string;
      targetId: string | null;
      targetIds: string[];
      damage: number;
      startsAt: number;
      throwAt: number;
      resolveAt: number;
    }
  | {
      type: "attack.resolved";
      attackId: string;
      attackerId: string;
      kind: SnowWordKind;
      hits: AttackHit[];
      targetId: string | null;
      actualDamage: number;
      targetHealth: number | null;
      frozenUntil: number | null;
      missed: boolean;
      winner: Team | null;
    }
  | { type: "match.started"; startedAt: number }
  | { type: "match.ended"; winner: Team }
  | { type: "typing.rejected"; playerId: string; reason: "NO_MATCH" | "TARGET_GONE" | "FROZEN" }
  | { type: "player.replaced_by_ai"; playerId: string };

export type JoinMessage = {
  v: typeof GAME_PROTOCOL_VERSION;
  type: "join";
  sessionId: string;
  reconnectToken: string;
  name: string;
};

export type RoomCommand =
  | { op: "presence.ready"; ready: boolean }
  | { op: "presence.leave" }
  | { op: "lobby.set_team"; team: Team }
  | { op: "lobby.move"; playerId: string; direction: -1 | 1 }
  | { op: "lobby.set_config"; config: Partial<RoomConfig> }
  | { op: "lobby.set_ai_level"; playerId: string; level: AiLevel }
  | { op: "lobby.remove_ai"; playerId: string }
  | { op: "match.start" }
  | { op: "match.restart" }
  | { op: "type.key"; key: string }
  | { op: "type.cancel" }
  | { op: "sync.request" }
  | { op: "ping" };

export type CommandMessage = {
  v: typeof GAME_PROTOCOL_VERSION;
  type: "command";
  id: string;
  sequence: number;
  command: RoomCommand;
};

export type ClientMessage = JoinMessage | CommandMessage;

export type ServerMessage =
  | {
      v: typeof GAME_PROTOCOL_VERSION;
      type: "welcome";
      reconnectToken: string;
      snapshot: RoomSnapshot;
    }
  | {
      v: typeof GAME_PROTOCOL_VERSION;
      type: "snapshot";
      snapshot: RoomSnapshot;
    }
  | {
      v: typeof GAME_PROTOCOL_VERSION;
      type: "event";
      revision: number;
      serverTime: number;
      event: RoomEvent;
    }
  | {
      v: typeof GAME_PROTOCOL_VERSION;
      type: "ack";
      id: string;
      sequence: number;
      ok: true;
      revision: number;
    }
  | {
      v: typeof GAME_PROTOCOL_VERSION;
      type: "error";
      id?: string;
      code: string;
      message: string;
    }
  | { v: typeof GAME_PROTOCOL_VERSION; type: "pong"; serverTime: number };

export type CreateRoomRequest = {
  sessionId: string;
  reconnectToken: string;
  name: string;
};

export type CreateRoomResponse = {
  roomCode: string;
};

export type StoredRoomCredentials = {
  roomCode: string;
  sessionId: string;
  reconnectToken: string;
  playerName: string;
};

export function isRoomCode(value: string) {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(value);
}

export function sanitizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
}

export function createClientId() {
  return crypto.randomUUID();
}

export function createReconnectToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

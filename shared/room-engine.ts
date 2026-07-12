import type {
  AiLevel,
  PendingAttack,
  RoomCommand,
  RoomConfig,
  RoomEvent,
  RoomPhase,
  RoomPlayer,
  RoomSnapshot,
  RoomTypingState,
  RoomWord,
  SnowWordKind,
  SnowfallLevel,
  Team,
  WordbookId,
} from "./game-protocol";
import { DEFAULT_AI_LEVEL } from "./game-protocol.ts";
import {
  FROST_WORD_POOL_SIZE,
  buildWordPools,
  drawWordFromBag,
  wordHistorySize,
} from "./word-pools.ts";
import {
  MAX_WORD_LENGTH,
  isPlayableWord,
  normalizePlayableWords,
  wordSpawnRange,
} from "./word-rules.ts";

const PROTOCOL_VERSION = 1 as const;
const MAX_TEAM_SIZE = 4;
const MAX_HUMANS = 8;
const DISCONNECT_GRACE_MS = 60_000;
const COUNTDOWN_MS = 3_000;
const ATTACK_THROW_DELAY_MS = 900;
const ATTACK_RESOLVE_DELAY_MS = 1_510;
const ACTOR_QUEUE_INTERVAL_MS = 1_850;
const COMBO_WINDOW_MS = 4_200;
const MAX_PLAYER_NAME_LENGTH = 8;
const FROST_SPAWN_CHANCE = 0.08;
const FROST_DAMAGE = 15;
const FROST_FREEZE_MS = 1_000;
const PLAYER_MAX_HEALTH = 100;
const WORD_START_Y = 7;
const WORD_GROUND_TTL_MS = 2_000;
const WORD_POOL_VERSION = 3;

type RandomSource = () => number;

type SeatSpec = {
  id: string;
  team: Team;
  slot: number;
  name: string;
  badge: string;
  aiLevel: AiLevel;
};

type InternalPlayer = RoomPlayer & {
  active: boolean;
  slot: number;
  fallbackName: string;
  fallbackBadge: string;
  fallbackAiLevel: AiLevel;
  sessionId: string | null;
  reconnectToken: string | null;
  disconnectDeadline: number | null;
  joinOrder: number;
  actorNextAt: number;
  combo: number;
  lastClaimAt: number;
};

type EngineState = {
  code: string;
  revision: number;
  phase: RoomPhase;
  config: RoomConfig;
  players: InternalPlayer[];
  words: RoomWord[];
  typingByPlayer: Record<string, RoomTypingState>;
  pendingAttacks: PendingAttack[];
  hostPlayerId: string | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  winner: Team | null;
  nextWordId: number;
  nextClaimId: number;
  nextAttackId: number;
  nextJoinOrder: number;
  nextSpawnAt: number | null;
  wordPoolVersion: number;
  wordBagBookId: WordbookId;
  wordBag: string[];
  frostWordBag: string[];
  recentWords: string[];
  recentFrostWords: string[];
  deferredEvents: RoomEvent[];
};

export type RoomEngineSerialized = {
  engineVersion: 1;
  state: EngineState;
};

export type RoomEngineOptions = {
  random?: RandomSource;
  wordbooks?: Partial<Record<WordbookId, readonly string[]>>;
};

export type CreateRoomEngineInput = RoomEngineOptions & {
  code: string;
  sessionId: string;
  reconnectToken: string;
  name: string;
  now: number;
};

export type JoinRoomEngineInput = {
  sessionId: string;
  reconnectToken: string;
  name: string;
  now: number;
};

export type EngineSuccess = {
  ok: true;
  events: RoomEvent[];
  revision: number;
};

export type EngineFailure = {
  ok: false;
  code: string;
  message: string;
  events: RoomEvent[];
  revision: number;
};

export type EngineResult = EngineSuccess | EngineFailure;

export type EngineJoinSuccess = EngineSuccess & {
  playerId: string;
  reconnectToken: string;
  resumed: boolean;
  snapshot: RoomSnapshot;
};

export type EngineJoinResult = EngineJoinSuccess | EngineFailure;

type DueTask = {
  at: number;
  priority: number;
  kind: "event" | "countdown" | "disconnect" | "word-expire" | "ai" | "attack" | "spawn";
  id: string;
};

const SEATS: SeatSpec[] = [
  { id: "pine-0", team: "pine", slot: 0, name: "小雪球", badge: "雪", aiLevel: DEFAULT_AI_LEVEL },
  { id: "pine-1", team: "pine", slot: 1, name: "阿澄", badge: "澄", aiLevel: DEFAULT_AI_LEVEL },
  { id: "pine-2", team: "pine", slot: 2, name: "米糕", badge: "糕", aiLevel: DEFAULT_AI_LEVEL },
  { id: "pine-3", team: "pine", slot: 3, name: "小北", badge: "北", aiLevel: DEFAULT_AI_LEVEL },
  { id: "berry-0", team: "berry", slot: 0, name: "团子", badge: "团", aiLevel: DEFAULT_AI_LEVEL },
  { id: "berry-1", team: "berry", slot: 1, name: "柚子", badge: "柚", aiLevel: DEFAULT_AI_LEVEL },
  { id: "berry-2", team: "berry", slot: 2, name: "阿满", badge: "满", aiLevel: DEFAULT_AI_LEVEL },
  { id: "berry-3", team: "berry", slot: 3, name: "星星", badge: "星", aiLevel: DEFAULT_AI_LEVEL },
];

const AI_LEVELS: Record<AiLevel, { reaction: [number, number]; charMs: [number, number] }> = {
  rookie: { reaction: [1_500, 2_300], charMs: [430, 610] },
  steady: { reaction: [1_000, 1_650], charMs: [310, 450] },
  expert: { reaction: [650, 1_150], charMs: [230, 340] },
};

const SNOWFALL_PROFILES: Record<
  SnowfallLevel,
  { interval: [number, number]; wordBonus: number; minimumWords: number; maximumWords: number; initialWords: number }
> = {
  light: { interval: [1_400, 1_900], wordBonus: 3, minimumWords: 5, maximumWords: 9, initialWords: 3 },
  classic: { interval: [850, 1_250], wordBonus: 5, minimumWords: 7, maximumWords: 12, initialWords: 5 },
  blizzard: { interval: [520, 780], wordBonus: 7, minimumWords: 9, maximumWords: 14, initialWords: 7 },
};

const DEFAULT_WORDBOOKS: Record<WordbookId, readonly string[]> = {
  winter: ["snow", "coat", "warm", "tree", "star", "moon", "river", "cocoa", "skate", "scarf", "glove", "winter", "frozen", "silver", "forest", "holiday"],
  cet4: ["ability", "academic", "access", "achieve", "adapt", "advance", "benefit", "career", "challenge", "community", "compare", "complex", "conduct", "context", "culture", "develop"],
  cet6: ["abstract", "abundant", "accelerate", "acknowledge", "adequate", "advocate", "allocate", "ambiguous", "anticipate", "articulate", "coherent", "comprehensive", "derive", "empirical", "hypothesis", "inevitable"],
  postgraduate: ["abstraction", "accountability", "architecture", "ascertain", "autonomy", "configuration", "credibility", "dialectical", "differentiate", "equilibrium", "indispensable", "infrastructure", "methodology", "perspective", "socioeconomic", "theoretical"],
  conceptStarter: ["family", "friend", "school", "teacher", "student", "lesson", "question", "answer", "picture", "window", "garden", "kitchen", "morning", "evening", "market", "station"],
  conceptProgress: ["accident", "adventure", "airport", "ancient", "attention", "audience", "behavior", "business", "captain", "century", "conversation", "decision", "discover", "distance", "electric", "enormous"],
  mixed: [],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeRandom(value: number) {
  if (!Number.isFinite(value)) return 0;
  const fraction = value - Math.floor(value);
  return clamp(fraction, 0, 0.9999999999999999);
}

function sanitizeName(value: string) {
  const cleaned = Array.from(String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim())
    .slice(0, MAX_PLAYER_NAME_LENGTH)
    .join("");
  return cleaned || "雪球手";
}

function nameKey(value: string) {
  return value.trim().toLowerCase();
}

function createUniqueAiName(baseName: string, usedNames: Set<string>) {
  if (!usedNames.has(nameKey(baseName))) return baseName;
  for (let index = 1; index <= MAX_TEAM_SIZE * 2; index += 1) {
    const suffix = index === 1 ? "AI" : `AI${index}`;
    const stemLength = Math.max(0, MAX_PLAYER_NAME_LENGTH - Array.from(suffix).length);
    const stem = Array.from(baseName).slice(0, stemLength).join("");
    const candidate = `${stem}${suffix}`;
    if (!usedNames.has(nameKey(candidate))) return candidate;
  }
  return `AI${Math.abs(Array.from(baseName).reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0))}`
    .slice(0, MAX_PLAYER_NAME_LENGTH);
}

function sanitizeWords(words: readonly string[]) {
  return normalizePlayableWords(words);
}

function hasPrefixCollision(candidate: string, activeWords: Set<string>) {
  return [...activeWords].some((active) => candidate.startsWith(active) || active.startsWith(candidate));
}

function calculateWordLandedAt(bornAt: number, restY: number, speed: number) {
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 4;
  const fallDistance = Math.max(0, restY - WORD_START_Y);
  return bornAt + Math.ceil((fallDistance / safeSpeed) * 1_000);
}

export function calculateWordDamage(length: number) {
  if (length <= 5) return 10;
  if (length <= 8) return 11;
  if (length <= 11) return 12;
  return 13;
}

export function calculateAiTiming(
  level: AiLevel,
  text: string,
  bornAt: number,
  random: RandomSource = Math.random,
) {
  const profile = AI_LEVELS[level];
  const between = ([minimum, maximum]: [number, number]) => minimum + normalizeRandom(random()) * (maximum - minimum);
  const startedAt = bornAt + between(profile.reaction);
  const typingTime = text.length * between(profile.charMs);
  const stumble = normalizeRandom(random()) < 0.12 ? 450 + normalizeRandom(random()) * 550 : 0;
  return { startedAt, claimAt: startedAt + typingTime + stumble };
}

function makeSeat(spec: SeatSpec, active: boolean): InternalPlayer {
  return {
    id: spec.id,
    name: spec.name,
    team: spec.team,
    position: spec.slot,
    badge: spec.badge,
    maxHealth: PLAYER_MAX_HEALTH,
    health: PLAYER_MAX_HEALTH,
    claims: 0,
    damage: 0,
    combo: 0,
    bestCombo: 0,
    frozenUntil: 0,
    controller: { kind: "ai", level: spec.aiLevel },
    active,
    slot: spec.slot,
    fallbackName: spec.name,
    fallbackBadge: spec.badge,
    fallbackAiLevel: spec.aiLevel,
    sessionId: null,
    reconnectToken: null,
    disconnectDeadline: null,
    joinOrder: 0,
    actorNextAt: 0,
    lastClaimAt: 0,
  };
}

function movePlayerToTeamBack(players: InternalPlayer[], player: InternalPlayer) {
  const teammates = players
    .filter((candidate) => candidate.active && candidate.team === player.team)
    .sort((left, right) => left.position - right.position);
  const finalPosition = teammates.length - 1;
  if (player.position >= finalPosition) return;
  const previousPosition = player.position;
  for (const teammate of teammates) {
    if (teammate.id !== player.id && teammate.position > previousPosition) teammate.position -= 1;
  }
  player.position = finalPosition;
}

function defaultConfig(): RoomConfig {
  return {
    pineSize: 3,
    berrySize: 3,
    wordbookId: "winter",
    snowfallLevel: "classic",
  };
}

function isRoomCode(code: string) {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}

export class RoomEngine {
  private state: EngineState;
  private random: RandomSource;
  private wordbooks: Record<WordbookId, readonly string[]>;

  private constructor(state: EngineState, options: RoomEngineOptions = {}) {
    this.state = state;
    for (const player of this.state.players) {
      player.frozenUntil ??= 0;
      const previousMaximum = Number.isFinite(player.maxHealth) && player.maxHealth > 0
        ? player.maxHealth
        : PLAYER_MAX_HEALTH;
      const healthRatio = clamp(player.health / previousMaximum, 0, 1);
      player.maxHealth = PLAYER_MAX_HEALTH;
      player.health = player.health <= 0
        ? 0
        : clamp(Math.round(healthRatio * PLAYER_MAX_HEALTH), 1, PLAYER_MAX_HEALTH);
      delete (player as InternalPlayer & { role?: unknown }).role;
    }
    for (const word of this.state.words) {
      word.kind ??= "normal";
      word.landedAt ??= calculateWordLandedAt(word.bornAt, word.restY, word.speed);
      word.expiresAt ??= word.landedAt + WORD_GROUND_TTL_MS;
    }
    for (const attack of this.state.pendingAttacks) {
      attack.kind ??= "normal";
      attack.targetIds ??= attack.targetId ? [attack.targetId] : [];
    }
    if (this.state.wordPoolVersion !== WORD_POOL_VERSION) {
      this.state.wordPoolVersion = WORD_POOL_VERSION;
      this.state.wordBagBookId = this.state.config.wordbookId;
      this.state.wordBag = [];
      this.state.frostWordBag = [];
      this.state.recentWords = [];
      this.state.recentFrostWords = [];
    } else {
      this.state.frostWordBag ??= [];
      this.state.recentFrostWords ??= [];
    }
    this.random = options.random ?? Math.random;
    const supplied = options.wordbooks ?? {};
    const winter = sanitizeWords(supplied.winter ?? DEFAULT_WORDBOOKS.winter);
    const cet4 = sanitizeWords(supplied.cet4 ?? DEFAULT_WORDBOOKS.cet4);
    const cet6 = sanitizeWords(supplied.cet6 ?? DEFAULT_WORDBOOKS.cet6);
    const postgraduate = sanitizeWords(supplied.postgraduate ?? DEFAULT_WORDBOOKS.postgraduate);
    const starter = sanitizeWords(supplied.conceptStarter ?? DEFAULT_WORDBOOKS.conceptStarter);
    const progress = sanitizeWords(supplied.conceptProgress ?? DEFAULT_WORDBOOKS.conceptProgress);
    const mixed = sanitizeWords(supplied.mixed ?? [...winter, ...cet4, ...cet6, ...postgraduate, ...starter, ...progress]);
    this.wordbooks = {
      winter: winter.length ? winter : DEFAULT_WORDBOOKS.winter,
      cet4: cet4.length ? cet4 : DEFAULT_WORDBOOKS.cet4,
      cet6: cet6.length ? cet6 : DEFAULT_WORDBOOKS.cet6,
      postgraduate: postgraduate.length ? postgraduate : DEFAULT_WORDBOOKS.postgraduate,
      conceptStarter: starter.length ? starter : DEFAULT_WORDBOOKS.conceptStarter,
      conceptProgress: progress.length ? progress : DEFAULT_WORDBOOKS.conceptProgress,
      mixed: mixed.length ? mixed : DEFAULT_WORDBOOKS.winter,
    };
    this.reconcileAiNames();
    this.reconcileHostInvariant();
  }

  static create(input: CreateRoomEngineInput) {
    const code = input.code.trim().toUpperCase();
    if (!isRoomCode(code)) throw new Error("Room code must be six unambiguous uppercase characters.");
    if (!input.sessionId || !input.reconnectToken) throw new Error("Host credentials are required.");
    const config = defaultConfig();
    const players = SEATS.map((seat) => makeSeat(
      seat,
      seat.slot < (seat.team === "pine" ? config.pineSize : config.berrySize),
    ));
    const host = players.find((player) => player.id === "pine-0");
    if (!host) throw new Error("Host seat is missing.");
    host.name = sanitizeName(input.name);
    host.badge = Array.from(host.name)[0] ?? "你";
    host.controller = { kind: "human", connected: true, ready: true, isHost: true };
    host.sessionId = input.sessionId;
    host.reconnectToken = input.reconnectToken;
    host.joinOrder = 1;
    movePlayerToTeamBack(players, host);
    const state: EngineState = {
      code,
      revision: 1,
      phase: "lobby",
      config,
      players,
      words: [],
      typingByPlayer: Object.fromEntries(players.map((player) => [player.id, { buffer: "", targetWordId: null }])),
      pendingAttacks: [],
      hostPlayerId: host.id,
      countdownEndsAt: null,
      startedAt: null,
      winner: null,
      nextWordId: 1,
      nextClaimId: 1,
      nextAttackId: 1,
      nextJoinOrder: 2,
      nextSpawnAt: null,
      wordPoolVersion: WORD_POOL_VERSION,
      wordBagBookId: config.wordbookId,
      wordBag: [],
      frostWordBag: [],
      recentWords: [],
      recentFrostWords: [],
      deferredEvents: [],
    };
    return new RoomEngine(state, input);
  }

  static restore(serialized: RoomEngineSerialized, options: RoomEngineOptions = {}) {
    if (serialized.engineVersion !== 1) throw new Error("Unsupported room engine state version.");
    const state = clone(serialized.state);
    state.deferredEvents ??= [];
    return new RoomEngine(state, options);
  }

  serialize(): RoomEngineSerialized {
    return { engineVersion: 1, state: clone(this.state) };
  }

  snapshot(now: number, selfSessionId: string | null = null): RoomSnapshot {
    const activePlayers = this.activePlayers().map((player) => this.publicPlayer(player));
    const typingByPlayer: Record<string, RoomTypingState> = {};
    for (const player of this.activePlayers()) {
      typingByPlayer[player.id] = clone(this.typing(player.id));
    }
    const self = selfSessionId ? this.playerForSession(selfSessionId) : null;
    return {
      protocolVersion: PROTOCOL_VERSION,
      code: this.state.code,
      revision: this.state.revision,
      serverTime: now,
      phase: this.state.phase,
      config: clone(this.state.config),
      players: activePlayers,
      words: clone(this.state.words),
      typingByPlayer,
      pendingAttacks: clone(this.state.pendingAttacks.filter((attack) => !attack.resolved)),
      selfPlayerId: self?.id ?? null,
      hostPlayerId: this.state.hostPlayerId,
      countdownEndsAt: this.state.countdownEndsAt,
      startedAt: this.state.startedAt,
      winner: this.state.winner,
      humanCount: this.humanPlayers().length,
    };
  }

  join(input: JoinRoomEngineInput): EngineJoinResult {
    const events = this.advance(input.now).events;
    if (this.humanPlayers().length === 0) {
      return this.failure("ROOM_NOT_FOUND", "This room no longer has any human players.", events);
    }
    if (!input.sessionId || !input.reconnectToken) {
      return this.failure("INVALID_CREDENTIALS", "Session and reconnect token are required.", events);
    }
    const existing = this.playerForSession(input.sessionId);
    if (existing) {
      if (existing.reconnectToken !== input.reconnectToken) {
        return this.failure("INVALID_RECONNECT_TOKEN", "Reconnect token does not match this player.", events);
      }
      if (existing.controller.kind !== "human") {
        return this.failure("SESSION_EXPIRED", "This player is already controlled by AI.", events);
      }
      const nextName = sanitizeName(input.name || existing.name);
      if (this.isHumanNameTaken(nextName, existing.id)) {
        return this.failure("NAME_TAKEN", "这个名字已经被其他玩家使用，请换一个。", events);
      }
      existing.controller.connected = true;
      existing.disconnectDeadline = null;
      existing.name = nextName;
      existing.badge = Array.from(existing.name)[0] ?? existing.badge;
      this.reconcileAiNames();
      this.touch();
      return {
        ok: true,
        events,
        revision: this.state.revision,
        playerId: existing.id,
        reconnectToken: existing.reconnectToken ?? input.reconnectToken,
        resumed: true,
        snapshot: this.snapshot(input.now, input.sessionId),
      };
    }
    if (this.state.phase !== "lobby") {
      return this.failure("MATCH_IN_PROGRESS", "New players can only join in the lobby.", events);
    }
    if (this.humanPlayers().length >= MAX_HUMANS) {
      return this.failure("ROOM_FULL", "The room already has eight human players.", events);
    }
    const seat = this.selectJoinSeat();
    if (!seat) return this.failure("ROOM_FULL", "No seat is available.", events);
    const playerName = sanitizeName(input.name);
    if (this.isHumanNameTaken(playerName)) {
      return this.failure("NAME_TAKEN", "这个名字已经被其他玩家使用，请换一个。", events);
    }
    if (!seat.active) this.activateSeat(seat);
    seat.name = playerName;
    seat.badge = Array.from(seat.name)[0] ?? "友";
    seat.fallbackAiLevel = DEFAULT_AI_LEVEL;
    seat.controller = { kind: "human", connected: true, ready: false, isHost: false };
    seat.sessionId = input.sessionId;
    seat.reconnectToken = input.reconnectToken;
    seat.disconnectDeadline = null;
    seat.joinOrder = this.state.nextJoinOrder++;
    seat.health = seat.maxHealth;
    seat.claims = 0;
    seat.damage = 0;
    seat.combo = 0;
    seat.bestCombo = 0;
    seat.lastClaimAt = 0;
    seat.frozenUntil = 0;
    movePlayerToTeamBack(this.state.players, seat);
    this.state.typingByPlayer[seat.id] = { buffer: "", targetWordId: null };
    this.reconcileAiNames();
    this.touch();
    return {
      ok: true,
      events,
      revision: this.state.revision,
      playerId: seat.id,
      reconnectToken: input.reconnectToken,
      resumed: false,
      snapshot: this.snapshot(input.now, input.sessionId),
    };
  }

  disconnect(sessionId: string, now: number): EngineResult {
    const events = this.advance(now).events;
    const player = this.playerForSession(sessionId);
    if (!player || player.controller.kind !== "human") {
      return this.failure("PLAYER_NOT_FOUND", "No human player belongs to this session.", events);
    }
    if (!player.controller.connected && player.disconnectDeadline !== null) return this.success(events);
    player.controller.connected = false;
    player.controller.ready = false;
    player.disconnectDeadline = now + DISCONNECT_GRACE_MS;
    this.clearTyping(player.id);
    this.touch();
    return this.success(events);
  }

  leave(sessionId: string, now: number): EngineResult {
    const events = this.advance(now).events;
    const player = this.playerForSession(sessionId);
    if (!player || player.controller.kind !== "human") {
      return this.failure("PLAYER_NOT_FOUND", "No human player belongs to this session.", events);
    }
    this.replaceHumanWithAi(player, now, events);
    return this.success(events);
  }

  handleCommand(sessionId: string, command: RoomCommand, now: number): EngineResult {
    const events = this.advance(now).events;
    const player = this.playerForSession(sessionId);
    if (!player || player.controller.kind !== "human") {
      return this.failure("PLAYER_NOT_FOUND", "No human player belongs to this session.", events);
    }
    if (!player.controller.connected) {
      return this.failure("NOT_CONNECTED", "Reconnect before sending commands.", events);
    }

    switch (command.op) {
      case "ping":
      case "sync.request":
        return this.success(events);
      case "presence.ready":
        if (this.state.phase !== "lobby") return this.failure("WRONG_STAGE", "Ready state can only change in the lobby.", events);
        player.controller.ready = player.controller.isHost ? true : Boolean(command.ready);
        this.touch();
        return this.success(events);
      case "presence.leave":
        this.replaceHumanWithAi(player, now, events);
        return this.success(events);
      case "lobby.set_team":
        return this.setTeam(player, command.team, events);
      case "lobby.move":
        return this.movePlayer(player, command.playerId, command.direction, events);
      case "lobby.set_config":
        return this.setConfig(player, command.config, events);
      case "lobby.set_ai_level":
        return this.setAiLevel(player, command.playerId, command.level, events);
      case "lobby.remove_ai":
        return this.removeAi(player, command.playerId, events);
      case "match.start":
        return this.startMatch(player, now, events);
      case "match.restart":
        return this.restartMatch(player, events);
      case "type.cancel":
        if (this.state.phase !== "playing") return this.failure("WRONG_STAGE", "Typing is only available during a match.", events);
        this.clearTyping(player.id);
        this.touch();
        return this.success(events);
      case "type.key":
        return this.typeKey(player, command.key, now, events);
      default:
        return this.failure("UNKNOWN_COMMAND", "Unknown room command.", events);
    }
  }

  advance(now: number): EngineResult {
    const events: RoomEvent[] = [];
    let guard = 0;
    while (guard < 10_000) {
      guard += 1;
      const task = this.nextTask(events.length === 0);
      if (!task || task.at > now) break;
      const taskEvents: RoomEvent[] = [];
      this.runTask(task, taskEvents);
      if (taskEvents.length) {
        if (events.length === 0) events.push(taskEvents[0]);
        else this.state.deferredEvents.push(taskEvents[0]);
      }
    }
    if (guard >= 10_000) return this.failure("TASK_OVERFLOW", "Too many scheduled room tasks were due.", events);
    return this.success(events);
  }

  nextDueAt(): number | null {
    return this.nextTask()?.at ?? null;
  }

  spawnWord(now: number, forcedText?: string, forcedKind: SnowWordKind = "normal"): RoomWord | null {
    if (this.state.phase !== "playing") return null;
    const profile = SNOWFALL_PROFILES[this.state.config.snowfallLevel];
    const maxWords = clamp(this.activePlayers().length + profile.wordBonus, profile.minimumWords, profile.maximumWords);
    if (this.state.words.length >= maxWords) return null;
    const activeTexts = new Set(this.state.words.map((word) => word.text));
    let text = forcedText?.trim().toLowerCase() ?? "";
    let kind: SnowWordKind = forcedText ? forcedKind : "normal";
    if (text) {
      if (!isPlayableWord(text) || activeTexts.has(text) || hasPrefixCollision(text, activeTexts)) return null;
    } else {
      const canSpawnFrost = !this.state.words.some((word) => word.kind === "frost");
      const wantsFrost = forcedKind === "frost" || (canSpawnFrost && this.roll() < FROST_SPAWN_CHANCE);
      if (canSpawnFrost && wantsFrost) {
        text = this.drawFrostWord(activeTexts) ?? "";
        kind = text ? "frost" : "normal";
      }
      if (!text) text = this.drawWord(activeTexts) ?? "";
      if (!text) return null;
    }
    const ai = this.randomItem(this.aliveAiPlayers());
    const rawTiming = ai && ai.controller.kind === "ai"
      ? calculateAiTiming(ai.controller.level, text, now, this.random)
      : null;
    const frozenDelay = ai ? Math.max(0, ai.frozenUntil - now) : 0;
    const timing = rawTiming
      ? { startedAt: rawTiming.startedAt + frozenDelay, claimAt: rawTiming.claimAt + frozenDelay }
      : null;
    const id = this.state.nextWordId++;
    const restY = 52 + ((id * 11) % 20);
    const [minimumX, maximumX] = wordSpawnRange(text.length);
    const x = minimumX + this.roll() * (maximumX - minimumX);
    const speed = 4 + this.roll() * 2.3;
    const landedAt = calculateWordLandedAt(now, restY, speed);
    const word: RoomWord = {
      id,
      text,
      kind,
      x,
      restY,
      speed,
      drift: -13 + this.roll() * 26,
      bornAt: now,
      landedAt,
      expiresAt: landedAt + WORD_GROUND_TTL_MS,
      aiPlayerId: ai?.id ?? null,
      aiStartedAt: timing?.startedAt ?? null,
      aiClaimAt: timing?.claimAt ?? null,
    };
    this.state.words.push(word);
    const pools = buildWordPools(this.wordbooks[this.state.config.wordbookId]);
    if (kind === "frost") {
      const historySize = Math.min(3, Math.max(1, pools.frostWords.length - 1));
      this.state.recentFrostWords = [...this.state.recentFrostWords, text].slice(-historySize);
    } else {
      const historySize = wordHistorySize(pools.regularWords.length);
      this.state.recentWords = [...this.state.recentWords, text].slice(-historySize);
    }
    this.touch();
    return clone(word);
  }

  private publicPlayer(player: InternalPlayer): RoomPlayer {
    return {
      id: player.id,
      name: player.name,
      team: player.team,
      position: player.position,
      badge: player.badge,
      maxHealth: player.maxHealth,
      health: player.health,
      claims: player.claims,
      damage: player.damage,
      combo: player.combo,
      bestCombo: player.bestCombo,
      frozenUntil: player.frozenUntil,
      controller: clone(player.controller),
    };
  }

  private activePlayers(team?: Team) {
    return this.state.players
      .filter((player) => player.active && (!team || player.team === team))
      .sort((left, right) => left.team.localeCompare(right.team) || left.position - right.position);
  }

  private humanPlayers() {
    return this.state.players.filter((player) => player.active && player.controller.kind === "human");
  }

  private aliveAiPlayers() {
    return this.state.players.filter((player) => player.active && player.health > 0 && player.controller.kind === "ai");
  }

  private playerForSession(sessionId: string) {
    return this.state.players.find((player) => player.active && player.sessionId === sessionId) ?? null;
  }

  private isHumanNameTaken(name: string, exceptPlayerId: string | null = null) {
    const key = nameKey(name);
    return this.humanPlayers().some((player) => player.id !== exceptPlayerId && nameKey(player.name) === key);
  }

  private reconcileAiNames() {
    const usedNames = new Set(
      this.state.players
        .filter((player) => player.active && player.controller.kind === "human")
        .map((player) => nameKey(player.name)),
    );
    const activeAiPlayers = this.state.players
      .filter((player) => player.active && player.controller.kind === "ai")
      .sort((left, right) => left.team.localeCompare(right.team) || left.slot - right.slot);
    for (const player of activeAiPlayers) {
      player.name = createUniqueAiName(player.fallbackName, usedNames);
      player.badge = player.fallbackBadge;
      usedNames.add(nameKey(player.name));
    }
  }

  private typing(playerId: string) {
    return this.state.typingByPlayer[playerId] ?? (this.state.typingByPlayer[playerId] = { buffer: "", targetWordId: null });
  }

  private clearTyping(playerId: string) {
    this.state.typingByPlayer[playerId] = { buffer: "", targetWordId: null };
  }

  private roll() {
    return normalizeRandom(this.random());
  }

  private between([minimum, maximum]: [number, number]) {
    return minimum + this.roll() * (maximum - minimum);
  }

  private randomItem<T>(items: T[]) {
    return items.length ? items[Math.floor(this.roll() * items.length)] : null;
  }

  private touch() {
    this.state.revision += 1;
  }

  private emit(events: RoomEvent[], event: RoomEvent) {
    this.touch();
    if (events.length) this.state.deferredEvents.push(event);
    else events.push(event);
  }

  private success(events: RoomEvent[]): EngineSuccess {
    return { ok: true, events, revision: this.state.revision };
  }

  private failure(code: string, message: string, events: RoomEvent[]): EngineFailure {
    return { ok: false, code, message, events, revision: this.state.revision };
  }

  private selectJoinSeat() {
    const teams: Team[] = ["pine", "berry"];
    teams.sort((left, right) => {
      const humans = (team: Team) => this.humanPlayers().filter((player) => player.team === team).length;
      const difference = humans(left) - humans(right);
      if (difference) return difference;
      return left === "pine" ? -1 : 1;
    });
    for (const team of teams) {
      const activeAi = this.activePlayers(team).find((player) => player.controller.kind === "ai");
      if (activeAi) return activeAi;
      const inactive = this.state.players
        .filter((player) => player.team === team && !player.active)
        .sort((left, right) => left.slot - right.slot)[0];
      if (inactive) return inactive;
    }
    return null;
  }

  private activateSeat(player: InternalPlayer) {
    const teammates = this.activePlayers(player.team);
    if (teammates.length >= MAX_TEAM_SIZE) return false;
    player.fallbackAiLevel = DEFAULT_AI_LEVEL;
    player.controller = { kind: "ai", level: DEFAULT_AI_LEVEL };
    player.active = true;
    player.position = teammates.length;
    player.health = player.maxHealth;
    player.frozenUntil = 0;
    if (player.team === "pine") this.state.config.pineSize = teammates.length + 1;
    else this.state.config.berrySize = teammates.length + 1;
    return true;
  }

  private setTeam(player: InternalPlayer, team: Team, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "lobby") return this.failure("WRONG_STAGE", "Teams can only change in the lobby.", events);
    if (player.team === team) return this.success(events);
    let target = this.activePlayers(team).find((candidate) => candidate.controller.kind === "ai");
    if (!target) {
      target = this.state.players.filter((candidate) => candidate.team === team && !candidate.active).sort((a, b) => a.slot - b.slot)[0];
      if (!target || !this.activateSeat(target)) return this.failure("TEAM_FULL", "That team already has four human players.", events);
    }
    const wasHost = player.controller.kind === "human" && player.controller.isHost;
    const humanController = clone(player.controller);
    const identity = {
      name: player.name,
      badge: player.badge,
      sessionId: player.sessionId,
      reconnectToken: player.reconnectToken,
      disconnectDeadline: player.disconnectDeadline,
      joinOrder: player.joinOrder,
    };
    this.resetSeatToAi(player);
    target.name = identity.name;
    target.badge = identity.badge;
    target.fallbackAiLevel = DEFAULT_AI_LEVEL;
    target.controller = humanController;
    target.sessionId = identity.sessionId;
    target.reconnectToken = identity.reconnectToken;
    target.disconnectDeadline = identity.disconnectDeadline;
    target.joinOrder = identity.joinOrder;
    target.health = target.maxHealth;
    target.frozenUntil = 0;
    movePlayerToTeamBack(this.state.players, target);
    this.clearTyping(player.id);
    this.clearTyping(target.id);
    if (wasHost) this.setHost(target);
    this.reconcileAiNames();
    this.invalidateReadyStates();
    this.touch();
    return this.success(events);
  }

  private movePlayer(actor: InternalPlayer, playerId: string, direction: -1 | 1, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "lobby") return this.failure("WRONG_STAGE", "Formation can only change in the lobby.", events);
    const player = this.state.players.find((candidate) => candidate.active && candidate.id === playerId);
    if (!player) return this.failure("PLAYER_NOT_FOUND", "Formation player was not found.", events);
    if (actor.controller.kind !== "human" || (!actor.controller.isHost && actor.id !== player.id)) {
      return this.failure("SELF_ONLY", "普通玩家只能调整自己的站位。", events);
    }
    const teammate = this.activePlayers(player.team).find((candidate) => candidate.position === player.position + direction);
    if (!teammate) return this.failure("INVALID_MOVE", "The player cannot move farther in that direction.", events);
    const previous = player.position;
    player.position = teammate.position;
    teammate.position = previous;
    this.invalidateReadyStates();
    this.touch();
    return this.success(events);
  }

  private setConfig(actor: InternalPlayer, patch: Partial<RoomConfig>, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "lobby") return this.failure("WRONG_STAGE", "Room configuration is locked after countdown.", events);
    if (actor.controller.kind !== "human" || !actor.controller.isHost) return this.failure("HOST_ONLY", "Only the host can configure the room.", events);
    const next = { ...this.state.config, ...patch };
    if (!Number.isInteger(next.pineSize) || !Number.isInteger(next.berrySize) || next.pineSize < 1 || next.pineSize > 4 || next.berrySize < 1 || next.berrySize > 4) {
      return this.failure("INVALID_TEAM_SIZE", "Each team must contain one to four active seats.", events);
    }
    if (!(next.wordbookId in this.wordbooks)) return this.failure("INVALID_WORDBOOK", "Unknown wordbook.", events);
    if (!(next.snowfallLevel in SNOWFALL_PROFILES)) return this.failure("INVALID_SNOWFALL", "Unknown snowfall level.", events);
    for (const team of ["pine", "berry"] as const) {
      const desired = team === "pine" ? next.pineSize : next.berrySize;
      if (this.humanPlayers().filter((player) => player.team === team).length > desired) {
        return this.failure("TEAM_HAS_HUMANS", "A team cannot be smaller than its human player count.", events);
      }
    }
    this.resizeTeam("pine", next.pineSize);
    this.resizeTeam("berry", next.berrySize);
    this.reconcileAiNames();
    const wordbookChanged = next.wordbookId !== this.state.config.wordbookId;
    this.state.config = next;
    if (wordbookChanged) {
      this.state.wordBagBookId = next.wordbookId;
      this.state.wordBag = [];
      this.state.frostWordBag = [];
      this.state.recentWords = [];
      this.state.recentFrostWords = [];
    }
    this.invalidateReadyStates();
    this.touch();
    return this.success(events);
  }

  private resizeTeam(team: Team, desired: number) {
    let active = this.activePlayers(team);
    while (active.length > desired) {
      const removed = [...active].reverse().find((player) => player.controller.kind === "ai");
      if (!removed) break;
      this.deactivateAiSeat(removed);
      active = this.activePlayers(team);
    }
    while (active.length < desired) {
      const seat = this.state.players.filter((player) => player.team === team && !player.active).sort((a, b) => a.slot - b.slot)[0];
      if (!seat) break;
      this.activateSeat(seat);
      active = this.activePlayers(team);
    }
  }

  private deactivateAiSeat(player: InternalPlayer) {
    const previousPosition = player.position;
    const team = player.team;
    player.fallbackAiLevel = DEFAULT_AI_LEVEL;
    this.resetSeatToAi(player);
    player.active = false;
    this.clearTyping(player.id);
    for (const teammate of this.activePlayers(team)) {
      if (teammate.position > previousPosition) teammate.position -= 1;
    }
    const nextSize = this.activePlayers(team).length;
    if (team === "pine") this.state.config.pineSize = nextSize;
    else this.state.config.berrySize = nextSize;
  }

  private removeAi(actor: InternalPlayer, playerId: string, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "lobby") return this.failure("WRONG_STAGE", "AI can only be removed in the lobby.", events);
    if (actor.controller.kind !== "human" || !actor.controller.isHost) return this.failure("HOST_ONLY", "Only the host can remove AI players.", events);
    const target = this.state.players.find((player) => player.active && player.id === playerId);
    if (!target || target.controller.kind !== "ai") return this.failure("NOT_AN_AI", "The selected seat is not controlled by AI.", events);
    if (this.activePlayers(target.team).length <= 1) return this.failure("MIN_TEAM_SIZE", "Each team must keep at least one player.", events);
    this.deactivateAiSeat(target);
    this.reconcileAiNames();
    this.invalidateReadyStates();
    this.touch();
    return this.success(events);
  }

  private setAiLevel(actor: InternalPlayer, playerId: string, level: AiLevel, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "lobby") return this.failure("WRONG_STAGE", "AI level can only change in the lobby.", events);
    if (actor.controller.kind !== "human" || !actor.controller.isHost) return this.failure("HOST_ONLY", "Only the host can configure AI.", events);
    if (!(level in AI_LEVELS)) return this.failure("INVALID_AI_LEVEL", "Unknown AI difficulty.", events);
    const target = this.state.players.find((player) => player.active && player.id === playerId);
    if (!target || target.controller.kind !== "ai") return this.failure("NOT_AN_AI", "The selected seat is not controlled by AI.", events);
    target.controller.level = level;
    target.fallbackAiLevel = level;
    this.invalidateReadyStates();
    this.touch();
    return this.success(events);
  }

  private invalidateReadyStates() {
    for (const player of this.humanPlayers()) {
      if (player.controller.kind === "human") player.controller.ready = player.controller.isHost;
    }
  }

  private startMatch(actor: InternalPlayer, now: number, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "lobby") return this.failure("WRONG_STAGE", "The match cannot start from this stage.", events);
    if (actor.controller.kind !== "human" || !actor.controller.isHost) return this.failure("HOST_ONLY", "Only the host can start the match.", events);
    const humans = this.humanPlayers();
    if (humans.some((player) => player.controller.kind === "human" && !player.controller.connected)) {
      return this.failure("PLAYER_DISCONNECTED", "Wait for disconnected players or remove them.", events);
    }
    if (humans.some((player) => player.controller.kind === "human" && !player.controller.isHost && !player.controller.ready)) {
      return this.failure("NOT_READY", "Every guest must be ready.", events);
    }
    for (const player of this.activePlayers()) {
      player.health = player.maxHealth;
      player.claims = 0;
      player.damage = 0;
      player.combo = 0;
      player.bestCombo = 0;
      player.lastClaimAt = 0;
      player.actorNextAt = now;
      player.frozenUntil = 0;
      this.clearTyping(player.id);
    }
    this.state.words = [];
    this.state.pendingAttacks = [];
    this.state.phase = "countdown";
    this.state.countdownEndsAt = now + COUNTDOWN_MS;
    this.state.startedAt = null;
    this.state.winner = null;
    this.state.nextSpawnAt = null;
    this.touch();
    return this.success(events);
  }

  private restartMatch(actor: InternalPlayer, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "ended") return this.failure("WRONG_STAGE", "Only an ended match can restart.", events);
    if (actor.controller.kind !== "human" || !actor.controller.isHost) return this.failure("HOST_ONLY", "Only the host can restart the match.", events);
    this.state.phase = "lobby";
    this.state.countdownEndsAt = null;
    this.state.startedAt = null;
    this.state.winner = null;
    this.state.words = [];
    this.state.pendingAttacks = [];
    for (const player of this.activePlayers()) {
      player.health = player.maxHealth;
      player.claims = 0;
      player.damage = 0;
      player.combo = 0;
      player.bestCombo = 0;
      player.lastClaimAt = 0;
      player.frozenUntil = 0;
      this.clearTyping(player.id);
    }
    this.invalidateReadyStates();
    this.touch();
    return this.success(events);
  }

  private typeKey(player: InternalPlayer, rawKey: string, now: number, events: RoomEvent[]): EngineResult {
    if (this.state.phase !== "playing") return this.failure("WRONG_STAGE", "Typing is only available during a match.", events);
    if (player.health <= 0) return this.failure("PLAYER_OUT", "Knocked-out players cannot type.", events);
    if (player.frozenUntil > now) {
      this.emit(events, { type: "typing.rejected", playerId: player.id, reason: "FROZEN" });
      return this.success(events);
    }
    const key = String(rawKey ?? "").toLowerCase();
    if (!/^[a-z]$/.test(key)) return this.failure("INVALID_KEY", "Type one English letter at a time.", events);
    const typing = this.typing(player.id);
    let target = typing.targetWordId === null ? null : this.state.words.find((word) => word.id === typing.targetWordId) ?? null;
    if (typing.targetWordId !== null && !target) {
      this.clearTyping(player.id);
      player.combo = 0;
      this.emit(events, { type: "typing.rejected", playerId: player.id, reason: "TARGET_GONE" });
      return this.success(events);
    }
    const candidateBuffer = `${typing.buffer}${key}`.slice(0, MAX_WORD_LENGTH);
    const matches = target
      ? target.text.startsWith(candidateBuffer) ? [target] : []
      : this.state.words.filter((word) => word.text.startsWith(candidateBuffer));
    if (!matches.length) {
      player.combo = 0;
      this.emit(events, { type: "typing.rejected", playerId: player.id, reason: "NO_MATCH" });
      return this.success(events);
    }
    if (!target && matches.length === 1) target = matches[0];
    typing.buffer = candidateBuffer;
    typing.targetWordId = target?.id ?? null;
    const exact = matches.find((word) => word.text === candidateBuffer) ?? null;
    if (exact) this.claimWord(exact.id, player.id, now, events);
    else this.touch();
    return this.success(events);
  }

  private claimWord(wordId: number, attackerId: string, now: number, events: RoomEvent[]) {
    if (this.state.phase !== "playing") return false;
    const wordIndex = this.state.words.findIndex((word) => word.id === wordId);
    const attacker = this.state.players.find((player) => player.active && player.id === attackerId && player.health > 0);
    if (wordIndex < 0 || !attacker || attacker.frozenUntil > now || this.state.words[wordIndex].expiresAt <= now) return false;
    const [word] = this.state.words.splice(wordIndex, 1);
    let damage = word.kind === "frost" ? FROST_DAMAGE : calculateWordDamage(word.text.length);
    if (attacker.controller.kind === "human") {
      attacker.combo = attacker.lastClaimAt > 0 && now - attacker.lastClaimAt < COMBO_WINDOW_MS ? attacker.combo + 1 : 1;
      attacker.bestCombo = Math.max(attacker.bestCombo, attacker.combo);
      attacker.lastClaimAt = now;
      if (word.kind === "normal") {
        damage = clamp(damage + Math.min(2, Math.floor(attacker.combo / 5)), 10, 15);
      }
    }
    attacker.claims += 1;
    const startsAt = Math.max(now, attacker.actorNextAt || now);
    attacker.actorNextAt = startsAt + ACTOR_QUEUE_INTERVAL_MS;
    const targetTeam: Team = attacker.team === "pine" ? "berry" : "pine";
    const targets = word.kind === "frost"
      ? this.activePlayers(targetTeam)
        .filter((player) => player.health > 0)
        .sort((left, right) => left.position - right.position)
      : [this.frontline(targetTeam)].filter((player): player is InternalPlayer => Boolean(player));
    const target = targets[0] ?? null;
    const claimId = `claim-${this.state.nextClaimId++}`;
    const attackId = `attack-${this.state.nextAttackId++}`;
    const attack: PendingAttack = {
      id: attackId,
      claimId,
      attackerId: attacker.id,
      targetId: target?.id ?? null,
      targetIds: targets.map((candidate) => candidate.id),
      word: word.text,
      kind: word.kind,
      damage,
      startsAt,
      throwAt: startsAt + ATTACK_THROW_DELAY_MS,
      resolveAt: startsAt + ATTACK_RESOLVE_DELAY_MS,
      resolved: false,
    };
    this.state.pendingAttacks.push(attack);
    for (const [playerId, typing] of Object.entries(this.state.typingByPlayer)) {
      if (typing.targetWordId === word.id || playerId === attacker.id) this.clearTyping(playerId);
    }
    this.emit(events, {
      type: "word.claimed",
      claimId,
      attackId,
      word: clone(word),
      attackerId: attacker.id,
      targetId: target?.id ?? null,
      targetIds: attack.targetIds,
      damage,
      startsAt: attack.startsAt,
      throwAt: attack.throwAt,
      resolveAt: attack.resolveAt,
    });
    return true;
  }

  private frontline(team: Team) {
    return this.activePlayers(team).filter((player) => player.health > 0).sort((a, b) => a.position - b.position)[0] ?? null;
  }

  private nextTask(includeDeferredEvents = true): DueTask | null {
    const tasks: DueTask[] = [];
    if (includeDeferredEvents && this.state.deferredEvents.length) {
      tasks.push({ at: 0, priority: -1, kind: "event", id: "deferred-event" });
    }
    if (this.state.phase === "countdown" && this.state.countdownEndsAt !== null) {
      tasks.push({ at: this.state.countdownEndsAt, priority: 0, kind: "countdown", id: "countdown" });
    }
    for (const player of this.humanPlayers()) {
      if (player.disconnectDeadline !== null) tasks.push({ at: player.disconnectDeadline, priority: 1, kind: "disconnect", id: player.id });
    }
    if (this.state.phase === "playing") {
      for (const word of this.state.words) {
        if (word.aiClaimAt !== null) tasks.push({ at: word.aiClaimAt, priority: 3, kind: "ai", id: String(word.id) });
      }
      if (this.state.nextSpawnAt !== null) tasks.push({ at: this.state.nextSpawnAt, priority: 5, kind: "spawn", id: "spawn" });
    }
    if (this.state.phase === "playing" || this.state.phase === "ended") {
      for (const word of this.state.words) {
        tasks.push({ at: word.expiresAt, priority: 2, kind: "word-expire", id: String(word.id) });
      }
    }
    if (this.state.phase === "playing" || this.state.phase === "ended") {
      for (const attack of this.state.pendingAttacks) {
        if (!attack.resolved) tasks.push({ at: attack.resolveAt, priority: 4, kind: "attack", id: attack.id });
      }
    }
    return tasks.sort((left, right) => {
      const timeOrder = left.at - right.at || left.priority - right.priority;
      if (timeOrder) return timeOrder;
      if (left.kind === "attack" && right.kind === "attack") {
        const leftSequence = Number(left.id.slice(left.id.lastIndexOf("-") + 1));
        const rightSequence = Number(right.id.slice(right.id.lastIndexOf("-") + 1));
        if (Number.isFinite(leftSequence) && Number.isFinite(rightSequence)) {
          return leftSequence - rightSequence;
        }
      }
      return left.id.localeCompare(right.id);
    })[0] ?? null;
  }

  private runTask(task: DueTask, events: RoomEvent[]) {
    if (task.kind === "event") {
      const event = this.state.deferredEvents.shift();
      if (!event) return;
      this.touch();
      events.push(event);
      return;
    }
    if (task.kind === "countdown") {
      if (this.state.phase !== "countdown" || this.state.countdownEndsAt !== task.at) return;
      this.state.phase = "playing";
      this.state.startedAt = task.at;
      this.state.countdownEndsAt = null;
      const profile = SNOWFALL_PROFILES[this.state.config.snowfallLevel];
      for (let index = 0; index < profile.initialWords; index += 1) {
        this.spawnWord(task.at, undefined, index === 0 ? "frost" : "normal");
      }
      this.state.nextSpawnAt = task.at + this.createSpawnDelay();
      this.emit(events, { type: "match.started", startedAt: task.at });
      return;
    }
    if (task.kind === "disconnect") {
      const player = this.state.players.find((candidate) => candidate.id === task.id);
      if (!player || player.controller.kind !== "human" || player.controller.connected || player.disconnectDeadline !== task.at) return;
      this.replaceHumanWithAi(player, task.at, events);
      return;
    }
    if (task.kind === "word-expire") {
      const wordIndex = this.state.words.findIndex((candidate) => (
        candidate.id === Number(task.id) && candidate.expiresAt === task.at
      ));
      if (wordIndex < 0) return;
      const [expiredWord] = this.state.words.splice(wordIndex, 1);
      for (const [playerId, typing] of Object.entries(this.state.typingByPlayer)) {
        if (typing.targetWordId === expiredWord.id) {
          this.clearTyping(playerId);
          continue;
        }
        if (typing.buffer && !this.state.words.some((word) => word.text.startsWith(typing.buffer))) {
          this.clearTyping(playerId);
        }
      }
      this.touch();
      return;
    }
    if (task.kind === "ai") {
      const word = this.state.words.find((candidate) => candidate.id === Number(task.id));
      if (!word || word.aiClaimAt !== task.at) return;
      const ai = word.aiPlayerId ? this.state.players.find((player) => player.id === word.aiPlayerId) : null;
      if (!ai || !ai.active || ai.health <= 0 || ai.controller.kind !== "ai") {
        this.assignWordAi(word, task.at);
        this.touch();
        return;
      }
      if (ai.frozenUntil > task.at) {
        const delay = ai.frozenUntil - task.at;
        if (word.aiStartedAt !== null && word.aiStartedAt > task.at) word.aiStartedAt += delay;
        word.aiClaimAt += delay;
        this.touch();
        return;
      }
      this.claimWord(word.id, ai.id, task.at, events);
      return;
    }
    if (task.kind === "attack") {
      const attack = this.state.pendingAttacks.find((candidate) => candidate.id === task.id);
      if (
        !attack
        || attack.resolved
        || attack.resolveAt !== task.at
        || (this.state.phase !== "playing" && this.state.phase !== "ended")
      ) return;
      const attacker = this.state.players.find((player) => player.id === attack.attackerId);
      const targetTeam: Team | null = attacker?.active
        ? attacker.team === "pine" ? "berry" : "pine"
        : null;
      attack.resolved = true;
      const lockedTargetIds = attack.kind === "frost"
        ? attack.targetIds
        : attack.targetIds.slice(0, 1);
      const lockedTargets = targetTeam
        ? lockedTargetIds
          .map((targetId) => this.state.players.find((player) => player.id === targetId))
          .filter((target): target is InternalPlayer => Boolean(
            target
            && target.active
            && target.team === targetTeam,
          ))
        : [];
      const hits = [] as Extract<RoomEvent, { type: "attack.resolved" }>["hits"];
      if (attacker?.active) {
        for (const target of lockedTargets) {
          if (target.health <= 0) continue;
          const actualDamage = Math.min(target.health, attack.damage);
          target.health -= actualDamage;
          attacker.damage += actualDamage;
          let frozenUntil: number | null = null;
          if (target.health <= 0) {
            target.frozenUntil = 0;
            for (const queuedAttack of this.state.pendingAttacks) {
              if (
                !queuedAttack.resolved
                && queuedAttack.attackerId === target.id
                && queuedAttack.throwAt > task.at
              ) queuedAttack.resolved = true;
            }
          } else if (attack.kind === "frost") {
            frozenUntil = this.freezePlayer(target, task.at);
          }
          hits.push({
            targetId: target.id,
            actualDamage,
            targetHealth: target.health,
            frozenUntil,
          });
        }
      }
      let winner: Team | null = null;
      if (
        this.state.phase === "playing"
        && attacker?.active
        && targetTeam
        && !this.frontline(targetTeam)
      ) {
        winner = attacker.team;
        this.state.phase = "ended";
        this.state.winner = winner;
        this.state.nextSpawnAt = null;
        for (const queuedAttack of this.state.pendingAttacks) {
          if (!queuedAttack.resolved && queuedAttack.throwAt > task.at) queuedAttack.resolved = true;
        }
      }
      const primaryTarget = attack.targetId
        ? this.state.players.find((player) => player.id === attack.targetId) ?? null
        : null;
      const primaryHit = hits.find((hit) => hit.targetId === attack.targetId) ?? hits[0] ?? null;
      this.emit(events, {
        type: "attack.resolved",
        attackId: attack.id,
        attackerId: attack.attackerId,
        kind: attack.kind,
        hits,
        targetId: attack.targetId,
        actualDamage: primaryHit?.actualDamage ?? 0,
        targetHealth: primaryHit?.targetHealth ?? primaryTarget?.health ?? null,
        frozenUntil: primaryHit?.frozenUntil ?? null,
        missed: hits.length === 0,
        winner,
      });
      if (winner) this.emit(events, { type: "match.ended", winner });
      return;
    }
    if (task.kind === "spawn") {
      if (this.state.phase !== "playing" || this.state.nextSpawnAt !== task.at) return;
      this.spawnWord(task.at);
      this.state.nextSpawnAt = task.at + this.createSpawnDelay();
    }
  }

  private replaceHumanWithAi(player: InternalPlayer, now: number, events: RoomEvent[]) {
    player.controller = { kind: "ai", level: player.fallbackAiLevel };
    player.sessionId = null;
    player.reconnectToken = null;
    player.disconnectDeadline = null;
    player.combo = 0;
    player.lastClaimAt = 0;
    this.clearTyping(player.id);
    this.reconcileHostInvariant();
    this.reconcileAiNames();
    for (const word of this.state.words) {
      if (word.aiPlayerId === null) this.assignWordAi(word, now);
    }
    this.emit(events, { type: "player.replaced_by_ai", playerId: player.id });
  }

  private resetSeatToAi(player: InternalPlayer) {
    player.name = player.fallbackName;
    player.badge = player.fallbackBadge;
    player.controller = { kind: "ai", level: player.fallbackAiLevel };
    player.sessionId = null;
    player.reconnectToken = null;
    player.disconnectDeadline = null;
    player.joinOrder = 0;
    player.health = player.maxHealth;
    player.claims = 0;
    player.damage = 0;
    player.combo = 0;
    player.bestCombo = 0;
    player.lastClaimAt = 0;
    player.actorNextAt = 0;
    player.frozenUntil = 0;
  }

  private setHost(player: InternalPlayer | null) {
    for (const candidate of this.humanPlayers()) {
      if (candidate.controller.kind !== "human") continue;
      candidate.controller.isHost = candidate.id === player?.id;
      if (candidate.controller.isHost) candidate.controller.ready = true;
    }
    this.state.hostPlayerId = player?.id ?? null;
  }

  private reconcileHostInvariant() {
    const humans = this.humanPlayers().sort((left, right) => left.joinOrder - right.joinOrder);
    const current = humans.find((player) => player.id === this.state.hostPlayerId) ?? null;
    const flagged = humans.find((player) => player.controller.kind === "human" && player.controller.isHost) ?? null;
    const connected = humans.find((player) => player.controller.kind === "human" && player.controller.connected) ?? null;
    this.setHost(current ?? flagged ?? connected ?? humans[0] ?? null);
  }

  private freezePlayer(player: InternalPlayer, now: number) {
    const previousEnd = Math.max(now, player.frozenUntil);
    const nextEnd = Math.max(player.frozenUntil, now + FROST_FREEZE_MS);
    const extension = nextEnd - previousEnd;
    player.frozenUntil = nextEnd;
    if (extension > 0 && player.controller.kind === "ai") {
      for (const word of this.state.words) {
        if (word.aiPlayerId !== player.id || word.aiClaimAt === null || word.aiClaimAt <= now) continue;
        if (word.aiStartedAt !== null && word.aiStartedAt > now) word.aiStartedAt += extension;
        word.aiClaimAt += extension;
      }
    }
    return nextEnd;
  }

  private assignWordAi(word: RoomWord, now: number) {
    const ai = this.randomItem(this.aliveAiPlayers());
    if (!ai || ai.controller.kind !== "ai") {
      word.aiPlayerId = null;
      word.aiStartedAt = null;
      word.aiClaimAt = null;
      return;
    }
    const timing = calculateAiTiming(ai.controller.level, word.text, now, this.random);
    const frozenDelay = Math.max(0, ai.frozenUntil - now);
    word.aiPlayerId = ai.id;
    word.aiStartedAt = timing.startedAt + frozenDelay;
    word.aiClaimAt = timing.claimAt + frozenDelay;
  }

  private createSpawnDelay() {
    const profile = SNOWFALL_PROFILES[this.state.config.snowfallLevel];
    const playerScale = clamp(1 - (this.activePlayers().length - 2) * 0.035, 0.82, 1);
    const weatherRoll = this.roll();
    const weatherScale = weatherRoll < 0.18 ? 0.58 : weatherRoll > 0.9 ? 1.45 : 1;
    return Math.round(this.between(profile.interval) * playerScale * weatherScale);
  }

  private drawFrostWord(activeTexts: Set<string>) {
    this.reconcileWordBagBook();
    const pool = buildWordPools(this.wordbooks[this.state.config.wordbookId]).frostWords;
    const draw = drawWordFromBag({
      bag: this.state.frostWordBag,
      pool,
      activeWords: activeTexts,
      recentWords: new Set(this.state.recentFrostWords),
      avoidImmediateWord: this.state.recentFrostWords.at(-1) ?? null,
      random: () => this.roll(),
    });
    this.state.frostWordBag = draw.bag;
    return draw.word;
  }

  private drawWord(activeTexts: Set<string>) {
    this.reconcileWordBagBook();
    const pool = buildWordPools(this.wordbooks[this.state.config.wordbookId]).regularWords;
    const draw = drawWordFromBag({
      bag: this.state.wordBag,
      pool,
      activeWords: activeTexts,
      recentWords: new Set(this.state.recentWords),
      avoidImmediateWord: this.state.recentWords.at(-1) ?? null,
      random: () => this.roll(),
    });
    this.state.wordBag = draw.bag;
    return draw.word;
  }

  private reconcileWordBagBook() {
    const bookId = this.state.config.wordbookId;
    if (this.state.wordBagBookId !== bookId) {
      this.state.wordBagBookId = bookId;
      this.state.wordBag = [];
      this.state.frostWordBag = [];
      this.state.recentWords = [];
      this.state.recentFrostWords = [];
    }
  }
}

export const ROOM_ENGINE_CONSTANTS = {
  maxHumans: MAX_HUMANS,
  maxTeamSize: MAX_TEAM_SIZE,
  disconnectGraceMs: DISCONNECT_GRACE_MS,
  countdownMs: COUNTDOWN_MS,
  actorQueueIntervalMs: ACTOR_QUEUE_INTERVAL_MS,
  frostWordPoolSize: FROST_WORD_POOL_SIZE,
  frostSpawnChance: FROST_SPAWN_CHANCE,
  frostDamage: FROST_DAMAGE,
  frostFreezeMs: FROST_FREEZE_MS,
  wordGroundTtlMs: WORD_GROUND_TTL_MS,
  wordStartY: WORD_START_Y,
  wordPoolVersion: WORD_POOL_VERSION,
  attackResolveDelayMs: ATTACK_RESOLVE_DELAY_MS,
} as const;

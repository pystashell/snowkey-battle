"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { OnlineLobby } from "./OnlineLobby";
import { useRoomSocket } from "./useRoomSocket";
import { WORD_BOOKS, WORD_BOOK_OPTIONS, type WordbookId } from "./wordbooks";
import {
  isRoomCode,
  sanitizeRoomCode,
  type RoomEvent,
  type RoomPlayer,
  type RoomSnapshot,
  type RoomWord,
  type SnowWordKind,
} from "../shared/game-protocol";

type Team = "pine" | "berry";
type Stage = "lobby" | "countdown" | "playing" | "paused" | "ended";
type AiLevel = "rookie" | "steady" | "expert";
type PlayerRole = "tank" | "balanced" | "striker";
type SnowfallLevel = "light" | "classic" | "blizzard";
type GameMode = "local" | "online";

type Player = {
  id: string;
  name: string;
  team: Team;
  badge: string;
  slot: number;
  position: number;
  role: PlayerRole;
  isUser?: boolean;
  active: boolean;
  aiLevel?: AiLevel;
  health: number;
  maxHealth: number;
  claims: number;
  damage: number;
  frozenUntil: number;
  controllerKind?: "human" | "ai";
  connected?: boolean;
  ready?: boolean;
};

type SnowWord = {
  id: number;
  text: string;
  kind: SnowWordKind;
  x: number;
  y: number;
  restY: number;
  speed: number;
  drift: number;
  bornAt: number;
  aiStartedAt: number | null;
  claimAt: number | null;
  aiProgress: number;
  aiTeam: Team | null;
  aiPlayerId: string | null;
};

type Projectile = {
  id: number;
  team: Team;
  text: string;
  damage: number;
  kind: SnowWordKind;
  sourcePlayerId: string;
  targetPlayerId: string;
  fromX: number;
  fromY: number;
  midX: number;
  apexY: number;
  toX: number;
  toY: number;
};

type CharacterPhase =
  | "idle"
  | "catch"
  | "hold"
  | "windup"
  | "throw"
  | "hit"
  | "cheer"
  | "defeat";

type CharacterAction = {
  phase: CharacterPhase;
  token: number;
  word?: string;
  kind?: SnowWordKind;
};

type CatchEffect = {
  id: number;
  sourcePlayerId: string;
  team: Team;
  text: string;
  kind: SnowWordKind;
  fromX: number;
  fromY: number;
  midX: number;
  apexY: number;
  toX: number;
  toY: number;
};

type ActorAnchor = {
  x: number;
  handY: number;
  hitY: number;
};

type ManagedTimer = {
  id: number;
  dueAt: number;
  remaining: number;
  callback: () => void;
};

const AI_LEVELS: Record<
  AiLevel,
  {
    label: string;
    short: string;
    reaction: [number, number];
    charMs: [number, number];
  }
> = {
  rookie: {
    label: "新手 AI",
    short: "慢",
    reaction: [1500, 2300],
    charMs: [430, 610],
  },
  steady: {
    label: "熟练 AI",
    short: "中",
    reaction: [1000, 1650],
    charMs: [310, 450],
  },
  expert: {
    label: "高手 AI",
    short: "快",
    reaction: [650, 1150],
    charMs: [230, 340],
  },
};

const FROST_WORD_MIN_LENGTH = 11;
const FROST_SPAWN_CHANCE = 0.08;
const FROST_DAMAGE = 15;
const FROST_FREEZE_MS = 1_000;

const SNOWFALL_PROFILES: Record<
  SnowfallLevel,
  {
    label: string;
    short: string;
    interval: [number, number];
    wordBonus: number;
    minimumWords: number;
    maximumWords: number;
    initialWords: number;
  }
> = {
  light: {
    label: "舒缓",
    short: "小雪",
    interval: [1400, 1900],
    wordBonus: 3,
    minimumWords: 5,
    maximumWords: 9,
    initialWords: 3,
  },
  classic: {
    label: "标准",
    short: "标准雪",
    interval: [850, 1250],
    wordBonus: 5,
    minimumWords: 7,
    maximumWords: 12,
    initialWords: 5,
  },
  blizzard: {
    label: "暴雪",
    short: "暴雪",
    interval: [520, 780],
    wordBonus: 7,
    minimumWords: 9,
    maximumWords: 14,
    initialWords: 7,
  },
};

const ROLE_LABELS: Record<PlayerRole, string> = {
  tank: "肉盾",
  balanced: "均衡",
  striker: "快手",
};

const PLAYER_SEEDS: Array<Omit<Player, "active" | "position" | "health" | "claims" | "damage" | "frozenUntil">> = [
  {
    id: "you",
    name: "小雪球",
    team: "pine",
    badge: "你",
    slot: 0,
    role: "balanced",
    isUser: true,
    maxHealth: 90,
  },
  {
    id: "pine-1",
    name: "阿澄",
    team: "pine",
    badge: "澄",
    slot: 1,
    role: "tank",
    aiLevel: "rookie",
    maxHealth: 125,
  },
  {
    id: "pine-2",
    name: "米糕",
    team: "pine",
    badge: "糕",
    slot: 2,
    role: "balanced",
    aiLevel: "steady",
    maxHealth: 95,
  },
  {
    id: "pine-3",
    name: "小北",
    team: "pine",
    badge: "北",
    slot: 3,
    role: "striker",
    aiLevel: "expert",
    maxHealth: 72,
  },
  {
    id: "berry-1",
    name: "团子",
    team: "berry",
    badge: "团",
    slot: 0,
    role: "tank",
    aiLevel: "rookie",
    maxHealth: 130,
  },
  {
    id: "berry-2",
    name: "柚子",
    team: "berry",
    badge: "柚",
    slot: 1,
    role: "balanced",
    aiLevel: "steady",
    maxHealth: 94,
  },
  {
    id: "berry-3",
    name: "阿满",
    team: "berry",
    badge: "满",
    slot: 2,
    role: "striker",
    aiLevel: "expert",
    maxHealth: 70,
  },
  {
    id: "berry-4",
    name: "星星",
    team: "berry",
    badge: "星",
    slot: 3,
    role: "balanced",
    aiLevel: "steady",
    maxHealth: 100,
  },
];

const KID_PALETTES = [
  { coat: "#3c9b4d", hat: "#23813e", scarf: "#ffd166", skin: "#ffd1aa" },
  { coat: "#48a958", hat: "#1f7a38", scarf: "#f4b942", skin: "#edb990" },
  { coat: "#2f9144", hat: "#50b55e", scarf: "#ffe08a", skin: "#f4c39c" },
  { coat: "#63b85d", hat: "#297f3c", scarf: "#f6c453", skin: "#d99e76" },
  { coat: "#dc3f46", hat: "#b82134", scarf: "#ffd166", skin: "#f1c09a" },
  { coat: "#e95158", hat: "#c72d3d", scarf: "#f7c75f", skin: "#dca47d" },
  { coat: "#c92f42", hat: "#ef6267", scarf: "#ffd883", skin: "#f3c6a3" },
  { coat: "#e6605f", hat: "#b52839", scarf: "#ffd166", skin: "#e5ad86" },
];

const AMBIENT_SNOW = Array.from({ length: 34 }, (_, index) => ({
  id: index,
  left: (index * 37 + 11) % 100,
  size: 3 + ((index * 7) % 7),
  delay: -((index * 0.63) % 8),
  duration: 7 + ((index * 13) % 8),
}));

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function randomBetween([minimum, maximum]: [number, number]) {
  return minimum + Math.random() * (maximum - minimum);
}

function shuffleWords(words: readonly string[]) {
  const shuffled = [...words];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function hasPrefixCollision(candidate: string, activeWords: Set<string>) {
  return [...activeWords].some(
    (activeWord) => candidate.startsWith(activeWord) || activeWord.startsWith(candidate),
  );
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function calculateWordDamage(length: number) {
  if (length <= 5) return 10;
  if (length <= 8) return 11;
  if (length <= 11) return 12;
  return 13;
}

function isFrostWordCandidate(word: string) {
  return word.length >= FROST_WORD_MIN_LENGTH;
}

function regularWordPool(words: readonly string[]) {
  const regular = words.filter((word) => !isFrostWordCandidate(word));
  return regular.length ? regular : [...words];
}

function createSpawnDelay(interval: [number, number], playerScale: number) {
  const weatherRoll = Math.random();
  const flurryScale = weatherRoll < 0.18 ? 0.58 : weatherRoll > 0.9 ? 1.45 : 1;
  return Math.round(randomBetween(interval) * playerScale * flurryScale);
}

function createInitialPlayers(pineCount = 3, berryCount = 3): Player[] {
  return PLAYER_SEEDS.map((seed) => {
    const count = seed.team === "pine" ? pineCount : berryCount;
    const active = seed.slot < count;
    return {
      ...seed,
      active,
      position: seed.slot,
      health: seed.maxHealth,
      claims: 0,
      damage: 0,
      frozenUntil: 0,
    };
  });
}

function nameKey(value: string) {
  return value.trim().toLowerCase();
}

function createUniqueLocalAiName(baseName: string, usedNames: Set<string>) {
  if (!usedNames.has(nameKey(baseName))) return baseName;
  for (let index = 1; index <= PLAYER_SEEDS.length; index += 1) {
    const suffix = index === 1 ? "AI" : `AI${index}`;
    const stem = Array.from(baseName).slice(0, Math.max(0, 8 - Array.from(suffix).length)).join("");
    const candidate = `${stem}${suffix}`;
    if (!usedNames.has(nameKey(candidate))) return candidate;
  }
  return baseName;
}

function createLocalDisplayPlayers(players: Player[], playerName: string) {
  const active = players.filter((player) => player.active);
  const userName = playerName.trim() || "小雪球";
  const usedNames = new Set(active.filter((player) => player.isUser).map(() => nameKey(userName)));
  return active.map((player) => {
    if (player.isUser) return { ...player, name: userName };
    const baseName = PLAYER_SEEDS.find((seed) => seed.id === player.id)?.name ?? player.name;
    const uniqueName = createUniqueLocalAiName(baseName, usedNames);
    usedNames.add(nameKey(uniqueName));
    return uniqueName === player.name ? player : { ...player, name: uniqueName };
  });
}

function createIdleActions(playerIds = PLAYER_SEEDS.map((player) => player.id)): Record<string, CharacterAction> {
  return Object.fromEntries(
    playerIds.map((playerId) => [playerId, { phase: "idle", token: 0 }]),
  ) as Record<string, CharacterAction>;
}

function getPlayerPalette(player: Pick<Player, "id" | "team" | "position">) {
  const seedIndex = PLAYER_SEEDS.findIndex((item) => item.id === player.id);
  const fallbackIndex = player.team === "pine" ? player.position : 4 + player.position;
  return KID_PALETTES[seedIndex >= 0 ? seedIndex : fallbackIndex % KID_PALETTES.length];
}

function mapRoomPlayer(player: RoomPlayer, selfPlayerId: string | null, serverTimeOffsetMs: number): Player {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    badge: player.badge,
    slot: player.position,
    position: player.position,
    role: player.role,
    isUser: player.id === selfPlayerId,
    active: true,
    aiLevel: player.controller.kind === "ai" ? player.controller.level : undefined,
    health: player.health,
    maxHealth: player.maxHealth,
    claims: player.claims,
    damage: player.damage,
    frozenUntil: player.frozenUntil - serverTimeOffsetMs,
    controllerKind: player.controller.kind,
    connected: player.controller.kind === "human" ? player.controller.connected : true,
    ready: player.controller.kind === "human" ? player.controller.ready : true,
  };
}

function mapRoomWord(word: RoomWord, snapshot: RoomSnapshot, serverTimeOffsetMs: number): SnowWord {
  const bornAt = word.bornAt - serverTimeOffsetMs;
  const aiStartedAt = word.aiStartedAt === null ? null : word.aiStartedAt - serverTimeOffsetMs;
  const claimAt = word.aiClaimAt === null ? null : word.aiClaimAt - serverTimeOffsetMs;
  const elapsedSeconds = Math.max(0, Date.now() - bornAt) / 1000;
  const aiPlayer = word.aiPlayerId
    ? snapshot.players.find((player) => player.id === word.aiPlayerId) ?? null
    : null;
  const aiProgress = word.aiStartedAt === null || word.aiClaimAt === null
    ? 0
    : clamp(
        (snapshot.serverTime - word.aiStartedAt) / Math.max(1, word.aiClaimAt - word.aiStartedAt),
        0,
        1,
      );
  return {
    id: word.id,
    text: word.text,
    kind: word.kind,
    x: word.x,
    y: Math.min(word.restY, 7 + word.speed * elapsedSeconds),
    restY: word.restY,
    speed: word.speed,
    drift: word.drift,
    bornAt,
    aiStartedAt,
    claimAt,
    aiProgress,
    aiTeam: aiPlayer?.team ?? null,
    aiPlayerId: word.aiPlayerId,
  };
}

function getActorAnchor(player: Player): ActorAnchor {
  const pineX = [31, 23, 15, 7];
  const berryX = [69, 77, 85, 93];
  const handY = [59, 70, 63, 72];
  const rank = clamp(player.position, 0, 3);
  return {
    x: player.team === "pine" ? pineX[rank] : berryX[rank],
    handY: handY[rank],
    hitY: handY[rank] - 6,
  };
}

function createAiTiming(player: Player, text: string, bornAt: number) {
  const profile = AI_LEVELS[player.aiLevel ?? "steady"];
  const frozenDelay = Math.max(0, player.frozenUntil - bornAt);
  const startedAt = bornAt + frozenDelay + randomBetween(profile.reaction);
  const typingTime = text.length * randomBetween(profile.charMs);
  const stumble = Math.random() < 0.12 ? 450 + Math.random() * 550 : 0;
  return { startedAt, claimAt: startedAt + typingTime + stumble };
}

const FORMATION_LEFT: Record<Team, number[]> = {
  pine: [82, 56, 28, 0],
  berry: [0, 28, 56, 82],
};
const FORMATION_BOTTOM = [37, 2, 25, 0];
const FORMATION_SCALE = [1.03, 0.94, 0.9, 0.84];

function getFrontlineId(players: Player[], team: Team) {
  return players
    .filter((player) => player.active && player.team === team && player.health > 0)
    .sort((a, b) => a.position - b.position)[0]?.id ?? null;
}

function TeamMark({ team }: { team: Team }) {
  return <span className={`team-mark team-mark--${team}`} aria-hidden="true" />;
}

function Kid({
  player,
  action,
  isFront,
  isFrozen,
  finale,
  nodeRef,
}: {
  player: Player;
  action: CharacterAction;
  isFront: boolean;
  isFrozen: boolean;
  finale?: "cheer" | "defeat";
  nodeRef?: (node: HTMLDivElement | null) => void;
}) {
  const phase = action.phase === "hit" ? "hit" : finale ?? action.phase;
  const palette = getPlayerPalette(player);
  const actionLabel: Partial<Record<CharacterPhase, string>> = {
    catch: "抓住！",
    hold: "捏雪球…",
    windup: "蓄力！",
    throw: "扔！",
    hit: "哎呀！",
    cheer: "好耶！",
    defeat: "出局",
  };
  const healthPercent = (player.health / player.maxHealth) * 100;

  return (
    <div
      ref={nodeRef}
      className={`kid kid--${player.team} is-${phase}${player.isUser ? " is-user" : ""}${isFrozen ? " is-frozen" : ""}`}
      style={
        {
          "--kid-coat": palette.coat,
          "--kid-hat": palette.hat,
          "--kid-scarf": palette.scarf,
          "--kid-skin": palette.skin,
          "--kid-left": `${FORMATION_LEFT[player.team][player.position]}%`,
          "--kid-bottom": `${FORMATION_BOTTOM[player.position]}px`,
          "--formation-scale": FORMATION_SCALE[player.position],
        } as CSSProperties
      }
      aria-label={`${player.name}，${player.health}/${player.maxHealth} 点血量，${isFrozen ? "冻结中" : actionLabel[phase] ?? "准备中"}`}
    >
      <span className="kid__shadow" aria-hidden="true" />
      <div className="kid__scale">
        <div className="kid__figure" key={`${action.token}-${phase}`}>
          <span className="kid__leg kid__leg--back"><i /></span>
          <span className="kid__leg kid__leg--front"><i /></span>
          <span className="kid__arm kid__arm--back"><i className="kid__mitten" /></span>
          <span className="kid__body"><i className="kid__zip" /><i className="kid__pocket" /></span>
          <span className="kid__hood" />
          <span className="kid__head">
            <span className="kid__face"><i /><i /><b /></span>
            <span className="kid__ear" />
          </span>
          <span className="kid__hat"><i /></span>
          <span className="kid__scarf"><i /></span>
          <span className="kid__arm kid__arm--front"><i className="kid__mitten" /></span>
          <span className={`kid__held-ball${action.kind === "frost" ? " is-frost" : ""}`}><i>{action.word}</i></span>
          <span className="kid__impact" aria-hidden="true">
            <i /><i /><i /><i /><i /><b>啪!</b>
          </span>
          <span className="kid__freeze" aria-hidden="true"><i>❄</i><b>冻结</b></span>
        </div>
      </div>
      <span className="kid__hp" aria-hidden="true">
        <i style={{ width: `${healthPercent}%` }} />
        <b>{player.health}</b>
      </span>
      {actionLabel[phase] && <span className="kid__action">{actionLabel[phase]}</span>}
      <span className="kid__name">
        {isFront ? "🛡 " : ""}{player.name}
      </span>
    </div>
  );
}

function RosterCard({
  player,
  index,
  total,
  onMove,
  onLevelChange,
}: {
  player: Player;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onLevelChange: (level: AiLevel) => void;
}) {
  const palette = getPlayerPalette(player);
  return (
    <div className={`roster-card roster-card--${player.team}${player.isUser ? " is-you" : ""}`}>
      <span
        className="roster-card__avatar"
        style={
          {
            "--kid-coat": palette.coat,
            "--kid-hat": palette.hat,
            "--kid-skin": palette.skin,
          } as CSSProperties
        }
        aria-hidden="true"
      >
        <i className="roster-card__body" />
        <i className="roster-card__head" />
        <i className="roster-card__hat" />
        <b className="roster-card__arm" />
      </span>
      <span className="roster-card__identity">
        <strong>{player.name}</strong>
        <small>
          {index === 0 ? "前排 · " : `第 ${index + 1} 位 · `}
          {ROLE_LABELS[player.role]} · {player.maxHealth} HP
        </small>
      </span>
      <span className="roster-card__settings">
        {player.isUser ? (
          <em>真人</em>
        ) : (
          <select
            value={player.aiLevel}
            onChange={(event) => onLevelChange(event.target.value as AiLevel)}
            aria-label={`${player.name} AI 强度`}
          >
            {Object.entries(AI_LEVELS).map(([value, profile]) => (
              <option key={value} value={value}>{profile.label}</option>
            ))}
          </select>
        )}
        <span className="formation-buttons">
          <button onClick={() => onMove(-1)} disabled={index === 0} aria-label={`${player.name} 前移`}>前</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`${player.name} 后移`}>后</button>
        </span>
      </span>
    </div>
  );
}

function TeamHealthRows({
  players,
  team,
  frontlineId,
  now,
}: {
  players: Player[];
  team: Team;
  frontlineId: string | null;
  now: number;
}) {
  return (
    <div className={`member-health-list member-health-list--${team}`}>
      {players.map((player) => (
        <div key={player.id} className={`member-health${player.health <= 0 ? " is-out" : ""}${player.frozenUntil > now ? " is-frozen" : ""}`}>
          <span>{player.id === frontlineId ? "盾 " : ""}{player.frozenUntil > now ? "❄ " : ""}{player.name}</span>
          <i><b style={{ width: `${(player.health / player.maxHealth) * 100}%` }} /></i>
          <strong>{player.health}</strong>
        </div>
      ))}
    </div>
  );
}

export default function SnowballGame() {
  const [gameMode, setGameMode] = useState<GameMode>("local");
  const [stage, setStage] = useState<Stage>("lobby");
  const [playerName, setPlayerName] = useState("小雪球");
  const [onlinePlayerName, setOnlinePlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [wordbookId, setWordbookId] = useState<WordbookId>("winter");
  const [snowfallLevel, setSnowfallLevel] = useState<SnowfallLevel>("classic");
  const [players, setPlayers] = useState<Player[]>(() => createInitialPlayers());
  const [words, setWords] = useState<SnowWord[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [catchEffects, setCatchEffects] = useState<CatchEffect[]>([]);
  const [characterActions, setCharacterActions] =
    useState<Record<string, CharacterAction>>(createIdleActions);
  const [typed, setTyped] = useState("");
  const [targetWordId, setTargetWordId] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [correctKeys, setCorrectKeys] = useState(0);
  const [wrongKeys, setWrongKeys] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [effectNow, setEffectNow] = useState(() => Date.now());
  const [countdown, setCountdown] = useState(3);
  const [winner, setWinner] = useState<Team | null>(null);
  const [inputError, setInputError] = useState(false);
  const [announcement, setAnnouncement] = useState("等待开战");
  const room = useRoomSocket({ autoResume: true });

  const inputRef = useRef<HTMLInputElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const kidNodesRef = useRef(new Map<string, HTMLDivElement>());
  const wordNodesRef = useRef(new Map<number, HTMLDivElement>());
  const stageRef = useRef<Stage>(stage);
  const wordsRef = useRef<SnowWord[]>([]);
  const playersRef = useRef<Player[]>(players);
  const typedRef = useRef("");
  const targetWordIdRef = useRef<number | null>(null);
  const wordBagRef = useRef<string[]>([]);
  const wordBagBookIdRef = useRef<WordbookId | null>(null);
  const recentWordsRef = useRef<string[]>([]);
  const comboRef = useRef(0);
  const lastClaimRef = useRef(0);
  const gameStartedAtRef = useRef(0);
  const sequenceRef = useRef(0);
  const lockedWordsRef = useRef(new Set<number>());
  const timersRef = useRef<ManagedTimer[]>([]);
  const actorAvailableAtRef = useRef<Record<string, number>>({});
  const pausedAtRef = useRef(0);
  const inviteHandledRef = useRef(false);
  const handledRoomEventRef = useRef<RoomEvent | null>(null);
  const onlinePhaseRef = useRef<RoomSnapshot["phase"] | null>(null);
  const eliminatedPlayerIdsRef = useRef(new Set<string>());
  const isOnline = gameMode === "online" || room.status !== "idle";
  const onlineSnapshot = isOnline ? room.snapshot : null;
  const onlineServerTimeOffsetMs = room.serverTimeOffsetMs;
  const getOnlineServerNow = room.getServerNow;

  useEffect(() => {
    if (inviteHandledRef.current || typeof window === "undefined") return;
    inviteHandledRef.current = true;
    const invitedCode = sanitizeRoomCode(new URL(window.location.href).searchParams.get("room") ?? "");
    if (!isRoomCode(invitedCode)) return;
    const timer = window.setTimeout(() => {
      setGameMode("online");
      setRoomCodeInput(invitedCode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activePlayers = useMemo(
    () => isOnline
      ? players.filter((player) => player.active)
      : createLocalDisplayPlayers(players, playerName),
    [isOnline, playerName, players],
  );
  const pinePlayers = activePlayers
    .filter((player) => player.team === "pine")
    .sort((a, b) => a.position - b.position);
  const berryPlayers = activePlayers
    .filter((player) => player.team === "berry")
    .sort((a, b) => a.position - b.position);
  const pineAlive = pinePlayers.filter((player) => player.health > 0).length;
  const berryAlive = berryPlayers.filter((player) => player.health > 0).length;
  const pineFrontlineId = getFrontlineId(activePlayers, "pine");
  const berryFrontlineId = getFrontlineId(activePlayers, "berry");
  const user = activePlayers.find((player) => player.isUser);
  const userAlive = Boolean(user && user.health > 0);
  const userFrozen = Boolean(user && user.frozenUntil > effectNow);
  const userFrozenSeconds = userFrozen && user
    ? Math.max(0.1, (user.frozenUntil - effectNow) / 1_000).toFixed(1)
    : "0.0";
  const selectedWordbook = WORD_BOOKS[wordbookId];
  const snowfallProfile = SNOWFALL_PROFILES[snowfallLevel];
  const totalKeys = correctKeys + wrongKeys;
  const accuracy = totalKeys ? Math.round((correctKeys / totalKeys) * 100) : 100;
  const lockedTarget = targetWordId === null
    ? null
    : words.find((word) => word.id === targetWordId) ?? null;
  const matchingWords = typed
    ? lockedTarget?.text.startsWith(typed)
      ? [lockedTarget]
      : words.filter((word) => word.text.startsWith(typed))
    : [];
  const focusedWordId = targetWordId ?? (matchingWords.length === 1 ? matchingWords[0].id : null);
  const spawnPlayerScale = clamp(1 - (activePlayers.length - 2) * 0.035, 0.82, 1);
  const maxWords = clamp(
    activePlayers.length + snowfallProfile.wordBonus,
    snowfallProfile.minimumWords,
    snowfallProfile.maximumWords,
  );

  const setGameStage = useCallback((nextStage: Stage) => {
    stageRef.current = nextStage;
    setStage(nextStage);
  }, []);

  const lockTargetWord = useCallback((wordId: number | null) => {
    targetWordIdRef.current = wordId;
    setTargetWordId(wordId);
  }, []);

  const clearTargetWord = useCallback(() => {
    targetWordIdRef.current = null;
    setTargetWordId(null);
  }, []);

  useEffect(() => {
    if (!isOnline || !onlineSnapshot) return;
    const mappedPlayers = onlineSnapshot.players.map((player) =>
      mapRoomPlayer(player, onlineSnapshot.selfPlayerId, onlineServerTimeOffsetMs));
    const mappedWords = onlineSnapshot.words.map((word) =>
      mapRoomWord(word, onlineSnapshot, onlineServerTimeOffsetMs));
    if (onlineSnapshot.phase === "lobby" || onlineSnapshot.phase === "countdown") {
      eliminatedPlayerIdsRef.current.clear();
    }
    for (const player of mappedPlayers) {
      if (player.health <= 0) eliminatedPlayerIdsRef.current.add(player.id);
    }
    const eliminatedIds = eliminatedPlayerIdsRef.current;
    const selfPlayer = onlineSnapshot.players.find(
      (player) => player.id === onlineSnapshot.selfPlayerId,
    );
    const selfTyping = onlineSnapshot.selfPlayerId
      ? onlineSnapshot.typingByPlayer[onlineSnapshot.selfPlayerId]
      : undefined;

    playersRef.current = mappedPlayers;
    // The WebSocket snapshot is an external authoritative store. Mirroring it
    // into animation state here is intentional and cannot be derived lazily.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayers(mappedPlayers);
    wordsRef.current = mappedWords;
    setWords(mappedWords);
    setProjectiles((current) => current.filter(
      (projectile) => !eliminatedIds.has(projectile.sourcePlayerId),
    ));
    setCatchEffects((current) => current.filter(
      (effect) => !eliminatedIds.has(effect.sourcePlayerId),
    ));
    setCharacterActions((current) => Object.fromEntries(
      mappedPlayers.map((player) => [player.id, current[player.id] ?? { phase: "idle", token: 0 }]),
    ) as Record<string, CharacterAction>);
    setWordbookId(onlineSnapshot.config.wordbookId);
    setSnowfallLevel(onlineSnapshot.config.snowfallLevel);
    setWinner(onlineSnapshot.winner);
    setCombo(selfPlayer?.combo ?? 0);
    comboRef.current = selfPlayer?.combo ?? 0;
    setBestCombo(selfPlayer?.bestCombo ?? 0);
    const nextTyped = selfTyping?.buffer ?? "";
    typedRef.current = nextTyped;
    setTyped(nextTyped);
    lockTargetWord(selfTyping?.targetWordId ?? null);

    const nextStage: Stage = onlineSnapshot.phase === "lobby"
      ? "lobby"
      : onlineSnapshot.phase;
    setGameStage(nextStage);
    if (onlineSnapshot.startedAt !== null) {
      gameStartedAtRef.current = onlineSnapshot.startedAt - onlineServerTimeOffsetMs;
      setElapsed(Math.max(0, Math.floor(
        (getOnlineServerNow() - onlineSnapshot.startedAt) / 1000,
      )));
    }
    if (onlineSnapshot.countdownEndsAt !== null) {
      setCountdown(Math.max(0, Math.ceil(
        (onlineSnapshot.countdownEndsAt - getOnlineServerNow()) / 1000,
      )));
    }
    if (onlinePhaseRef.current !== onlineSnapshot.phase) {
      onlinePhaseRef.current = onlineSnapshot.phase;
      setAnnouncement(
        onlineSnapshot.phase === "lobby"
          ? "等待所有真人准备"
          : onlineSnapshot.phase === "countdown"
            ? "房间已锁定，准备开战！"
            : onlineSnapshot.phase === "ended"
              ? "本局已经结束"
              : "服务器实时裁定中",
      );
    }
  }, [
    getOnlineServerNow,
    isOnline,
    lockTargetWord,
    onlineServerTimeOffsetMs,
    onlineSnapshot,
    setGameStage,
  ]);

  useEffect(() => {
    if (!isOnline || onlineSnapshot?.phase !== "countdown" || onlineSnapshot.countdownEndsAt === null) return;
    const updateCountdown = () => setCountdown(Math.max(0, Math.ceil(
      (onlineSnapshot.countdownEndsAt! - getOnlineServerNow()) / 1000,
    )));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 160);
    return () => window.clearInterval(timer);
  }, [getOnlineServerNow, isOnline, onlineSnapshot]);

  const scheduleTimer = useCallback((callback: () => void, delay: number) => {
    const remaining = Math.max(0, delay);
    const timer: ManagedTimer = {
      id: 0,
      dueAt: Date.now() + remaining,
      remaining,
      callback,
    };
    timer.id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
      callback();
    }, remaining);
    timersRef.current.push(timer);
    return timer.id;
  }, []);

  const pausePendingTimers = useCallback(() => {
    const now = Date.now();
    timersRef.current.forEach((timer) => {
      window.clearTimeout(timer.id);
      timer.remaining = Math.max(0, timer.dueAt - now);
    });
  }, []);

  const resumePendingTimers = useCallback(() => {
    const now = Date.now();
    timersRef.current.forEach((timer) => {
      timer.dueAt = now + timer.remaining;
      timer.id = window.setTimeout(() => {
        timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
        timer.callback();
      }, timer.remaining);
    });
  }, []);

  const clearPendingTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer.id));
    timersRef.current = [];
  }, []);

  const say = useCallback(
    (message: string) => {
      setAnnouncement(message);
      scheduleTimer(() => {
        if (stageRef.current === "playing") setAnnouncement("继续抢单词雪花！");
      }, 1600);
    },
    [scheduleTimer],
  );

  const setCharacterPose = useCallback(
    (playerId: string, phase: CharacterPhase, word?: string, kind?: SnowWordKind) => {
      const token = ++sequenceRef.current;
      setCharacterActions((current) => ({
        ...current,
        [playerId]: {
          phase,
          token,
          ...(word ? { word } : {}),
          ...(kind ? { kind } : {}),
        },
      }));
      return token;
    },
    [],
  );

  const settleCharacterPose = useCallback((
    playerId: string,
    expectedPhase: CharacterPhase,
    expectedToken?: number,
  ) => {
    setCharacterActions((current) => {
      const action = current[playerId];
      if (
        action?.phase !== expectedPhase ||
        (expectedToken !== undefined && action.token !== expectedToken)
      ) return current;
      return {
        ...current,
        [playerId]: { phase: "idle", token: ++sequenceRef.current },
      };
    });
  }, []);

  const pointInArena = useCallback(
    (node: HTMLElement | undefined, xFactor = 0.5, yFactor = 0.5) => {
      const arena = arenaRef.current?.getBoundingClientRect();
      const rect = node?.getBoundingClientRect();
      if (!arena || !rect || !arena.width || !arena.height) return null;
      return {
        x: ((rect.left + rect.width * xFactor - arena.left) / arena.width) * 100,
        y: ((rect.top + rect.height * yFactor - arena.top) / arena.height) * 100,
      };
    },
    [],
  );

  const changeTeamSize = (team: Team, requestedSize: number) => {
    setPlayers((current) => {
      const teamPlayers = current.filter((player) => player.team === team);
      const active = teamPlayers.filter((player) => player.active).sort((a, b) => a.position - b.position);
      let next = current;
      if (requestedSize < active.length) {
        let keep = active.slice(0, requestedSize);
        if (team === "pine") {
          const localPlayer = active.find((player) => player.isUser);
          if (localPlayer && !keep.some((player) => player.id === localPlayer.id)) {
            keep = [
              ...active.filter((player) => !player.isUser).slice(0, requestedSize - 1),
              localPlayer,
            ].sort((a, b) => a.position - b.position);
          }
        }
        const keepIds = new Set(keep.map((player) => player.id));
        next = current.map((player) =>
          player.team === team && player.active && !keepIds.has(player.id)
            ? { ...player, active: false }
            : player,
        );
      } else if (requestedSize > active.length) {
        const inactive = teamPlayers
          .filter((player) => !player.active)
          .sort((a, b) => a.slot - b.slot)
          .slice(0, requestedSize - active.length);
        const addIds = new Set(inactive.map((player) => player.id));
        let nextPosition = active.length;
        next = current.map((player) =>
          addIds.has(player.id)
            ? { ...player, active: true, position: nextPosition++, health: player.maxHealth }
            : player,
        );
      }
      const normalized = next.map((player) => {
        if (player.team !== team || !player.active) return player;
        const order = next
          .filter((candidate) => candidate.team === team && candidate.active)
          .sort((a, b) => a.position - b.position);
        return { ...player, position: order.findIndex((candidate) => candidate.id === player.id) };
      });
      playersRef.current = normalized;
      return normalized;
    });
  };

  const movePlayer = (playerId: string, direction: -1 | 1) => {
    setPlayers((current) => {
      const player = current.find((item) => item.id === playerId);
      if (!player) return current;
      const order = current
        .filter((item) => item.team === player.team && item.active)
        .sort((a, b) => a.position - b.position);
      const index = order.findIndex((item) => item.id === playerId);
      const swap = order[index + direction];
      if (!swap) return current;
      const next = current.map((item) => {
        if (item.id === player.id) return { ...item, position: swap.position };
        if (item.id === swap.id) return { ...item, position: player.position };
        return item;
      });
      playersRef.current = next;
      return next;
    });
  };

  const changeAiLevel = (playerId: string, level: AiLevel) => {
    setPlayers((current) => {
      const next = current.map((player) =>
        player.id === playerId ? { ...player, aiLevel: level } : player,
      );
      playersRef.current = next;
      return next;
    });
  };

  const changeWordbook = (nextWordbookId: WordbookId) => {
    setWordbookId(nextWordbookId);
    wordBagBookIdRef.current = nextWordbookId;
    wordBagRef.current = shuffleWords(regularWordPool(WORD_BOOKS[nextWordbookId].words));
    recentWordsRef.current = [];
  };

  const endMatch = useCallback(
    (winningTeam: Team) => {
      setWinner(winningTeam);
      typedRef.current = "";
      setTyped("");
      clearTargetWord();
      setGameStage("ended");
      setAnnouncement(winningTeam === "pine" ? "雪松队守住了河岸！" : "红莓队突破了防线！");
    },
    [clearTargetWord, setGameStage],
  );

  const registerClaim = useCallback((playerId: string) => {
    const next = playersRef.current.map((player) =>
      player.id === playerId ? { ...player, claims: player.claims + 1 } : player,
    );
    playersRef.current = next;
    setPlayers(next);
  }, []);

  const applyDamage = useCallback(
    (attackerId: string, targetId: string, requestedDamage: number, kind: SnowWordKind = "normal") => {
      if (stageRef.current === "ended") return;
      const target = playersRef.current.find((player) => player.id === targetId);
      if (!target || !target.active || target.health <= 0) return;
      const actualDamage = Math.min(target.health, requestedDamage);
      const targetHealth = target.health - actualDamage;
      const now = Date.now();
      const shouldFreeze = kind === "frost" && targetHealth > 0;
      const frozenUntil = targetHealth <= 0
        ? 0
        : shouldFreeze
          ? Math.max(target.frozenUntil, now + FROST_FREEZE_MS)
          : target.frozenUntil;
      const freezeExtension = shouldFreeze
        ? frozenUntil - Math.max(now, target.frozenUntil)
        : 0;
      const next = playersRef.current.map((player) => {
        if (player.id === targetId) return { ...player, health: targetHealth, frozenUntil };
        if (player.id === attackerId) return { ...player, damage: player.damage + actualDamage };
        return player;
      });
      playersRef.current = next;
      setPlayers(next);
      if (freezeExtension > 0) {
        const shiftedWords = wordsRef.current.map((word) => {
          if (word.aiPlayerId !== target.id || word.claimAt === null || word.claimAt <= now) return word;
          return {
            ...word,
            aiStartedAt: word.aiStartedAt !== null && word.aiStartedAt > now
              ? word.aiStartedAt + freezeExtension
              : word.aiStartedAt,
            claimAt: word.claimAt + freezeExtension,
          };
        });
        wordsRef.current = shiftedWords;
        setWords(shiftedWords);
        setEffectNow(now);
      }
      if (targetHealth <= 0) {
        eliminatedPlayerIdsRef.current.add(target.id);
        setProjectiles((current) => current.filter(
          (projectile) => projectile.sourcePlayerId !== target.id,
        ));
        setCatchEffects((current) => current.filter(
          (effect) => effect.sourcePlayerId !== target.id,
        ));
      }
      if (target.isUser && targetHealth <= 0) {
        typedRef.current = "";
        setTyped("");
        clearTargetWord();
      }
      say(`${target.name} 承受 ${actualDamage} 点伤害${targetHealth <= 0 ? "，出局！" : shouldFreeze ? "，被冻结 1 秒！" : ""}`);
      const survivors = next.filter(
        (player) => player.active && player.team === target.team && player.health > 0,
      );
      if (!survivors.length) endMatch(target.team === "pine" ? "berry" : "pine");
    },
    [clearTargetWord, endMatch, say],
  );

  const launchSnowball = useCallback(
    (
      player: Player,
      word: SnowWord,
      damage: number,
      options?: { authoritative?: boolean; targetId?: string | null; startsInMs?: number },
    ) => {
      const now = Date.now();
      const requestedStart = now + Math.max(0, options?.startsInMs ?? 0);
      const startsAt = Math.max(requestedStart, actorAvailableAtRef.current[player.id] ?? now);
      const queueDelay = startsAt - now;
      actorAvailableAtRef.current[player.id] = startsAt + 1850;
      const canAnimate = (attacker: Player | undefined) =>
        Boolean(
          attacker
          && attacker.health > 0
          && stageRef.current !== "ended"
          && !eliminatedPlayerIdsRef.current.has(attacker.id),
        );

      const sourceFallback = getActorAnchor(player);
      const visibleWord = pointInArena(wordNodesRef.current.get(word.id)) ?? { x: word.x, y: word.y };
      const catchId = ++sequenceRef.current;
      const projectileId = ++sequenceRef.current;
      let throwToken: number | undefined;

      scheduleTimer(() => {
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (!canAnimate(attacker)) return;
        const mitten = kidNodesRef.current
          .get(player.id)
          ?.querySelector<HTMLElement>(".kid__arm--front .kid__mitten") ?? undefined;
        const sourceAnchor = pointInArena(mitten) ?? { x: sourceFallback.x, y: sourceFallback.handY };
        const catchEffect: CatchEffect = {
          id: catchId,
          sourcePlayerId: player.id,
          team: player.team,
          text: word.text,
          kind: word.kind,
          fromX: visibleWord.x,
          fromY: visibleWord.y,
          midX: (visibleWord.x + sourceAnchor.x) / 2,
          apexY: Math.max(6, Math.min(visibleWord.y, sourceAnchor.y) - 11),
          toX: sourceAnchor.x,
          toY: sourceAnchor.y,
        };
        setCatchEffects((current) => [...current, catchEffect]);
        setCharacterPose(player.id, "catch", word.text, word.kind);
      }, queueDelay);
      scheduleTimer(() => {
        setCatchEffects((current) => current.filter((effect) => effect.id !== catchId));
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (canAnimate(attacker)) {
          setCharacterPose(player.id, "hold", word.text, word.kind);
        }
      }, queueDelay + 410);
      scheduleTimer(() => {
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (canAnimate(attacker)) {
          setCharacterPose(player.id, "windup", word.text, word.kind);
        }
      }, queueDelay + 650);
      scheduleTimer(() => {
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (!attacker || !canAnimate(attacker)) return;
        const targets = playersRef.current
          .filter((candidate) => candidate.active && candidate.team !== player.team && candidate.health > 0)
          .sort((a, b) => a.position - b.position);
        const target = options?.targetId
          ? playersRef.current.find((candidate) => candidate.id === options.targetId) ?? targets[0]
          : targets[0];
        if (!target) return;
        const freshSourceFallback = getActorAnchor(attacker);
        const targetFallback = getActorAnchor(target);
        const sourceMitten = kidNodesRef.current
          .get(attacker.id)
          ?.querySelector<HTMLElement>(".kid__arm--front .kid__mitten") ?? undefined;
        const targetHead = kidNodesRef.current
          .get(target.id)
          ?.querySelector<HTMLElement>(".kid__head") ?? undefined;
        const freshSource = pointInArena(sourceMitten) ?? {
          x: freshSourceFallback.x,
          y: freshSourceFallback.handY,
        };
        const freshTarget = pointInArena(targetHead) ?? {
          x: targetFallback.x,
          y: targetFallback.hitY,
        };
        const projectile: Projectile = {
          id: projectileId,
          team: attacker.team,
          text: word.text,
          damage,
          kind: word.kind,
          sourcePlayerId: attacker.id,
          targetPlayerId: target.id,
          fromX: freshSource.x,
          fromY: freshSource.y,
          midX: (freshSource.x + freshTarget.x) / 2,
          apexY: Math.max(8, Math.min(freshSource.y, freshTarget.y) - 28),
          toX: freshTarget.x,
          toY: freshTarget.y,
        };
        throwToken = setCharacterPose(attacker.id, "throw", word.text, word.kind);
        setProjectiles((current) => [...current, projectile]);
        scheduleTimer(() => {
          setProjectiles((current) => current.filter((item) => item.id !== projectileId));
          if (!options?.authoritative && stageRef.current === "ended") return;
          const currentAttacker = playersRef.current.find((candidate) => candidate.id === attacker.id);
          if (
            !currentAttacker
            || currentAttacker.health <= 0
            || eliminatedPlayerIdsRef.current.has(attacker.id)
          ) {
            say(`${word.text} 随着 ${attacker.name} 出局而作废`);
            return;
          }
          const currentTarget = playersRef.current.find((candidate) => candidate.id === target.id);
          if (!currentTarget || (!options?.authoritative && currentTarget.health <= 0)) {
            say(`${word.text} 落在了空雪地上`);
            return;
          }
          const hitToken = setCharacterPose(target.id, "hit");
          if (!options?.authoritative) applyDamage(attacker.id, target.id, damage, word.kind);
          scheduleTimer(() => settleCharacterPose(target.id, "hit", hitToken), 620);
        }, 610);
      }, queueDelay + 900);
      scheduleTimer(
        () => settleCharacterPose(player.id, "throw", throwToken),
        queueDelay + 1740,
      );
    },
    [applyDamage, pointInArena, say, scheduleTimer, setCharacterPose, settleCharacterPose],
  );

  const claimWord = useCallback(
    (wordId: number, playerId: string) => {
      if (stageRef.current !== "playing" || lockedWordsRef.current.has(wordId)) return;
      const word = wordsRef.current.find((item) => item.id === wordId);
      const player = playersRef.current.find((item) => item.id === playerId);
      if (!word || !player || !player.active || player.health <= 0 || player.frozenUntil > Date.now()) return;

      lockedWordsRef.current.add(wordId);
      const nextWords = wordsRef.current.filter((item) => item.id !== wordId);
      wordsRef.current = nextWords;
      setWords(nextWords);

      let damage = word.kind === "frost" ? FROST_DAMAGE : calculateWordDamage(word.text.length);
      if (player.isUser) {
        clearTargetWord();
        const now = Date.now();
        const nextCombo = now - lastClaimRef.current < 4200 ? comboRef.current + 1 : 1;
        comboRef.current = nextCombo;
        lastClaimRef.current = now;
        setCombo(nextCombo);
        setBestCombo((current) => Math.max(current, nextCombo));
        if (word.kind === "normal") {
          damage = clamp(damage + Math.min(2, Math.floor(nextCombo / 5)), 10, 15);
        }
        say(word.kind === "frost"
          ? `${word.text} — 抢到冰晶雪球！命中冻结 1 秒`
          : `${word.text} — 你最快！连击 ×${nextCombo}`);
      } else {
        const currentTyped = typedRef.current;
        const targetWasStolen = targetWordIdRef.current === word.id;
        const stillMatches = currentTyped && nextWords.some((item) => item.text.startsWith(currentTyped));
        if (targetWasStolen || (currentTyped && word.text.startsWith(currentTyped) && !stillMatches)) {
          typedRef.current = "";
          setTyped("");
          clearTargetWord();
        }
        say(`${player.name} 抢走了 ${word.text}`);
      }

      registerClaim(player.id);
      launchSnowball(player, word, damage);
    },
    [clearTargetWord, launchSnowball, registerClaim, say],
  );

  useEffect(() => {
    const event: RoomEvent | null = isOnline ? room.lastEvent : null;
    if (!event || !onlineSnapshot) return;
    if (handledRoomEventRef.current === event) return;
    handledRoomEventRef.current = event;
    if (event.type === "word.claimed") {
      const attacker = playersRef.current.find((player) => player.id === event.attackerId);
      if (!attacker) return;
      const claimedWord = mapRoomWord(event.word, onlineSnapshot, onlineServerTimeOffsetMs);
      launchSnowball(attacker, claimedWord, event.damage, {
        authoritative: true,
        startsInMs: Math.max(0, event.startsAt - getOnlineServerNow()),
      });
      setAnnouncement(
        attacker.isUser
          ? `${event.word.text} — 服务器确认你最快！`
          : `${attacker.name} 抢走了 ${event.word.text}`,
      );
      return;
    }
    if (event.type === "typing.rejected" && event.playerId === onlineSnapshot.selfPlayerId) {
      setInputError(true);
      if (event.reason === "FROZEN") setAnnouncement("❄ 你被冻结了，1 秒后继续输入");
      window.setTimeout(() => setInputError(false), 260);
      return;
    }
    if (event.type === "attack.resolved") {
      const target = event.targetId
        ? playersRef.current.find((player) => player.id === event.targetId)
        : null;
      if (target && event.targetHealth === 0) {
        eliminatedPlayerIdsRef.current.add(target.id);
        setProjectiles((current) => current.filter(
          (projectile) => projectile.sourcePlayerId !== target.id,
        ));
        setCatchEffects((current) => current.filter(
          (effect) => effect.sourcePlayerId !== target.id,
        ));
      }
      setAnnouncement(
        event.missed || !target
          ? "雪球落在了空雪地上"
          : event.frozenUntil !== null
            ? `${target.name} 承受 ${event.actualDamage} 点伤害，被冻结 1 秒！`
            : `${target.name} 承受 ${event.actualDamage} 点伤害`,
      );
      return;
    }
    if (event.type === "match.started") setAnnouncement("联机对战开始！");
    if (event.type === "match.ended") setAnnouncement(`${event.winner === "pine" ? "雪松队" : "红莓队"}获胜！`);
  }, [
    getOnlineServerNow,
    isOnline,
    launchSnowball,
    onlineServerTimeOffsetMs,
    onlineSnapshot,
    room.lastEvent,
  ]);

  const spawnWord = useCallback(
    (seedY?: number, forcedKind?: SnowWordKind) => {
      if (wordsRef.current.length >= maxWords) return;
      const active = new Set(wordsRef.current.map((word) => word.text));
      if (wordBagBookIdRef.current !== wordbookId) {
        wordBagBookIdRef.current = wordbookId;
        wordBagRef.current = shuffleWords(regularWordPool(selectedWordbook.words));
        recentWordsRef.current = [];
      }
      if (!wordBagRef.current.length) {
        const recent = new Set(recentWordsRef.current);
        const regular = regularWordPool(selectedWordbook.words);
        const freshPool = regular.filter((word) => !recent.has(word));
        wordBagRef.current = shuffleWords(freshPool.length ? freshPool : regular);
      }
      const recent = new Set(recentWordsRef.current);
      const canSpawnFrost = !wordsRef.current.some((word) => word.kind === "frost");
      const wantsFrost = canSpawnFrost && (forcedKind === "frost"
        || (forcedKind === undefined && Math.random() < FROST_SPAWN_CHANCE));
      let kind: SnowWordKind = "normal";
      let text = "";
      if (wantsFrost) {
        const frostPool = selectedWordbook.words.filter((word) =>
          isFrostWordCandidate(word)
          && !active.has(word)
          && !hasPrefixCollision(word, active));
        const freshFrostPool = frostPool.filter((word) => !recent.has(word));
        const candidates = freshFrostPool.length ? freshFrostPool : frostPool;
        if (candidates.length) {
          text = candidates[Math.floor(Math.random() * candidates.length)];
          kind = "frost";
          wordBagRef.current = wordBagRef.current.filter((word) => word !== text);
        }
      }
      if (!text) {
        const candidateIndex = wordBagRef.current.findIndex(
          (word) => !active.has(word) && !recent.has(word) && !hasPrefixCollision(word, active),
        );
        if (candidateIndex < 0) return;
        [text] = wordBagRef.current.splice(candidateIndex, 1);
      }
      const bots = playersRef.current.filter(
        (player) => player.active && !player.isUser && player.health > 0,
      );
      if (!bots.length) return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const historySize = clamp(Math.round(selectedWordbook.words.length * 0.2), 16, 48);
      recentWordsRef.current = [...recentWordsRef.current, text].slice(-historySize);
      const bornAt = Date.now();
      const timing = createAiTiming(bot, text, bornAt);
      const id = ++sequenceRef.current;
      const word: SnowWord = {
        id,
        text,
        kind,
        x: 17 + Math.random() * 66,
        y: seedY ?? 7 + Math.random() * 8,
        restY: 52 + ((id * 11) % 20),
        speed: 4 + Math.random() * 2.3,
        drift: -13 + Math.random() * 26,
        bornAt,
        aiStartedAt: timing.startedAt,
        claimAt: timing.claimAt,
        aiProgress: 0,
        aiTeam: bot.team,
        aiPlayerId: bot.id,
      };
      const next = [...wordsRef.current, word];
      wordsRef.current = next;
      setWords(next);
    },
    [maxWords, selectedWordbook.words, wordbookId],
  );

  const reassignWordAi = useCallback((wordId: number) => {
    const bots = playersRef.current.filter(
      (player) => player.active && !player.isUser && player.health > 0,
    );
    if (!bots.length) return;
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const now = Date.now();
    const timing = createAiTiming(bot, wordsRef.current.find((word) => word.id === wordId)?.text ?? "snow", now);
    const next = wordsRef.current.map((word) =>
      word.id === wordId
        ? {
            ...word,
            aiPlayerId: bot.id,
            aiTeam: bot.team,
            aiStartedAt: timing.startedAt,
            claimAt: timing.claimAt,
            aiProgress: 0,
          }
        : word,
    );
    wordsRef.current = next;
    setWords(next);
  }, []);

  const startMatch = useCallback(() => {
    clearPendingTimers();
    const displayNames = new Map(
      createLocalDisplayPlayers(players, playerName).map((player) => [player.id, player.name]),
    );
    const cleanPlayers = players.map((player) => ({
      ...player,
      name: displayNames.get(player.id) ?? player.name,
      health: player.maxHealth,
      claims: 0,
      damage: 0,
      frozenUntil: 0,
    }));
    playersRef.current = cleanPlayers;
    setPlayers(cleanPlayers);
    wordsRef.current = [];
    setWords([]);
    setProjectiles([]);
    setCatchEffects([]);
    eliminatedPlayerIdsRef.current.clear();
    setCharacterActions(createIdleActions());
    actorAvailableAtRef.current = {};
    lockedWordsRef.current.clear();
    clearTargetWord();
    if (wordBagBookIdRef.current !== wordbookId || !wordBagRef.current.length) {
      wordBagBookIdRef.current = wordbookId;
      wordBagRef.current = shuffleWords(regularWordPool(selectedWordbook.words));
    }
    comboRef.current = 0;
    lastClaimRef.current = 0;
    setCombo(0);
    setBestCombo(0);
    setCorrectKeys(0);
    setWrongKeys(0);
    setElapsed(0);
    setWinner(null);
    typedRef.current = "";
    setTyped("");
    setInputError(false);
    setCountdown(3);
    setAnnouncement("前排挡住，后排准备输出！");
    gameStartedAtRef.current = 0;
    setGameStage("countdown");
  }, [clearPendingTimers, clearTargetWord, playerName, players, selectedWordbook.words, setGameStage, wordbookId]);

  const returnToLobby = useCallback(() => {
    clearPendingTimers();
    wordsRef.current = [];
    setWords([]);
    setProjectiles([]);
    setCatchEffects([]);
    setCharacterActions(createIdleActions());
    actorAvailableAtRef.current = {};
    typedRef.current = "";
    setTyped("");
    clearTargetWord();
    setWinner(null);
    const healed = playersRef.current.map((player) => ({ ...player, health: player.maxHealth, frozenUntil: 0 }));
    playersRef.current = healed;
    setPlayers(healed);
    setGameStage("lobby");
    setAnnouncement("等待开战");
  }, [clearPendingTimers, clearTargetWord, setGameStage]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    typedRef.current = typed;
  }, [typed]);

  useEffect(() => {
    if (isOnline || stage !== "playing") return;
    const staleWords = wordsRef.current.filter((word) => {
      const racer = playersRef.current.find((player) => player.id === word.aiPlayerId);
      return !racer || !racer.active || racer.health <= 0;
    });
    staleWords.forEach((word) => reassignWordAi(word.id));
  }, [isOnline, players, reassignWordAi, stage]);

  useEffect(() => {
    if (isOnline || stage !== "countdown") return;
    const timer = window.setTimeout(() => {
      if (countdown <= 0) {
        wordsRef.current = [];
        const initialWordCount = Math.min(snowfallProfile.initialWords, maxWords);
        for (let index = 0; index < initialWordCount; index += 1) {
          spawnWord(
            8 + index * (36 / Math.max(1, initialWordCount - 1)),
            index === 0 ? "frost" : "normal",
          );
        }
        gameStartedAtRef.current = Date.now();
        setAnnouncement("开战！只输入英文单词");
        setGameStage("playing");
        return;
      }
      setCountdown((value) => value - 1);
    }, countdown <= 0 ? 0 : 720);
    return () => window.clearTimeout(timer);
  }, [countdown, isOnline, maxWords, setGameStage, snowfallProfile.initialWords, spawnWord, stage]);

  useEffect(() => {
    if (stage === "playing" && userAlive) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [stage, userAlive]);

  useEffect(() => {
    const fallTimer = window.setInterval(() => {
      if (stageRef.current !== "playing") return;
      const now = Date.now();
      setEffectNow(now);
      const next = wordsRef.current.map((word) => ({
        ...word,
        y: Math.min(word.restY, word.y + word.speed * 0.055),
        aiProgress:
          word.aiStartedAt === null || word.claimAt === null
            ? 0
            : now < word.aiStartedAt
            ? 0
            : clamp((now - word.aiStartedAt) / Math.max(1, word.claimAt - word.aiStartedAt), 0, 1),
      }));
      wordsRef.current = next;
      setWords(next);
    }, 55);

    const aiTimer = window.setInterval(() => {
      if (isOnline || stageRef.current !== "playing") return;
      const now = Date.now();
      const due = wordsRef.current
        .filter((word) => word.claimAt !== null && word.claimAt <= now)
        .sort((a, b) => (a.claimAt ?? Infinity) - (b.claimAt ?? Infinity))[0];
      if (!due) return;
      const bot = playersRef.current.find((player) => player.id === due.aiPlayerId);
      if (!bot || !bot.active || bot.health <= 0) reassignWordAi(due.id);
      else if (bot.frozenUntil > now) {
        const delay = bot.frozenUntil - now;
        const delayed = wordsRef.current.map((word) => word.id === due.id
          ? {
              ...word,
              aiStartedAt: word.aiStartedAt !== null && word.aiStartedAt > now
                ? word.aiStartedAt + delay
                : word.aiStartedAt,
              claimAt: (word.claimAt ?? now) + delay,
            }
          : word);
        wordsRef.current = delayed;
        setWords(delayed);
      }
      else claimWord(due.id, bot.id);
    }, 80);

    let spawnTimer = 0;
    let spawnLoopStopped = false;
    const scheduleNextSpawn = () => {
      const delay = createSpawnDelay(snowfallProfile.interval, spawnPlayerScale);
      spawnTimer = window.setTimeout(() => {
        if (!isOnline && stageRef.current === "playing") spawnWord();
        if (!spawnLoopStopped) scheduleNextSpawn();
      }, delay);
    };
    scheduleNextSpawn();

    const clockTimer = window.setInterval(() => {
      if (stageRef.current !== "playing" || !gameStartedAtRef.current) return;
      setElapsed(Math.floor((Date.now() - gameStartedAtRef.current) / 1000));
      if (!isOnline && Date.now() - lastClaimRef.current > 4200 && comboRef.current > 0) {
        comboRef.current = 0;
        setCombo(0);
      }
    }, 500);

    return () => {
      window.clearInterval(fallTimer);
      window.clearInterval(aiTimer);
      spawnLoopStopped = true;
      window.clearTimeout(spawnTimer);
      window.clearInterval(clockTimer);
    };
  }, [claimWord, isOnline, reassignWordAi, snowfallProfile.interval, spawnPlayerScale, spawnWord]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!isOnline && document.hidden && stageRef.current === "playing") {
        pausedAtRef.current = Date.now();
        pausePendingTimers();
        setGameStage("paused");
        setAnnouncement("离开页面，已自动暂停");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isOnline, pausePendingTimers, setGameStage]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer.id));
    },
    [],
  );

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (isOnline) return;
    if (stageRef.current !== "playing" || !userAlive || userFrozen) return;
    const previousTyped = typedRef.current;
    const nextValue = event.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14);
    if (!nextValue) {
      typedRef.current = "";
      setTyped("");
      clearTargetWord();
      setInputError(false);
      return;
    }
    let target = targetWordIdRef.current === null
      ? null
      : wordsRef.current.find((word) => word.id === targetWordIdRef.current) ?? null;
    if (targetWordIdRef.current !== null && !target) clearTargetWord();
    const matches = target
      ? target.text.startsWith(nextValue) ? [target] : []
      : wordsRef.current.filter((word) => word.text.startsWith(nextValue));
    if (!matches.length) {
      setInputError(true);
      setWrongKeys((value) => value + 1);
      comboRef.current = 0;
      setCombo(0);
      scheduleTimer(() => setInputError(false), 260);
      return;
    }
    if (!target && matches.length === 1) {
      target = matches[0];
      lockTargetWord(target.id);
    }
    typedRef.current = nextValue;
    setTyped(nextValue);
    setInputError(false);
    if (nextValue.length > previousTyped.length) setCorrectKeys((value) => value + 1);
    const exact = matches.length === 1 && matches[0].text === nextValue ? matches[0] : null;
    if (exact) {
      typedRef.current = "";
      setTyped("");
      clearTargetWord();
      if (user) claimWord(exact.id, user.id);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isOnline && /^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      if (stageRef.current !== "playing" || !userAlive || userFrozen || !room.connected) return;
      const key = event.key.toLowerCase();
      room.sendCommand({ op: "type.key", key });
      const nextValue = `${typedRef.current}${key}`.slice(0, 14);
      const target = targetWordIdRef.current === null
        ? null
        : wordsRef.current.find((word) => word.id === targetWordIdRef.current) ?? null;
      const matches = target
        ? target.text.startsWith(nextValue) ? [target] : []
        : wordsRef.current.filter((word) => word.text.startsWith(nextValue));
      if (!matches.length) {
        setInputError(true);
        setWrongKeys((value) => value + 1);
        window.setTimeout(() => setInputError(false), 260);
        return;
      }
      if (!target && matches.length === 1) lockTargetWord(matches[0].id);
      typedRef.current = nextValue;
      setTyped(nextValue);
      setCorrectKeys((value) => value + 1);
      const exact = matches.length === 1 && matches[0].text === nextValue;
      if (exact) {
        typedRef.current = "";
        setTyped("");
        clearTargetWord();
      }
      return;
    }
    if (event.key === "Escape" || event.key === " " || (isOnline && event.key === "Backspace")) {
      event.preventDefault();
      if (isOnline) room.sendCommand({ op: "type.cancel" });
      typedRef.current = "";
      setTyped("");
      clearTargetWord();
      setInputError(false);
    }
  };

  const resume = () => {
    const pauseDuration = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
    if (pauseDuration > 0) {
      const shiftedWords = wordsRef.current.map((word) => ({
        ...word,
        bornAt: word.bornAt + pauseDuration,
        aiStartedAt: word.aiStartedAt === null ? null : word.aiStartedAt + pauseDuration,
        claimAt: word.claimAt === null ? null : word.claimAt + pauseDuration,
      }));
      wordsRef.current = shiftedWords;
      setWords(shiftedWords);
      const shiftedPlayers = playersRef.current.map((player) => ({
        ...player,
        frozenUntil: player.frozenUntil > pausedAtRef.current
          ? player.frozenUntil + pauseDuration
          : player.frozenUntil,
      }));
      playersRef.current = shiftedPlayers;
      setPlayers(shiftedPlayers);
      gameStartedAtRef.current += pauseDuration;
      if (lastClaimRef.current > 0) lastClaimRef.current += pauseDuration;
      Object.keys(actorAvailableAtRef.current).forEach((playerId) => {
        actorAvailableAtRef.current[playerId] += pauseDuration;
      });
    }
    pausedAtRef.current = 0;
    setGameStage("playing");
    resumePendingTimers();
    setAnnouncement(userAlive ? "继续抢英文单词！" : "你已出局，AI 队友继续作战");
  };

  const switchToOnlineMode = () => {
    clearPendingTimers();
    wordsRef.current = [];
    setWords([]);
    setProjectiles([]);
    setCatchEffects([]);
    typedRef.current = "";
    setTyped("");
    clearTargetWord();
    setGameStage("lobby");
    setGameMode("online");
    setAnnouncement("创建房间或输入好友的房间码");
  };

  const switchToLocalMode = () => {
    room.leave({ forgetCredentials: false });
    clearPendingTimers();
    const localPlayers = createInitialPlayers();
    playersRef.current = localPlayers;
    setPlayers(localPlayers);
    wordsRef.current = [];
    setWords([]);
    setProjectiles([]);
    setCatchEffects([]);
    setCharacterActions(createIdleActions());
    typedRef.current = "";
    setTyped("");
    clearTargetWord();
    setWinner(null);
    setGameStage("lobby");
    setGameMode("local");
    setAnnouncement("等待开战");
  };

  const leaveOnlineRoom = () => {
    room.leave();
    clearPendingTimers();
    wordsRef.current = [];
    setWords([]);
    setProjectiles([]);
    setCatchEffects([]);
    typedRef.current = "";
    setTyped("");
    clearTargetWord();
    setWinner(null);
    setGameStage("lobby");
  };

  return (
    <main className={`game-shell game-shell--${stage}`}>
      <div className="ambient-snow" aria-hidden="true">
        {AMBIENT_SNOW.map((flake) => (
          <i
            key={flake.id}
            style={
              {
                "--snow-left": `${flake.left}%`,
                "--snow-size": `${flake.size}px`,
                "--snow-delay": `${flake.delay}s`,
                "--snow-duration": `${flake.duration}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {stage === "lobby" ? (
        isOnline ? (
          <OnlineLobby
            playerName={onlinePlayerName}
            setPlayerName={setOnlinePlayerName}
            roomCode={roomCodeInput}
            setRoomCode={setRoomCodeInput}
            status={room.status}
            error={room.error?.message ?? null}
            snapshot={onlineSnapshot}
            onCreate={() => { void room.createRoom(onlinePlayerName); }}
            onJoin={() => { room.joinRoom(roomCodeInput, onlinePlayerName); }}
            onLeave={leaveOnlineRoom}
            onLocalMode={switchToLocalMode}
            sendCommand={(command) => { room.sendCommand(command); }}
          />
        ) : (
        <section className="lobby" aria-labelledby="game-title">
          <div className="lobby__story">
            <div className="mode-switch" role="group" aria-label="游戏模式">
              <button className="is-active">本机 AI</button>
              <button onClick={switchToOnlineMode}>好友联机</button>
            </div>
            <p className="eyebrow"><span /> SNOWCRAFT-INSPIRED TACTICAL REMAKE</p>
            <h1 id="game-title">排好阵型，<br /><em>开打雪仗！</em></h1>
            <p className="lobby__lead">
              全英文单词竞速。肉盾站前排替队友吃伤害，快手躲在后排持续抢词输出。
            </p>

            <div className="rule-strip" aria-label="游戏规则">
              <span><b>01</b> 英文雪花永久停留</span>
              <span><b>02</b> 永远攻击最前排</span>
              <span><b>03</b> 全员出局才算输</span>
            </div>

            <div className="lobby__controls lobby__controls--formation">
              <label>
                <span>你的名字</span>
                <input value={playerName} maxLength={8} onChange={(event) => setPlayerName(event.target.value)} aria-label="你的名字" />
              </label>
              <label>
                <span>雪松队人数</span>
                <select value={pinePlayers.length} onChange={(event) => changeTeamSize("pine", Number(event.target.value))} aria-label="雪松队人数">
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 人</option>)}
                </select>
              </label>
              <label>
                <span>红莓队人数</span>
                <select value={berryPlayers.length} onChange={(event) => changeTeamSize("berry", Number(event.target.value))} aria-label="红莓队人数">
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 人</option>)}
                </select>
              </label>
              <label className="lobby-control--wordbook">
                <span>单词册</span>
                <select
                  value={wordbookId}
                  onChange={(event) => changeWordbook(event.target.value as WordbookId)}
                  aria-label="选择单词册"
                >
                  {WORD_BOOK_OPTIONS.map((wordbook) => (
                    <option key={wordbook.id} value={wordbook.id}>
                      {wordbook.label} · {wordbook.words.length} 词
                    </option>
                  ))}
                </select>
              </label>
              <label className="lobby-control--density">
                <span>雪花密度</span>
                <select
                  value={snowfallLevel}
                  onChange={(event) => setSnowfallLevel(event.target.value as SnowfallLevel)}
                  aria-label="选择雪花密度"
                >
                  {(["light", "classic", "blizzard"] as const).map((level) => (
                    <option key={level} value={level}>{SNOWFALL_PROFILES[level].label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="wordbook-tip" aria-live="polite">
              <strong>{selectedWordbook.shortLabel}</strong>
              <span>{selectedWordbook.description}</span>
              <small>{selectedWordbook.words.length} 个词 · {selectedWordbook.sourceNote}</small>
              <small>{snowfallProfile.label}雪量 · 场上最多 {maxWords} 词 · 普通伤害 10 / 11 / 12 / 13 · 冰晶 15 + 冻结 1 秒</small>
            </div>

            <div className="formation-tip">
              <strong>职业与速度</strong>
              <span>肉盾 / 均衡 / 快手只决定血量；AI 抢词速度由难度单独决定，真人只看实际打字速度。</span>
            </div>

            <button className="primary-button" onClick={startMatch}>
              <span>{pinePlayers.length} VS {berryPlayers.length} · {selectedWordbook.shortLabel} · {snowfallProfile.short}</span>
              <strong>按阵型开战 →</strong>
            </button>
            <p className="local-note">
              本机模式 · 1 位真人 + {pinePlayers.length + berryPlayers.length - 1} 位可调强度 AI · 洗牌抽词不连号重复
            </p>
          </div>

          <div className="lobby__room">
            <div className="room-card room-card--formation">
              <div className="room-card__top">
                <span><i /> 阵型编辑中</span>
                <strong>{pinePlayers.length} VS {berryPlayers.length}</strong>
                <small>不要求双方人数相等</small>
              </div>
              <div className="room-vs">
                <section>
                  <header><TeamMark team="pine" /> 雪松队 <b>{pinePlayers.length}/4</b></header>
                  {pinePlayers.map((player, index) => (
                    <RosterCard
                      key={player.id}
                      player={player}
                      index={index}
                      total={pinePlayers.length}
                      onMove={(direction) => movePlayer(player.id, direction)}
                      onLevelChange={(level) => changeAiLevel(player.id, level)}
                    />
                  ))}
                </section>
                <div className="room-vs__river"><span>VS</span></div>
                <section>
                  <header><TeamMark team="berry" /> 红莓队 <b>{berryPlayers.length}/4</b></header>
                  {berryPlayers.map((player, index) => (
                    <RosterCard
                      key={player.id}
                      player={player}
                      index={index}
                      total={berryPlayers.length}
                      onMove={(direction) => movePlayer(player.id, direction)}
                      onLevelChange={(level) => changeAiLevel(player.id, level)}
                    />
                  ))}
                </section>
              </div>
              <div className="room-card__footer">
                <span>🛡 前排挡伤</span>
                <span>⌨ {selectedWordbook.shortLabel} · {snowfallProfile.short}</span>
                <span>⚙ 职业管血量，难度管 AI 速度</span>
              </div>
            </div>
          </div>
        </section>
        )
      ) : (
        <section className="match" aria-label="雪仗对战">
          <header className="match-header">
            <button className="brand-button" onClick={isOnline ? leaveOnlineRoom : returnToLobby} aria-label="返回阵型房间">
              <span className="brand-button__flake">✦</span>
              <span><strong>河岸雪仗</strong><small>SNOW TYPE BATTLE</small></span>
            </button>
            <div className="match-header__status">
              <span>{stage === "playing" ? "对战进行中" : stage === "countdown" ? "即将开战" : stage === "paused" ? "暂停中" : "本局结束"}</span>
              <b>{formatClock(elapsed)}</b>
              <small>
                {pinePlayers.length}v{berryPlayers.length} · {selectedWordbook.shortLabel} · {snowfallProfile.short} · {isOnline ? `房间 ${onlineSnapshot?.code ?? "------"}` : "前排锁定"}
              </small>
            </div>
            {isOnline ? (
              <button className="paper-button" disabled>
                {room.status === "connected" ? "● 联机中" : "↻ 重连中"}
              </button>
            ) : (
              <button
                className="paper-button"
                onClick={() => {
                  if (stage === "paused") resume();
                  else {
                    pausedAtRef.current = Date.now();
                    pausePendingTimers();
                    setGameStage("paused");
                  }
                }}
                disabled={stage === "countdown" || stage === "ended"}
              >
                {stage === "paused" ? "继续" : "暂停"}
              </button>
            )}
          </header>

          <div className="scoreboard scoreboard--individual">
            <section className="team-score team-score--pine">
              <div className="team-score__label">
                <span><TeamMark team="pine" /><b>雪松队</b><small>盾牌标记 = 当前前排</small></span>
                <strong>{pineAlive}<i>/ {pinePlayers.length} 存活</i></strong>
              </div>
              <TeamHealthRows players={pinePlayers} team="pine" frontlineId={pineFrontlineId} now={effectNow} />
            </section>
            <div className="scoreboard__badge"><span>前排</span><strong>VS</strong><small>锁定</small></div>
            <section className="team-score team-score--berry">
              <div className="team-score__label">
                <span><TeamMark team="berry" /><b>红莓队</b><small>倒下后自动切换下一位</small></span>
                <strong>{berryAlive}<i>/ {berryPlayers.length} 存活</i></strong>
              </div>
              <TeamHealthRows players={berryPlayers} team="berry" frontlineId={berryFrontlineId} now={effectNow} />
            </section>
          </div>

          <div ref={arenaRef} className="arena" onClick={() => inputRef.current?.focus()}>
            <div className="sky-hills" aria-hidden="true">
              <span className="hill hill--one" />
              <span className="hill hill--two" />
              <span className="cabin"><i /><b /></span>
              <span className="pine-tree pine-tree--one" />
              <span className="pine-tree pine-tree--two" />
              <span className="pine-tree pine-tree--three" />
            </div>
            <div className="bank bank--pine" aria-hidden="true" />
            <div className="river" aria-hidden="true"><i /><i /><i /></div>
            <div className="bank bank--berry" aria-hidden="true" />

            <div className="kids kids--pine">
              {pinePlayers.map((player) => (
                <Kid
                  key={player.id}
                  player={player}
                  action={characterActions[player.id] ?? { phase: "idle", token: 0 }}
                  isFront={player.id === pineFrontlineId}
                  isFrozen={player.frozenUntil > effectNow}
                  finale={player.health <= 0 ? "defeat" : stage === "ended" ? (winner === "pine" ? "cheer" : "defeat") : undefined}
                  nodeRef={(node) => {
                    if (node) kidNodesRef.current.set(player.id, node);
                    else kidNodesRef.current.delete(player.id);
                  }}
                />
              ))}
            </div>
            <div className="kids kids--berry">
              {berryPlayers.map((player) => (
                <Kid
                  key={player.id}
                  player={player}
                  action={characterActions[player.id] ?? { phase: "idle", token: 0 }}
                  isFront={player.id === berryFrontlineId}
                  isFrozen={player.frozenUntil > effectNow}
                  finale={player.health <= 0 ? "defeat" : stage === "ended" ? (winner === "berry" ? "cheer" : "defeat") : undefined}
                  nodeRef={(node) => {
                    if (node) kidNodesRef.current.set(player.id, node);
                    else kidNodesRef.current.delete(player.id);
                  }}
                />
              ))}
            </div>

            <div className="word-field" aria-label="不会自动消失的英文单词雪花">
              {words.map((word) => {
                const isLockedTarget = targetWordId === word.id;
                const matchLength = typed && (targetWordId === null || isLockedTarget) && word.text.startsWith(typed)
                  ? typed.length
                  : 0;
                const networkRacers = onlineSnapshot
                  ? Object.entries(onlineSnapshot.typingByPlayer)
                      .filter(([, state]) => state.targetWordId === word.id && state.buffer.length > 0)
                      .map(([playerId, state]) => ({
                        playerId,
                        progress: state.buffer.length / word.text.length,
                      }))
                      .sort((a, b) => b.progress - a.progress)
                  : [];
                const networkLeader = networkRacers[0] ?? null;
                const aiProgress = word.aiProgress;
                const playerProgress = matchLength / word.text.length;
                const networkProgress = networkLeader?.progress ?? 0;
                const leaderId = isOnline
                  ? networkProgress >= aiProgress
                    ? networkLeader?.playerId ?? null
                    : word.aiPlayerId
                  : playerProgress > aiProgress
                    ? user?.id ?? null
                    : word.aiPlayerId;
                const racer = players.find((player) => player.id === leaderId);
                const visibleProgress = isOnline
                  ? Math.max(networkProgress, aiProgress)
                  : Math.max(playerProgress, aiProgress);
                const raceState = visibleProgress <= 0
                  ? "idle"
                  : leaderId === user?.id
                    ? "leading"
                    : "contested";
                return (
                  <div
                    key={word.id}
                    ref={(node) => {
                      if (node) wordNodesRef.current.set(word.id, node);
                      else wordNodesRef.current.delete(word.id);
                    }}
                    className={`snow-word snow-word--${word.aiTeam} is-${raceState}${word.kind === "frost" ? " is-frost" : ""}${focusedWordId === word.id ? " is-focused" : ""}${word.y >= word.restY - 0.1 ? " is-resting" : ""}`}
                    aria-label={word.kind === "frost" ? `冰晶特殊词 ${word.text}，15 点伤害，命中冻结 1 秒` : word.text}
                    style={
                      {
                        left: `${word.x}%`,
                        top: `${word.y}%`,
                        "--word-drift": `${word.drift}px`,
                        "--race-progress": visibleProgress,
                      } as CSSProperties
                    }
                  >
                    <div className="snow-word__sway">
                      <span className="snow-word__flake" aria-hidden="true">{word.kind === "frost" ? "✦" : "❄"}</span>
                      <strong><b>{word.text.slice(0, matchLength)}</b>{word.text.slice(matchLength)}</strong>
                      <i aria-hidden="true"><span style={{ width: `${visibleProgress * 100}%` }} /></i>
                      {word.kind === "frost" && <small className="snow-word__power">ICE · 15 DMG · FREEZE 1s</small>}
                      <small className="snow-word__state">
                        {isLockedTarget
                          ? "TARGET LOCKED"
                          : raceState === "leading"
                          ? "YOU'RE FASTEST"
                          : raceState === "contested"
                            ? `${racer?.name ?? "AI"} TYPING`
                            : "OPEN"}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>

            {catchEffects.map((effect) => (
              <div
                key={effect.id}
                className={`catch-effect catch-effect--${effect.team}${effect.kind === "frost" ? " is-frost" : ""}`}
                style={
                  {
                    "--catch-from-x": `${effect.fromX}%`,
                    "--catch-from-y": `${effect.fromY}%`,
                    "--catch-mid-x": `${effect.midX}%`,
                    "--catch-apex-y": `${effect.apexY}%`,
                    "--catch-to-x": `${effect.toX}%`,
                    "--catch-to-y": `${effect.toY}%`,
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                <span>{effect.kind === "frost" ? "✦" : "❄"}</span><strong>{effect.text}</strong><i /><i /><i />
              </div>
            ))}

            {projectiles.map((projectile) => (
              <div
                key={projectile.id}
                className={`projectile projectile--${projectile.team}${projectile.kind === "frost" ? " is-frost" : ""}`}
                style={
                  {
                    "--projectile-from-x": `${projectile.fromX}%`,
                    "--projectile-from-y": `${projectile.fromY}%`,
                    "--projectile-mid-x": `${projectile.midX}%`,
                    "--projectile-apex-y": `${projectile.apexY}%`,
                    "--projectile-to-x": `${projectile.toX}%`,
                    "--projectile-to-y": `${projectile.toY}%`,
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                <span>{projectile.text}</span>
              </div>
            ))}

            {(stage === "countdown" || stage === "paused" || stage === "ended") && (
              <div className="arena-overlay">
                {stage === "countdown" && <><small>前排举盾</small><strong>{countdown || "GO!"}</strong><p>手放到英文键盘上</p></>}
                {stage === "paused" && <><small>雪球先放下</small><strong>暂停</strong><p>AI 进度也已暂停</p><button onClick={resume}>继续对战</button></>}
                {stage === "ended" && (
                  <>
                    <small>{winner === "pine" ? "雪松队守住河岸！" : "红莓队突破防线！"}</small>
                    <strong>{user?.team === winner ? "胜利" : "再战"}</strong>
                    <p>最佳连击 ×{bestCombo} · 准确率 {accuracy}%</p>
                    <div>
                      {isOnline ? (
                        onlineSnapshot?.selfPlayerId === onlineSnapshot?.hostPlayerId
                          ? <button onClick={() => room.sendCommand({ op: "match.restart" })}>返回房间大厅</button>
                          : <button disabled>等待房主重开</button>
                      ) : (
                        <button onClick={startMatch}>同阵型再来</button>
                      )}
                      <button className="ghost" onClick={isOnline ? leaveOnlineRoom : returnToLobby}>
                        {isOnline ? "离开房间" : "重排阵型"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {isOnline && stage === "playing" && !room.connected && (
              <div className="arena-overlay arena-overlay--network">
                <small>席位仍为你保留</small>
                <strong>重连中</strong>
                <p>比赛会在服务器继续；连上后自动同步最新血量和雪花。</p>
              </div>
            )}
          </div>

          <div className="type-dock">
            <div className="stat-card">
              <small>连续命中</small>
              <strong>×{combo}</strong>
              <span>最高 {bestCombo}</span>
            </div>
            <label className={`type-box${inputError ? " is-error" : ""}${typed ? " has-text" : ""}${userFrozen ? " is-frozen" : ""}`}>
              <span className="type-box__hint">
                {userAlive
                  ? userFrozen
                    ? `❄ 冰晶冻结中，${userFrozenSeconds} 秒后恢复`
                    : isOnline && !room.connected
                    ? "网络中断，正在自动重连…"
                    : lockedTarget
                    ? `已锁定 ${lockedTarget.text}；SPACE / ESC 可放弃`
                    : `${selectedWordbook.shortLabel}；前缀唯一后自动锁定目标`
                  : "你已出局，AI 队友仍会继续战斗"}
              </span>
              <div className="type-box__line">
                <span className="type-box__prompt">EN</span>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={handleInput}
                  onKeyDown={handleInputKeyDown}
                  disabled={stage !== "playing" || !userAlive || userFrozen || (isOnline && !room.connected)}
                  placeholder={userAlive ? (userFrozen ? "frozen…" : isOnline && !room.connected ? "reconnecting…" : "type an English word…") : "you are out"}
                  lang="en"
                  inputMode="text"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="英文单词输入框"
                  onPaste={(event) => event.preventDefault()}
                />
                <span className="type-box__clear">SPACE 清空</span>
              </div>
              <span className="type-box__message" aria-live="polite">
                {inputError ? "没有这个英文开头，再看一眼" : announcement}
              </span>
            </label>
            <div className="stat-card stat-card--right">
              <small>输入准确率</small>
              <strong>{accuracy}%</strong>
              <span>{players.find((player) => player.isUser)?.claims ?? 0} 个雪球</span>
            </div>
          </div>
        </section>
      )}

      <div className="sr-only" aria-live="assertive">
        雪松队还有 {pineAlive} 人，红莓队还有 {berryAlive} 人。
      </div>
    </main>
  );
}

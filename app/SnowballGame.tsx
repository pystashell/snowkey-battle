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

type Team = "pine" | "berry";
type Stage = "lobby" | "countdown" | "playing" | "paused" | "ended";
type AiLevel = "rookie" | "steady" | "expert";
type PlayerRole = "tank" | "balanced" | "striker";

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
};

type SnowWord = {
  id: number;
  text: string;
  x: number;
  y: number;
  restY: number;
  speed: number;
  drift: number;
  bornAt: number;
  aiStartedAt: number;
  claimAt: number;
  aiProgress: number;
  aiTeam: Team;
  aiPlayerId: string;
};

type Projectile = {
  id: number;
  team: Team;
  text: string;
  damage: number;
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
};

type CatchEffect = {
  id: number;
  team: Team;
  text: string;
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

const WORDS = [
  "snow",
  "coat",
  "warm",
  "tree",
  "star",
  "game",
  "moon",
  "river",
  "cocoa",
  "skate",
  "scarf",
  "glove",
  "winter",
  "frozen",
  "silver",
  "forest",
  "friend",
  "school",
  "holiday",
  "blizzard",
  "mittens",
  "snowman",
  "sledding",
  "sparkle",
  "crystal",
  "powder",
  "icicle",
  "penguin",
  "mountain",
  "fireplace",
  "blanket",
  "marshmallow",
  "evergreen",
  "snowflake",
  "wonderland",
  "cabin",
  "boots",
  "chilly",
  "flurry",
  "glacier",
  "huddle",
  "lantern",
  "shiver",
  "snowball",
  "weather",
  "whiteout",
];

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

const ROLE_LABELS: Record<PlayerRole, string> = {
  tank: "肉盾",
  balanced: "均衡",
  striker: "快手",
};

const PLAYER_SEEDS: Array<Omit<Player, "active" | "position" | "health" | "claims" | "damage">> = [
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

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
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
    };
  });
}

function createIdleActions(): Record<string, CharacterAction> {
  return Object.fromEntries(
    PLAYER_SEEDS.map((player) => [player.id, { phase: "idle", token: 0 }]),
  ) as Record<string, CharacterAction>;
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
  const startedAt = bornAt + randomBetween(profile.reaction);
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
  finale,
  nodeRef,
}: {
  player: Player;
  action: CharacterAction;
  isFront: boolean;
  finale?: "cheer" | "defeat";
  nodeRef?: (node: HTMLDivElement | null) => void;
}) {
  const phase = action.phase === "hit" ? "hit" : finale ?? action.phase;
  const paletteIndex = Math.max(0, PLAYER_SEEDS.findIndex((item) => item.id === player.id));
  const palette = KID_PALETTES[paletteIndex];
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
      className={`kid kid--${player.team} is-${phase}${player.isUser ? " is-user" : ""}`}
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
      aria-label={`${player.name}，${player.health}/${player.maxHealth} 点血量，${actionLabel[phase] ?? "准备中"}`}
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
          <span className="kid__held-ball"><i>{action.word}</i></span>
          <span className="kid__impact" aria-hidden="true">
            <i /><i /><i /><i /><i /><b>啪!</b>
          </span>
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
  const paletteIndex = Math.max(0, PLAYER_SEEDS.findIndex((item) => item.id === player.id));
  const palette = KID_PALETTES[paletteIndex];
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
}: {
  players: Player[];
  team: Team;
  frontlineId: string | null;
}) {
  return (
    <div className={`member-health-list member-health-list--${team}`}>
      {players.map((player) => (
        <div key={player.id} className={`member-health${player.health <= 0 ? " is-out" : ""}`}>
          <span>{player.id === frontlineId ? "盾 " : ""}{player.name}</span>
          <i><b style={{ width: `${(player.health / player.maxHealth) * 100}%` }} /></i>
          <strong>{player.health}</strong>
        </div>
      ))}
    </div>
  );
}

export default function SnowballGame() {
  const [stage, setStage] = useState<Stage>("lobby");
  const [playerName, setPlayerName] = useState("小雪球");
  const [players, setPlayers] = useState<Player[]>(() => createInitialPlayers());
  const [words, setWords] = useState<SnowWord[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [catchEffects, setCatchEffects] = useState<CatchEffect[]>([]);
  const [characterActions, setCharacterActions] =
    useState<Record<string, CharacterAction>>(createIdleActions);
  const [typed, setTyped] = useState("");
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [correctKeys, setCorrectKeys] = useState(0);
  const [wrongKeys, setWrongKeys] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [winner, setWinner] = useState<Team | null>(null);
  const [inputError, setInputError] = useState(false);
  const [announcement, setAnnouncement] = useState("等待开战");

  const inputRef = useRef<HTMLInputElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const kidNodesRef = useRef(new Map<string, HTMLDivElement>());
  const wordNodesRef = useRef(new Map<number, HTMLDivElement>());
  const stageRef = useRef<Stage>(stage);
  const wordsRef = useRef<SnowWord[]>([]);
  const playersRef = useRef<Player[]>(players);
  const typedRef = useRef("");
  const comboRef = useRef(0);
  const lastClaimRef = useRef(0);
  const gameStartedAtRef = useRef(0);
  const sequenceRef = useRef(0);
  const lockedWordsRef = useRef(new Set<number>());
  const timersRef = useRef<ManagedTimer[]>([]);
  const actorAvailableAtRef = useRef<Record<string, number>>({});
  const pausedAtRef = useRef(0);

  const activePlayers = useMemo(
    () =>
      players
        .filter((player) => player.active)
        .map((player) =>
          player.id === "you" ? { ...player, name: playerName.trim() || "小雪球" } : player,
        ),
    [playerName, players],
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
  const totalKeys = correctKeys + wrongKeys;
  const accuracy = totalKeys ? Math.round((correctKeys / totalKeys) * 100) : 100;
  const matchingWords = typed ? words.filter((word) => word.text.startsWith(typed)) : [];
  const focusedWordId = matchingWords.length === 1 ? matchingWords[0].id : null;
  const spawnEvery = clamp(1450 - activePlayers.length * 95, 720, 1200);
  const maxWords = clamp(activePlayers.length + 5, 7, 12);

  const setGameStage = useCallback((nextStage: Stage) => {
    stageRef.current = nextStage;
    setStage(nextStage);
  }, []);

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
    (playerId: string, phase: CharacterPhase, word?: string) => {
      const token = ++sequenceRef.current;
      setCharacterActions((current) => ({
        ...current,
        [playerId]: {
          phase,
          token,
          ...(word ? { word } : {}),
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

  const endMatch = useCallback(
    (winningTeam: Team) => {
      setWinner(winningTeam);
      typedRef.current = "";
      setTyped("");
      setGameStage("ended");
      setAnnouncement(winningTeam === "pine" ? "雪松队守住了河岸！" : "红莓队突破了防线！");
    },
    [setGameStage],
  );

  const registerClaim = useCallback((playerId: string) => {
    const next = playersRef.current.map((player) =>
      player.id === playerId ? { ...player, claims: player.claims + 1 } : player,
    );
    playersRef.current = next;
    setPlayers(next);
  }, []);

  const applyDamage = useCallback(
    (attackerId: string, targetId: string, requestedDamage: number) => {
      if (stageRef.current === "ended") return;
      const target = playersRef.current.find((player) => player.id === targetId);
      if (!target || !target.active || target.health <= 0) return;
      const actualDamage = Math.min(target.health, requestedDamage);
      const next = playersRef.current.map((player) => {
        if (player.id === targetId) return { ...player, health: player.health - actualDamage };
        if (player.id === attackerId) return { ...player, damage: player.damage + actualDamage };
        return player;
      });
      playersRef.current = next;
      setPlayers(next);
      if (target.isUser && target.health - actualDamage <= 0) {
        typedRef.current = "";
        setTyped("");
      }
      say(`${target.name} 承受 ${actualDamage} 点伤害${target.health - actualDamage <= 0 ? "，出局！" : ""}`);
      const survivors = next.filter(
        (player) => player.active && player.team === target.team && player.health > 0,
      );
      if (!survivors.length) endMatch(target.team === "pine" ? "berry" : "pine");
    },
    [endMatch, say],
  );

  const launchSnowball = useCallback(
    (player: Player, word: SnowWord, damage: number) => {
      const now = Date.now();
      const startsAt = Math.max(now, actorAvailableAtRef.current[player.id] ?? now);
      const queueDelay = startsAt - now;
      actorAvailableAtRef.current[player.id] = startsAt + 1850;

      const sourceFallback = getActorAnchor(player);
      const visibleWord = pointInArena(wordNodesRef.current.get(word.id)) ?? { x: word.x, y: word.y };
      const catchId = ++sequenceRef.current;
      const projectileId = ++sequenceRef.current;
      let throwToken: number | undefined;

      scheduleTimer(() => {
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (stageRef.current === "ended" || !attacker || attacker.health <= 0) return;
        const mitten = kidNodesRef.current
          .get(player.id)
          ?.querySelector<HTMLElement>(".kid__arm--front .kid__mitten") ?? undefined;
        const sourceAnchor = pointInArena(mitten) ?? { x: sourceFallback.x, y: sourceFallback.handY };
        const catchEffect: CatchEffect = {
          id: catchId,
          team: player.team,
          text: word.text,
          fromX: visibleWord.x,
          fromY: visibleWord.y,
          midX: (visibleWord.x + sourceAnchor.x) / 2,
          apexY: Math.max(6, Math.min(visibleWord.y, sourceAnchor.y) - 11),
          toX: sourceAnchor.x,
          toY: sourceAnchor.y,
        };
        setCatchEffects((current) => [...current, catchEffect]);
        setCharacterPose(player.id, "catch", word.text);
      }, queueDelay);
      scheduleTimer(() => {
        setCatchEffects((current) => current.filter((effect) => effect.id !== catchId));
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (stageRef.current !== "ended" && attacker && attacker.health > 0) {
          setCharacterPose(player.id, "hold", word.text);
        }
      }, queueDelay + 410);
      scheduleTimer(() => {
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (stageRef.current !== "ended" && attacker && attacker.health > 0) {
          setCharacterPose(player.id, "windup", word.text);
        }
      }, queueDelay + 650);
      scheduleTimer(() => {
        const attacker = playersRef.current.find((candidate) => candidate.id === player.id);
        if (stageRef.current === "ended" || !attacker || attacker.health <= 0) return;
        const targets = playersRef.current
          .filter((candidate) => candidate.active && candidate.team !== player.team && candidate.health > 0)
          .sort((a, b) => a.position - b.position);
        const target = targets[0];
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
          sourcePlayerId: attacker.id,
          targetPlayerId: target.id,
          fromX: freshSource.x,
          fromY: freshSource.y,
          midX: (freshSource.x + freshTarget.x) / 2,
          apexY: Math.max(8, Math.min(freshSource.y, freshTarget.y) - 28),
          toX: freshTarget.x,
          toY: freshTarget.y,
        };
        throwToken = setCharacterPose(attacker.id, "throw", word.text);
        setProjectiles((current) => [...current, projectile]);
        scheduleTimer(() => {
          setProjectiles((current) => current.filter((item) => item.id !== projectileId));
          const currentTarget = playersRef.current.find((candidate) => candidate.id === target.id);
          if (!currentTarget || currentTarget.health <= 0) {
            say(`${word.text} 落在了空雪地上`);
            return;
          }
          const hitToken = setCharacterPose(target.id, "hit");
          applyDamage(attacker.id, target.id, damage);
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
      if (!word || !player || !player.active || player.health <= 0) return;

      lockedWordsRef.current.add(wordId);
      const nextWords = wordsRef.current.filter((item) => item.id !== wordId);
      wordsRef.current = nextWords;
      setWords(nextWords);

      let damage = clamp(5 + word.text.length, 8, 15);
      if (player.isUser) {
        const now = Date.now();
        const nextCombo = now - lastClaimRef.current < 4200 ? comboRef.current + 1 : 1;
        comboRef.current = nextCombo;
        lastClaimRef.current = now;
        setCombo(nextCombo);
        setBestCombo((current) => Math.max(current, nextCombo));
        damage = clamp(damage + Math.floor(nextCombo / 3), 8, 18);
        say(`${word.text} — 你最快！连击 ×${nextCombo}`);
      } else {
        const currentTyped = typedRef.current;
        const stillMatches = currentTyped && nextWords.some((item) => item.text.startsWith(currentTyped));
        if (currentTyped && word.text.startsWith(currentTyped) && !stillMatches) {
          typedRef.current = "";
          setTyped("");
        }
        say(`${player.name} 抢走了 ${word.text}`);
      }

      registerClaim(player.id);
      launchSnowball(player, word, damage);
    },
    [launchSnowball, registerClaim, say],
  );

  const spawnWord = useCallback(
    (seedY?: number) => {
      if (wordsRef.current.length >= maxWords) return;
      const active = new Set(wordsRef.current.map((word) => word.text));
      const available = WORDS.filter((word) => !active.has(word));
      const bots = playersRef.current.filter(
        (player) => player.active && !player.isUser && player.health > 0,
      );
      if (!available.length || !bots.length) return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const text = available[Math.floor(Math.random() * available.length)];
      const bornAt = Date.now();
      const timing = createAiTiming(bot, text, bornAt);
      const id = ++sequenceRef.current;
      const word: SnowWord = {
        id,
        text,
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
    [maxWords],
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
    const cleanPlayers = players.map((player) => ({
      ...player,
      name: player.id === "you" ? playerName.trim() || "小雪球" : player.name,
      health: player.maxHealth,
      claims: 0,
      damage: 0,
    }));
    playersRef.current = cleanPlayers;
    setPlayers(cleanPlayers);
    wordsRef.current = [];
    setWords([]);
    setProjectiles([]);
    setCatchEffects([]);
    setCharacterActions(createIdleActions());
    actorAvailableAtRef.current = {};
    lockedWordsRef.current.clear();
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
  }, [clearPendingTimers, playerName, players, setGameStage]);

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
    setWinner(null);
    const healed = playersRef.current.map((player) => ({ ...player, health: player.maxHealth }));
    playersRef.current = healed;
    setPlayers(healed);
    setGameStage("lobby");
    setAnnouncement("等待开战");
  }, [clearPendingTimers, setGameStage]);

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
    if (stage !== "playing") return;
    const staleWords = wordsRef.current.filter((word) => {
      const racer = playersRef.current.find((player) => player.id === word.aiPlayerId);
      return !racer || !racer.active || racer.health <= 0;
    });
    staleWords.forEach((word) => reassignWordAi(word.id));
  }, [players, reassignWordAi, stage]);

  useEffect(() => {
    if (stage !== "countdown") return;
    const timer = window.setTimeout(() => {
      if (countdown <= 0) {
        wordsRef.current = [];
        for (let index = 0; index < Math.min(5, maxWords); index += 1) spawnWord(8 + index * 9);
        gameStartedAtRef.current = Date.now();
        setAnnouncement("开战！只输入英文单词");
        setGameStage("playing");
        return;
      }
      setCountdown((value) => value - 1);
    }, countdown <= 0 ? 0 : 720);
    return () => window.clearTimeout(timer);
  }, [countdown, maxWords, setGameStage, spawnWord, stage]);

  useEffect(() => {
    if (stage === "playing" && userAlive) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [stage, userAlive]);

  useEffect(() => {
    const fallTimer = window.setInterval(() => {
      if (stageRef.current !== "playing") return;
      const now = Date.now();
      const next = wordsRef.current.map((word) => ({
        ...word,
        y: Math.min(word.restY, word.y + word.speed * 0.055),
        aiProgress:
          now < word.aiStartedAt
            ? 0
            : clamp((now - word.aiStartedAt) / Math.max(1, word.claimAt - word.aiStartedAt), 0, 1),
      }));
      wordsRef.current = next;
      setWords(next);
    }, 55);

    const aiTimer = window.setInterval(() => {
      if (stageRef.current !== "playing") return;
      const now = Date.now();
      const due = wordsRef.current
        .filter((word) => word.claimAt <= now)
        .sort((a, b) => a.claimAt - b.claimAt)[0];
      if (!due) return;
      const bot = playersRef.current.find((player) => player.id === due.aiPlayerId);
      if (!bot || !bot.active || bot.health <= 0) reassignWordAi(due.id);
      else claimWord(due.id, bot.id);
    }, 80);

    const spawnTimer = window.setInterval(() => {
      if (stageRef.current === "playing") spawnWord();
    }, spawnEvery);

    const clockTimer = window.setInterval(() => {
      if (stageRef.current !== "playing" || !gameStartedAtRef.current) return;
      setElapsed(Math.floor((Date.now() - gameStartedAtRef.current) / 1000));
      if (Date.now() - lastClaimRef.current > 4200 && comboRef.current > 0) {
        comboRef.current = 0;
        setCombo(0);
      }
    }, 500);

    return () => {
      window.clearInterval(fallTimer);
      window.clearInterval(aiTimer);
      window.clearInterval(spawnTimer);
      window.clearInterval(clockTimer);
    };
  }, [claimWord, reassignWordAi, spawnEvery, spawnWord]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && stageRef.current === "playing") {
        pausedAtRef.current = Date.now();
        pausePendingTimers();
        setGameStage("paused");
        setAnnouncement("离开页面，已自动暂停");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pausePendingTimers, setGameStage]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer.id));
    },
    [],
  );

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (stageRef.current !== "playing" || !userAlive) return;
    const nextValue = event.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14);
    if (!nextValue) {
      typedRef.current = "";
      setTyped("");
      setInputError(false);
      return;
    }
    const matches = wordsRef.current.filter((word) => word.text.startsWith(nextValue));
    if (!matches.length) {
      setInputError(true);
      setWrongKeys((value) => value + 1);
      comboRef.current = 0;
      setCombo(0);
      scheduleTimer(() => setInputError(false), 260);
      return;
    }
    typedRef.current = nextValue;
    setTyped(nextValue);
    setInputError(false);
    if (nextValue.length > typed.length) setCorrectKeys((value) => value + 1);
    const exact = matches.find((word) => word.text === nextValue);
    if (exact) {
      typedRef.current = "";
      setTyped("");
      claimWord(exact.id, "you");
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      typedRef.current = "";
      setTyped("");
      setInputError(false);
    }
  };

  const resume = () => {
    const pauseDuration = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
    if (pauseDuration > 0) {
      const shiftedWords = wordsRef.current.map((word) => ({
        ...word,
        bornAt: word.bornAt + pauseDuration,
        aiStartedAt: word.aiStartedAt + pauseDuration,
        claimAt: word.claimAt + pauseDuration,
      }));
      wordsRef.current = shiftedWords;
      setWords(shiftedWords);
      gameStartedAtRef.current += pauseDuration;
      if (lastClaimRef.current > 0) lastClaimRef.current += pauseDuration;
    }
    pausedAtRef.current = 0;
    setGameStage("playing");
    resumePendingTimers();
    setAnnouncement(userAlive ? "继续抢英文单词！" : "你已出局，AI 队友继续作战");
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
        <section className="lobby" aria-labelledby="game-title">
          <div className="lobby__story">
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
            </div>

            <div className="formation-tip">
              <strong>阵型提示</strong>
              <span>卡片从上到下就是前排到后排；用“前 / 后”按钮换位。</span>
            </div>

            <button className="primary-button" onClick={startMatch}>
              <span>{pinePlayers.length} VS {berryPlayers.length} · AI 战术演练</span>
              <strong>按阵型开战 →</strong>
            </button>
            <p className="local-note">
              本机模式 · 1 位真人 + {pinePlayers.length + berryPlayers.length - 1} 位可调强度 AI
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
                <span>⌨ 全英文输入</span>
                <span>⚙ 每个 AI 独立强度</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="match" aria-label="雪仗对战">
          <header className="match-header">
            <button className="brand-button" onClick={returnToLobby} aria-label="返回阵型房间">
              <span className="brand-button__flake">✦</span>
              <span><strong>河岸雪仗</strong><small>SNOW TYPE BATTLE</small></span>
            </button>
            <div className="match-header__status">
              <span>{stage === "playing" ? "对战进行中" : stage === "countdown" ? "即将开战" : stage === "paused" ? "暂停中" : "本局结束"}</span>
              <b>{formatClock(elapsed)}</b>
              <small>{pinePlayers.length}v{berryPlayers.length} · 前排锁定</small>
            </div>
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
          </header>

          <div className="scoreboard scoreboard--individual">
            <section className="team-score team-score--pine">
              <div className="team-score__label">
                <span><TeamMark team="pine" /><b>雪松队</b><small>盾牌标记 = 当前前排</small></span>
                <strong>{pineAlive}<i>/ {pinePlayers.length} 存活</i></strong>
              </div>
              <TeamHealthRows players={pinePlayers} team="pine" frontlineId={pineFrontlineId} />
            </section>
            <div className="scoreboard__badge"><span>前排</span><strong>VS</strong><small>锁定</small></div>
            <section className="team-score team-score--berry">
              <div className="team-score__label">
                <span><TeamMark team="berry" /><b>红莓队</b><small>倒下后自动切换下一位</small></span>
                <strong>{berryAlive}<i>/ {berryPlayers.length} 存活</i></strong>
              </div>
              <TeamHealthRows players={berryPlayers} team="berry" frontlineId={berryFrontlineId} />
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
                const matchLength = typed && word.text.startsWith(typed) ? typed.length : 0;
                const racer = players.find((player) => player.id === word.aiPlayerId);
                const aiProgress = word.aiProgress;
                const playerProgress = matchLength / word.text.length;
                const raceState =
                  playerProgress > aiProgress
                    ? "leading"
                    : aiProgress > 0 || playerProgress > 0
                      ? "contested"
                      : "idle";
                const visibleProgress = Math.max(playerProgress, aiProgress);
                return (
                  <div
                    key={word.id}
                    ref={(node) => {
                      if (node) wordNodesRef.current.set(word.id, node);
                      else wordNodesRef.current.delete(word.id);
                    }}
                    className={`snow-word snow-word--${word.aiTeam} is-${raceState}${focusedWordId === word.id ? " is-focused" : ""}${word.y >= word.restY - 0.1 ? " is-resting" : ""}`}
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
                      <span className="snow-word__flake" aria-hidden="true">❄</span>
                      <strong><b>{word.text.slice(0, matchLength)}</b>{word.text.slice(matchLength)}</strong>
                      <i aria-hidden="true"><span style={{ width: `${visibleProgress * 100}%` }} /></i>
                      <small className="snow-word__state">
                        {raceState === "leading"
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
                className={`catch-effect catch-effect--${effect.team}`}
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
                <span>❄</span><strong>{effect.text}</strong><i /><i /><i />
              </div>
            ))}

            {projectiles.map((projectile) => (
              <div
                key={projectile.id}
                className={`projectile projectile--${projectile.team}`}
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
                {stage === "ended" && <><small>{winner === "pine" ? "守住河岸！" : "防线被突破"}</small><strong>{winner === "pine" ? "胜利" : "再战"}</strong><p>最佳连击 ×{bestCombo} · 准确率 {accuracy}%</p><div><button onClick={startMatch}>同阵型再来</button><button className="ghost" onClick={returnToLobby}>重排阵型</button></div></>}
              </div>
            )}
          </div>

          <div className="type-dock">
            <div className="stat-card">
              <small>连续命中</small>
              <strong>×{combo}</strong>
              <span>最高 {bestCombo}</span>
            </div>
            <label className={`type-box${inputError ? " is-error" : ""}${typed ? " has-text" : ""}`}>
              <span className="type-box__hint">
                {userAlive ? "只输入英文；绿色表示你当前领先" : "你已出局，AI 队友仍会继续战斗"}
              </span>
              <div className="type-box__line">
                <span className="type-box__prompt">EN</span>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={handleInput}
                  onKeyDown={handleInputKeyDown}
                  disabled={stage !== "playing" || !userAlive}
                  placeholder={userAlive ? "type an English word…" : "you are out"}
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
              <span>{players.find((player) => player.id === "you")?.claims ?? 0} 个雪球</span>
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

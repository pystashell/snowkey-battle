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
type Difficulty = "cozy" | "classic" | "blizzard";

type Player = {
  id: string;
  name: string;
  team: Team;
  badge: string;
  isUser?: boolean;
  claims: number;
  damage: number;
};

type SnowWord = {
  id: number;
  text: string;
  x: number;
  y: number;
  speed: number;
  drift: number;
  bornAt: number;
  claimAt: number;
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
  playerId: string;
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

const MAX_HEALTH = 120;

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
  "雪球",
  "雪花",
  "围巾",
  "冬天",
  "松树",
  "伙伴",
];

const DIFFICULTIES: Record<
  Difficulty,
  {
    label: string;
    note: string;
    minClaim: number;
    maxClaim: number;
    allyChance: number;
    spawnEvery: number;
    maxWords: number;
  }
> = {
  cozy: {
    label: "暖手局",
    note: "队友很给力，适合先找手感",
    minClaim: 3300,
    maxClaim: 5600,
    allyChance: 0.63,
    spawnEvery: 1120,
    maxWords: 8,
  },
  classic: {
    label: "课间局",
    note: "和记忆里差不多的抢词速度",
    minClaim: 2400,
    maxClaim: 4700,
    allyChance: 0.48,
    spawnEvery: 920,
    maxWords: 9,
  },
  blizzard: {
    label: "暴雪局",
    note: "对岸手速很快，长单词伤害更高",
    minClaim: 1650,
    maxClaim: 3600,
    allyChance: 0.34,
    spawnEvery: 760,
    maxWords: 10,
  },
};

const BASE_PLAYERS: Player[] = [
  { id: "you", name: "小雪球", team: "pine", badge: "你", isUser: true, claims: 0, damage: 0 },
  { id: "pine-1", name: "阿澄", team: "pine", badge: "澄", claims: 0, damage: 0 },
  { id: "pine-2", name: "米糕", team: "pine", badge: "糕", claims: 0, damage: 0 },
  { id: "pine-3", name: "小北", team: "pine", badge: "北", claims: 0, damage: 0 },
  { id: "berry-1", name: "团子", team: "berry", badge: "团", claims: 0, damage: 0 },
  { id: "berry-2", name: "柚子", team: "berry", badge: "柚", claims: 0, damage: 0 },
  { id: "berry-3", name: "阿满", team: "berry", badge: "满", claims: 0, damage: 0 },
  { id: "berry-4", name: "星星", team: "berry", badge: "星", claims: 0, damage: 0 },
];

const KID_PALETTES = [
  { coat: "#e7684f", hat: "#ffd166", scarf: "#f7b34b", skin: "#ffd1aa" },
  { coat: "#4f877d", hat: "#f08a5d", scarf: "#ffcf72", skin: "#edb990" },
  { coat: "#8c68a8", hat: "#e85d75", scarf: "#ffd166", skin: "#f4c39c" },
  { coat: "#d58a42", hat: "#4f877d", scarf: "#f6e27a", skin: "#d99e76" },
  { coat: "#4b83b4", hat: "#ef6d67", scarf: "#f7b34b", skin: "#f1c09a" },
  { coat: "#696fa3", hat: "#55a9b8", scarf: "#f7cc68", skin: "#dca47d" },
  { coat: "#3f7898", hat: "#a86c9d", scarf: "#f4a261", skin: "#f3c6a3" },
  { coat: "#6f83b7", hat: "#d45c70", scarf: "#ffd166", skin: "#e5ad86" },
];

function getActorAnchor(player: Player): ActorAnchor {
  const teamPlayers = BASE_PLAYERS.filter((item) => item.team === player.team);
  const index = Math.max(0, teamPlayers.findIndex((item) => item.id === player.id));
  const pineX = [7.4, 15.3, 23.1, 30.7];
  const berryX = [92.6, 84.7, 76.9, 69.3];
  const handY = [68, 62, 71, 59];
  return {
    x: player.team === "pine" ? pineX[index] : berryX[index],
    handY: handY[index],
    hitY: handY[index] - 6,
  };
}

function createIdleActions(): Record<string, CharacterAction> {
  return Object.fromEntries(
    BASE_PLAYERS.map((player) => [player.id, { phase: "idle", token: 0 }]),
  ) as Record<string, CharacterAction>;
}

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

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function TeamMark({ team }: { team: Team }) {
  return <span className={`team-mark team-mark--${team}`} aria-hidden="true" />;
}

function Kid({
  player,
  action,
  finale,
  nodeRef,
}: {
  player: Player;
  action: CharacterAction;
  finale?: "cheer" | "defeat";
  nodeRef?: (node: HTMLDivElement | null) => void;
}) {
  const phase = action.phase === "hit" ? "hit" : finale ?? action.phase;
  const paletteIndex = Math.max(0, BASE_PLAYERS.findIndex((item) => item.id === player.id));
  const palette = KID_PALETTES[paletteIndex];
  const actionLabel: Partial<Record<CharacterPhase, string>> = {
    catch: "抓住！",
    hold: "捏雪球…",
    windup: "蓄力！",
    throw: "扔！",
    hit: "哎呀！",
    cheer: "好耶！",
    defeat: "呜…",
  };

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
        } as CSSProperties
      }
      aria-label={`${player.name}，${actionLabel[phase] ?? "准备中"}`}
    >
      <span className="kid__shadow" aria-hidden="true" />
      <div className="kid__scale">
        <div className="kid__figure" key={`${action.token}-${phase}`}>
          <span className="kid__leg kid__leg--back"><i /></span>
          <span className="kid__leg kid__leg--front"><i /></span>
          <span className="kid__arm kid__arm--back"><i className="kid__mitten" /></span>
          <span className="kid__body"><i className="kid__zip" /><i className="kid__pocket" /></span>
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
      {actionLabel[phase] && <span className="kid__action">{actionLabel[phase]}</span>}
      <span className="kid__name">{player.name}</span>
    </div>
  );
}

function RosterCard({ player }: { player: Player }) {
  const paletteIndex = Math.max(0, BASE_PLAYERS.findIndex((item) => item.id === player.id));
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
      <span>
        <strong>{player.name}</strong>
        <small>{player.isUser ? "本地玩家" : `${player.claims} 次命中`}</small>
      </span>
      <i aria-label="已准备">✓</i>
    </div>
  );
}

export default function SnowballGame() {
  const [stage, setStage] = useState<Stage>("lobby");
  const [difficulty, setDifficulty] = useState<Difficulty>("classic");
  const [playerName, setPlayerName] = useState("小雪球");
  const [players, setPlayers] = useState<Player[]>(BASE_PLAYERS);
  const [words, setWords] = useState<SnowWord[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [catchEffects, setCatchEffects] = useState<CatchEffect[]>([]);
  const [characterActions, setCharacterActions] =
    useState<Record<string, CharacterAction>>(createIdleActions);
  const [pineHealth, setPineHealth] = useState(MAX_HEALTH);
  const [berryHealth, setBerryHealth] = useState(MAX_HEALTH);
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
  const pineHealthRef = useRef(MAX_HEALTH);
  const berryHealthRef = useRef(MAX_HEALTH);
  const comboRef = useRef(0);
  const lastClaimRef = useRef(0);
  const gameStartedAtRef = useRef(0);
  const sequenceRef = useRef(0);
  const lockedWordsRef = useRef(new Set<number>());
  const timersRef = useRef<number[]>([]);
  const actorAvailableAtRef = useRef<Record<string, number>>({});
  const targetCursorRef = useRef<Record<Team, number>>({ pine: 0, berry: 0 });

  const config = DIFFICULTIES[difficulty];
  const activePlayers = useMemo(
    () =>
      players.map((player) =>
        player.id === "you" ? { ...player, name: playerName.trim() || "小雪球" } : player,
      ),
    [playerName, players],
  );
  const pinePlayers = activePlayers.filter((player) => player.team === "pine");
  const berryPlayers = activePlayers.filter((player) => player.team === "berry");
  const totalKeys = correctKeys + wrongKeys;
  const accuracy = totalKeys ? Math.round((correctKeys / totalKeys) * 100) : 100;
  const matchingWords = typed
    ? words.filter((word) => word.text.toLowerCase().startsWith(typed.toLowerCase()))
    : [];
  const focusedWordId = matchingWords.length === 1 ? matchingWords[0].id : null;

  const setGameStage = useCallback((nextStage: Stage) => {
    stageRef.current = nextStage;
    setStage(nextStage);
  }, []);

  const rememberTimer = useCallback((timer: number) => {
    timersRef.current.push(timer);
    return timer;
  }, []);

  const setCharacterPose = useCallback(
    (playerId: string, phase: CharacterPhase, word?: string) => {
      setCharacterActions((current) => ({
        ...current,
        [playerId]: {
          phase,
          token: ++sequenceRef.current,
          ...(word ? { word } : {}),
        },
      }));
    },
    [],
  );

  const settleCharacterPose = useCallback(
    (playerId: string, expectedPhase: CharacterPhase) => {
      setCharacterActions((current) => {
        if (current[playerId]?.phase !== expectedPhase) return current;
        return {
          ...current,
          [playerId]: { phase: "idle", token: ++sequenceRef.current },
        };
      });
    },
    [],
  );

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

  const clearPendingTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const say = useCallback(
    (message: string) => {
      setAnnouncement(message);
      rememberTimer(
        window.setTimeout(() => {
          if (stageRef.current === "playing") setAnnouncement("继续抢雪花！");
        }, 1500),
      );
    },
    [rememberTimer],
  );

  const registerHit = useCallback((playerId: string, damage: number) => {
    setPlayers((current) => {
      const next = current.map((player) =>
        player.id === playerId
          ? { ...player, claims: player.claims + 1, damage: player.damage + damage }
          : player,
      );
      playersRef.current = next;
      return next;
    });
  }, []);

  const endMatch = useCallback(
    (winningTeam: Team) => {
      setWinner(winningTeam);
      setTyped("");
      setGameStage("ended");
      setAnnouncement(winningTeam === "pine" ? "雪松队守住了河岸！" : "红莓队赢下这场雪仗！");
    },
    [setGameStage],
  );

  const applyDamage = useCallback(
    (attackingTeam: Team, damage: number) => {
      const target: Team = attackingTeam === "pine" ? "berry" : "pine";

      if (target === "berry") {
        const next = clamp(berryHealthRef.current - damage, 0, MAX_HEALTH);
        berryHealthRef.current = next;
        setBerryHealth(next);
        if (next === 0) endMatch("pine");
      } else {
        const next = clamp(pineHealthRef.current - damage, 0, MAX_HEALTH);
        pineHealthRef.current = next;
        setPineHealth(next);
        if (next === 0) endMatch("berry");
      }
    },
    [endMatch],
  );

  const launchSnowball = useCallback(
    (player: Player, word: SnowWord, damage: number) => {
      const now = Date.now();
      const startsAt = Math.max(now, actorAvailableAtRef.current[player.id] ?? now);
      const queueDelay = startsAt - now;
      actorAvailableAtRef.current[player.id] = startsAt + 1850;

      const opponents = playersRef.current.filter((candidate) => candidate.team !== player.team);
      const targetTeam: Team = player.team === "pine" ? "berry" : "pine";
      const targetIndex = targetCursorRef.current[targetTeam] % opponents.length;
      targetCursorRef.current[targetTeam] += 1;
      const target = opponents[targetIndex];
      if (!target) return;

      const sourceFallback = getActorAnchor(player);
      const targetFallback = getActorAnchor(target);
      const visibleWord = pointInArena(wordNodesRef.current.get(word.id)) ?? {
        x: word.x,
        y: word.y,
      };
      const sourceAnchor = pointInArena(
        kidNodesRef.current.get(player.id),
        player.team === "pine" ? 0.78 : 0.22,
        0.56,
      ) ?? { x: sourceFallback.x, y: sourceFallback.handY };
      const targetAnchor = pointInArena(
        kidNodesRef.current.get(target.id),
        0.5,
        0.37,
      ) ?? { x: targetFallback.x, y: targetFallback.hitY };
      const catchId = ++sequenceRef.current;
      const projectileId = ++sequenceRef.current;
      const catchEffect: CatchEffect = {
        id: catchId,
        team: player.team,
        playerId: player.id,
        text: word.text,
        fromX: visibleWord.x,
        fromY: visibleWord.y,
        midX: (visibleWord.x + sourceAnchor.x) / 2,
        apexY: Math.max(6, Math.min(visibleWord.y, sourceAnchor.y) - 11),
        toX: sourceAnchor.x,
        toY: sourceAnchor.y,
      };
      const projectile: Projectile = {
        id: projectileId,
        team: player.team,
        text: word.text,
        damage,
        sourcePlayerId: player.id,
        targetPlayerId: target.id,
        fromX: sourceAnchor.x,
        fromY: sourceAnchor.y,
        midX: (sourceAnchor.x + targetAnchor.x) / 2,
        apexY: Math.max(8, Math.min(sourceAnchor.y, targetAnchor.y) - 28),
        toX: targetAnchor.x,
        toY: targetAnchor.y,
      };

      rememberTimer(
        window.setTimeout(() => {
          if (stageRef.current === "ended") return;
          setCatchEffects((current) => [...current, catchEffect]);
          setCharacterPose(player.id, "catch", word.text);
        }, queueDelay),
      );
      rememberTimer(
        window.setTimeout(() => {
          setCatchEffects((current) => current.filter((effect) => effect.id !== catchId));
          if (stageRef.current !== "ended") setCharacterPose(player.id, "hold", word.text);
        }, queueDelay + 410),
      );
      rememberTimer(
        window.setTimeout(() => {
          if (stageRef.current !== "ended") setCharacterPose(player.id, "windup", word.text);
        }, queueDelay + 650),
      );
      rememberTimer(
        window.setTimeout(() => {
          if (stageRef.current === "ended") return;
          setCharacterPose(player.id, "throw", word.text);
          setProjectiles((current) => [...current, projectile]);
        }, queueDelay + 900),
      );
      rememberTimer(
        window.setTimeout(() => {
          setProjectiles((current) => current.filter((item) => item.id !== projectileId));
          if (stageRef.current === "ended") return;
          setCharacterPose(target.id, "hit");
          applyDamage(player.team, damage);
        }, queueDelay + 1510),
      );
      rememberTimer(
        window.setTimeout(() => {
          settleCharacterPose(player.id, "throw");
        }, queueDelay + 1740),
      );
      rememberTimer(
        window.setTimeout(() => {
          settleCharacterPose(target.id, "hit");
        }, queueDelay + 2110),
      );
    },
    [applyDamage, pointInArena, rememberTimer, setCharacterPose, settleCharacterPose],
  );

  const claimWord = useCallback(
    (wordId: number, playerId: string) => {
      if (stageRef.current !== "playing" || lockedWordsRef.current.has(wordId)) return;
      const word = wordsRef.current.find((item) => item.id === wordId);
      const player = playersRef.current.find((item) => item.id === playerId);
      if (!word || !player) return;

      lockedWordsRef.current.add(wordId);
      const nextWords = wordsRef.current.filter((item) => item.id !== wordId);
      wordsRef.current = nextWords;
      setWords(nextWords);

      let damage = clamp(5 + word.text.length, 8, 13);
      if (player.isUser) {
        const now = Date.now();
        const nextCombo = now - lastClaimRef.current < 4200 ? comboRef.current + 1 : 1;
        comboRef.current = nextCombo;
        lastClaimRef.current = now;
        setCombo(nextCombo);
        setBestCombo((current) => Math.max(current, nextCombo));
        damage = clamp(damage + Math.floor(nextCombo / 3), 8, 16);
        say(`${word.text} 抢到了！连击 ×${nextCombo}`);
      } else {
        const stillMatches = typed && nextWords.some((item) => item.text.startsWith(typed));
        if (typed && word.text.startsWith(typed) && !stillMatches) {
          setTyped("");
          say(`被 ${player.name} 抢先了！`);
        } else {
          say(`${player.name} 抢到「${word.text}」`);
        }
      }

      registerHit(player.id, damage);
      launchSnowball(player, word, damage);
    },
    [launchSnowball, registerHit, say, typed],
  );

  const spawnWord = useCallback(
    (seedY?: number) => {
      if (wordsRef.current.length >= config.maxWords) return;
      const active = new Set(wordsRef.current.map((word) => word.text));
      const available = WORDS.filter((word) => !active.has(word));
      if (!available.length) return;

      const team: Team = Math.random() < config.allyChance ? "pine" : "berry";
      const candidates = playersRef.current.filter(
        (player) => player.team === team && !player.isUser,
      );
      const aiPlayer = candidates[Math.floor(Math.random() * candidates.length)];
      if (!aiPlayer) return;

      const bornAt = Date.now();
      const word: SnowWord = {
        id: ++sequenceRef.current,
        text: available[Math.floor(Math.random() * available.length)],
        x: 19 + Math.random() * 62,
        y: seedY ?? 7 + Math.random() * 8,
        speed: 4.2 + Math.random() * 2.4,
        drift: -10 + Math.random() * 20,
        bornAt,
        claimAt:
          bornAt + config.minClaim + Math.random() * (config.maxClaim - config.minClaim),
        aiTeam: team,
        aiPlayerId: aiPlayer.id,
      };
      const next = [...wordsRef.current, word];
      wordsRef.current = next;
      setWords(next);
    },
    [config],
  );

  const startMatch = useCallback(() => {
    clearPendingTimers();
    const cleanPlayers = BASE_PLAYERS.map((player) => ({
      ...player,
      name: player.id === "you" ? playerName.trim() || "小雪球" : player.name,
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
    targetCursorRef.current = { pine: 0, berry: 0 };
    lockedWordsRef.current.clear();
    pineHealthRef.current = MAX_HEALTH;
    berryHealthRef.current = MAX_HEALTH;
    setPineHealth(MAX_HEALTH);
    setBerryHealth(MAX_HEALTH);
    comboRef.current = 0;
    lastClaimRef.current = 0;
    setCombo(0);
    setBestCombo(0);
    setCorrectKeys(0);
    setWrongKeys(0);
    setElapsed(0);
    setWinner(null);
    setTyped("");
    setInputError(false);
    setCountdown(3);
    setAnnouncement("准备好了吗？");
    gameStartedAtRef.current = 0;
    setGameStage("countdown");
  }, [clearPendingTimers, playerName, setGameStage]);

  const returnToLobby = useCallback(() => {
    clearPendingTimers();
    wordsRef.current = [];
    setWords([]);
    setProjectiles([]);
    setCatchEffects([]);
    setCharacterActions(createIdleActions());
    actorAvailableAtRef.current = {};
    setTyped("");
    setWinner(null);
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
    if (stage !== "countdown") return;
    if (countdown <= 0) {
      const initialWords: SnowWord[] = [];
      wordsRef.current = initialWords;
      for (let index = 0; index < 5; index += 1) spawnWord(10 + index * 10);
      gameStartedAtRef.current = Date.now();
      setAnnouncement("开战！先把单词打出来");
      setGameStage("playing");
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 720);
    return () => window.clearTimeout(timer);
  }, [countdown, setGameStage, spawnWord, stage]);

  useEffect(() => {
    if (stage === "playing") {
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [stage]);

  useEffect(() => {
    const fallTimer = window.setInterval(() => {
      if (stageRef.current !== "playing") return;
      const next = wordsRef.current
        .map((word) => ({ ...word, y: word.y + word.speed * 0.055 }))
        .filter((word) => word.y < 78);
      if (next.length !== wordsRef.current.length && typed) {
        const hasMatch = next.some((word) => word.text.startsWith(typed));
        if (!hasMatch) setTyped("");
      }
      wordsRef.current = next;
      setWords(next);
    }, 55);

    const aiTimer = window.setInterval(() => {
      if (stageRef.current !== "playing") return;
      const now = Date.now();
      const due = wordsRef.current
        .filter((word) => word.claimAt <= now)
        .sort((a, b) => a.claimAt - b.claimAt);
      if (due[0]) claimWord(due[0].id, due[0].aiPlayerId);
    }, 80);

    const spawnTimer = window.setInterval(() => {
      if (stageRef.current === "playing") spawnWord();
    }, config.spawnEvery);

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
  }, [claimWord, config.spawnEvery, spawnWord, typed]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && stageRef.current === "playing") {
        setGameStage("paused");
        setAnnouncement("离开页面，已自动暂停");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [setGameStage]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (stageRef.current !== "playing") return;
    const nextValue = event.target.value
      .toLowerCase()
      .replace(/[^a-z\u4e00-\u9fff]/g, "")
      .slice(0, 10);
    if (!nextValue) {
      setTyped("");
      setInputError(false);
      return;
    }

    const matches = wordsRef.current.filter((word) =>
      word.text.toLowerCase().startsWith(nextValue),
    );
    if (!matches.length) {
      setInputError(true);
      setWrongKeys((value) => value + 1);
      comboRef.current = 0;
      setCombo(0);
      rememberTimer(window.setTimeout(() => setInputError(false), 260));
      return;
    }

    setTyped(nextValue);
    setInputError(false);
    if (nextValue.length > typed.length) setCorrectKeys((value) => value + 1);
    const exact = matches.find((word) => word.text.toLowerCase() === nextValue);
    if (exact) {
      setTyped("");
      claimWord(exact.id, "you");
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      setTyped("");
      setInputError(false);
    }
  };

  const resume = () => {
    gameStartedAtRef.current = Date.now() - elapsed * 1000;
    setGameStage("playing");
    setAnnouncement("继续抢雪花！");
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
            <p className="eyebrow"><span /> 童年打字小游戏重制</p>
            <h1 id="game-title">
              河岸那边，<br />
              <em>开打雪仗！</em>
            </h1>
            <p className="lobby__lead">
              雪花里藏着单词。谁先打出来，谁就能把它攥成雪球，越过冰河砸向对岸。
            </p>

            <div className="rule-strip" aria-label="游戏规则">
              <span><b>01</b> 看准飘落单词</span>
              <span><b>02</b> 完整输入抢雪花</span>
              <span><b>03</b> 先打空对方血量</span>
            </div>

            <div className="lobby__controls">
              <label>
                <span>你的名字</span>
                <input
                  value={playerName}
                  maxLength={8}
                  onChange={(event) => setPlayerName(event.target.value)}
                  aria-label="你的名字"
                />
              </label>
              <label>
                <span>对战难度</span>
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                  aria-label="对战难度"
                >
                  {Object.entries(DIFFICULTIES).map(([value, item]) => (
                    <option key={value} value={value}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="difficulty-note">{config.note}</p>

            <button className="primary-button" onClick={startMatch}>
              <span>加入雪松队</span>
              <strong>开始对战 →</strong>
            </button>
            <p className="local-note">本机试玩 · 1 位玩家 + 7 位雪友 AI · 共 8 人</p>
          </div>

          <div className="lobby__room">
            <div className="room-card">
              <div className="room-card__top">
                <span><i /> 房间已满</span>
                <strong>4 VS 4</strong>
                <small>雪桥镇 · 01号河岸</small>
              </div>
              <div className="room-vs">
                <section>
                  <header><TeamMark team="pine" /> 雪松队 <b>4/4</b></header>
                  {pinePlayers.map((player) => <RosterCard key={player.id} player={player} />)}
                </section>
                <div className="room-vs__river"><span>VS</span></div>
                <section>
                  <header><TeamMark team="berry" /> 红莓队 <b>4/4</b></header>
                  {berryPlayers.map((player) => <RosterCard key={player.id} player={player} />)}
                </section>
              </div>
              <div className="room-card__footer">
                <span>◉ 共享血量</span>
                <span>⌨ 输入即出手</span>
                <span>❄ 长词伤害更高</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="match" aria-label="雪仗对战">
          <header className="match-header">
            <button className="brand-button" onClick={returnToLobby} aria-label="返回房间">
              <span className="brand-button__flake">✦</span>
              <span><strong>河岸雪仗</strong><small>SNOW TYPE BATTLE</small></span>
            </button>
            <div className="match-header__status">
              <span>{stage === "playing" ? "对战进行中" : stage === "countdown" ? "即将开战" : stage === "paused" ? "暂停中" : "本局结束"}</span>
              <b>{formatClock(elapsed)}</b>
              <small>{config.label} · 4v4</small>
            </div>
            <button
              className="paper-button"
              onClick={() => (stage === "paused" ? resume() : setGameStage("paused"))}
              disabled={stage === "countdown" || stage === "ended"}
            >
              {stage === "paused" ? "继续" : "暂停"}
            </button>
          </header>

          <div className="scoreboard">
            <section className="team-score team-score--pine">
              <div className="team-score__label">
                <span><TeamMark team="pine" /><b>雪松队</b><small>{pinePlayers.map((player) => player.badge).join(" · ")}</small></span>
                <strong>{pineHealth}<i>/ {MAX_HEALTH}</i></strong>
              </div>
              <div className="health-track" role="progressbar" aria-label="雪松队血量" aria-valuenow={pineHealth} aria-valuemin={0} aria-valuemax={MAX_HEALTH}>
                <i style={{ width: `${(pineHealth / MAX_HEALTH) * 100}%` }} />
              </div>
            </section>
            <div className="scoreboard__badge"><span>跨河</span><strong>VS</strong><small>雪仗</small></div>
            <section className="team-score team-score--berry">
              <div className="team-score__label">
                <span><TeamMark team="berry" /><b>红莓队</b><small>{berryPlayers.map((player) => player.badge).join(" · ")}</small></span>
                <strong>{berryHealth}<i>/ {MAX_HEALTH}</i></strong>
              </div>
              <div className="health-track" role="progressbar" aria-label="红莓队血量" aria-valuenow={berryHealth} aria-valuemin={0} aria-valuemax={MAX_HEALTH}>
                <i style={{ width: `${(berryHealth / MAX_HEALTH) * 100}%` }} />
              </div>
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
                  finale={stage === "ended" ? (winner === "pine" ? "cheer" : "defeat") : undefined}
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
                  finale={stage === "ended" ? (winner === "berry" ? "cheer" : "defeat") : undefined}
                  nodeRef={(node) => {
                    if (node) kidNodesRef.current.set(player.id, node);
                    else kidNodesRef.current.delete(player.id);
                  }}
                />
              ))}
            </div>

            <div className="word-field" aria-label="飘落的单词">
              {words.map((word) => {
                const matchLength = typed && word.text.toLowerCase().startsWith(typed.toLowerCase()) ? typed.length : 0;
                const claimDuration = Math.max(400, word.claimAt - word.bornAt);
                return (
                  <div
                    key={word.id}
                    ref={(node) => {
                      if (node) wordNodesRef.current.set(word.id, node);
                      else wordNodesRef.current.delete(word.id);
                    }}
                    className={`snow-word snow-word--${word.aiTeam}${matchLength ? " is-matching" : ""}${focusedWordId === word.id ? " is-focused" : ""}`}
                    style={
                      {
                        left: `${word.x}%`,
                        top: `${word.y}%`,
                        "--word-drift": `${word.drift}px`,
                        "--claim-duration": `${claimDuration}ms`,
                      } as CSSProperties
                    }
                  >
                    <div className="snow-word__sway">
                      <span className="snow-word__flake" aria-hidden="true">❄</span>
                      <strong>
                        <b>{word.text.slice(0, matchLength)}</b>{word.text.slice(matchLength)}
                      </strong>
                      <i aria-hidden="true" />
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
                {stage === "countdown" && <><small>戴好手套</small><strong>{countdown || "GO!"}</strong><p>手放到键盘上</p></>}
                {stage === "paused" && <><small>雪球先放下</small><strong>暂停</strong><p>准备好了再继续</p><button onClick={resume}>继续对战</button></>}
                {stage === "ended" && <><small>{winner === "pine" ? "守住河岸！" : "对岸攻过来了"}</small><strong>{winner === "pine" ? "胜利" : "再战"}</strong><p>最佳连击 ×{bestCombo} · 准确率 {accuracy}%</p><div><button onClick={startMatch}>再来一局</button><button className="ghost" onClick={returnToLobby}>回到房间</button></div></>}
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
              <span className="type-box__hint">输入飘落的单词，抢先抓住它</span>
              <div className="type-box__line">
                <span className="type-box__prompt">⌨</span>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={handleInput}
                  onKeyDown={handleInputKeyDown}
                  disabled={stage !== "playing"}
                  placeholder={stage === "playing" ? "直接打字…" : "等待开战"}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="单词输入框"
                  onPaste={(event) => event.preventDefault()}
                />
                <span className="type-box__clear">空格清空</span>
              </div>
              <span className="type-box__message" aria-live="polite">{inputError ? "这个开头没有雪花，再看一眼" : announcement}</span>
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
        雪松队剩余 {pineHealth} 点血量，红莓队剩余 {berryHealth} 点血量。
      </div>
    </main>
  );
}

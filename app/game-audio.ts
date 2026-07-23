export const MUSIC_SCENES = ["lobby", "battle"] as const;

export type MusicScene = (typeof MUSIC_SCENES)[number];

export type MusicTrack = Readonly<{
  id: string;
  title: string;
  artist: string;
  src: string;
  sourceUrl: string;
  license: "CC0 1.0";
  scene: MusicScene;
}>;

export type GameOutcome = "victory" | "defeat";

export type OutcomeMusicTrack = Readonly<{
  id: string;
  title: string;
  artist: string;
  src: string;
  sourceUrl: string;
  license: string;
  outcome: GameOutcome;
}>;

export const MUSIC_TRACKS: readonly MusicTrack[] = Object.freeze([
  Object.freeze({
    id: "wintery-loop",
    title: "Wintery Loop",
    artist: "Emma_MA",
    src: "/audio/music/wintery-loop.mp3",
    sourceUrl: "https://opengameart.org/content/wintery-loop",
    license: "CC0 1.0" as const,
    scene: "lobby" as const,
  }),
  Object.freeze({
    id: "winter-wind",
    title: "Winter Wind",
    artist: "wipics",
    src: "/audio/music/winter-wind.mp3",
    sourceUrl: "https://opengameart.org/content/winter-wind",
    license: "CC0 1.0" as const,
    scene: "lobby" as const,
  }),
  Object.freeze({
    id: "happy-synths",
    title: "Happy Synths",
    artist: "3xBlast",
    src: "/audio/music/happy-synths.mp3",
    sourceUrl: "https://opengameart.org/content/happy-synths-loop-with-slight-christmas-feeling",
    license: "CC0 1.0" as const,
    scene: "lobby" as const,
  }),
  Object.freeze({
    id: "black-diamond",
    title: "Black Diamond",
    artist: "Joth",
    src: "/audio/music/black-diamond.mp3",
    sourceUrl: "https://opengameart.org/content/black-diamond",
    license: "CC0 1.0" as const,
    scene: "battle" as const,
  }),
]);

export const DEFAULT_MUSIC_TRACK_IDS: Readonly<Record<MusicScene, string>> = Object.freeze({
  lobby: "happy-synths",
  battle: "black-diamond",
});

export const OUTCOME_MUSIC_TRACKS: Readonly<Record<GameOutcome, OutcomeMusicTrack>> = Object.freeze({
  victory: Object.freeze({
    id: "aigei-game-victory",
    title: "游戏胜利提示音效",
    artist: "爱给网 / Aigei.com",
    src: "/audio/music/aigei-game-victory.mp3",
    sourceUrl: "https://www.aigei.com/sound/class/you_xi_she_72/",
    license: "许可见来源 / See source terms",
    outcome: "victory",
  }),
  defeat: Object.freeze({
    id: "aigei-game-defeat-1683890",
    title: "游戏失败",
    artist: "爱给网 / Aigei.com",
    src: "/audio/music/aigei-game-defeat-1683890.mp3",
    sourceUrl: "https://www.aigei.com/sound/class/wan_you_xi_38/",
    license: "许可见来源 / See source terms",
    outcome: "defeat",
  }),
});

export function resolvePersonalOutcome(
  winner: "pine" | "berry" | null,
  playerTeam: "pine" | "berry" | null,
): GameOutcome | null {
  if (!winner || !playerTeam) return null;
  return winner === playerTeam ? "victory" : "defeat";
}

export const DEFAULT_MUSIC_VOLUME = 0.5;
export const DEFAULT_SFX_VOLUME = 0.5;
export const MUSIC_OUTPUT_GAIN = 0.32;
export const OUTCOME_MUSIC_GAIN = 1.5;
export const MUSIC_PREVIEW_DURATION_MS = 8_000;

export type GameSfx = "pack" | "hit" | "down";

export const SFX_SOURCES: Readonly<Record<GameSfx, string>> = Object.freeze({
  pack: "/audio/sfx/snowball-pack.wav",
  hit: "/audio/sfx/snowball-hit.wav",
  down: "/audio/sfx/player-down.wav",
});

export const SFX_OUTPUT_GAINS: Readonly<Record<GameSfx, number>> = Object.freeze({
  pack: 0.38,
  hit: 0.55,
  down: 0.82,
});

const SFX_COOLDOWNS_MS: Readonly<Record<GameSfx, number>> = Object.freeze({
  pack: 90,
  hit: 55,
  down: 80,
});

const SFX_CONCURRENCY_LIMITS: Readonly<Record<GameSfx, number>> = Object.freeze({
  pack: 2,
  hit: 3,
  down: 2,
});

export const GAME_AUDIO_STORAGE_KEY = "snowkey.gameAudio.v1";

type SceneBooleans = Readonly<Record<MusicScene, boolean>>;
type SceneTrackIds = Readonly<Record<MusicScene, string>>;

export type GameAudioState = Readonly<{
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  musicScene: MusicScene;
  previewingScene: MusicScene | null;
  randomModeByScene: SceneBooleans;
  selectedTrackIds: SceneTrackIds;
  currentTrackId: string | null;
  currentTrack: MusicTrack | null;
  activeOutcome: GameOutcome | null;
  previewingOutcome: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  blocked: boolean;
  ready: boolean;
}>;

type StoredPreferences = {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  randomModeByScene: SceneBooleans;
  selectedTrackIds: SceneTrackIds;
};

type AudioFactory = (src?: string) => HTMLAudioElement | null;
type TimerHandle = ReturnType<typeof setTimeout>;

export type GameAudioControllerOptions = {
  tracks?: readonly MusicTrack[];
  outcomeTracks?: Readonly<Record<GameOutcome, OutcomeMusicTrack>>;
  random?: () => number;
  now?: () => number;
  audioFactory?: AudioFactory;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancelScheduled?: (handle: TimerHandle) => void;
};

const DEFAULT_RANDOM_MODES: SceneBooleans = Object.freeze({
  lobby: false,
  battle: false,
});

const DEFAULT_SELECTED_TRACK_IDS: SceneTrackIds = Object.freeze({
  ...DEFAULT_MUSIC_TRACK_IDS,
});

const DEFAULT_STATE: GameAudioState = Object.freeze({
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: DEFAULT_MUSIC_VOLUME,
  sfxVolume: DEFAULT_SFX_VOLUME,
  musicScene: "lobby",
  previewingScene: null,
  randomModeByScene: DEFAULT_RANDOM_MODES,
  selectedTrackIds: DEFAULT_SELECTED_TRACK_IDS,
  currentTrackId: null,
  currentTrack: null,
  activeOutcome: null,
  previewingOutcome: false,
  isPlaying: false,
  isPaused: false,
  blocked: false,
  ready: false,
});

function normalizeRandom(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.9999999999999999, value));
}

export function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function pickRandomTrack(
  tracks: readonly MusicTrack[],
  currentTrackId: string | null,
  random: () => number = Math.random,
): MusicTrack | null {
  if (!tracks.length) return null;
  const candidates = tracks.length > 1
    ? tracks.filter((track) => track.id !== currentTrackId)
    : [...tracks];
  const index = Math.floor(normalizeRandom(random()) * candidates.length);
  return candidates[index] ?? candidates[0] ?? null;
}

function browserAudioFactory(src?: string) {
  if (typeof Audio === "undefined") return null;
  return new Audio(src);
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPlaybackBlocked(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "NotAllowedError" || name === "SecurityError";
}

function safelyPause(audio: HTMLAudioElement | null) {
  if (!audio) return;
  try {
    audio.pause();
  } catch {
    // A partially initialized media element can reject cleanup in old browsers.
  }
}

function releaseAudio(audio: HTMLAudioElement) {
  safelyPause(audio);
  try {
    audio.removeAttribute("src");
    audio.load();
  } catch {
    // Releasing media is best-effort during navigation and test teardown.
  }
}

function freezeSceneBooleans(values: Record<MusicScene, boolean>): SceneBooleans {
  return Object.freeze({ lobby: values.lobby, battle: values.battle });
}

function freezeSceneTrackIds(values: Record<MusicScene, string>): SceneTrackIds {
  return Object.freeze({ lobby: values.lobby, battle: values.battle });
}

function trackExistsForScene(
  tracks: readonly MusicTrack[],
  trackId: unknown,
  scene: MusicScene,
): trackId is string {
  return typeof trackId === "string"
    && tracks.some((track) => track.id === trackId && track.scene === scene);
}

function readPreferences(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  tracks: readonly MusicTrack[],
): StoredPreferences | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(GAME_AUDIO_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredPreferences> & {
      currentTrackId?: unknown;
    };
    const selectedTrackIds: Record<MusicScene, string> = {
      lobby: DEFAULT_MUSIC_TRACK_IDS.lobby,
      battle: DEFAULT_MUSIC_TRACK_IDS.battle,
    };
    for (const scene of MUSIC_SCENES) {
      const storedTrackId = value.selectedTrackIds?.[scene];
      if (trackExistsForScene(tracks, storedTrackId, scene)) {
        selectedTrackIds[scene] = storedTrackId;
      }
    }

    // Preserve a manual choice written by the first audio implementation.
    if (typeof value.currentTrackId === "string") {
      const legacyTrack = tracks.find((track) => track.id === value.currentTrackId);
      if (legacyTrack && !value.selectedTrackIds) {
        selectedTrackIds[legacyTrack.scene] = legacyTrack.id;
      }
    }

    const randomModeByScene = freezeSceneBooleans({
      lobby: value.randomModeByScene?.lobby === true,
      battle: value.randomModeByScene?.battle === true,
    });
    return {
      musicEnabled: value.musicEnabled !== false,
      sfxEnabled: value.sfxEnabled !== false,
      musicVolume: typeof value.musicVolume === "number"
        ? clampVolume(value.musicVolume)
        : DEFAULT_MUSIC_VOLUME,
      sfxVolume: typeof value.sfxVolume === "number"
        ? clampVolume(value.sfxVolume)
        : DEFAULT_SFX_VOLUME,
      randomModeByScene,
      selectedTrackIds: freezeSceneTrackIds(selectedTrackIds),
    };
  } catch {
    return null;
  }
}

type ActiveSfx = {
  kind: GameSfx;
  cleanup: () => void;
};

export class GameAudioController {
  readonly tracks: readonly MusicTrack[];
  readonly outcomeTracks: Readonly<Record<GameOutcome, OutcomeMusicTrack>>;

  private readonly random: () => number;
  private readonly now: () => number;
  private readonly audioFactory: AudioFactory;
  private readonly suppliedStorage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  private readonly schedule: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly cancelScheduled: (handle: TimerHandle) => void;
  private storage: Pick<Storage, "getItem" | "setItem"> | null = null;
  private state: GameAudioState = DEFAULT_STATE;
  private listeners = new Set<() => void>();
  private music: HTMLAudioElement | null = null;
  private activeSfx = new Map<HTMLAudioElement, ActiveSfx>();
  private lastSfxStartedAt: Record<GameSfx, number> = {
    pack: Number.NEGATIVE_INFINITY,
    hit: Number.NEGATIVE_INFINITY,
    down: Number.NEGATIVE_INFINITY,
  };
  private previewTimer: TimerHandle | null = null;
  private mounted = false;
  private destroyed = false;
  private unlocked = false;
  private playRequest = 0;

  constructor(options: GameAudioControllerOptions = {}) {
    this.tracks = options.tracks ?? MUSIC_TRACKS;
    this.outcomeTracks = options.outcomeTracks ?? OUTCOME_MUSIC_TRACKS;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.audioFactory = options.audioFactory ?? browserAudioFactory;
    this.suppliedStorage = options.storage;
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelScheduled = options.cancelScheduled ?? ((handle) => clearTimeout(handle));
  }

  getSnapshot = () => this.state;

  getServerSnapshot = () => DEFAULT_STATE;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  tracksForScene(scene: MusicScene) {
    return this.tracks.filter((track) => track.scene === scene);
  }

  mount() {
    if (this.mounted) return;
    // React Strict Mode intentionally mounts, cleans up, and mounts effects again
    // in development. Recreate the media resources on that second mount.
    this.destroyed = false;
    this.mounted = true;
    this.unlocked = false;
    this.storage = this.suppliedStorage === undefined ? browserStorage() : this.suppliedStorage;
    const stored = readPreferences(this.storage, this.tracks);
    const selectedTrackIds = stored?.selectedTrackIds ?? DEFAULT_SELECTED_TRACK_IDS;
    const initialTrack = this.findTrack(selectedTrackIds.lobby)
      ?? this.tracksForScene("lobby")[0]
      ?? null;
    this.state = {
      musicEnabled: stored?.musicEnabled ?? true,
      sfxEnabled: stored?.sfxEnabled ?? true,
      musicVolume: stored?.musicVolume ?? DEFAULT_MUSIC_VOLUME,
      sfxVolume: stored?.sfxVolume ?? DEFAULT_SFX_VOLUME,
      musicScene: "lobby",
      previewingScene: null,
      randomModeByScene: stored?.randomModeByScene ?? DEFAULT_RANDOM_MODES,
      selectedTrackIds,
      currentTrackId: initialTrack?.id ?? null,
      currentTrack: initialTrack,
      activeOutcome: null,
      previewingOutcome: false,
      isPlaying: false,
      isPaused: false,
      blocked: false,
      ready: true,
    };
    this.music = this.audioFactory();
    if (this.music) {
      this.music.preload = "auto";
      this.applyMusicVolume();
      this.music.addEventListener("ended", this.handleMusicEnded);
      this.music.addEventListener("play", this.handleMusicPlay);
      this.music.addEventListener("pause", this.handleMusicPause);
      this.music.addEventListener("error", this.handleMusicError);
    }
    this.emit();
  }

  async notifyUserInteraction() {
    if (!this.mounted) this.mount();
    this.unlocked = true;
    if (
      !this.state.musicEnabled
      || this.state.isPlaying
      || this.state.isPaused
      || this.destroyed
    ) return false;
    if (this.state.activeOutcome) {
      return this.startOutcomeTrack(
        this.outcomeTracks[this.state.activeOutcome],
        this.state.previewingOutcome,
      );
    }
    return this.playSceneMusic(this.state.musicScene, false);
  }

  async setMusicScene(scene: MusicScene) {
    if (!this.mounted) this.mount();
    if (this.destroyed) return false;
    const changed = scene !== this.state.musicScene;
    const wasPreviewing = this.state.previewingScene !== null;
    const wasPlayingOutcome = this.state.activeOutcome !== null;
    this.clearPreviewTimer();
    const track = this.chooseSceneTrack(scene, changed);
    this.update({
      musicScene: scene,
      previewingScene: null,
      currentTrackId: track?.id ?? null,
      currentTrack: track,
      activeOutcome: null,
      previewingOutcome: false,
      blocked: false,
    });
    if (
      !this.unlocked
      || !this.state.musicEnabled
      || this.state.isPaused
      || !track
    ) {
      if (changed || wasPreviewing || wasPlayingOutcome) {
        this.playRequest += 1;
        safelyPause(this.music);
        this.update({ isPlaying: false });
      }
      return false;
    }
    if (!changed && !wasPreviewing && !wasPlayingOutcome && this.state.isPlaying) return true;
    return this.startTrack(track, null);
  }

  async selectTrack(trackId: string) {
    if (!this.mounted) this.mount();
    const track = this.findTrack(trackId);
    if (!track || this.destroyed) return false;
    this.unlocked = true;
    const selectedTrackIds = freezeSceneTrackIds({
      ...this.state.selectedTrackIds,
      [track.scene]: track.id,
    });
    const randomModeByScene = freezeSceneBooleans({
      ...this.state.randomModeByScene,
      [track.scene]: false,
    });
    this.update({
      musicEnabled: true,
      isPaused: false,
      selectedTrackIds,
      randomModeByScene,
      activeOutcome: null,
      previewingOutcome: false,
      blocked: false,
    });
    this.persist();
    const previewingScene = track.scene === this.state.musicScene ? null : track.scene;
    return this.startTrack(track, previewingScene);
  }

  async playRandom(scene: MusicScene = this.state.musicScene) {
    if (!this.mounted) this.mount();
    if (this.destroyed) return false;
    this.unlocked = true;
    const pool = this.tracksForScene(scene);
    const currentId = this.state.currentTrack?.scene === scene
      ? this.state.currentTrackId
      : null;
    const track = pickRandomTrack(pool, currentId, this.random);
    if (!track) return false;
    const randomModeByScene = freezeSceneBooleans({
      ...this.state.randomModeByScene,
      [scene]: true,
    });
    this.update({
      musicEnabled: true,
      isPaused: false,
      randomModeByScene,
      activeOutcome: null,
      previewingOutcome: false,
      blocked: false,
    });
    this.persist();
    const previewingScene = scene === this.state.musicScene ? null : scene;
    return this.startTrack(track, previewingScene);
  }

  async playNext() {
    if (!this.mounted) this.mount();
    if (!this.tracks.length || this.destroyed) return false;
    if (this.state.activeOutcome) {
      return this.playSceneMusic(this.state.musicScene, false);
    }
    const scene = this.state.previewingScene ?? this.state.musicScene;
    if (this.state.randomModeByScene[scene]) return this.playRandom(scene);
    const pool = this.tracksForScene(scene);
    if (!pool.length) return false;
    const currentIndex = pool.findIndex((track) => track.id === this.state.currentTrackId);
    const nextIndex = (Math.max(-1, currentIndex) + 1) % pool.length;
    return this.selectTrack(pool[nextIndex].id);
  }

  pauseMusic() {
    if (!this.mounted) this.mount();
    if (this.destroyed) return false;
    this.playRequest += 1;
    this.clearPreviewTimer();
    safelyPause(this.music);
    this.update({
      isPlaying: false,
      isPaused: true,
      previewingScene: null,
      blocked: false,
    });
    return true;
  }

  async resumeMusic() {
    if (!this.mounted) this.mount();
    if (this.destroyed) return false;
    this.unlocked = true;
    this.update({ musicEnabled: true, isPaused: false, blocked: false });
    this.persist();
    if (this.state.activeOutcome) {
      return this.startOutcomeTrack(
        this.outcomeTracks[this.state.activeOutcome],
        this.state.previewingOutcome,
      );
    }
    return this.playSceneMusic(this.state.musicScene, false);
  }

  async togglePlayback() {
    if (this.state.musicEnabled && this.state.isPlaying) return this.pauseMusic();
    return this.resumeMusic();
  }

  async toggleMusic(force?: boolean) {
    if (!this.mounted) this.mount();
    const enabled = typeof force === "boolean" ? force : !this.state.musicEnabled;
    if (!enabled) {
      this.playRequest += 1;
      this.clearPreviewTimer();
      safelyPause(this.music);
      this.update({
        musicEnabled: false,
        isPlaying: false,
        isPaused: false,
        previewingScene: null,
        blocked: false,
      });
      this.persist();
      return false;
    }
    this.unlocked = true;
    this.update({ musicEnabled: true, isPaused: false, blocked: false });
    this.persist();
    if (this.state.activeOutcome) {
      return this.startOutcomeTrack(
        this.outcomeTracks[this.state.activeOutcome],
        this.state.previewingOutcome,
      );
    }
    return this.playSceneMusic(this.state.musicScene, false);
  }

  async playOutcomeMusic(outcome: GameOutcome) {
    if (!this.mounted) this.mount();
    if (this.destroyed) return false;
    if (this.state.activeOutcome === outcome && !this.state.previewingOutcome) {
      return this.state.isPlaying;
    }
    const track = this.outcomeTracks[outcome];
    this.clearPreviewTimer();
    this.update({
      currentTrackId: track.id,
      currentTrack: null,
      activeOutcome: outcome,
      previewingOutcome: false,
      previewingScene: null,
      blocked: false,
    });
    if (!this.unlocked || !this.state.musicEnabled || this.state.isPaused) {
      this.playRequest += 1;
      safelyPause(this.music);
      this.update({ isPlaying: false });
      return false;
    }
    return this.startOutcomeTrack(track, false);
  }

  async previewOutcomeMusic(outcome: GameOutcome) {
    if (!this.mounted) this.mount();
    if (this.destroyed) return false;
    this.unlocked = true;
    this.update({ musicEnabled: true, isPaused: false, blocked: false });
    this.persist();
    return this.startOutcomeTrack(this.outcomeTracks[outcome], true);
  }

  toggleSfx(force?: boolean) {
    if (!this.mounted) this.mount();
    const enabled = typeof force === "boolean" ? force : !this.state.sfxEnabled;
    this.update({ sfxEnabled: enabled });
    if (!enabled) this.stopAllSfx();
    this.persist();
    return enabled;
  }

  setMusicVolume(value: number) {
    if (!this.mounted) this.mount();
    const musicVolume = clampVolume(value);
    this.update({ musicVolume });
    this.applyMusicVolume();
    this.persist();
    return musicVolume;
  }

  setSfxVolume(value: number) {
    if (!this.mounted) this.mount();
    const sfxVolume = clampVolume(value);
    this.update({ sfxVolume });
    for (const [audio, active] of this.activeSfx) {
      audio.volume = SFX_OUTPUT_GAINS[active.kind] * sfxVolume;
    }
    this.persist();
    return sfxVolume;
  }

  async playSfx(kind: GameSfx) {
    if (!this.mounted) this.mount();
    if (!this.state.sfxEnabled || this.destroyed || this.state.sfxVolume <= 0) return false;
    const now = this.now();
    if (now - this.lastSfxStartedAt[kind] < SFX_COOLDOWNS_MS[kind]) return false;
    const sameKindCount = [...this.activeSfx.values()]
      .filter((active) => active.kind === kind)
      .length;
    if (sameKindCount >= SFX_CONCURRENCY_LIMITS[kind]) return false;
    const audio = this.audioFactory(SFX_SOURCES[kind]);
    if (!audio) return false;
    audio.preload = "auto";
    audio.volume = SFX_OUTPUT_GAINS[kind] * this.state.sfxVolume;
    const cleanup = () => {
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("error", cleanup);
      this.activeSfx.delete(audio);
      releaseAudio(audio);
    };
    this.activeSfx.set(audio, { kind, cleanup });
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);
    this.lastSfxStartedAt[kind] = now;
    try {
      await Promise.resolve(audio.play());
      return true;
    } catch (error) {
      cleanup();
      if (isPlaybackBlocked(error)) this.update({ blocked: true });
      return false;
    }
  }

  clearBlocked() {
    if (this.state.blocked) this.update({ blocked: false });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mounted = false;
    this.unlocked = false;
    this.playRequest += 1;
    this.clearPreviewTimer();
    if (this.music) {
      this.music.removeEventListener("ended", this.handleMusicEnded);
      this.music.removeEventListener("play", this.handleMusicPlay);
      this.music.removeEventListener("pause", this.handleMusicPause);
      this.music.removeEventListener("error", this.handleMusicError);
      releaseAudio(this.music);
      this.music = null;
    }
    this.stopAllSfx();
    this.listeners.clear();
  }

  private findTrack(trackId: string | null) {
    return this.tracks.find((track) => track.id === trackId) ?? null;
  }

  private chooseSceneTrack(scene: MusicScene, randomNext: boolean) {
    const pool = this.tracksForScene(scene);
    if (!pool.length) return null;
    if (!this.state.randomModeByScene[scene]) {
      return this.findTrack(this.state.selectedTrackIds[scene]) ?? pool[0];
    }
    if (!randomNext && this.state.currentTrack?.scene === scene) return this.state.currentTrack;
    const currentId = this.state.currentTrack?.scene === scene
      ? this.state.currentTrackId
      : null;
    return pickRandomTrack(pool, currentId, this.random);
  }

  private async playSceneMusic(scene: MusicScene, randomNext: boolean) {
    const track = this.chooseSceneTrack(scene, randomNext);
    this.clearPreviewTimer();
    this.update({
      previewingScene: null,
      currentTrackId: track?.id ?? null,
      currentTrack: track,
      activeOutcome: null,
      previewingOutcome: false,
    });
    if (!track) return false;
    return this.startTrack(track, null);
  }

  private async startTrack(track: MusicTrack, previewingScene: MusicScene | null) {
    if (!this.state.musicEnabled || this.state.isPaused || this.destroyed) return false;
    if (!this.mounted) this.mount();
    const audio = this.music;
    if (!audio) return false;
    const request = ++this.playRequest;
    this.clearPreviewTimer();
    safelyPause(audio);
    audio.loop = previewingScene === null && !this.state.randomModeByScene[track.scene];
    audio.src = track.src;
    this.applyMusicVolume();
    this.update({
      currentTrackId: track.id,
      currentTrack: track,
      activeOutcome: null,
      previewingOutcome: false,
      previewingScene,
      isPlaying: false,
      blocked: false,
    });
    try {
      await Promise.resolve(audio.play());
      if (request !== this.playRequest || this.destroyed) return false;
      this.update({ isPlaying: true, blocked: false });
      if (previewingScene !== null) this.schedulePreviewEnd();
      return true;
    } catch (error) {
      if (request !== this.playRequest || this.destroyed) return false;
      this.update({ isPlaying: false, blocked: isPlaybackBlocked(error) });
      return false;
    }
  }

  private async startOutcomeTrack(track: OutcomeMusicTrack, previewing: boolean) {
    if (!this.state.musicEnabled || this.state.isPaused || this.destroyed) return false;
    if (!this.mounted) this.mount();
    const audio = this.music;
    if (!audio) return false;
    const request = ++this.playRequest;
    this.clearPreviewTimer();
    safelyPause(audio);
    audio.loop = false;
    audio.src = track.src;
    this.update({
      currentTrackId: track.id,
      currentTrack: null,
      activeOutcome: track.outcome,
      previewingOutcome: previewing,
      previewingScene: null,
      isPlaying: false,
      blocked: false,
    });
    this.applyMusicVolume();
    try {
      await Promise.resolve(audio.play());
      if (request !== this.playRequest || this.destroyed) return false;
      this.update({ isPlaying: true, blocked: false });
      return true;
    } catch (error) {
      if (request !== this.playRequest || this.destroyed) return false;
      this.update({ isPlaying: false, blocked: isPlaybackBlocked(error) });
      return false;
    }
  }

  private schedulePreviewEnd() {
    this.clearPreviewTimer();
    this.previewTimer = this.schedule(() => {
      this.previewTimer = null;
      this.finishPreview();
    }, MUSIC_PREVIEW_DURATION_MS);
  }

  private finishPreview() {
    if (this.destroyed || this.state.previewingScene === null) return;
    this.update({ previewingScene: null });
    if (
      this.state.musicEnabled
      && !this.state.isPaused
      && this.unlocked
    ) {
      void this.playSceneMusic(this.state.musicScene, false);
    }
  }

  private clearPreviewTimer() {
    if (this.previewTimer === null) return;
    this.cancelScheduled(this.previewTimer);
    this.previewTimer = null;
  }

  private applyMusicVolume() {
    if (!this.music) return;
    const trackGain = this.state.activeOutcome === null ? 1 : OUTCOME_MUSIC_GAIN;
    this.music.volume = clampVolume(MUSIC_OUTPUT_GAIN * trackGain * this.state.musicVolume);
  }

  private stopAllSfx() {
    for (const active of [...this.activeSfx.values()]) active.cleanup();
  }

  private persist() {
    if (!this.storage) return;
    const value: StoredPreferences = {
      musicEnabled: this.state.musicEnabled,
      sfxEnabled: this.state.sfxEnabled,
      musicVolume: this.state.musicVolume,
      sfxVolume: this.state.sfxVolume,
      randomModeByScene: this.state.randomModeByScene,
      selectedTrackIds: this.state.selectedTrackIds,
    };
    try {
      this.storage.setItem(GAME_AUDIO_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Private browsing and exhausted storage must not interrupt the game.
    }
  }

  private update(patch: Partial<GameAudioState>) {
    this.state = Object.freeze({ ...this.state, ...patch });
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private handleMusicEnded = () => {
    this.update({ isPlaying: false });
    if (!this.state.musicEnabled || this.state.isPaused || this.destroyed) return;
    if (this.state.activeOutcome !== null) {
      if (this.state.previewingOutcome) {
        void this.playSceneMusic(this.state.musicScene, false);
      }
      return;
    }
    if (this.state.previewingScene !== null) {
      this.finishPreview();
      return;
    }
    if (this.state.randomModeByScene[this.state.musicScene]) {
      void this.playSceneMusic(this.state.musicScene, true);
    }
  };

  private handleMusicPlay = () => {
    if (!this.destroyed) this.update({ isPlaying: true, blocked: false });
  };

  private handleMusicPause = () => {
    if (!this.destroyed && this.state.isPlaying) this.update({ isPlaying: false });
  };

  private handleMusicError = () => {
    if (!this.destroyed) this.update({ isPlaying: false });
  };
}

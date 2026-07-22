import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_MUSIC_TRACK_IDS,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  GAME_AUDIO_STORAGE_KEY,
  GameAudioController,
  MUSIC_OUTPUT_GAIN,
  MUSIC_PREVIEW_DURATION_MS,
  MUSIC_TRACKS,
  SFX_OUTPUT_GAINS,
  SFX_SOURCES,
  pickRandomTrack,
} from "../app/game-audio.ts";

class FakeAudio {
  constructor(src = "") {
    this.src = src;
    this.loop = false;
    this.preload = "";
    this.volume = 1;
    this.currentTime = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    this.loadCount = 0;
    this.listeners = new Map();
    this.nextPlayError = null;
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name, listener) {
    this.listeners.get(name)?.delete(listener);
  }

  emit(name) {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }

  play() {
    this.playCount += 1;
    if (this.nextPlayError) {
      const error = this.nextPlayError;
      this.nextPlayError = null;
      return Promise.reject(error);
    }
    this.emit("play");
    return Promise.resolve();
  }

  pause() {
    this.pauseCount += 1;
    this.emit("pause");
  }

  removeAttribute(name) {
    if (name === "src") this.src = "";
  }

  load() {
    this.loadCount += 1;
  }
}

function createHarness({ stored = null, randomValues = [0], initialNow = 1_000 } = {}) {
  const audios = [];
  const values = [...randomValues];
  const storageValues = new Map();
  const scheduled = new Map();
  let now = initialNow;
  let nextTimerId = 1;
  if (stored !== null) storageValues.set(GAME_AUDIO_STORAGE_KEY, JSON.stringify(stored));
  const storage = {
    getItem(key) { return storageValues.get(key) ?? null; },
    setItem(key, value) { storageValues.set(key, value); },
  };
  const controller = new GameAudioController({
    storage,
    random: () => values.shift() ?? 0,
    now: () => now,
    schedule: (callback, delayMs) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      scheduled.set(timerId, { callback, dueAt: now + delayMs });
      return timerId;
    },
    cancelScheduled: (timerId) => scheduled.delete(timerId),
    audioFactory: (src) => {
      const audio = new FakeAudio(src);
      audios.push(audio);
      return audio;
    },
  });
  const advanceTime = async (durationMs) => {
    now += durationMs;
    const due = [...scheduled.entries()]
      .filter(([, timer]) => timer.dueAt <= now)
      .sort((left, right) => left[1].dueAt - right[1].dueAt);
    for (const [timerId, timer] of due) {
      scheduled.delete(timerId);
      timer.callback();
    }
    await flushTasks();
  };
  return { advanceTime, audios, controller, scheduled, storageValues };
}

function flushTasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function readWavDuration(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataSize = buffer.readUInt32LE(40);
  return dataSize / (sampleRate * channels * (bitsPerSample / 8));
}

test("the four packaged tracks are split into cheerful lobby and stronger battle pools", async () => {
  assert.equal(MUSIC_TRACKS.length, 4);
  assert.equal(new Set(MUSIC_TRACKS.map((track) => track.id)).size, 4);
  assert.deepEqual(
    MUSIC_TRACKS.filter((track) => track.scene === "lobby").map((track) => track.id),
    ["wintery-loop", "winter-wind", "happy-synths"],
  );
  assert.deepEqual(
    MUSIC_TRACKS.filter((track) => track.scene === "battle").map((track) => track.id),
    ["black-diamond"],
  );
  assert.deepEqual(DEFAULT_MUSIC_TRACK_IDS, {
    lobby: "happy-synths",
    battle: "black-diamond",
  });
  assert.ok(MUSIC_TRACKS.every((track) => track.artist && track.sourceUrl && track.license === "CC0 1.0"));
  assert.ok(MUSIC_TRACKS.every((track) => track.sourceUrl.startsWith("https://opengameart.org/content/")));
  const packagedFiles = (await readdir(new URL("../public/audio/music/", import.meta.url)))
    .filter((fileName) => fileName.endsWith(".mp3"))
    .sort();
  const configuredFiles = MUSIC_TRACKS
    .map((track) => track.src.split("/").at(-1))
    .sort();
  assert.deepEqual(packagedFiles, configuredFiles);
});

test("a stored selection for a removed track falls back to the current battle default", () => {
  const { controller } = createHarness({
    stored: {
      selectedTrackIds: { lobby: "happy-synths", battle: "shine-blitz" },
    },
  });
  controller.mount();
  assert.equal(controller.getSnapshot().selectedTrackIds.battle, "black-diamond");
  controller.destroy();
});

test("random selection avoids the current track whenever another track exists", () => {
  const current = MUSIC_TRACKS[0];
  assert.equal(pickRandomTrack(MUSIC_TRACKS, current.id, () => 0)?.id, MUSIC_TRACKS[1].id);
  assert.notEqual(pickRandomTrack(MUSIC_TRACKS, current.id, () => 0.999999)?.id, current.id);
  assert.equal(pickRandomTrack([current], current.id, () => 0.5)?.id, current.id);
  assert.equal(pickRandomTrack([], null, () => 0), null);
});

test("lobby and battle route to different defaults after the first user gesture", async () => {
  const { audios, controller } = createHarness();
  controller.mount();
  const music = audios[0];
  assert.equal(controller.getSnapshot().currentTrackId, "happy-synths");
  assert.equal(controller.getSnapshot().musicScene, "lobby");
  assert.equal(music.volume, MUSIC_OUTPUT_GAIN * DEFAULT_MUSIC_VOLUME);

  assert.equal(await controller.notifyUserInteraction(), true);
  assert.equal(music.src, "/audio/music/happy-synths.mp3");
  assert.equal(music.loop, true);

  assert.equal(await controller.setMusicScene("battle"), true);
  assert.equal(music.src, "/audio/music/black-diamond.mp3");
  assert.equal(controller.getSnapshot().musicScene, "battle");
  assert.equal(music.loop, true);

  assert.equal(await controller.setMusicScene("lobby"), true);
  assert.equal(music.src, "/audio/music/happy-synths.mp3");
  controller.destroy();
});

test("shuffle advances only inside the active scene and avoids immediate repetition", async () => {
  const { audios, controller } = createHarness({ randomValues: [0, 0] });
  controller.mount();
  assert.equal(await controller.playRandom("lobby"), true);
  const music = audios[0];
  assert.equal(music.src, "/audio/music/wintery-loop.mp3");
  assert.equal(music.loop, false);

  music.emit("ended");
  await flushTasks();
  assert.equal(music.src, "/audio/music/winter-wind.mp3");
  assert.equal(controller.getSnapshot().currentTrack?.scene, "lobby");
  assert.equal(music.playCount, 2);
  controller.destroy();
});

test("scene choices persist separately and another-scene selection previews for eight seconds", async () => {
  const { advanceTime, audios, controller, scheduled, storageValues } = createHarness();
  controller.mount();
  await controller.notifyUserInteraction();

  assert.equal(await controller.selectTrack("black-diamond"), true);
  assert.equal(controller.getSnapshot().musicScene, "lobby");
  assert.equal(controller.getSnapshot().previewingScene, "battle");
  assert.equal(controller.getSnapshot().selectedTrackIds.battle, "black-diamond");
  assert.equal(audios[0].loop, false);
  assert.equal(scheduled.size, 1);

  const stored = JSON.parse(storageValues.get(GAME_AUDIO_STORAGE_KEY));
  assert.equal(stored.selectedTrackIds.lobby, "happy-synths");
  assert.equal(stored.selectedTrackIds.battle, "black-diamond");

  await advanceTime(MUSIC_PREVIEW_DURATION_MS);
  assert.equal(controller.getSnapshot().previewingScene, null);
  assert.equal(controller.getSnapshot().currentTrackId, "happy-synths");
  assert.equal(audios[0].src, "/audio/music/happy-synths.mp3");

  await controller.setMusicScene("battle");
  assert.equal(audios[0].src, "/audio/music/black-diamond.mp3");
  controller.destroy();
});

test("music can pause across scene changes, resume, change both volumes, and turn off", async () => {
  const { audios, controller, storageValues } = createHarness();
  controller.mount();
  await controller.notifyUserInteraction();
  const music = audios[0];

  assert.equal(controller.pauseMusic(), true);
  assert.equal(controller.getSnapshot().isPaused, true);
  const playCountWhilePaused = music.playCount;
  assert.equal(await controller.setMusicScene("battle"), false);
  assert.equal(music.playCount, playCountWhilePaused);
  assert.equal(controller.getSnapshot().currentTrackId, "black-diamond");

  assert.equal(controller.setMusicVolume(0.75), 0.75);
  assert.equal(music.volume, MUSIC_OUTPUT_GAIN * 0.75);
  assert.equal(controller.setSfxVolume(0.4), 0.4);
  assert.equal(await controller.resumeMusic(), true);
  assert.equal(controller.getSnapshot().isPaused, false);
  assert.equal(music.src, "/audio/music/black-diamond.mp3");

  assert.equal(await controller.toggleMusic(false), false);
  assert.equal(controller.getSnapshot().musicEnabled, false);
  assert.equal(controller.getSnapshot().isPlaying, false);
  assert.equal(controller.toggleSfx(false), false);
  assert.equal(await controller.playSfx("pack"), false);

  const stored = JSON.parse(storageValues.get(GAME_AUDIO_STORAGE_KEY));
  assert.equal(stored.musicVolume, 0.75);
  assert.equal(stored.sfxVolume, 0.4);
  assert.equal(stored.musicEnabled, false);
  assert.equal(stored.sfxEnabled, false);
  controller.destroy();
});

test("a rejected autoplay exposes blocked state and a later gesture can recover", async () => {
  const { audios, controller } = createHarness();
  controller.mount();
  const blocked = new Error("play() requires a user gesture");
  blocked.name = "NotAllowedError";
  audios[0].nextPlayError = blocked;
  assert.equal(await controller.notifyUserInteraction(), false);
  assert.equal(controller.getSnapshot().blocked, true);
  assert.equal(controller.getSnapshot().isPlaying, false);

  assert.equal(await controller.notifyUserInteraction(), true);
  assert.equal(controller.getSnapshot().blocked, false);
  assert.equal(controller.getSnapshot().isPlaying, true);
  controller.destroy();
});

test("short effects overlap across kinds but repeated pack sounds are throttled and volume-scaled", async () => {
  const { advanceTime, audios, controller } = createHarness();
  controller.mount();
  assert.deepEqual(await Promise.all([
    controller.playSfx("pack"),
    controller.playSfx("pack"),
    controller.playSfx("hit"),
    controller.playSfx("down"),
  ]), [true, false, true, true]);
  const effects = audios.slice(1);
  assert.deepEqual(effects.map((audio) => audio.src), [
    SFX_SOURCES.pack,
    SFX_SOURCES.hit,
    SFX_SOURCES.down,
  ]);
  assert.equal(effects[0].volume, SFX_OUTPUT_GAINS.pack * DEFAULT_SFX_VOLUME);
  assert.equal(effects[1].volume, SFX_OUTPUT_GAINS.hit * DEFAULT_SFX_VOLUME);

  await advanceTime(100);
  assert.equal(await controller.playSfx("pack"), true);
  await advanceTime(100);
  assert.equal(await controller.playSfx("pack"), false);
  effects[0].emit("ended");
  assert.equal(await controller.playSfx("pack"), true);

  controller.setSfxVolume(0.8);
  const activePack = audios.at(-1);
  assert.equal(activePack.volume, SFX_OUTPUT_GAINS.pack * 0.8);
  controller.toggleSfx(false);
  assert.ok(audios.slice(1).every((audio) => audio.src === ""));
  controller.destroy();
});

test("generated pack and hit WAV files stay at or below 0.2 seconds", async () => {
  const pack = await readFile(new URL("../public/audio/sfx/snowball-pack.wav", import.meta.url));
  const hit = await readFile(new URL("../public/audio/sfx/snowball-hit.wav", import.meta.url));
  const down = await readFile(new URL("../public/audio/sfx/player-down.wav", import.meta.url));
  assert.ok(readWavDuration(pack) > 0.12 && readWavDuration(pack) <= 0.2);
  assert.ok(readWavDuration(hit) > 0.12 && readWavDuration(hit) <= 0.2);
  assert.ok(readWavDuration(down) > 0.5);
});

test("controller is SSR-safe and releases listeners and media on cleanup", async () => {
  const ssr = new GameAudioController({ storage: null, audioFactory: () => null });
  ssr.mount();
  assert.equal(ssr.getSnapshot().ready, true);
  assert.equal(await ssr.notifyUserInteraction(), false);
  ssr.destroy();

  const { audios, controller } = createHarness();
  controller.mount();
  await controller.notifyUserInteraction();
  const music = audios[0];
  controller.destroy();
  assert.equal(music.src, "");
  assert.equal(music.listeners.get("ended")?.size, 0);
  assert.ok(music.pauseCount >= 1);

  // React Strict Mode can recreate the resources after its development cleanup pass.
  controller.mount();
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(audios.length, 2);
  controller.destroy();
});

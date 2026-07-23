import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  OUTCOME_MUSIC_TRACKS,
  SFX_OUTPUT_GAINS,
  SFX_SOURCES,
  pickRandomTrack,
  resolvePersonalOutcome,
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

function readMp3Duration(buffer) {
  const mpeg1Layer3Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const mpeg2Layer3Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const baseSampleRates = [44_100, 48_000, 32_000];
  let offset = 0;
  let duration = 0;
  let frameCount = 0;

  if (buffer.toString("ascii", 0, 3) === "ID3" && buffer.length >= 10) {
    const tagSize = ((buffer[6] & 0x7f) << 21)
      | ((buffer[7] & 0x7f) << 14)
      | ((buffer[8] & 0x7f) << 7)
      | (buffer[9] & 0x7f);
    offset = 10 + tagSize;
  }

  while (offset + 4 <= buffer.length) {
    const header = buffer.readUInt32BE(offset);
    if (((header & 0xffe00000) >>> 0) !== 0xffe00000) {
      offset += 1;
      continue;
    }
    const versionBits = (header >>> 19) & 0x3;
    const layerBits = (header >>> 17) & 0x3;
    const bitrateIndex = (header >>> 12) & 0xf;
    const sampleRateIndex = (header >>> 10) & 0x3;
    const padding = (header >>> 9) & 0x1;
    if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset += 1;
      continue;
    }
    const isMpeg1 = versionBits === 3;
    const sampleRateDivisor = isMpeg1 ? 1 : versionBits === 2 ? 2 : 4;
    const sampleRate = baseSampleRates[sampleRateIndex] / sampleRateDivisor;
    const bitrate = (isMpeg1 ? mpeg1Layer3Bitrates : mpeg2Layer3Bitrates)[bitrateIndex];
    const frameLength = Math.floor((isMpeg1 ? 144_000 : 72_000) * bitrate / sampleRate) + padding;
    if (frameLength <= 4 || offset + frameLength > buffer.length + 4) {
      offset += 1;
      continue;
    }
    duration += (isMpeg1 ? 1_152 : 576) / sampleRate;
    frameCount += 1;
    offset += frameLength;
  }

  assert.ok(frameCount > 0, "expected at least one valid MP3 frame");
  return duration;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
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
    .filter((fileName) => /\.(mp3|wav)$/u.test(fileName))
    .sort();
  const configuredFiles = [...MUSIC_TRACKS, ...Object.values(OUTCOME_MUSIC_TRACKS)]
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

test("personal match results resolve to victory or defeat from the current player's team", () => {
  assert.equal(resolvePersonalOutcome("pine", "pine"), "victory");
  assert.equal(resolvePersonalOutcome("berry", "pine"), "defeat");
  assert.equal(resolvePersonalOutcome(null, "pine"), null);
  assert.equal(resolvePersonalOutcome("pine", null), null);
});

test("user-provided Aigei victory and defeat cues are packaged with source records", async () => {
  assert.deepEqual(Object.keys(OUTCOME_MUSIC_TRACKS), ["victory", "defeat"]);
  assert.deepEqual(
    Object.values(OUTCOME_MUSIC_TRACKS).map((track) => track.src),
    ["/audio/music/aigei-game-victory.mp3", "/audio/music/aigei-game-defeat-1683890.mp3"],
  );
  assert.ok(Object.values(OUTCOME_MUSIC_TRACKS).every(
    (track) => track.artist.includes("Aigei.com")
      && track.sourceUrl.startsWith("https://www.aigei.com/")
      && track.license.includes("See source terms"),
  ));
  const victory = await readFile(new URL("../public/audio/music/aigei-game-victory.mp3", import.meta.url));
  const defeat = await readFile(new URL("../public/audio/music/aigei-game-defeat-1683890.mp3", import.meta.url));
  assert.ok(readMp3Duration(victory) >= 5 && readMp3Duration(victory) <= 7);
  assert.ok(readMp3Duration(defeat) >= 1 && readMp3Duration(defeat) <= 3);
  assert.equal(sha256(victory), "AFD9105E37B20539D615F9CD47BD615F007BCB55BE2AC404A42DA972989620AA");
  assert.equal(sha256(defeat), "3FA38C733714BAD345989CA2BE27C96578EBEF18EA75CD2FCAEB314585DD411C");
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

test("match results interrupt battle music once while manual outcome previews return to the scene", async () => {
  const { audios, controller } = createHarness();
  controller.mount();
  await controller.notifyUserInteraction();
  await controller.setMusicScene("battle");
  const music = audios[0];

  assert.equal(await controller.playOutcomeMusic("victory"), true);
  assert.equal(music.src, OUTCOME_MUSIC_TRACKS.victory.src);
  assert.equal(music.loop, false);
  assert.equal(controller.getSnapshot().activeOutcome, "victory");
  assert.equal(controller.getSnapshot().previewingOutcome, false);
  const victoryPlayCount = music.playCount;
  assert.equal(await controller.playOutcomeMusic("victory"), true);
  assert.equal(music.playCount, victoryPlayCount);

  music.emit("ended");
  assert.equal(controller.getSnapshot().isPlaying, false);
  assert.equal(controller.getSnapshot().activeOutcome, "victory");

  assert.equal(await controller.previewOutcomeMusic("defeat"), true);
  assert.equal(music.src, OUTCOME_MUSIC_TRACKS.defeat.src);
  assert.equal(controller.getSnapshot().activeOutcome, "defeat");
  assert.equal(controller.getSnapshot().previewingOutcome, true);
  music.emit("ended");
  await flushTasks();
  assert.equal(controller.getSnapshot().activeOutcome, null);
  assert.equal(controller.getSnapshot().previewingOutcome, false);
  assert.equal(controller.getSnapshot().currentTrackId, "black-diamond");
  assert.equal(music.src, "/audio/music/black-diamond.mp3");
  assert.equal(controller.getSnapshot().isPlaying, true);
  controller.destroy();
});

test("outcome cues obey the music switch, pause control, and master volume", async () => {
  const { audios, controller } = createHarness();
  controller.mount();
  await controller.notifyUserInteraction();
  const music = audios[0];
  controller.setMusicVolume(0.35);
  await controller.toggleMusic(false);
  const playCountWhileOff = music.playCount;

  assert.equal(await controller.playOutcomeMusic("defeat"), false);
  assert.equal(controller.getSnapshot().activeOutcome, "defeat");
  assert.equal(music.playCount, playCountWhileOff);
  assert.equal(await controller.toggleMusic(true), true);
  assert.equal(music.src, OUTCOME_MUSIC_TRACKS.defeat.src);
  assert.equal(music.volume, MUSIC_OUTPUT_GAIN * 0.35);

  assert.equal(controller.pauseMusic(), true);
  assert.equal(controller.getSnapshot().isPaused, true);
  assert.equal(await controller.resumeMusic(), true);
  assert.equal(controller.getSnapshot().activeOutcome, "defeat");
  assert.equal(controller.getSnapshot().isPlaying, true);
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

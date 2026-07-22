"use client";

import { useEffect, useId, useState } from "react";
import type { MusicScene } from "./game-audio";
import { useLanguage } from "./LanguageContext";
import type { useGameAudio } from "./useGameAudio";

export type AudioControlsProps = {
  audio: ReturnType<typeof useGameAudio>;
};

const SCENES: readonly MusicScene[] = ["lobby", "battle"];

export function AudioControls({ audio }: AudioControlsProps) {
  const { text } = useLanguage();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const musicVolumeId = `${panelId}-music-volume`;
  const sfxVolumeId = `${panelId}-sfx-volume`;
  const sceneName = (scene: MusicScene) => scene === "lobby"
    ? text("大厅音乐", "Lobby music")
    : text("战斗音乐", "Battle music");
  const currentTitle = audio.currentTrack?.title ?? sceneName(audio.musicScene);
  const currentArtist = audio.currentTrack?.artist ?? text("等待第一次播放", "Waiting for first play");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const playbackStatus = !audio.ready
    ? text("音频准备中", "Preparing audio")
    : !audio.musicEnabled
      ? text("音乐已关闭", "Music off")
      : audio.blocked
        ? text("点按继续播放", "Tap to resume")
        : audio.isPaused
          ? text("音乐已暂停", "Music paused")
          : audio.isPlaying
            ? audio.previewingScene
              ? text(`正在试听${sceneName(audio.previewingScene)}`, `Previewing ${sceneName(audio.previewingScene)}`)
              : text(`${sceneName(audio.musicScene)}播放中`, `${sceneName(audio.musicScene)} playing`)
            : text(`${sceneName(audio.musicScene)}待播放`, `${sceneName(audio.musicScene)} ready`);

  const musicVolumePercent = Math.round(audio.musicVolume * 100);
  const sfxVolumePercent = Math.round(audio.sfxVolume * 100);

  return (
    <aside
      className={`audio-controls${open ? " is-open" : ""}${audio.blocked ? " is-blocked" : ""}`}
      data-game-audio-control
      aria-label={text("游戏声音", "Game audio")}
    >
      <button
        type="button"
        className="audio-controls__trigger"
        data-game-audio-control
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="audio-controls__note" aria-hidden="true">
          {audio.musicEnabled ? audio.isPaused ? "Ⅱ" : "♫" : "♪"}
        </span>
        <span className="audio-controls__trigger-copy">
          <strong>{currentTitle}</strong>
          <small>{playbackStatus}</small>
        </span>
        <span className="audio-controls__chevron" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <section
          id={panelId}
          className="audio-controls__panel"
          data-game-audio-control
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          <header className="audio-controls__header" data-game-audio-control>
            <div className="audio-controls__heading" data-game-audio-control>
              <span>{text(`当前场景 · ${sceneName(audio.musicScene)}`, `Current scene · ${sceneName(audio.musicScene)}`)}</span>
              <h2 id={titleId}>{currentTitle}</h2>
              <p>{currentArtist}</p>
            </div>
            <button
              type="button"
              className="audio-controls__close"
              data-game-audio-control
              aria-label={text("关闭声音面板", "Close audio panel")}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          {audio.blocked ? (
            <div className="audio-controls__blocked" data-game-audio-control role="status">
              <p>{text("浏览器暂停了自动播放，点一下即可继续。", "Your browser paused autoplay. Tap once to continue.")}</p>
              <button
                type="button"
                data-game-audio-control
                onClick={() => {
                  audio.clearBlocked();
                  void audio.resumeMusic();
                }}
              >
                {text("继续播放", "Resume")}
              </button>
            </div>
          ) : null}

          <div className="audio-controls__transport" data-game-audio-control>
            <button
              type="button"
              className={audio.isPlaying ? "is-active" : ""}
              data-game-audio-control
              aria-pressed={audio.isPlaying}
              onClick={() => void audio.togglePlayback()}
            >
              <span aria-hidden="true">{audio.isPlaying ? "Ⅱ" : "▶"}</span>
              {audio.isPlaying ? text("暂停音乐", "Pause") : text("播放音乐", "Play")}
            </button>
            <button
              type="button"
              data-game-audio-control
              onClick={() => void audio.playNext()}
            >
              <span aria-hidden="true">▷|</span>
              {text("下一首", "Next")}
            </button>
          </div>

          <div className="audio-controls__mixers" data-game-audio-control>
            <label className="audio-controls__volume" htmlFor={musicVolumeId} data-game-audio-control>
              <span>
                <b>{text("音乐音量", "Music volume")}</b>
                <output htmlFor={musicVolumeId}>{musicVolumePercent}%</output>
              </span>
              <input
                id={musicVolumeId}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audio.musicVolume}
                data-game-audio-control
                aria-label={text("调整音乐音量", "Adjust music volume")}
                onInput={(event) => audio.setMusicVolume(Number(event.currentTarget.value))}
              />
            </label>
            <label className="audio-controls__volume" htmlFor={sfxVolumeId} data-game-audio-control>
              <span>
                <b>{text("音效音量", "Sound FX volume")}</b>
                <output htmlFor={sfxVolumeId}>{sfxVolumePercent}%</output>
              </span>
              <input
                id={sfxVolumeId}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audio.sfxVolume}
                data-game-audio-control
                aria-label={text("调整音效音量", "Adjust sound FX volume")}
                onInput={(event) => audio.setSfxVolume(Number(event.currentTarget.value))}
              />
            </label>
          </div>

          <p className="audio-controls__preview-note" data-game-audio-control>
            {text(
              "大厅与战斗分别选曲；试听另一场景时，8 秒后会回到当前场景音乐。",
              "Lobby and battle choices are separate. Other-scene previews return after 8 seconds.",
            )}
          </p>

          <div className="audio-controls__scenes" data-game-audio-control>
            {SCENES.map((scene) => {
              const isCurrentScene = scene === audio.musicScene;
              const sceneTracks = audio.tracks.filter((track) => track.scene === scene);
              return (
                <section
                  key={scene}
                  className={`audio-controls__scene${isCurrentScene ? " is-current" : ""}`}
                  data-game-audio-control
                  aria-label={sceneName(scene)}
                >
                  <header className="audio-controls__scene-header" data-game-audio-control>
                    <span className="audio-controls__scene-title">
                      <b>{scene === "lobby" ? "☃" : "⚔"}</b>
                      <span>
                        <strong>{sceneName(scene)}</strong>
                        <small>
                          {isCurrentScene
                            ? text("当前场景", "Current scene")
                            : text("提前选择并试听", "Choose and preview")}
                        </small>
                      </span>
                    </span>
                    <button
                      type="button"
                      className={audio.randomModeByScene[scene] ? "is-active" : ""}
                      data-game-audio-control
                      aria-pressed={audio.randomModeByScene[scene]}
                      onClick={() => void audio.playRandom(scene)}
                    >
                      <span aria-hidden="true">⤨</span>
                      {text("随机", "Shuffle")}
                    </button>
                  </header>

                  <ul className="audio-controls__tracks" data-game-audio-control>
                    {sceneTracks.map((track, index) => {
                      const selected = track.id === audio.selectedTrackIds[scene];
                      const playing = track.id === audio.currentTrackId
                        && audio.isPlaying
                        && audio.musicEnabled;
                      const previewing = playing && audio.previewingScene === scene;
                      return (
                        <li key={track.id} data-game-audio-control>
                          <button
                            type="button"
                            className={selected ? "is-selected" : ""}
                            data-game-audio-control
                            aria-pressed={selected}
                            aria-label={`${text("选择并播放", "Select and play")} ${track.title} — ${track.artist}`}
                            onClick={() => void audio.selectTrack(track.id)}
                          >
                            <span className="audio-controls__track-number" aria-hidden="true">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="audio-controls__track-copy">
                              <strong>{track.title}</strong>
                              <small>{track.artist}</small>
                            </span>
                            <span className="audio-controls__track-state">
                              {previewing
                                ? text("试听中", "Previewing")
                                : playing
                                  ? text("播放中", "Playing")
                                  : selected
                                    ? text("已选择", "Selected")
                                    : text("选择", "Choose")}
                            </span>
                          </button>
                          <a
                            className="audio-controls__track-source"
                            data-game-audio-control
                            href={track.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${track.title} — ${track.artist}: ${track.license}, OpenGameArt`}
                          >
                            {track.license} · OpenGameArt ↗
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="audio-controls__toggles" data-game-audio-control role="group" aria-label={text("声音开关", "Sound toggles")}>
            <button
              type="button"
              className={audio.musicEnabled ? "is-on" : ""}
              data-game-audio-control
              aria-pressed={audio.musicEnabled}
              onClick={() => void audio.toggleMusic()}
            >
              <span>{text("背景音乐", "Music")}</span>
              <b>{audio.musicEnabled ? text("关闭", "Turn off") : text("开启", "Turn on")}</b>
            </button>
            <button
              type="button"
              className={audio.sfxEnabled ? "is-on" : ""}
              data-game-audio-control
              aria-pressed={audio.sfxEnabled}
              onClick={() => audio.toggleSfx()}
            >
              <span>{text("游戏音效", "Sound FX")}</span>
              <b>{audio.sfxEnabled ? text("关闭", "Turn off") : text("开启", "Turn on")}</b>
            </button>
          </div>

          <p className="audio-controls__license" data-game-audio-control>
            {text(
              "4 首音乐均已标注作者、CC0 1.0 许可和 OpenGameArt 出处。",
              "All four tracks show their author, CC0 1.0 license, and OpenGameArt source.",
            )}
          </p>
        </section>
      ) : null}
    </aside>
  );
}

export default AudioControls;

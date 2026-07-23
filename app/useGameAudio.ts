"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  GameAudioController,
  type GameAudioControllerOptions,
  type GameOutcome,
  type GameSfx,
  type MusicScene,
} from "./game-audio";

export function useGameAudio(options: GameAudioControllerOptions = {}) {
  const [controller] = useState(() => new GameAudioController(options));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );

  useEffect(() => {
    controller.mount();
    return () => controller.destroy();
  }, [controller]);

  useEffect(() => {
    let handled = false;
    const removeListeners = () => {
      document.removeEventListener("pointerdown", handleInteraction, true);
      document.removeEventListener("keydown", handleInteraction, true);
    };
    const handleInteraction = (event: Event) => {
      if (handled) return;
      if (event instanceof KeyboardEvent && (event.repeat || event.ctrlKey || event.metaKey || event.altKey)) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-game-audio-control]")) return;
      handled = true;
      removeListeners();
      void controller.notifyUserInteraction();
    };
    document.addEventListener("pointerdown", handleInteraction, true);
    document.addEventListener("keydown", handleInteraction, true);
    return removeListeners;
  }, [controller]);

  const selectTrack = useCallback((trackId: string) => controller.selectTrack(trackId), [controller]);
  const tracksForScene = useCallback((scene: MusicScene) => controller.tracksForScene(scene), [controller]);
  const playRandom = useCallback((scene?: MusicScene) => controller.playRandom(scene), [controller]);
  const playNext = useCallback(() => controller.playNext(), [controller]);
  const setMusicScene = useCallback((scene: MusicScene) => controller.setMusicScene(scene), [controller]);
  const playOutcomeMusic = useCallback((outcome: GameOutcome) => controller.playOutcomeMusic(outcome), [controller]);
  const previewOutcomeMusic = useCallback((outcome: GameOutcome) => controller.previewOutcomeMusic(outcome), [controller]);
  const pauseMusic = useCallback(() => controller.pauseMusic(), [controller]);
  const resumeMusic = useCallback(() => controller.resumeMusic(), [controller]);
  const togglePlayback = useCallback(() => controller.togglePlayback(), [controller]);
  const toggleMusic = useCallback((force?: boolean) => controller.toggleMusic(force), [controller]);
  const toggleSfx = useCallback((force?: boolean) => controller.toggleSfx(force), [controller]);
  const setMusicVolume = useCallback((value: number) => controller.setMusicVolume(value), [controller]);
  const setSfxVolume = useCallback((value: number) => controller.setSfxVolume(value), [controller]);
  const playSfx = useCallback((kind: GameSfx) => controller.playSfx(kind), [controller]);
  const notifyUserInteraction = useCallback(() => controller.notifyUserInteraction(), [controller]);
  const clearBlocked = useCallback(() => controller.clearBlocked(), [controller]);

  return useMemo(() => ({
    ...state,
    tracks: controller.tracks,
    outcomeTracks: controller.outcomeTracks,
    tracksForScene,
    selectTrack,
    playRandom,
    playNext,
    setMusicScene,
    playOutcomeMusic,
    previewOutcomeMusic,
    pauseMusic,
    resumeMusic,
    togglePlayback,
    toggleMusic,
    toggleSfx,
    setMusicVolume,
    setSfxVolume,
    playSfx,
    notifyUserInteraction,
    clearBlocked,
  }), [
    clearBlocked,
    controller.outcomeTracks,
    controller.tracks,
    notifyUserInteraction,
    pauseMusic,
    playNext,
    playOutcomeMusic,
    playRandom,
    playSfx,
    previewOutcomeMusic,
    resumeMusic,
    selectTrack,
    setMusicScene,
    setMusicVolume,
    setSfxVolume,
    state,
    tracksForScene,
    toggleMusic,
    togglePlayback,
    toggleSfx,
  ]);
}

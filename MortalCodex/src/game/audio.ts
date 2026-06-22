import Phaser from 'phaser';

export type MortalCodexSfxCue = 'punch' | 'kick' | 'jump' | 'get-hit' | 'super' | 'ko';

const MUSIC_KEY = 'music-fight-loop';
const AUDIO_STORAGE_KEY = 'mortal-codex.audio-muted';
const RECENT_EVENT_LIMIT = 48;
const SFX_KEYS: Readonly<Record<MortalCodexSfxCue, string>> = {
  punch: 'sfx-punch',
  kick: 'sfx-kick',
  jump: 'sfx-jump',
  'get-hit': 'sfx-get-hit',
  super: 'sfx-super',
  ko: 'sfx-ko',
};
const SFX_VOLUMES: Readonly<Record<MortalCodexSfxCue, number>> = {
  punch: 0.62,
  kick: 0.68,
  jump: 0.42,
  'get-hit': 0.64,
  super: 0.72,
  ko: 0.72,
};

let music: Phaser.Sound.BaseSound | null = null;
let musicStarted = false;
let musicArmed = false;
const recentAudioEvents: string[] = [];
const recentDedupeKeys = new Set<string>();

export function installMortalCodexAudioUnlock(scene: Phaser.Scene): void {
  applyMortalCodexAudioMute(scene);

  const arm = (): void => {
    if (musicArmed) {
      return;
    }

    musicArmed = true;
    startMortalCodexMusic(scene);
  };

  scene.input.once('pointerdown', arm);
  scene.input.keyboard?.once('keydown', arm);
}

export function startMortalCodexMusic(scene: Phaser.Scene): void {
  if (isMortalCodexAudioMuted() || musicStarted || !scene.cache.audio.exists(MUSIC_KEY)) {
    return;
  }

  if (music) {
    if (!music.isPlaying) {
      music.play({ loop: true, volume: 0.22 });
    }
    musicStarted = true;
    return;
  }

  music = scene.sound.add(MUSIC_KEY, { loop: true, volume: 0.22 });
  music.play();
  musicStarted = true;
}

export function playMortalCodexSfx(scene: Phaser.Scene, cue: MortalCodexSfxCue, dedupeKey?: string): void {
  if (dedupeKey) {
    if (recentDedupeKeys.has(dedupeKey)) {
      return;
    }

    recentDedupeKeys.add(dedupeKey);
    if (recentDedupeKeys.size > RECENT_EVENT_LIMIT * 2) {
      recentDedupeKeys.clear();
    }
  }

  recordAudioEvent(cue);

  if (isMortalCodexAudioMuted()) {
    return;
  }

  const key = SFX_KEYS[cue];
  if (!scene.cache.audio.exists(key)) {
    return;
  }

  scene.sound.play(key, { volume: SFX_VOLUMES[cue] });
}

export function isMortalCodexAudioMuted(): boolean {
  try {
    return window.localStorage.getItem(AUDIO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMortalCodexAudioMuted(scene: Phaser.Scene, muted: boolean): void {
  try {
    window.localStorage.setItem(AUDIO_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage failures; the in-memory sound manager still gets updated.
  }

  applyMortalCodexAudioMute(scene);

  if (!muted) {
    startMortalCodexMusic(scene);
  }
}

export function applyMortalCodexAudioMute(scene: Phaser.Scene): void {
  scene.sound.mute = isMortalCodexAudioMuted();
}

export function getRecentMortalCodexAudioEvents(): readonly string[] {
  return [...recentAudioEvents];
}

function recordAudioEvent(cue: MortalCodexSfxCue): void {
  recentAudioEvents.push(cue);
  recentAudioEvents.splice(0, Math.max(0, recentAudioEvents.length - RECENT_EVENT_LIMIT));
}

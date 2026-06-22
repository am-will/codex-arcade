export type FlamethrowAudioCue = 'shot' | 'rim' | 'backboard' | 'made'

type AudioAssetKey = FlamethrowAudioCue | 'music'

const AUDIO_STORAGE_KEY = 'flamethrow.audio-muted'
const RECENT_EVENT_LIMIT = 48
const AUDIO_PATHS: Readonly<Record<AudioAssetKey, string>> = {
  music: '/assets/audio/music-flamethrow-loop.mp3',
  shot: '/assets/audio/sfx-shot.wav',
  rim: '/assets/audio/sfx-rim.wav',
  backboard: '/assets/audio/sfx-backboard.wav',
  made: '/assets/audio/sfx-made.wav',
}
const CUE_VOLUMES: Readonly<Record<FlamethrowAudioCue, number>> = {
  shot: 0.48,
  rim: 0.68,
  backboard: 0.7,
  made: 0.74,
}

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

export class AudioManager {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicSource: AudioBufferSourceNode | null = null
  private readonly buffers = new Map<AudioAssetKey, Promise<AudioBuffer>>()
  private readonly recentEvents: FlamethrowAudioCue[] = []
  private readonly testMode: boolean
  private muted = readStoredMute()

  constructor(testMode: boolean) {
    this.testMode = testMode
  }

  isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try {
      window.localStorage.setItem(AUDIO_STORAGE_KEY, muted ? '1' : '0')
    } catch {
      // Storage can fail in private contexts; runtime audio state still updates.
    }
    this.updateMasterGain()

    if (muted) {
      this.stopMusic()
    }
  }

  async unlock(): Promise<void> {
    const context = this.getContext()
    if (!context) return
    if (context.state === 'suspended') {
      await context.resume()
    }
  }

  startMusic(): void {
    if (this.muted || this.musicSource) return
    void this.startMusicAsync()
  }

  play(cue: FlamethrowAudioCue): void {
    this.record(cue)
    if (this.muted) return
    void this.playCue(cue)
  }

  getRecentEvents(): readonly FlamethrowAudioCue[] {
    return [...this.recentEvents]
  }

  dispose(): void {
    this.stopMusic()
    void this.context?.close()
    this.context = null
    this.masterGain = null
  }

  private async startMusicAsync(): Promise<void> {
    const context = this.getContext()
    if (!context || this.musicSource || this.muted) return

    try {
      const buffer = await this.getBuffer('music')
      if (!buffer || this.musicSource || this.muted) return

      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = buffer
      source.loop = true
      gain.gain.value = 0.24
      source.connect(gain).connect(this.masterGain ?? context.destination)
      source.start()
      source.onended = () => {
        if (this.musicSource === source) {
          this.musicSource = null
        }
      }
      this.musicSource = source
    } catch (error) {
      console.warn('Failed to start Flamethrow music.', error)
    }
  }

  private async playCue(cue: FlamethrowAudioCue): Promise<void> {
    const context = this.getContext()
    if (!context) return

    try {
      const buffer = await this.getBuffer(cue)
      if (!buffer || this.muted) return

      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = buffer
      gain.gain.value = CUE_VOLUMES[cue]
      source.connect(gain).connect(this.masterGain ?? context.destination)
      source.start()
    } catch (error) {
      console.warn(`Failed to play Flamethrow audio cue "${cue}".`, error)
    }
  }

  private async getBuffer(key: AudioAssetKey): Promise<AudioBuffer | null> {
    const context = this.getContext()
    if (!context) return null

    const existing = this.buffers.get(key)
    if (existing) return existing

    const request = fetch(AUDIO_PATHS[key])
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${AUDIO_PATHS[key]}`)
        }
        return response.arrayBuffer()
      })
      .then((data) => context.decodeAudioData(data))
    this.buffers.set(key, request)
    return request
  }

  private getContext(): AudioContext | null {
    if (this.context) return this.context

    const AudioContextCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (!AudioContextCtor) return null

    this.context = new AudioContextCtor()
    this.masterGain = this.context.createGain()
    this.masterGain.connect(this.context.destination)
    this.updateMasterGain()
    return this.context
  }

  private updateMasterGain(): void {
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 1
    }
  }

  private stopMusic(): void {
    if (!this.musicSource) return

    try {
      this.musicSource.stop()
    } catch {
      // The source may already be stopped.
    }
    this.musicSource = null
  }

  private record(cue: FlamethrowAudioCue): void {
    if (!this.testMode) return

    this.recentEvents.push(cue)
    this.recentEvents.splice(0, Math.max(0, this.recentEvents.length - RECENT_EVENT_LIMIT))
  }
}

function readStoredMute(): boolean {
  try {
    return window.localStorage.getItem(AUDIO_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

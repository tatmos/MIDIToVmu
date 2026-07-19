import type { MelodyPair } from './midiToVmu'

/** VMU風の矩形波で [Hz, ms] 配列をプレビュー再生する */
export class MelodyPreview {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private osc: OscillatorNode | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private playing = false
  private onEnd: (() => void) | null = null

  get isPlaying(): boolean {
    return this.playing
  }

  async play(pairs: MelodyPair[], onEnd?: () => void): Promise<void> {
    this.stop()
    if (pairs.length === 0) return

    this.onEnd = onEnd ?? null
    this.ctx = new AudioContext()
    await this.ctx.resume()

    this.gain = this.ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(this.ctx.destination)

    this.osc = this.ctx.createOscillator()
    this.osc.type = 'square'
    this.osc.frequency.value = 440
    this.osc.connect(this.gain)
    this.osc.start()

    this.playing = true
    void this.runSequence(pairs, 0)
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const wasPlaying = this.playing
    this.playing = false

    if (this.osc) {
      try {
        this.osc.stop()
      } catch {
        // already stopped
      }
      this.osc.disconnect()
      this.osc = null
    }
    if (this.gain) {
      this.gain.disconnect()
      this.gain = null
    }
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }

    const end = this.onEnd
    this.onEnd = null
    if (wasPlaying && end) end()
  }

  private runSequence(pairs: MelodyPair[], index: number): void {
    if (!this.playing || !this.osc || !this.gain || !this.ctx) return

    if (index >= pairs.length) {
      this.stop()
      return
    }

    const { freq, durationMs } = pairs[index]
    const now = this.ctx.currentTime
    const vol = 0.12

    if (freq > 0) {
      this.osc.frequency.setValueAtTime(freq, now)
      this.gain.gain.cancelScheduledValues(now)
      this.gain.gain.setValueAtTime(0, now)
      this.gain.gain.linearRampToValueAtTime(vol, now + 0.005)
      const releaseAt = Math.max(0.01, durationMs / 1000 - 0.01)
      this.gain.gain.setValueAtTime(vol, now + releaseAt)
      this.gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)
    } else {
      this.gain.gain.cancelScheduledValues(now)
      this.gain.gain.setValueAtTime(0, now)
    }

    this.timer = setTimeout(() => {
      this.timer = null
      this.runSequence(pairs, index + 1)
    }, Math.max(1, durationMs))
  }
}

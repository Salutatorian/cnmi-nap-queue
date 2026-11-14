import type { Announcement } from './types'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function playChime(context: AudioContext, volume: number): Promise<void> {
  if (volume <= 0) return wait(250)
  const now = context.currentTime
  const master = context.createGain()
  master.gain.value = 1
  master.connect(context.destination)
  ;[523.25, 784].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    gain.connect(master)
    const start = now + index * 0.18
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.35), start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)
    oscillator.start(start)
    oscillator.stop(start + 0.46)
  })
  return wait(700)
}

export class Announcer {
  private readonly queue: Announcement[] = []
  private playing = false
  private enabled = false
  private context: AudioContext | null = null
  volume = 0.8

  get isEnabled(): boolean {
    return this.enabled
  }

  async enable(): Promise<void> {
    this.context = this.context ?? new AudioContext()
    await this.context.resume()
    this.enabled = true
    void this.pump()
  }

  enqueue(item: Announcement): void {
    this.queue.push(item)
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (!this.enabled || this.playing) return
    const next = this.queue.shift()
    if (!next) return
    this.playing = true
    try {
      if (this.context) await playChime(this.context, this.volume)
    } finally {
      this.playing = false
      void this.pump()
    }
  }
}

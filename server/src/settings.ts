import { getDb } from './context.ts'
import { str } from './db.ts'

const DEFAULTS: Record<string, string> = {
  chime_volume: '0.8',
  highlight_seconds: '20',
  session_timeout_minutes: '30',
  demo_hint_enabled: '1',
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) return DEFAULTS[key] ?? ''
  return str(row, 'value')
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    .run(key, value)
}

export type PublicSettings = {
  chimeVolume: number
  highlightSeconds: number
}

export function publicSettings(): PublicSettings {
  return {
    chimeVolume: clamp(Number(getSetting('chime_volume')), 0, 1, 0.8),
    highlightSeconds: Math.round(clamp(Number(getSetting('highlight_seconds')), 5, 120, 20)),
  }
}

export function sessionTimeoutMinutes(): number {
  return Math.round(clamp(Number(getSetting('session_timeout_minutes')), 5, 240, 30))
}

export type OfficeSettings = PublicSettings & {
  sessionTimeoutMinutes: number
  demoHintEnabled: boolean
}

export function officeSettings(): OfficeSettings {
  return {
    ...publicSettings(),
    sessionTimeoutMinutes: sessionTimeoutMinutes(),
    demoHintEnabled: getSetting('demo_hint_enabled') !== '0',
  }
}

export function saveOfficeSettings(settings: OfficeSettings): void {
  setSetting('chime_volume', settings.chimeVolume.toFixed(2))
  setSetting('highlight_seconds', String(settings.highlightSeconds))
  setSetting('session_timeout_minutes', String(settings.sessionTimeoutMinutes))
  setSetting('demo_hint_enabled', settings.demoHintEnabled ? '1' : '0')
}

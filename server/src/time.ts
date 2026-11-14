import { HttpError } from './errors.ts'

const PRIMARY_ZONE = 'Pacific/Saipan'
const FALLBACK_ZONE = 'Pacific/Guam'
const OFFSET_MS = 10 * 60 * 60 * 1000

function supportedZone(): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: PRIMARY_ZONE }).format(new Date())
    return PRIMARY_ZONE
  } catch {
    return FALLBACK_ZONE
  }
}

export const TIME_ZONE = supportedZone()

const partFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function nowIso(): string {
  return new Date().toISOString()
}

function parts(date: Date): { year: string; month: string; day: string; hour: string; minute: string; second: string } {
  const map: Record<string, string> = {}
  for (const part of partFormatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  const hour = map.hour === '24' ? '00' : map.hour
  const year = map.year
  const month = map.month
  const day = map.day
  const minute = map.minute
  const second = map.second
  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error('Could not format a Saipan timestamp.')
  }
  return { year, month, day, hour, minute, second }
}

export function formatStamp(iso: string): string {
  const value = parts(new Date(iso))
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`
}

export function localDate(iso = nowIso()): string {
  const value = parts(new Date(iso))
  return `${value.year}-${value.month}-${value.day}`
}

export function fileStamp(iso = nowIso()): string {
  const value = parts(new Date(iso))
  return `${value.year}-${value.month}-${value.day}-${value.hour}${value.minute}${value.second}`
}

export function assertLocalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Choose a valid date.')
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) throw new HttpError(400, 'Choose a valid date.')
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new HttpError(400, 'Choose a valid date.')
  }
  return value
}

export function localDayUtcRange(local: string): { start: string; end: string } {
  const date = assertLocalDate(local)
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) throw new HttpError(400, 'Choose a valid date.')
  const start = new Date(Date.UTC(year, month - 1, day) - OFFSET_MS)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function todayAt(hour: number, minute: number, second = 0): string {
  const date = localDate()
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) throw new Error('Could not read the Saipan date.')
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - OFFSET_MS).toISOString()
}

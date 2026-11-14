function zone(): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Saipan' }).format(new Date())
    return 'Pacific/Saipan'
  } catch {
    return 'Pacific/Guam'
  }
}

export const TIME_ZONE = zone()

export function todayInputValue(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatWhenFull(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatClock(date = new Date(), withSeconds = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
  }).format(date)
}

import { HttpError } from './errors.ts'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export function assertWithinLimit(key: string, limit: number, windowMs: number, message: string): void {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  if (bucket.count >= limit) throw new HttpError(429, message)
  bucket.count += 1
}

const loginFailures = new Map<string, Bucket>()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LIMIT = 8

export function loginKey(ip: string, username: string): string {
  return `${ip}:${username.toLocaleLowerCase('en-US')}`
}

export function assertLoginAllowed(key: string): void {
  const now = Date.now()
  const bucket = loginFailures.get(key)
  if (!bucket || now > bucket.resetAt) return
  if (bucket.count >= LOGIN_LIMIT) {
    throw new HttpError(429, 'Too many sign-in attempts. Please wait a few minutes and try again.')
  }
}

export function recordLoginFailure(key: string): void {
  const now = Date.now()
  const bucket = loginFailures.get(key)
  if (!bucket || now > bucket.resetAt) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }
  bucket.count += 1
}

export function clearLoginFailures(key: string): void {
  loginFailures.delete(key)
}

export function clearRateLimits(): void {
  buckets.clear()
  loginFailures.clear()
}

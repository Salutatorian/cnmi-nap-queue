import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

export function randomNonce(): string {
  return randomBytes(9).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

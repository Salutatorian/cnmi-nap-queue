import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { HttpError } from './errors.ts'
import type { Role, StaffUser } from './types.ts'

export const SESSION_COOKIE = 'nap_session'

export function clientIp(req: Request): string {
  const address = req.ip || req.socket.remoteAddress || 'unknown'
  return address.replace(/^::ffff:/, '')
}

export function isLoopback(req: Request): boolean {
  const address = clientIp(req)
  return address === '127.0.0.1' || address === '::1' || address === 'localhost'
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

export function sessionCookieOptions(req: Request): {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  }
}

export function clearCookieOptions(req: Request): {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: string
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
  }
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next()
    return
  }
  const origin = req.get('origin')
  if (!origin) {
    next()
    return
  }
  const host = req.get('host')
  try {
    if (!host || new URL(origin).host !== host) {
      res.status(403).json({ error: 'Request blocked.' })
      return
    }
  } catch {
    res.status(403).json({ error: 'Request blocked.' })
    return
  }
  next()
}

export function route(fn: (req: Request, res: Response) => unknown): RequestHandler {
  return (req, res, next) => {
    try {
      Promise.resolve(fn(req, res)).catch(next)
    } catch (error) {
      next(error)
    }
  }
}

export function parseId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || !/^\d{1,12}$/.test(raw)) throw new HttpError(404, 'That record was not found.')
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, 'That record was not found.')
  return id
}

export function staffFrom(req: Request): StaffUser {
  if (!req.staff) throw new HttpError(401, 'Sign in required.')
  return req.staff
}

export function requireRoles(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      res.status(403).json({ error: 'You do not have permission for that action.' })
      return
    }
    next()
  }
}

import type { StaffUser } from './types.ts'

declare global {
  namespace Express {
    interface Request {
      staff?: StaffUser
      sessionCsrf?: string
    }
  }
}

export {}

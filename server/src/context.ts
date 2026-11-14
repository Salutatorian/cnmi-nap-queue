import type { Server } from 'socket.io'
import type { Config } from './config.ts'
import type { Db } from './db.ts'

export type AppContext = {
  db: Db
  config: Config
  io: Server | null
}

let current: AppContext | undefined

export function setContext(context: AppContext): void {
  current = context
}

export function getContext(): AppContext {
  if (!current) throw new Error('The application is not ready.')
  return current
}

export function getDb(): Db {
  return getContext().db
}

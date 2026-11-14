import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(serverRoot, '..')

export type Config = {
  port: number
  host: string
  projectRoot: string
  dataDir: string
  dbPath: string
  logDir: string
  backupDir: string
  clientDist: string
  httpsCert: string | undefined
  httpsKey: string | undefined
  trustProxy: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(projectRoot, 'data')
  const port = Number(env.PORT ?? 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a number from 1 to 65535.')
  }
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    projectRoot,
    dataDir,
    dbPath: path.join(dataDir, 'nap.sqlite'),
    logDir: path.join(dataDir, 'logs'),
    backupDir: path.join(dataDir, 'backups'),
    clientDist: path.join(projectRoot, 'client', 'dist'),
    httpsCert: env.HTTPS_CERT,
    httpsKey: env.HTTPS_KEY,
    trustProxy: env.TRUST_PROXY === '1',
  }
}

export function ensureDataDirs(config: Config): void {
  fs.mkdirSync(config.dataDir, { recursive: true })
  fs.mkdirSync(config.logDir, { recursive: true })
  fs.mkdirSync(config.backupDir, { recursive: true })
}

import fs from 'node:fs'
import path from 'node:path'
import { recordAudit } from './audit.ts'
import { getContext } from './context.ts'
import { fileStamp } from './time.ts'

const KEEP = 14
let running = false

function prune(directory: string): void {
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith('nap-') && name.endsWith('.sqlite'))
    .map((name) => {
      const full = path.join(directory, name)
      return { full, mtime: fs.statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  for (const file of files.slice(KEEP)) fs.rmSync(file.full, { force: true })
}

export async function backupDatabase(): Promise<string | undefined> {
  if (running) return undefined
  running = true
  try {
    const { db, config } = getContext()
    fs.mkdirSync(config.backupDir, { recursive: true })
    const dest = path.join(config.backupDir, `nap-${fileStamp()}.sqlite`)
    await db.backupTo(dest)
    prune(config.backupDir)
    recordAudit({ actorId: null, action: 'backup', targetType: 'database', detail: { file: path.basename(dest) } })
    return dest
  } catch (error) {
    console.error('Backup failed.', error)
    return undefined
  } finally {
    running = false
  }
}

export function startBackupSchedule(): void {
  const sixHours = 6 * 60 * 60 * 1000
  setInterval(() => {
    void backupDatabase()
  }, sixHours).unref()
}

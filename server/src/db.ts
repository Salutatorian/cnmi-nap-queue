import { backup, DatabaseSync, type SQLInputValue } from 'node:sqlite'

export type Row = Record<string, SQLInputValue | bigint | null>

function plain(value: unknown): Row | undefined {
  if (!value || typeof value !== 'object') return undefined
  return { ...(value as object) } as Row
}

export class Db {
  private readonly database: DatabaseSync

  constructor(filename: string) {
    this.database = new DatabaseSync(filename)
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec('PRAGMA journal_mode = WAL')
    this.database.exec('PRAGMA busy_timeout = 5000')
  }

  exec(sql: string): void {
    this.database.exec(sql)
  }

  prepare(sql: string) {
    const statement = this.database.prepare(sql)
    return {
      get: (...params: SQLInputValue[]): Row | undefined => plain(statement.get(...params)),
      all: (...params: SQLInputValue[]): Row[] => statement.all(...params).map((row) => plain(row)!),
      run: (...params: SQLInputValue[]): { changes: number; lastInsertRowid: number } => {
        const result = statement.run(...params)
        return {
          changes: Number(result.changes),
          lastInsertRowid: Number(result.lastInsertRowid),
        }
      },
    }
  }

  transaction<T>(fn: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      try {
        this.database.exec('ROLLBACK')
      } catch {
        // The original error is the one the caller needs.
      }
      throw error
    }
  }

  checkpoint(): void {
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }

  backupTo(filename: string): Promise<number> {
    return backup(this.database, filename)
  }

  close(): void {
    this.database.close()
  }
}

export function openDatabase(filename: string): Db {
  return new Db(filename)
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS caseworkers (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('caseworker', 'supervisor', 'receptionist')),
      availability TEXT NOT NULL DEFAULT 'offline' CHECK (availability IN ('available', 'busy', 'on_break', 'offline')),
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      caseworker_id INTEGER NOT NULL REFERENCES caseworkers(id),
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS check_ins (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      caseworker_id INTEGER NOT NULL REFERENCES caseworkers(id),
      reason TEXT NOT NULL CHECK (reason IN ('new_application', 'renewal', 'document_submission', 'other')),
      checked_in_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('kiosk', 'staff')),
      override_unavailable INTEGER NOT NULL DEFAULT 0 CHECK (override_unavailable IN (0, 1)),
      created_by INTEGER REFERENCES caseworkers(id),
      correction_note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_entries (
      id INTEGER PRIMARY KEY,
      check_in_id INTEGER NOT NULL UNIQUE REFERENCES check_ins(id),
      caseworker_id INTEGER NOT NULL REFERENCES caseworkers(id),
      name_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('waiting', 'calling', 'missed', 'completed', 'cancelled')),
      called_at TEXT,
      completed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS queue_one_calling_per_worker
      ON queue_entries(caseworker_id)
      WHERE status = 'calling';

    CREATE UNIQUE INDEX IF NOT EXISTS queue_one_active_name
      ON queue_entries(caseworker_id, name_key)
      WHERE status IN ('waiting', 'calling', 'missed');

    CREATE INDEX IF NOT EXISTS idx_queue_worker_status ON queue_entries(caseworker_id, status);
    CREATE INDEX IF NOT EXISTS idx_checkins_name ON check_ins(caseworker_id, name_key);
    CREATE INDEX IF NOT EXISTS idx_checkins_time ON check_ins(checked_in_at);

    CREATE TABLE IF NOT EXISTS queue_events (
      id INTEGER PRIMARY KEY,
      queue_entry_id INTEGER NOT NULL REFERENCES queue_entries(id),
      action TEXT NOT NULL,
      actor_id INTEGER REFERENCES caseworkers(id),
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_queue_events_entry ON queue_events(queue_entry_id, created_at);

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY,
      actor_id INTEGER REFERENCES caseworkers(id),
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const defaults: Record<string, string> = {
    chime_volume: '0.8',
    highlight_seconds: '20',
    session_timeout_minutes: '30',
    demo_hint_enabled: '1',
  }
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(defaults)) insert.run(key, value)
}

export function str(row: Row, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new Error(`Expected text in ${key}.`)
  return value
}

export function strOrNull(row: Row, key: string): string | null {
  const value = row[key]
  if (value == null) return null
  if (typeof value !== 'string') throw new Error(`Expected text in ${key}.`)
  return value
}

export function int(row: Row, key: string): number {
  const value = row[key]
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  throw new Error(`Expected a number in ${key}.`)
}

export function isConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

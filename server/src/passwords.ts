import { hash, verify, type Algorithm } from '@node-rs/argon2'

function options(): { algorithm: Algorithm; memoryCost: number; timeCost: number; parallelism: number } {
  const memoryCost = Number(process.env.ARGON2_MEMORY_COST ?? 19456)
  const timeCost = Number(process.env.ARGON2_TIME_COST ?? 2)
  return {
    algorithm: 2 as Algorithm,
    memoryCost: Number.isFinite(memoryCost) ? memoryCost : 19456,
    timeCost: Number.isFinite(timeCost) ? timeCost : 2,
    parallelism: 1,
  }
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, options())
}

let dummyHash: string | null = null

export async function initPasswords(): Promise<void> {
  if (!dummyHash) dummyHash = await hashPassword('nap-queue-dummy-password')
}

export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  await initPasswords()
  try {
    const ok = await verify(passwordHash ?? dummyHash!, password)
    return Boolean(passwordHash) && ok
  } catch {
    return false
  }
}

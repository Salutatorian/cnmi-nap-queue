import type { Availability, Role } from './types.ts'

/** Fictional demonstration accounts. Do not use these passwords for a real program. */
export const DEMO_PASSWORD = 'NapDemo!2026'

export type DemoAccount = {
  username: string
  fullName: string
  role: Role
  availability: Availability
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'maria.reyes', fullName: 'Maria Reyes', role: 'caseworker', availability: 'available' },
  { username: 'david.santos', fullName: 'David Santos', role: 'caseworker', availability: 'available' },
  { username: 'anna.cruz', fullName: 'Anna Cruz', role: 'caseworker', availability: 'available' },
  { username: 'luis.cabrera', fullName: 'Luis Cabrera', role: 'caseworker', availability: 'available' },
  { username: 'grace.mendiola', fullName: 'Grace Mendiola', role: 'caseworker', availability: 'on_break' },
  { username: 'peter.ada', fullName: 'Peter Ada', role: 'caseworker', availability: 'available' },
  { username: 'elena.guerrero', fullName: 'Elena Guerrero', role: 'caseworker', availability: 'busy' },
  { username: 'mark.camacho', fullName: 'Mark Camacho', role: 'caseworker', availability: 'available' },
  { username: 'sofia.delacruz', fullName: 'Sofia Dela Cruz', role: 'caseworker', availability: 'offline' },
  { username: 'daniel.pangelinan', fullName: 'Daniel Pangelinan', role: 'caseworker', availability: 'available' },
  { username: 'patricia.sannicolas', fullName: 'Patricia San Nicolas', role: 'supervisor', availability: 'offline' },
  { username: 'linda.tenorio', fullName: 'Linda Tenorio', role: 'receptionist', availability: 'offline' },
]

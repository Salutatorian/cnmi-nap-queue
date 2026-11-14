export const ROLES = ['caseworker', 'supervisor', 'receptionist'] as const
export type Role = (typeof ROLES)[number]

export const AVAILABILITIES = ['available', 'busy', 'on_break', 'offline'] as const
export type Availability = (typeof AVAILABILITIES)[number]

export const REASONS = ['new_application', 'renewal', 'document_submission', 'other'] as const
export type Reason = (typeof REASONS)[number]

export const QUEUE_STATUSES = ['waiting', 'calling', 'missed', 'completed', 'cancelled'] as const
export type QueueStatus = (typeof QUEUE_STATUSES)[number]

export type StaffUser = {
  id: number
  username: string
  fullName: string
  role: Role
  availability: Availability
}

export type Actor = {
  user: StaffUser
  ip: string | null
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

export function isAvailability(value: string): value is Availability {
  return (AVAILABILITIES as readonly string[]).includes(value)
}

export function isReason(value: string): value is Reason {
  return (REASONS as readonly string[]).includes(value)
}

export function isQueueStatus(value: string): value is QueueStatus {
  return (QUEUE_STATUSES as readonly string[]).includes(value)
}

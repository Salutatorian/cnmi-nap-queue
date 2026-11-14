import type { Availability, QueueStatus, Reason, Role } from './types'

const REASON_LABELS: Record<Reason, string> = {
  new_application: 'New application',
  renewal: 'Renewal',
  document_submission: 'Document submission',
  other: 'Other',
}

const STATUS_LABELS: Record<QueueStatus, string> = {
  waiting: 'Waiting',
  calling: 'Calling',
  missed: 'Missed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: 'Available',
  busy: 'Busy',
  on_break: 'On Break',
  offline: 'Offline',
}

const ROLE_LABELS: Record<Role, string> = {
  caseworker: 'Caseworker',
  supervisor: 'Supervisor',
  receptionist: 'Receptionist',
}

export const REASONS = Object.keys(REASON_LABELS) as Reason[]

export function reasonLabel(reason: Reason): string {
  return REASON_LABELS[reason]
}

export function statusLabel(status: QueueStatus): string {
  return STATUS_LABELS[status]
}

export function availabilityLabel(availability: Availability): string {
  return AVAILABILITY_LABELS[availability]
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role]
}

export function homeFor(role: Role): string {
  switch (role) {
    case 'receptionist':
      return '/staff/check-in'
    case 'caseworker':
    case 'supervisor':
      return '/staff/queue'
    default: {
      const neverRole: never = role
      return neverRole
    }
  }
}

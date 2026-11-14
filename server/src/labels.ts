import { assertNever } from './errors.ts'
import type { Availability, QueueStatus, Reason, Role } from './types.ts'

export function reasonLabel(reason: Reason): string {
  switch (reason) {
    case 'new_application':
      return 'New application'
    case 'renewal':
      return 'Renewal'
    case 'document_submission':
      return 'Document submission'
    case 'other':
      return 'Other'
    default:
      return assertNever(reason)
  }
}

export function statusLabel(status: QueueStatus): string {
  switch (status) {
    case 'waiting':
      return 'Waiting'
    case 'calling':
      return 'Calling'
    case 'missed':
      return 'Missed'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return assertNever(status)
  }
}

export function availabilityLabel(availability: Availability): string {
  switch (availability) {
    case 'available':
      return 'Available'
    case 'busy':
      return 'Busy'
    case 'on_break':
      return 'On Break'
    case 'offline':
      return 'Offline'
    default:
      return assertNever(availability)
  }
}

export function roleLabel(role: Role): string {
  switch (role) {
    case 'caseworker':
      return 'Caseworker'
    case 'supervisor':
      return 'Supervisor'
    case 'receptionist':
      return 'Receptionist'
    default:
      return assertNever(role)
  }
}

export type Role = 'caseworker' | 'supervisor' | 'receptionist'
export type Availability = 'available' | 'busy' | 'on_break' | 'offline'
export type Reason = 'new_application' | 'renewal' | 'document_submission' | 'other'
export type QueueStatus = 'waiting' | 'calling' | 'missed' | 'completed' | 'cancelled'

export type StaffUser = {
  id: number
  username: string
  fullName: string
  role: Role
  availability: Availability
}

export type PublicWorker = {
  id: number
  fullName: string
}

export type CheckInWorker = PublicWorker & {
  availability: Availability
}

export type QueueItem = {
  id: number
  version: number
  checkInId: number
  fullName: string
  reason: Reason
  status: 'waiting' | 'calling' | 'missed'
  checkedInAt: string
  calledAt: string | null
  caseworkerId: number
  caseworkerName: string
}

export type HistoryVisit = {
  id: number
  version: number
  checkInId: number
  fullName: string
  reason: Reason
  status: QueueStatus
  checkedInAt: string
  calledAt: string | null
  completedAt: string | null
  caseworkerId: number
  caseworkerName: string
}

export type BoardCard = {
  entryId: number
  visitorName: string
  caseworkerName: string
  calledAt: string
}

export type BoardState = {
  cards: BoardCard[]
  onDuty: { fullName: string; availability: 'available' | 'busy' }[]
}

export type Announcement = BoardCard & {
  nonce: string
}

export type PublicSettings = {
  chimeVolume: number
  highlightSeconds: number
}

export type OfficeSettings = PublicSettings & {
  sessionTimeoutMinutes: number
  demoHintEnabled: boolean
}

export type StaffRecord = StaffUser & {
  disabled: boolean
}

export type DailyCount = {
  caseworkerId: number
  fullName: string
  completed: number
  missed: number
  waiting: number
  calling: number
  cancelled: number
  total: number
}

export type AuditEvent = {
  id: number
  action: string
  actorName: string | null
  targetType: string | null
  targetId: string | null
  detail: string | null
  ip: string | null
  createdAt: string
}

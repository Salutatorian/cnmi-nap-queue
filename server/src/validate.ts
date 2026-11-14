import { z } from 'zod'
import { HttpError } from './errors.ts'
import { AVAILABILITIES, REASONS, ROLES } from './types.ts'

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? 'Please check the form and try again.')
  }
  return result.data
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9.]{2,31}$/, 'Usernames use lowercase letters, numbers, and periods.')

export const passwordSchema = z.string().min(10, 'Use at least 10 characters.').max(100, 'That password is too long.')

export const checkInSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a full name.').max(80),
  caseworkerId: z.number().int().positive('Choose a caseworker.'),
  reason: z.enum(REASONS, { errorMap: () => ({ message: 'Choose a reason for the visit.' }) }),
})

export const staffCheckInSchema = checkInSchema.extend({
  override: z.boolean().optional(),
})

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter a username.').max(40),
  password: z.string().min(1, 'Enter a password.').max(100),
})

export const versionSchema = z.object({
  version: z.number().int().positive(),
})

export const availabilitySchema = z.object({
  availability: z.enum(AVAILABILITIES),
})

export const createAccountSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2, 'Enter the staff member\'s full name.').max(80),
  role: z.enum(ROLES),
})

export const disabledSchema = z.object({
  disabled: z.boolean(),
})

export const passwordResetSchema = z.object({
  password: passwordSchema,
})

export const reassignSchema = z.object({
  caseworkerId: z.number().int().positive('Choose a caseworker.'),
  version: z.number().int().positive(),
})

export const cancelSchema = z.object({
  note: z.string().trim().min(3, 'Add a short note explaining the correction.').max(200),
  version: z.number().int().positive(),
})

export const correctSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  reason: z.enum(REASONS).optional(),
  note: z.string().trim().min(3, 'Add a short note explaining the correction.').max(200),
  version: z.number().int().positive(),
})

export const settingsSchema = z.object({
  chimeVolume: z.number().min(0).max(1),
  highlightSeconds: z.number().int().min(5).max(120),
  sessionTimeoutMinutes: z.number().int().min(5).max(240),
  demoHintEnabled: z.boolean(),
})

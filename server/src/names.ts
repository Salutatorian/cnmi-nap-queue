import { HttpError } from './errors.ts'

export function cleanName(input: string): string {
  return input.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

export function nameKey(fullName: string): string {
  return cleanName(fullName).toLocaleLowerCase('en-US')
}

export function caseworkerFolder(fullName: string): string {
  const folder = cleanName(fullName)
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return folder || 'caseworker'
}

const NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'-]{0,79}$/u

export function parsePersonName(input: string): string {
  const cleaned = cleanName(input)
  if (cleaned.length < 2 || cleaned.length > 80 || !NAME_PATTERN.test(cleaned)) {
    throw new HttpError(400, 'Enter a full name using letters.')
  }
  return cleaned
}

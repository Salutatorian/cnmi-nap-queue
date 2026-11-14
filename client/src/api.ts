let csrfToken = ''
let onUnauthorized = (): void => {}

export function setCsrf(token: string): void {
  csrfToken = token
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const method = (options.method ?? 'GET').toUpperCase()
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers.set('X-CSRF-Token', csrfToken)

  let response: Response
  try {
    response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'The queue server is unreachable.')
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  let data: { error?: string } = {}
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string }
    } catch {
      throw new ApiError(response.status, 'The server returned an unexpected response.')
    }
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') onUnauthorized()
    throw new ApiError(response.status, data.error ?? 'Something went wrong.')
  }
  return data as T
}

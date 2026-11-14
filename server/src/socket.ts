import type { Server, Socket } from 'socket.io'
import { readSession } from './auth.ts'
import { readCookie, SESSION_COOKIE } from './http.ts'
import { listBoard } from './queueService.ts'
import { publicSettings } from './settings.ts'

function screenOf(socket: Socket): string | undefined {
  const auth = socket.handshake.auth
  if (!auth || typeof auth !== 'object' || !('screen' in auth)) return undefined
  const screen = auth.screen
  return typeof screen === 'string' ? screen : undefined
}

function cookieHeader(socket: Socket): string | undefined {
  const header = socket.handshake.headers.cookie
  if (Array.isArray(header)) return header.join('; ')
  return header
}

export function attachSocket(io: Server): void {
  io.on('connection', (socket) => {
    const screen = screenOf(socket)
    if (screen === 'tv') {
      socket.join('tv')
      socket.emit('board:state', listBoard())
      socket.emit('public:settings', publicSettings())
      return
    }
    if (screen === 'kiosk') {
      socket.join('kiosk')
      return
    }
    if (screen === 'staff') {
      const token = readCookie(cookieHeader(socket), SESSION_COOKIE)
      const session = token ? readSession(token, false) : undefined
      if (!session) {
        socket.emit('staff:unauthorized')
        socket.disconnect(true)
        return
      }
      socket.join('staff')
      socket.join(`worker:${session.user.id}`)
      return
    }
    socket.disconnect(true)
  })
}

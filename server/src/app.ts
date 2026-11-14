import fs from 'node:fs'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import path from 'node:path'
import express, { type ErrorRequestHandler, type Express } from 'express'
import helmet from 'helmet'
import { Server } from 'socket.io'
import { initPasswords } from './passwords.ts'
import { ensureDataDirs, type Config } from './config.ts'
import { setContext } from './context.ts'
import { migrate, openDatabase, type Db } from './db.ts'
import { HttpError } from './errors.ts'
import { requireSameOrigin } from './http.ts'
import { registerRoutes } from './routes.ts'
import { attachSocket } from './socket.ts'

export type RunningApp = {
  app: Express
  server: HttpServer
  io: Server
  db: Db
}

function transport(app: Express, config: Config): HttpServer {
  if (!config.httpsCert && !config.httpsKey) return createHttpServer(app)
  if (!config.httpsCert || !config.httpsKey) throw new Error('Set both HTTPS_CERT and HTTPS_KEY, or neither.')
  if (!fs.existsSync(config.httpsCert) || !fs.existsSync(config.httpsKey)) {
    throw new Error('The HTTPS certificate or key file was not found.')
  }
  return createHttpsServer(
    { cert: fs.readFileSync(config.httpsCert), key: fs.readFileSync(config.httpsKey) },
    app,
  )
}

function serveClient(app: Express, config: Config): void {
  const indexHtml = path.join(config.clientDist, 'index.html')
  if (!fs.existsSync(indexHtml)) {
    app.get('/', (_req, res) => {
      res.type('text/plain').send('CNMI NAP Queue API is running. Build the client with npm run build.')
    })
    return
  }
  app.use(express.static(config.clientDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(`${path.sep}index.html`)) res.setHeader('Cache-Control', 'no-cache')
    },
  }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next()
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexHtml)
  })
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message })
    return
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ error: 'The request could not be read.' })
    return
  }
  console.error(error)
  res.status(500).json({ error: 'Something went wrong.' })
}

export async function createApp(config: Config): Promise<RunningApp> {
  ensureDataDirs(config)
  await initPasswords()
  const db = openDatabase(config.dbPath)
  migrate(db)
  const app = express()
  if (config.trustProxy) app.set('trust proxy', 1)
  app.disable('x-powered-by')
  const server = transport(app, config)
  const io = new Server(server, {
    cors: { origin: true, credentials: true },
    serveClient: false,
  })
  setContext({ db, config, io })
  attachSocket(io)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }))
  app.use(express.json({ limit: '20kb' }))
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(requireSameOrigin)
  registerRoutes(app)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' })
  })
  serveClient(app, config)
  app.use(errorHandler)
  return { app, server, io, db }
}

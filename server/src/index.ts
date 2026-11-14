import { networkInterfaces } from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { createApp } from './app.ts'
import { backupDatabase, startBackupSchedule } from './backup.ts'
import { loadConfig } from './config.ts'

const nodeMajor = Number(process.versions.node.split('.')[0])
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  console.error('Node.js 22.18 or newer is required.')
  process.exit(1)
}

const config = loadConfig()
const running = await createApp(config)
const scheme = config.httpsCert ? 'https' : 'http'

running.server.listen(config.port, config.host, () => {
  console.log('')
  console.log('CNMI NAP Queue (demonstration)')
  console.log('This is not an official government system.')
  console.log(`Kiosk:  ${scheme}://localhost:${config.port}/kiosk`)
  console.log(`TV:     ${scheme}://localhost:${config.port}/tv`)
  console.log(`Staff:  ${scheme}://localhost:${config.port}/staff/login`)
  for (const address of officeAddresses()) {
    console.log(`Office: ${scheme}://${address}:${config.port}/staff/login`)
  }
  console.log('')
  if (!fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    console.log('The client is not built yet. From the project folder, run: npm run build')
  }
})

void backupDatabase()
startBackupSchedule()

function officeAddresses(): string[] {
  const addresses: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address)
    }
  }
  return addresses
}

function shutdown(): void {
  running.io.close()
  running.server.close(() => {
    running.db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

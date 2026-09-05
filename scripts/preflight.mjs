#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'

const checks = []

function record(name, ok, detail) {
  checks.push({ name, ok, detail })
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.setTimeout(700)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

// Named `preflight`, not `doctor`: pnpm 11 ships a built-in `pnpm doctor` command
// that shadows a same-named script, so `pnpm doctor` would silently run pnpm's
// diagnostics instead of this file. See the plan's Task 1 Step 8.
const major = Number(process.versions.node.split('.')[0])
record('node >= 24', major >= 24, `found ${process.versions.node} — run \`nvm use\``)

record('.env.local exists', existsSync('.env.local'), 'cp .env.example .env.local')

// Next reads .env.local from the directory it was started in, never from the repo
// root, so apps/web needs its own link to the canonical file. See review §3.1.
if (existsSync('apps/web')) {
  record(
    'apps/web/.env.local resolves',
    existsSync('apps/web/.env.local'),
    'ln -s ../../.env.local apps/web/.env.local',
  )
}

try {
  execSync('docker info', { stdio: 'ignore' })
  record('docker daemon', true, '')
} catch {
  record('docker daemon', false, 'start Docker Desktop')
}

// 5433, not 5432: a Homebrew postgresql@17 service owns 5432 on this machine, so
// checking 5432 reports `ok` for a database that is not ours. See docker-compose.yml.
record('postgres :5433', await portOpen(5433), 'run pnpm db:up')
record('mailpit :8025', await portOpen(8025), 'run pnpm db:up')

for (const { name, ok, detail } of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

process.exit(checks.every((c) => c.ok) ? 0 : 1)

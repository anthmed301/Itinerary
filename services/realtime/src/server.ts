import { Server } from '@hocuspocus/server'
import { realtimeEnv } from '@tether/shared/env'
import pino from 'pino'

const log = pino({ name: 'realtime' })
const env = realtimeEnv()

// Phase 0 authentication accepts anything. This guard is what stops that from
// silently becoming the Stage 2 configuration. Remove it in Phase 4 with the stub.
if (env.NODE_ENV === 'production') {
  throw new Error('Phase 0 stub auth must not run in production')
}

/**
 * Phase 0 server. Authentication is intentionally a permissive stub — Phase 4
 * replaces the body of onAuthenticate with JWT verification and sets
 * `connection.readOnly = true` for viewers, which is the correct way to
 * enforce the viewer role. See docs/prd-review-2026-09-05.md §2.1.
 */
const server = new Server({
  port: env.HOCUSPOCUS_PORT,
  name: 'tether-realtime',

  async onAuthenticate(data) {
    // Hocuspocus 4 exposes web-standard Headers and URLSearchParams.
    // requestHeaders.get(...) replaces the v2 object indexing in docs/.
    log.info({ documentName: data.documentName }, 'connection authenticated')
    return { user: { id: 'phase-0-anonymous' } }
  },

  async onLoadDocument(data) {
    log.info({ documentName: data.documentName }, 'document loaded')
    return data.document
  },

  async onChange(data) {
    log.debug({ documentName: data.documentName }, 'document changed')
  },
})

server.listen().then(() => {
  log.info({ port: env.HOCUSPOCUS_PORT }, 'realtime server listening')
})

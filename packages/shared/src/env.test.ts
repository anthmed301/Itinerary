import { describe, expect, it } from 'vitest'
import { parseCoreEnv, parseRealtimeEnv, parseWebEnv } from './env'

const core = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://tripi:tripi@localhost:5433/tripi',
}

const web = {
  ...core,
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
}

const realtime = {
  ...core,
  HOCUSPOCUS_PORT: '1234',
  HOCUSPOCUS_JWT_SECRET: 'a'.repeat(64),
}

describe('core env', () => {
  it('accepts a complete environment', () => {
    expect(parseCoreEnv(core).DATABASE_URL).toBe('postgresql://tripi:tripi@localhost:5433/tripi')
  })

  it('defaults NODE_ENV to development', () => {
    const { NODE_ENV, ...withoutNodeEnv } = core
    expect(parseCoreEnv(withoutNodeEnv).NODE_ENV).toBe('development')
  })

  it('throws naming the missing key when DATABASE_URL is absent', () => {
    const { DATABASE_URL, ...withoutDb } = core
    expect(() => parseCoreEnv(withoutDb)).toThrow(/DATABASE_URL/)
  })

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() => parseCoreEnv({ ...core, DATABASE_URL: 'mysql://nope' })).toThrow(/DATABASE_URL/)
  })
})

describe('web env', () => {
  it('accepts the web environment', () => {
    expect(parseWebEnv(web).NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000')
  })

  // The web app has no business holding the realtime signing key until Phase 4.
  it('does not require the realtime signing secret', () => {
    expect(() => parseWebEnv(web)).not.toThrow()
  })

  it('rejects a websocket URL that is not a ws URL', () => {
    expect(() => parseWebEnv({ ...web, NEXT_PUBLIC_HOCUSPOCUS_URL: 'http://nope' })).toThrow(
      /NEXT_PUBLIC_HOCUSPOCUS_URL/,
    )
  })
})

describe('realtime env', () => {
  it('coerces the port to a number', () => {
    expect(parseRealtimeEnv(realtime).HOCUSPOCUS_PORT).toBe(1234)
  })

  it('defaults the port when absent', () => {
    const { HOCUSPOCUS_PORT, ...withoutPort } = realtime
    expect(parseRealtimeEnv(withoutPort).HOCUSPOCUS_PORT).toBe(1234)
  })

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => parseRealtimeEnv({ ...realtime, HOCUSPOCUS_JWT_SECRET: 'short' })).toThrow(
      /HOCUSPOCUS_JWT_SECRET/,
    )
  })

  // The realtime server never renders a page; requiring the app URL would block boot.
  it('does not require the public app URL', () => {
    expect(() => parseRealtimeEnv(realtime)).not.toThrow()
  })
})

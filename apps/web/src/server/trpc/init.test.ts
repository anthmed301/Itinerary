import { describe, expect, it } from 'vitest'
import { createContext } from './init'
import { appRouter } from './root'

describe('createContext — A10 fail closed', () => {
  // Review §4.5: spec §5 A10 promises "session-lookup failure yields
  // unauthenticated, not authorized". An error here must never become an
  // authorisation bypass.
  it('treats a throwing session lookup as anonymous', async () => {
    const ctx = await createContext({
      headers: new Headers(),
      getSession: async () => {
        throw new Error('session store unreachable')
      },
    })
    expect(ctx.user).toBeNull()
  })

  it('is anonymous when there is no session', async () => {
    const ctx = await createContext({ headers: new Headers(), getSession: async () => null })
    expect(ctx.user).toBeNull()
  })

  it('populates the user when the session resolves', async () => {
    const ctx = await createContext({
      headers: new Headers(),
      getSession: async () => ({
        user: { id: 'u1', email: 'a@b.co', name: 'Alice', username: 'alice' },
      }),
    })
    expect(ctx.user).toEqual({ id: 'u1', email: 'a@b.co', name: 'Alice', username: 'alice' })
  })

  it('reads the client address from x-forwarded-for for the tRPC rate limiter', async () => {
    const ctx = await createContext({
      headers: new Headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }),
      getSession: async () => null,
    })
    expect(ctx.ip).toBe('198.51.100.7')
  })
})

describe('profile router — A01 has no tamperable target', () => {
  /**
   * Review §4.5: spec §5 A01 promises "no profile procedure takes a userId
   * input". This is the IDOR/BOLA regression guard, and it matters most in
   * Phase 4 when trip roles arrive and the temptation to accept an id returns.
   */
  it('exposes no profile procedure accepting a userId or id', () => {
    const procedures = (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })
      ._def.procedures
    const profileNames = Object.keys(procedures).filter((n) => n.startsWith('profile.'))
    expect(profileNames).toContain('profile.get')
    expect(profileNames).toContain('profile.update')

    for (const name of profileNames) {
      const inputs = (procedures[name] as { _def?: { inputs?: unknown[] } })._def?.inputs ?? []
      for (const input of inputs) {
        const shape = (input as { shape?: Record<string, unknown> }).shape
        if (!shape) continue
        expect(Object.keys(shape), `${name} must not accept an identity field`).not.toContain(
          'userId',
        )
        expect(Object.keys(shape), `${name} must not accept an identity field`).not.toContain('id')
      }
    }
  })
})

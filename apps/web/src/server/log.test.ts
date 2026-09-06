import { describe, expect, it } from 'vitest'
import { authLog, redact } from './log'

describe('redact', () => {
  it('replaces known secret keys', () => {
    const out = redact({ userId: 'u1', password: 'hunter2', token: 'abc', event: 'x' })
    expect(out.password).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.userId).toBe('u1')
  })

  it('is case-insensitive and matches partial names', () => {
    const out = redact({ resetToken: 'x', SessionToken: 'y', passwordHash: 'z' })
    expect(Object.values(out)).toEqual(['[redacted]', '[redacted]', '[redacted]'])
  })

  it('leaves ordinary values alone', () => {
    expect(redact({ event: 'auth.login', ok: true }).event).toBe('auth.login')
  })
})

describe('authLog', () => {
  // Spec §5 A04/A09: a log line must never carry a credential or a token.
  it('emits neither a password nor a token', () => {
    const lines: string[] = []
    const original = console.info
    console.info = (line: string) => lines.push(line)
    try {
      authLog('auth.login.failure', { userId: 'u1', password: 'hunter2', token: 'tok_abc' })
    } finally {
      console.info = original
    }
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('hunter2')
    expect(lines[0]).not.toContain('tok_abc')
    expect(lines[0]).toContain('auth.login.failure')
    expect(lines[0]).toContain('u1')
  })
})

import { describe, expect, it } from 'vitest'
import { normalizeUsername, RESERVED_USERNAMES, validateUsername } from './username'

describe('normalizeUsername', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeUsername('  Alice_01  ')).toBe('alice_01')
  })

  it('is idempotent', () => {
    expect(normalizeUsername(normalizeUsername('AliCe'))).toBe('alice')
  })
})

describe('validateUsername', () => {
  it('accepts a simple valid username and returns both forms', () => {
    const r = validateUsername('Alice_01')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.username).toBe('Alice_01')
      expect(r.usernameLower).toBe('alice_01')
    }
  })

  it('rejects fewer than 3 characters', () => {
    const r = validateUsername('ab')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/3/)
  })

  it('rejects more than 32 characters', () => {
    expect(validateUsername('a'.repeat(33)).ok).toBe(false)
  })

  it('rejects a name not starting with a letter', () => {
    expect(validateUsername('1alice').ok).toBe(false)
    expect(validateUsername('_alice').ok).toBe(false)
  })

  it('rejects characters outside [a-z0-9_]', () => {
    expect(validateUsername('alice-01').ok).toBe(false)
    expect(validateUsername('alice.01').ok).toBe(false)
    expect(validateUsername('alice 01').ok).toBe(false)
    expect(validateUsername('alicé').ok).toBe(false)
  })

  it('rejects consecutive underscores', () => {
    expect(validateUsername('alice__01').ok).toBe(false)
  })

  it('rejects a trailing underscore', () => {
    expect(validateUsername('alice_').ok).toBe(false)
  })

  // Phase 6 turns usernames into /:username profile URLs. A user called
  // "settings" would shadow a route, so the denylist is load-bearing.
  it('rejects reserved words regardless of case', () => {
    for (const word of ['admin', 'API', 'Settings', 'login', 'me']) {
      expect(validateUsername(word).ok).toBe(false)
    }
  })

  it('exposes the reserved list so the signup form can explain itself', () => {
    expect(RESERVED_USERNAMES.has('admin')).toBe(true)
  })

  it('treats differently-cased spellings as the same name', () => {
    const a = validateUsername('Alice')
    const b = validateUsername('ALICE')
    expect(a.ok && b.ok && a.usernameLower === b.usernameLower).toBe(true)
  })
})

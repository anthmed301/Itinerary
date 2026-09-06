import { describe, expect, it } from 'vitest'
import { escapeHtml, resetPasswordEmail, verificationEmail } from './templates'

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Alice from Berlin')).toBe('Alice from Berlin')
  })
})

describe('verificationEmail', () => {
  it('includes the verification URL in both bodies', () => {
    const m = verificationEmail({ name: 'Alice', url: 'https://x.test/v?t=abc' })
    expect(m.html).toContain('https://x.test/v?t=abc')
    expect(m.text).toContain('https://x.test/v?t=abc')
  })

  // A05: a hostile display name must not become live markup in a mail client.
  it('neutralises HTML in the display name', () => {
    const m = verificationEmail({ name: '<script>alert(1)</script>', url: 'https://x.test/v' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('has a subject', () => {
    expect(verificationEmail({ name: 'A', url: 'https://x.test' }).subject.length).toBeGreaterThan(
      0,
    )
  })
})

describe('resetPasswordEmail', () => {
  it('includes the reset URL and escapes the name', () => {
    const m = resetPasswordEmail({ name: '"><b>x', url: 'https://x.test/r?t=1' })
    expect(m.html).toContain('https://x.test/r?t=1')
    expect(m.html).not.toContain('<b>x')
  })
})

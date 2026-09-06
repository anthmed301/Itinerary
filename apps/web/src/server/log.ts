/**
 * A09 (Security Logging & Alerting Failures). Structured auth events, with
 * secrets stripped before they can reach a log sink.
 *
 * Honest limit: this produces the signal only. Aggregation and alerting are
 * Stage 2-3 per PRD §7b — nothing watches these lines yet.
 */
const SECRET_KEY = /pass|token|secret|hash|cookie|authorization/i

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SECRET_KEY.test(k) ? '[redacted]' : v
  }
  return out
}

export type AuthEvent =
  | 'auth.signup'
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.reset.requested'
  | 'auth.reset.completed'
  | 'auth.verification.sent'
  | 'auth.throttled'

/**
 * Logs a user id, never an email address — spec §5 A09 says "user id only",
 * and the address is the one piece of PII in this flow.
 */
export function authLog(event: AuthEvent, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...redact(fields) }))
}

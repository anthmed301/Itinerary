export type AuthPosture = {
  APP_STAGE: 'local' | 'cloud' | 'trusted' | 'public'
  REQUIRE_EMAIL_VERIFICATION: boolean
  RATE_LIMIT_ENABLED: boolean
}

/**
 * A02 (Security Misconfiguration). Two settings are deliberately relaxed at
 * Stage 1 (D1.5, D1.8). This makes it impossible for either to reach a
 * deployed stage unnoticed: the process refuses to boot instead.
 *
 * Keyed on APP_STAGE, NOT NODE_ENV. `next build` and `next start` both run with
 * NODE_ENV=production on a laptop, and CLAUDE.md requires both to run there —
 * so keying on NODE_ENV makes the production path impossible to exercise.
 * PRD §7b already owns the right axis and calls it a Stage. Review §3.2.
 */
export function assertProductionAuthPosture(env: AuthPosture): void {
  if (env.APP_STAGE === 'local') return

  const failures: string[] = []
  if (!env.REQUIRE_EMAIL_VERIFICATION) failures.push('REQUIRE_EMAIL_VERIFICATION must be true')
  if (!env.RATE_LIMIT_ENABLED) failures.push('RATE_LIMIT_ENABLED must be true')

  if (failures.length > 0) {
    throw new Error(
      `Unsafe auth configuration for APP_STAGE=${env.APP_STAGE}:\n  ${failures.join('\n  ')}`,
    )
  }
}

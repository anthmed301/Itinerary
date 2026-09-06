import { describe, expect, it } from 'vitest'
import { type AuthPosture, assertProductionAuthPosture } from './guard'

const deployed: AuthPosture = {
  APP_STAGE: 'cloud',
  REQUIRE_EMAIL_VERIFICATION: true,
  RATE_LIMIT_ENABLED: true,
}

describe('assertProductionAuthPosture', () => {
  it('passes at a deployed stage when the posture is correct', () => {
    expect(() => assertProductionAuthPosture(deployed)).not.toThrow()
  })

  it('throws at every deployed stage when email verification is disabled', () => {
    for (const APP_STAGE of ['cloud', 'trusted', 'public'] as const) {
      expect(() =>
        assertProductionAuthPosture({ ...deployed, APP_STAGE, REQUIRE_EMAIL_VERIFICATION: false }),
      ).toThrow(/REQUIRE_EMAIL_VERIFICATION/)
    }
  })

  it('throws at a deployed stage when rate limiting is disabled', () => {
    expect(() => assertProductionAuthPosture({ ...deployed, RATE_LIMIT_ENABLED: false })).toThrow(
      /RATE_LIMIT_ENABLED/,
    )
  })

  it('names the stage in the error so the cause is obvious', () => {
    expect(() =>
      assertProductionAuthPosture({ ...deployed, APP_STAGE: 'public', RATE_LIMIT_ENABLED: false }),
    ).toThrow(/APP_STAGE=public/)
  })

  // The whole point of keying on APP_STAGE rather than NODE_ENV: `next build`
  // and `next start` run NODE_ENV=production locally, and must still work with
  // the relaxed Stage 1 posture. Review §3.2.
  it('allows the relaxed posture at Stage 1 even though NODE_ENV is production there', () => {
    expect(() =>
      assertProductionAuthPosture({
        APP_STAGE: 'local',
        REQUIRE_EMAIL_VERIFICATION: false,
        RATE_LIMIT_ENABLED: false,
      }),
    ).not.toThrow()
  })
})

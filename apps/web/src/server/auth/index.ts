import { validateUsername } from '@tether/shared'
import { db, schema } from '@tether/shared/db'
import { userProfile } from '@tether/shared/db/schema'
import { webEnv } from '@tether/shared/env'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sendEmail } from '../email/mailer'
import { resetPasswordEmail, verificationEmail } from '../email/templates'
import { assertProductionAuthPosture } from './guard'

const env = webEnv()

// `next build` evaluates every route module to collect page data, with
// NODE_ENV=production and NEXT_PHASE='phase-production-build'. Skipping the
// guard there means a build never needs deployment secrets. Under `next start`
// NEXT_PHASE is undefined, so a real server is always checked. Review §3.2.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  assertProductionAuthPosture({
    APP_STAGE: env.APP_STAGE,
    REQUIRE_EMAIL_VERIFICATION: env.REQUIRE_EMAIL_VERIFICATION,
    RATE_LIMIT_ENABLED: env.RATE_LIMIT_ENABLED,
  })
}

export const auth = betterAuth({
  // Pass `schema` explicitly: the adapter otherwise depends on db._.fullSchema
  // being populated by however createDb happens to be built — a silent coupling.
  database: drizzleAdapter(db(), { provider: 'pg', schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],

  emailAndPassword: {
    enabled: true,
    // D1.5 — emails are sent either way; this only gates login.
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    minPasswordLength: 10,
    autoSignIn: true,
    // A07 — a reset logs the account out everywhere (security.md §2.3).
    // Not the default.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        resetPasswordEmail({ name: user.name, url }),
        'auth.reset.requested',
        user.id,
      )
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        user.email,
        verificationEmail({ name: user.name, url }),
        'auth.verification.sent',
        user.id,
      )
    },
  },

  // D1.2 — username on `user` makes signup a single atomic insert.
  user: {
    additionalFields: {
      username: { type: 'string', required: true, input: true },
      // required:false, NOT true. Better Auth validates additionalFields against
      // the request BODY before databaseHooks run, so a `required` field the
      // client is forbidden to send (input:false) is rejected as MISSING_FIELD
      // and every signup 400s. NOT NULL on user.username_lower is the real
      // guarantee. Verified: required:true -> 400, hooks never run. Review §3.1.
      usernameLower: { type: 'string', required: false, input: false, unique: true },
    },
  },

  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },

  // D1.8 — better-auth's own default is `enabled ?? isProduction`, i.e. OFF in
  // development, so a local test could never observe throttling.
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED,
    window: 60,
    max: 30,
    // Better Auth ships DEFAULT SPECIAL RULES that override the base for these
    // paths: /sign-in* and /sign-up* are 3 per 10s, /request-password-reset is
    // 3 per 60s. Undocumented defaults are not a security posture — state ours,
    // or the e2e suite throttles itself from one shared bucket. Review §3.4.
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 20 },
      '/request-password-reset': { window: 60, max: 20 },
    },
  },

  advanced: {
    cookiePrefix: 'tether',
    useSecureCookies: env.NODE_ENV === 'production',
  },

  databaseHooks: {
    user: {
      create: {
        // Server-side validation is the authority; the signup form's live check
        // is a convenience, never a control.
        before: async (creating) => {
          const raw = (creating as { username?: unknown }).username
          if (typeof raw !== 'string') throw new Error('username is required')
          const result = validateUsername(raw)
          if (!result.ok) throw new Error(`Invalid username: ${result.reason}`)
          return {
            data: { ...creating, username: result.username, usernameLower: result.usernameLower },
          }
        },
        // D1.4 — profile creation must never block signup, so failures are
        // swallowed here and repaired lazily by profile.get.
        after: async (created) => {
          try {
            await db().insert(userProfile).values({ userId: created.id }).onConflictDoNothing()
          } catch (error) {
            console.warn(
              JSON.stringify({
                event: 'user_profile.create_failed',
                userId: created.id,
                message: error instanceof Error ? error.message : String(error),
              }),
            )
          }
        },
      },
    },
  },
})

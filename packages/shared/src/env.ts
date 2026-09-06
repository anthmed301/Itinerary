import { z } from 'zod'

/**
 * Environment variables are always strings. z.coerce.boolean() is wrong here —
 * it treats the string "false" as truthy. This accepts only the two literals.
 */
const envBool = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((v) => v === 'true')

/** Everything both services need. */
const coreShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // PRD §7b stages. NODE_ENV says "this is a built artefact"; APP_STAGE says
  // "strangers can reach this". `next build` and `next start` both run with
  // NODE_ENV=production on a laptop, so security posture keys on APP_STAGE.
  APP_STAGE: z.enum(['local', 'cloud', 'trusted', 'public']).default('local'),
  DATABASE_URL: z.string().startsWith('postgres'),
}

const CoreEnvSchema = z.object(coreShape)

const WebEnvSchema = z.object({
  ...coreShape,
  NEXT_PUBLIC_APP_URL: z.string().startsWith('http'),
  NEXT_PUBLIC_HOCUSPOCUS_URL: z.string().startsWith('ws'),

  // Better Auth signs session tokens with this. Never sent to the browser.
  BETTER_AUTH_SECRET: z.string().min(32),

  // Mailpit in dev (docker-compose); a real relay at Stage 2.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  EMAIL_FROM: z.string().min(3),

  // D1.5 — verification emails are sent, but login is not gated on them locally.
  REQUIRE_EMAIL_VERIFICATION: envBool('false'),
  // D1.8 — explicit, because better-auth's own default is off in development.
  RATE_LIMIT_ENABLED: envBool('true'),
})

const RealtimeEnvSchema = z.object({
  ...coreShape,
  HOCUSPOCUS_PORT: z.coerce.number().int().positive().default(1234),
  HOCUSPOCUS_JWT_SECRET: z.string().min(32),
})

export type CoreEnv = z.infer<typeof CoreEnvSchema>
export type WebEnv = z.infer<typeof WebEnvSchema>
export type RealtimeEnv = z.infer<typeof RealtimeEnvSchema>

/**
 * Parses an environment record, throwing an error that names every offending key.
 * Exported through the three named parsers so tests can exercise them without
 * touching process.env.
 */
function parse<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ')
    throw new Error(`Invalid ${label} environment:\n  ${detail}`)
  }
  return result.data
}

export const parseCoreEnv = (source: Record<string, string | undefined>): CoreEnv =>
  parse(CoreEnvSchema, source, 'core')

export const parseWebEnv = (source: Record<string, string | undefined>): WebEnv =>
  parse(WebEnvSchema, source, 'web')

export const parseRealtimeEnv = (source: Record<string, string | undefined>): RealtimeEnv =>
  parse(RealtimeEnvSchema, source, 'realtime')

let coreCache: CoreEnv | undefined
let webCache: WebEnv | undefined
let realtimeCache: RealtimeEnv | undefined

/**
 * Lazily validated process env. These are functions rather than top-level
 * constants so that importing this module during a Next build does not throw
 * before the runtime environment exists.
 *
 * All three read server-side process.env and are therefore server-only —
 * biome.json restricts `@tether/shared/env` to server directories.
 */
export function coreEnv(): CoreEnv {
  coreCache ??= parseCoreEnv(process.env)
  return coreCache
}

export function webEnv(): WebEnv {
  webCache ??= parseWebEnv(process.env)
  return webCache
}

export function realtimeEnv(): RealtimeEnv {
  realtimeCache ??= parseRealtimeEnv(process.env)
  return realtimeCache
}

import { z } from 'zod'

/** Everything both services need. */
const coreShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().startsWith('postgres'),
}

const CoreEnvSchema = z.object(coreShape)

const WebEnvSchema = z.object({
  ...coreShape,
  NEXT_PUBLIC_APP_URL: z.string().startsWith('http'),
  NEXT_PUBLIC_HOCUSPOCUS_URL: z.string().startsWith('ws'),
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
 * biome.json restricts `@tripi/shared/env` to server directories.
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

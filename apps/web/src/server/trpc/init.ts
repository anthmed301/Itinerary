import { type Database, db } from '@tether/shared/db'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'

export type SessionUser = { id: string; email: string; name: string; username: string }

export type Context = {
  db: Database
  user: SessionUser | null
  /** Client address, for the tRPC-side rate limiter. See `rateLimited`. */
  ip: string
}

/**
 * A10 (Mishandling of Exceptional Conditions): if the session lookup throws,
 * the request is treated as ANONYMOUS, never as authorised. Failing closed is
 * the whole point — an error here must not become an authorisation bypass.
 *
 * `getSession` is injectable so that behaviour can be tested directly.
 */
export async function createContext(opts?: {
  headers?: Headers
  getSession?: (headers: Headers) => Promise<{ user?: unknown } | null>
}): Promise<Context> {
  const headers = opts?.headers ?? new Headers()
  // Imported lazily so a unit test that injects `getSession` never loads the
  // auth module — which builds a Better Auth instance and a DB client at import
  // time and would need the full environment just to test a null check.
  const lookup =
    opts?.getSession ??
    (async (h: Headers) => {
      const { auth } = await import('@/server/auth')
      return auth.api.getSession({ headers: h })
    })

  let user: SessionUser | null = null
  try {
    const session = await lookup(headers)
    const u = session?.user as SessionUser | undefined
    if (u) {
      user = { id: u.id, email: u.email, name: u.name, username: u.username }
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'session.lookup_failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    user = null
  }

  return {
    db: db(),
    user,
    ip: headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1',
  }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // A10: never leak internals to a client in production. Note tRPC itself
  // attaches data.stack whenever isDev, so this control only exists on the
  // production path — which is the path CI serves.
  errorFormatter({ shape, error }) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ...shape,
        message: error.code === 'INTERNAL_SERVER_ERROR' ? 'Internal server error' : shape.message,
        data: { code: shape.data.code, httpStatus: shape.data.httpStatus },
      }
    }
    return shape
  },
})

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

/**
 * A01 (Broken Access Control). Every non-public procedure builds on this.
 * Phase 4 layers trip roles on top; the shape does not change.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

/**
 * A06. Better Auth's rate limiter lives inside `auth.handler` at /api/auth/*
 * and never sees tRPC routes at /api/trpc/*. The username-availability oracle
 * is unauthenticated, cheap and enumerable, so it needs its own limiter.
 *
 * Per-instance and in-memory, matching what spec §5 already discloses about
 * the Better Auth limiter. Multi-instance is a v2 concern.
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export const rateLimited = (max: number, windowMs: number) =>
  t.middleware(({ ctx, next, path }) => {
    const key = `${ctx.ip}|${path}`
    const now = Date.now()
    const bucket = buckets.get(key)
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
    } else {
      bucket.count += 1
      if (bucket.count > max) throw new TRPCError({ code: 'TOO_MANY_REQUESTS' })
    }
    return next()
  })

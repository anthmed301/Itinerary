import { validateUsername } from '@tripi/shared'
import { getOrCreateProfile, isUsernameAvailable, updateProfile } from '@tripi/shared/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, publicProcedure, rateLimited, router } from '../init'

export const profileRouter = router({
  /**
   * A01: no userId input. The caller can only ever read their own profile,
   * because the id comes from the session. This is the IDOR defence — there is
   * no parameter to tamper with.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getOrCreateProfile(ctx.db, ctx.user.id)
    if (!profile) throw new TRPCError({ code: 'NOT_FOUND' })
    return profile
  }),

  /** A01: same — the target is always ctx.user.id, never client-supplied. */
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        bio: z.string().trim().max(500).nullable(),
        homeCity: z.string().trim().max(120).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await updateProfile(ctx.db, ctx.user.id, input)
      return { ok: true as const }
    }),

  /**
   * A06: this endpoint is a username enumeration oracle by design (D1.1).
   * Accepted, but it returns only a boolean and carries its own rate limit —
   * Better Auth's limiter does not cover /api/trpc/*. Never widen the response.
   */
  checkUsernameAvailable: publicProcedure
    .use(rateLimited(30, 60_000))
    .input(z.object({ username: z.string().max(64) }))
    .query(async ({ ctx, input }) => {
      const result = validateUsername(input.username)
      if (!result.ok) return { available: false, reason: result.reason }
      const available = await isUsernameAvailable(ctx.db, result.usernameLower)
      return { available, reason: available ? null : 'That name is taken.' }
    }),
})

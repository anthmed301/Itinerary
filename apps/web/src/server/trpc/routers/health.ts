import { countPlaces } from '@tripi/shared/db'
import { publicProcedure, router } from '../init'

export const healthRouter = router({
  /**
   * Proves the whole server-side seam: tRPC -> Drizzle -> Postgres.
   * The body is throwaway; the wiring around it is not.
   */
  check: publicProcedure.query(async ({ ctx }) => {
    const checkedAt = new Date()
    try {
      return { database: 'up' as const, placeCount: await countPlaces(ctx.db), checkedAt }
    } catch {
      // Reached when Postgres is unreachable or the migration has not run.
      // The page renders `database: down` instead of a 500.
      return { database: 'down' as const, placeCount: 0, checkedAt }
    }
  }),
})

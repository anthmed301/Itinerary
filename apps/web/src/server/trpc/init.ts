import { type Database, db } from '@tripi/shared/db'
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

export type Context = {
  db: Database
  /** Populated in Phase 1 when Better Auth lands. */
  userId: string | null
}

export async function createContext(): Promise<Context> {
  return { db: db(), userId: null }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

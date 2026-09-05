import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { coreEnv } from '../env'
import * as schema from './schema'
import { place } from './schema'

export type Database = ReturnType<typeof createDb>

/** Creates a Drizzle client. `max: 1` suits serverless; the realtime server overrides it. */
export function createDb(connectionString: string = coreEnv().DATABASE_URL, max = 1) {
  const client = postgres(connectionString, { max })
  return drizzle(client, { schema })
}

// Next re-evaluates modules on every hot reload, so a module-scoped variable does
// not survive one. globalThis does. Production gets a plain module singleton
// because there is no reload to survive.
const globalForDb = globalThis as typeof globalThis & { __tripiDb?: Database }

let cached: Database | undefined

export function db(): Database {
  if (process.env.NODE_ENV === 'production') {
    cached ??= createDb()
    return cached
  }
  globalForDb.__tripiDb ??= createDb()
  return globalForDb.__tripiDb
}

/**
 * Row count of the place cache.
 *
 * Lives here rather than in a tRPC router so that `drizzle-orm` and the `sql`
 * template stay inside packages/shared/src/db — the boundary says only this
 * directory contains SQL. A router that imports `sql` directly also forces
 * `drizzle-orm` into apps/web's dependencies, where it does not belong.
 */
export async function countPlaces(database: Database): Promise<number> {
  const rows = await database.select({ count: sql<number>`count(*)::int` }).from(place)
  // rows.at(0) rather than destructuring because noUncheckedIndexedAccess is on.
  return rows.at(0)?.count ?? 0
}

export { schema }

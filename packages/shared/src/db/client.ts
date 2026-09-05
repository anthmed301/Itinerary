import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { coreEnv } from '../env'
import * as schema from './schema'

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

export { schema }

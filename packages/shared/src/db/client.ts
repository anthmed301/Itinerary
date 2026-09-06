import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { coreEnv } from '../env'
import * as schema from './schema'
import { place, user, userProfile } from './schema'

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

export type ProfileRow = {
  userId: string
  name: string
  username: string
  email: string
  emailVerified: boolean
  bio: string | null
  homeCity: string | null
}

/**
 * Reads a user's profile, creating the row first if it is missing (D1.4).
 * Signup writes it via an after-hook that deliberately swallows failures, so
 * this is the repair path — a user can never be stuck without a profile.
 *
 * Insert before select, so the returned row reflects reality rather than the
 * state from before the repair.
 */
export async function getOrCreateProfile(
  database: Database,
  userId: string,
): Promise<ProfileRow | null> {
  await database.insert(userProfile).values({ userId }).onConflictDoNothing()

  const rows = await database
    .select({
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      bio: userProfile.bio,
      homeCity: userProfile.homeCity,
    })
    .from(user)
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)

  return rows.at(0) ?? null
}

/** Updates the fields a user may change about themselves. */
export async function updateProfile(
  database: Database,
  userId: string,
  input: { name: string; bio: string | null; homeCity: string | null },
): Promise<void> {
  await database
    .update(user)
    .set({ name: input.name, updatedAt: new Date() })
    .where(eq(user.id, userId))
  await database
    .insert(userProfile)
    .values({ userId, bio: input.bio, homeCity: input.homeCity })
    .onConflictDoUpdate({
      target: userProfile.userId,
      set: { bio: input.bio, homeCity: input.homeCity, updatedAt: new Date() },
    })
}

/** True when the canonical lowercase form is free. */
export async function isUsernameAvailable(
  database: Database,
  usernameLower: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.usernameLower, usernameLower))
    .limit(1)
  return rows.length === 0
}

export { schema }

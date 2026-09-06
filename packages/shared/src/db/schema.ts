import { sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Foursquare-backed place cache, shared across activities.
 *
 * Foursquare's usage terms allow storing `fsq_id` indefinitely but limit cached
 * POI metadata (name, address, hours, coordinates) to 24 hours. `refreshedAt`
 * drives refresh-on-read. See docs/prd-review-2026-09-05.md §2.4.
 *
 * lat/lng are doublePrecision, not decimal: Drizzle returns `decimal` columns as
 * strings, so every map pin would need Number() at the call site. Coordinates are
 * a measurement, not money — float is the right type. Deviates from
 * docs/data-model.md §2.3; see the deviations table.
 */
export const place = pgTable(
  'place',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fsqId: varchar('fsq_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    category: varchar('category', { length: 100 }),
    address: text('address'),
    city: varchar('city', { length: 120 }),
    country: varchar('country', { length: 80 }),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('place_fsq_id_idx').on(t.fsqId),
    index('place_refreshed_at_idx').on(t.refreshedAt),
  ],
)

export type Place = typeof place.$inferSelect
export type NewPlace = typeof place.$inferInsert

/** Rows whose cached metadata has aged past the Foursquare 24h limit. */
export const placeIsStale = sql`${place.refreshedAt} < now() - interval '24 hours'`

/**
 * Better Auth owns these four tables. Column *property* names must match Better
 * Auth's field names exactly (camelCase) because the Drizzle adapter looks up
 * `schema[model][field]`; the SQL column names underneath are ours to choose.
 *
 * Hand-written rather than generated: @better-auth/cli's newest release
 * (2026-03-16) predates better-auth 1.7.1 and does not know about
 * `account.issuer`. Shape taken from running getAuthTables() with our config.
 *
 * "user" is a reserved word in Postgres; Drizzle quotes identifiers, so it is safe.
 */
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(), // D1.3 — this IS the display name
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'), // unused in Phase 1
    // D1.2 — username lives here, not on user_profile, so signup is one insert.
    username: varchar('username', { length: 32 }).notNull(),
    usernameLower: varchar('username_lower', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('user_email_idx').on(t.email),
    // The sole arbiter of username uniqueness under D1.2.
    uniqueIndex('user_username_lower_idx').on(t.usernameLower),
  ],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('session_token_idx').on(t.token), index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    // scrypt hash via node:crypto, not bcrypt — see docs/security.md §2.1.
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('account_user_id_idx').on(t.userId),
    // getAuthTables() reports this composite unique; an earlier draft dropped it.
    uniqueIndex('account_issuer_account_id_idx').on(t.issuer, t.accountId),
  ],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/**
 * Non-identity profile fields (D1.4). Deliberately separate from `user` so a
 * failure here can never block account creation: written by an after-hook and
 * lazily created on first read if missing.
 *
 * avatarKey stays null in Phase 1 — nothing renders an avatar until Phase 6.
 */
export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  homeCity: varchar('home_city', { length: 120 }),
  avatarKey: text('avatar_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type User = typeof user.$inferSelect
export type UserProfile = typeof userProfile.$inferSelect
export type NewUserProfile = typeof userProfile.$inferInsert

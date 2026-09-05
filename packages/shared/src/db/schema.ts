import { sql } from 'drizzle-orm'
import {
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

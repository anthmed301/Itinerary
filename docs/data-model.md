# Data Model

> Postgres schema, written in Drizzle. Includes LexoRank-based ordering, three-state privacy, and the access-control model that makes per-row authorization safe at the API layer.

---

## 1. Schema overview

15 tables for v1. Grouped:

```
identity         user, account, session, verification        (Better Auth)
profile          user_profile, follow
trips            trip, day, activity, place, trip_member, trip_invite
social           trip_like, trip_comment, fork (denormalized into trip)
trip-mode        activity_checkin, location_share
ai               ai_generation
infra            rate_limit_bucket
```

`account`, `session`, `verification` are owned by Better Auth — we don't define them in our schema; we let it migrate them.

## 2. Drizzle schema (the contract)

`packages/db/src/schema/index.ts` exports everything; below is the canonical definition split into sub-files for readability.

### 2.1 Profile

```ts
// packages/db/src/schema/profile.ts
import { pgTable, text, timestamp, uniqueIndex, varchar, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth'

export const userProfile = pgTable('user_profile', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  username: varchar('username', { length: 32 }).notNull(),
  // citext-equivalent: store lowercase, validate at write
  usernameLower: varchar('username_lower', { length: 32 }).notNull(),
  displayName: varchar('display_name', { length: 80 }).notNull(),
  bio: text('bio'),
  avatarKey: text('avatar_key'),         // S3 key, e.g. "avatars/userId/v3.jpg"
  homeCity: varchar('home_city', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  usernameUnique: uniqueIndex('user_profile_username_lower_unique').on(t.usernameLower),
}))

export const follow = pgTable('follow', {
  followerId: text('follower_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  followeeId: text('followee_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.followerId, t.followeeId] }),
  // for "who follows me" queries
  byFollowee: { columns: [t.followeeId, t.createdAt] },
}))
```

### 2.2 Trips

```ts
// packages/db/src/schema/trip.ts
import { pgTable, text, timestamp, uuid, uniqueIndex, index, varchar, integer, boolean, date, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const tripPrivacy = pgEnum('trip_privacy', ['private', 'unlisted', 'public'])
export const tripRole = pgEnum('trip_role', ['owner', 'editor', 'viewer'])

export const trip = pgTable('trip', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 140 }).notNull(),
  summary: text('summary'),
  coverImageKey: text('cover_image_key'),    // S3
  destination: varchar('destination', { length: 200 }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  privacy: tripPrivacy('privacy').notNull().default('private'),
  // Scaffolding for v2 paid features. Free in v1.
  entitlements: jsonb('entitlements').$type<{
    advancedAi?: boolean
    bigCollab?: boolean
    export?: boolean
  }>().default({}).notNull(),
  // Discovery + social rollups (denormalized; updated by triggers/jobs)
  likeCount: integer('like_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  forkCount: integer('fork_count').notNull().default(0),
  forkedFromTripId: uuid('forked_from_trip_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byOwner: index('trip_owner_id_idx').on(t.ownerId, t.updatedAt),
  byPrivacyPublishedAt: index('trip_privacy_published_at_idx').on(t.privacy, t.publishedAt),
  fts: sql`CREATE INDEX IF NOT EXISTS trip_fts_idx ON trip USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(destination,'')))`,
}))

export const tripMember = pgTable('trip_member', {
  tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: tripRole('role').notNull(),
  invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.tripId, t.userId] }),
  byUser: index('trip_member_user_id_idx').on(t.userId),
}))

export const tripInvite = pgTable('trip_invite', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
  invitedBy: text('invited_by').notNull().references(() => user.id, { onDelete: 'cascade' }),
  emailLower: varchar('email_lower', { length: 320 }),  // null when invite is by username
  invitedUserId: text('invited_user_id').references(() => user.id, { onDelete: 'cascade' }),
  role: tripRole('role').notNull(),
  // single-use token; null when consumed
  token: varchar('token', { length: 64 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byToken: uniqueIndex('trip_invite_token_idx').on(t.token),
  byTrip: index('trip_invite_trip_id_idx').on(t.tripId),
}))
```

### 2.3 Days, activities, places

```ts
// packages/db/src/schema/activity.ts
import { pgTable, text, timestamp, uuid, varchar, integer, date, time, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { trip } from './trip'

// Foursquare-keyed shared cache. Same place referenced by many activities.
export const place = pgTable('place', {
  id: uuid('id').primaryKey().defaultRandom(),
  fsqId: varchar('fsq_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  category: varchar('category', { length: 100 }),
  address: text('address'),
  city: varchar('city', { length: 120 }),
  country: varchar('country', { length: 80 }),
  lat: decimal('lat', { precision: 9, scale: 6 }),
  lng: decimal('lng', { precision: 9, scale: 6 }),
  // raw subset of Foursquare response (hours, photos, etc.)
  data: jsonb('data').$type<Record<string, unknown>>(),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byFsq: uniqueIndex('place_fsq_id_idx').on(t.fsqId),
}))

export const day = pgTable('day', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
  // Date in trip's local TZ. Null only on the "ideas day" sentinel — but we model ideas as activities with day_id=null.
  date: date('date').notNull(),
  title: varchar('title', { length: 140 }),     // optional human title ("Arrival day")
  notes: text('notes'),
  // Day order is by date, but we keep an order_key for "no-date" trips later.
  orderKey: varchar('order_key', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byTripDate: index('day_trip_id_date_idx').on(t.tripId, t.date),
}))

export const activity = pgTable('activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
  // Null = lives in the ideas pool. NOT NULL is enforced by app logic, not DB.
  dayId: uuid('day_id').references(() => day.id, { onDelete: 'set null' }),
  placeId: uuid('place_id').references(() => place.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }).notNull(),
  notes: text('notes'),
  startTime: time('start_time'),     // local to trip
  endTime: time('end_time'),
  // LexoRank-style fractional ordering. See §3.
  orderKey: varchar('order_key', { length: 64 }).notNull(),
  // Source tracking for AI-suggested activities (UX shows a sparkle if true).
  aiSuggested: boolean('ai_suggested').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byTrip: index('activity_trip_id_idx').on(t.tripId),
  byDayOrder: index('activity_day_id_order_key_idx').on(t.dayId, t.orderKey),
  byTripIdeas: index('activity_trip_ideas_idx').on(t.tripId).where(sql`${t.dayId} IS NULL`),
}))
```

### 2.4 Social

```ts
// packages/db/src/schema/social.ts
import { pgTable, text, timestamp, uuid, varchar, primaryKey, index } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { trip } from './trip'

export const tripLike = pgTable('trip_like', {
  tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.tripId, t.userId] }),
  byUser: index('trip_like_user_id_idx').on(t.userId, t.createdAt),
}))

export const tripComment = pgTable('trip_comment', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  body: varchar('body', { length: 2000 }).notNull(),
  // soft delete to preserve thread shape
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byTripCreated: index('trip_comment_trip_id_created_at_idx').on(t.tripId, t.createdAt),
}))
```

### 2.5 Trip-mode

```ts
// packages/db/src/schema/trip-mode.ts
import { pgTable, text, timestamp, uuid, decimal, index } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { activity } from './activity'
import { trip } from './trip'

export const activityCheckin = pgTable('activity_checkin', {
  activityId: uuid('activity_id').notNull().references(() => activity.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }).defaultNow().notNull(),
  note: text('note'),
}, (t) => ({
  pk: primaryKey({ columns: [t.activityId, t.userId] }),
  byActivity: index('activity_checkin_activity_id_idx').on(t.activityId),
}))

// Time-bound, opt-in. Records are GC'd 24h after trip end.
export const locationShare = pgTable('location_share', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  lat: decimal('lat', { precision: 9, scale: 6 }).notNull(),
  lng: decimal('lng', { precision: 9, scale: 6 }).notNull(),
  accuracy: decimal('accuracy', { precision: 8, scale: 2 }),  // meters
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byTripUserTime: index('location_share_trip_user_time_idx').on(t.tripId, t.userId, t.recordedAt),
}))
```

### 2.6 AI + infra

```ts
// packages/db/src/schema/ai.ts
import { pgTable, text, timestamp, uuid, varchar, integer, jsonb } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { trip } from './trip'

export const aiGeneration = pgTable('ai_generation', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id').references(() => trip.id, { onDelete: 'set null' }),
  feature: varchar('feature', { length: 32 }).notNull(),     // 'suggester' | 'co_planner' | 'auto_planner' | 'enrich'
  promptTemplate: varchar('prompt_template', { length: 64 }).notNull(),  // version-tagged template id
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms'),
  // raw user prompt (truncated) for debugging only — purged after 30 days
  inputSummary: text('input_summary'),
  result: jsonb('result'),                                   // structured output we returned to client
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byUserDay: index('ai_generation_user_id_created_at_idx').on(t.userId, t.createdAt),
}))
```

```ts
// packages/db/src/schema/rate-limit.ts
export const rateLimitBucket = pgTable('rate_limit_bucket', {
  key: varchar('key', { length: 200 }).primaryKey(),  // e.g. 'ai:userId:dayBucket'
  count: integer('count').notNull().default(0),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
})
```

## 3. LexoRank ordering — the part that matters most

**Problem:** when a user drags activity B between A and C on Day 1, naïve "set order=2" requires updating every later activity on that day. With concurrent editors, you get conflicts.

**Solution:** every activity stores an `order_key` (string). To insert between A (key `a3`) and C (key `a5`), pick `a4`. To insert before A, pick something less than `a3`. The set of all possible string keys is dense enough that you can always find a fit.

**The library:** use [`fractional-indexing`](https://github.com/rocicorp/fractional-indexing) — it's the LexoRank approach, MIT-licensed, no deps.

```ts
// shared util
import { generateKeyBetween } from 'fractional-indexing'

// First insert
const k0 = generateKeyBetween(null, null)              // 'a0'
// Insert at end
const k1 = generateKeyBetween(k0, null)                 // 'a1'
// Insert between two
const kMid = generateKeyBetween('a0', 'a1')             // 'a0V'
```

Where this lives:

- **In the DB:** as `order_key` strings on `day` and `activity`.
- **In the Yjs doc:** the same strings live on each activity Y.Map. When a user drags, we recompute the key locally, set it on the Yjs Map, and Yjs broadcasts.
- **On the server:** the persistence extension diffs the Yjs doc, then writes `UPDATE activity SET order_key = $1 WHERE id = $2`.

**Why fractional indexing wins for collab:**

- Two users dragging the same item simultaneously produce two different keys; Yjs's last-write-wins resolves it. No cascade re-indexing of N rows.
- Insert between any two items is O(1).
- No global lock on the day.

**Pitfall: key drift.** After many inserts in the same gap, keys grow long (`a0VVVVV...`). When `len(orderKey) > 32`, schedule a background "compaction" pass for that day: read all activities ordered by current key, rewrite as evenly-spaced keys. Cheap, single trip, off the hot path.

## 4. Authorization model — the trust boundary

We enforce access in three layers, every layer assumes the next can fail:

1. **tRPC middleware** (`server/trpc/middleware/trip-access.ts`) — fast, runs first.
2. **Drizzle query patterns** — every `trip`-scoped query joins through `trip_member` for user-scoped reads.
3. **Hocuspocus auth extension** — connection-time JWT validation including role.

We do **not** use Postgres RLS. Reasons:
- We're not exposing the DB to clients (Supabase pattern), so RLS adds complexity without payoff.
- All access flows through our own server code; centralized authz in tRPC is auditable.

But we **do** test it like RLS: every privileged tRPC procedure has a unit test with three users (owner, editor, viewer, stranger) verifying expected pass/fail.

```ts
// server/trpc/middleware/trip-access.ts (sketch)
export const requireTripAccess = (minRole: 'viewer' | 'editor' | 'owner') =>
  middleware(async ({ ctx, input, next }) => {
    const tripId = (input as { tripId: string }).tripId
    const member = await ctx.db.query.tripMember.findFirst({
      where: and(eq(tripMember.tripId, tripId), eq(tripMember.userId, ctx.userId)),
    })
    if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
    if (!roleSatisfies(member.role, minRole)) throw new TRPCError({ code: 'FORBIDDEN' })
    return next({ ctx: { ...ctx, member } })
  })

const roleRank = { viewer: 1, editor: 2, owner: 3 } as const
const roleSatisfies = (have: TripRole, need: TripRole) => roleRank[have] >= roleRank[need]
```

## 5. Indexes — the ones that matter

| Index | Query it serves |
|---|---|
| `trip(owner_id, updated_at)` | "My trips" list, sorted recency |
| `trip(privacy, published_at)` | Explore feed |
| `trip` GIN on tsvector | Search (titles, summaries, destinations) |
| `activity(day_id, order_key)` | Render a day in order |
| `activity(trip_id) WHERE day_id IS NULL` | Render the ideas pool |
| `trip_member(user_id)` | "Trips shared with me" |
| `follow(followee_id, created_at)` | "Followers of X" |
| `trip_like(user_id, created_at)` | "Trips I liked" |
| `trip_comment(trip_id, created_at)` | Comments thread |
| `place(fsq_id) UNIQUE` | Foursquare lookup cache |
| `ai_generation(user_id, created_at)` | Daily token usage rollup |
| `location_share(trip_id, user_id, recorded_at)` | Latest location per user in trip |

## 6. Triggers + denormalized counters

We run two `AFTER INSERT/DELETE` triggers — the only triggers in the system:

```sql
-- trip.like_count
CREATE OR REPLACE FUNCTION bump_trip_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE trip SET like_count = like_count + 1 WHERE id = NEW.trip_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE trip SET like_count = like_count - 1 WHERE id = OLD.trip_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trip_like_count_trigger
AFTER INSERT OR DELETE ON trip_like
FOR EACH ROW EXECUTE FUNCTION bump_trip_like_count();
```

Same shape for `comment_count` and `fork_count`. Comments use `deletedAt IS NULL` filter when computing displayed count.

## 7. Migrations

- Drizzle Kit generates SQL migrations into `packages/db/migrations/`.
- Migrations are committed to git.
- Apply on boot in dev (`drizzle-kit push:pg`); apply via deploy step in production (`drizzle-kit migrate`).
- Never hand-edit a generated migration. If you need a custom step (triggers, FTS index), write it as a new numbered migration file in `packages/db/migrations/custom/`.

## 8. Seed + factories

`packages/test-utils/factories.ts` exports:

```ts
makeUser({ ... })
makeTrip({ ownerId, members?, days?, activities? })
makeActivity({ tripId, dayId?, orderKey?, ... })
```

Used in Playwright `globalSetup.ts` for e2e and Vitest for unit tests. Reset DB between Playwright runs via `TRUNCATE ... CASCADE`.

## 9. Data lifecycle + retention

| Data | Retention | Mechanism |
|---|---|---|
| `location_share` | Deleted 24h after trip end OR on user revoke | Nightly Lambda |
| `ai_generation.input_summary` | Purged after 30 days | Nightly Lambda |
| Yjs doc history | Compacted every 7 days; full snapshots kept indefinitely | In-process GC pass |
| Soft-deleted comments | Hard-deleted after 90 days | Nightly Lambda |
| User-requested deletion (account) | Hard-cascade within 30 days | tRPC `account.delete` schedules a job |

## 10. What's NOT in the schema (and why)

| Not modeled | Why |
|---|---|
| Per-day or per-activity comments | v2. Schema can add a `target_id` + polymorphic `target_kind` column without migration if we plan now: stored on a future `comment` table, not on `trip_comment`. |
| Group chat | v2. Will get its own `trip_chat_message` table when we add it. |
| Push notification tokens | v2 (mobile). |
| Stripe subscriptions | v2. Entitlement scaffolding is on `trip.entitlements` JSONB. |
| Audit log | v2. Add when we ship admin tooling. |
| Friend graph (vs follow) | We chose follow as the only social edge. Symmetrical "friend" is more work for negligible product gain right now. |

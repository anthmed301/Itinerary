# API

> tRPC v11 routers, key procedures, error model, and rate limits. The full request surface is mapped here.

---

## 1. Router shape

```
appRouter
├── auth          (mostly delegated to Better Auth REST routes — see §6)
├── profile       me, byUsername, update, uploadAvatarUrl
├── follow        follow, unfollow, listFollowers, listFollowing
├── trip          create, byId, listMine, update, delete, publish, unpublish, fork
├── tripMember    invite, listMembers, updateRole, remove, leave
├── tripInvite    accept, reject, byToken
├── day           create, update, delete, reorder
├── activity      create, update, delete, move, batchReorder
├── place         search, byFsqId
├── trip.social   like, unlike, listLikers
├── trip.comment  create, list, delete
├── explore       feed, trending, search
├── ai            stream      (SSE; not tRPC, see §7)
├── tripMode      checkIn, uncheckIn, listCheckIns, shareLocation, stopSharing, listSharedLocations
└── upload        signTripCoverUrl, signActivityImageUrl
```

All inputs validated with Zod; all outputs are typed inferred. The web client uses `@trpc/react-query` so every query maps to TanStack Query hooks.

## 2. Context

```ts
// server/trpc/context.ts
export async function createContext({ req, res }: { req: NextRequest, res: NextResponse }) {
  const session = await getSession(req)         // Better Auth
  return {
    db: drizzleClient,
    userId: session?.user.id ?? null,
    user: session?.user ?? null,
    req,
    res,
  }
}
```

## 3. Middleware stack

Every protected procedure runs through a chain. Middlewares short-circuit on failure with structured errors.

```ts
// server/trpc/middleware/auth.ts
export const requireAuth = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

// server/trpc/middleware/rate-limit.ts
export const rateLimit = (key: string, limit: number, windowSec: number) =>
  middleware(async ({ ctx, next }) => {
    const bucketKey = `${key}:${ctx.userId ?? ctx.req.ip}:${Math.floor(Date.now() / (windowSec * 1000))}`
    const result = await consumeBucket(ctx.db, bucketKey, limit, windowSec)
    if (!result.allowed) throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit hit. Try again in ${result.retryAfterSec}s.`,
    })
    return next()
  })
```

Compose:

```ts
export const protectedProcedure = t.procedure.use(requireAuth)
export const tripViewProcedure = protectedProcedure.use(requireTripAccess('viewer'))
export const tripEditProcedure = protectedProcedure.use(requireTripAccess('editor'))
export const tripOwnerProcedure = protectedProcedure.use(requireTripAccess('owner'))
```

## 4. Procedure signatures (the surface area you'll actually use)

### 4.1 Trips

```ts
trip.create({
  title: z.string().min(1).max(140),
  destination: z.string().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
})
// → { tripId: string }

trip.byId({ tripId: z.string().uuid() })
// → { trip, days, activities, ideas, members, role: 'owner'|'editor'|'viewer'|null }

trip.listMine({ cursor: z.string().optional() })
// → { items: TripCard[], nextCursor: string|null }

trip.update({ tripId, patch: TripPatchSchema })
// editor+

trip.publish({ tripId })       // owner; sets privacy='public', publishedAt=now
trip.unpublish({ tripId })     // owner

trip.fork({ tripId })          // any user with view access; deep-copies trip + days + activities; sets forkedFromTripId
// → { newTripId: string }
```

### 4.2 Days + activities

```ts
day.create({ tripId, date, title?, afterDayId? })
day.update({ dayId, patch })
day.delete({ dayId })
day.reorder({ dayId, beforeDayId?: string, afterDayId?: string })

activity.create({
  tripId,
  dayId: z.string().uuid().nullable(),     // null = ideas pool
  title: z.string().min(1).max(200),
  startTime: z.string().regex(TIME_RE).optional(),
  endTime: z.string().regex(TIME_RE).optional(),
  notes: z.string().max(2000).optional(),
  fsqPlaceId: z.string().optional(),       // server resolves to placeId
  beforeActivityId: z.string().uuid().optional(),
  afterActivityId: z.string().uuid().optional(),
  aiSuggested: z.boolean().default(false),
})
// → { activityId, orderKey }

activity.move({
  activityId: z.string().uuid(),
  toDayId: z.string().uuid().nullable(),   // null = move to ideas
  beforeActivityId: z.string().uuid().optional(),
  afterActivityId: z.string().uuid().optional(),
})

// Batch reorder used by drag-and-drop multi-select; computes one orderKey per moved activity.
activity.batchReorder({
  tripId,
  moves: z.array(z.object({
    activityId: z.string().uuid(),
    toDayId: z.string().uuid().nullable(),
    beforeActivityId: z.string().uuid().optional(),
    afterActivityId: z.string().uuid().optional(),
  })).max(50),
})
```

> Note: Drag-and-drop in the trip view goes through Yjs in real-time, *not* tRPC. The Yjs persistence extension on Hocuspocus writes the resulting `orderKey` change to Postgres. tRPC mutations like `activity.move` are used for non-collab paths (e.g. moving from another user's view of a trip you own privately). See `docs/realtime-collab.md` §4.

### 4.3 Place search

```ts
place.search({
  query: z.string().min(1).max(120),
  near: z.string().optional(),               // city or coords "37.7,-122.4"
  category: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
// 1. Hits Foursquare /places/search
// 2. Caches each result row in `place` table
// 3. Returns canonical place objects (with our place.id)
// → { results: Place[] }

place.byFsqId({ fsqId })  // resolves a Foursquare ID into our Place row, fetching if not cached
```

### 4.4 Members + invites

```ts
tripMember.invite({
  tripId,
  by: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('username'), username: z.string() }),
    z.object({ kind: z.literal('email'), email: z.string().email() }),
  ]),
  role: z.enum(['editor', 'viewer']),
})
// owner only. by:username creates direct trip_member; by:email creates trip_invite + sends email.

tripMember.updateRole({ tripId, userId, role })          // owner only; can't change own role
tripMember.remove({ tripId, userId })                    // owner only
tripMember.leave({ tripId })                             // self; not allowed if you're the only owner

tripInvite.accept({ token })                              // signed-in user; creates trip_member
tripInvite.byToken({ token })                             // unauthenticated; returns { tripPreview, inviterName }
tripInvite.reject({ token })
```

### 4.5 Social

```ts
trip.social.like({ tripId })             // viewer+
trip.social.unlike({ tripId })

trip.comment.create({ tripId, body: z.string().min(1).max(2000) })
trip.comment.list({ tripId, cursor? })   // keyset by created_at
trip.comment.delete({ commentId })       // author only

follow.follow({ userId })
follow.unfollow({ userId })
follow.listFollowers({ userId, cursor? })
follow.listFollowing({ userId, cursor? })
```

### 4.6 Explore

```ts
explore.feed({
  cursor: z.string().optional(),
  filter: z.enum(['recent', 'popular', 'following']).default('recent'),
})
// Keyset pagination over (publishedAt, id). For 'following', filter by joined `follow` of current user.

explore.search({ q: z.string().min(2).max(80), cursor? })
// Postgres FTS across public trips + users (UNION). Returns mixed result type.

explore.trending({})  // 24h likes leader, public trips only; cached 60s in HTTP layer.
```

### 4.7 Trip-mode

```ts
tripMode.checkIn({ activityId, note? })
tripMode.uncheckIn({ activityId })
tripMode.listCheckIns({ tripId })

tripMode.shareLocation({ tripId, lat, lng, accuracy? })
tripMode.stopSharing({ tripId })                          // hard-deletes all my location_share rows for this trip
tripMode.listSharedLocations({ tripId })
// returns latest location per user (one row per member who's currently sharing).
```

### 4.8 Uploads

```ts
upload.signTripCoverUrl({ tripId, contentType, byteLength })
// → { uploadUrl, key, expiresAt }
// Client PUTs the file to S3 directly, then calls trip.update({ coverImageKey: key }).

upload.signActivityImageUrl({ activityId, contentType, byteLength })
```

## 5. Error model

```ts
// All errors are TRPCError with code + message. Codes we use:
UNAUTHORIZED         // not signed in
FORBIDDEN            // signed in but lacks permission for this trip
NOT_FOUND            // resource missing or hidden
BAD_REQUEST          // input failed validation (Zod handles auto-formatting)
CONFLICT             // username taken, invite already used, fork-of-private
TOO_MANY_REQUESTS    // rate limit hit; message contains retryAfterSec
INTERNAL_SERVER_ERROR
```

Client errors include a `data.zodError` payload from `@trpc/server` when validation fails — the form layer hooks straight into react-hook-form's `setError`.

## 6. Auth routes (Better Auth)

Better Auth ships its own REST routes, mounted at `/api/auth/*`. We don't wrap them in tRPC; Better Auth's client hooks (`useSession`, `signIn`, `signUp`) are perfectly good. Our tRPC `auth` router is small:

```ts
auth.me({})                         // returns current user + profile or null
auth.requestEmailVerification({})    // resends; rate-limited 1/min
```

Sessions are cookie-based; tRPC pulls userId from the session in `createContext`.

## 7. AI streaming endpoint

AI uses Server-Sent Events, not tRPC subscriptions, because:
- We need bidirectional streaming for tool calls (Tavily web search round-trips).
- Vercel AI SDK + Gemini support streaming natively over fetch + SSE.
- TanStack Query has weak support for SSE; we use custom hooks.

```
POST /api/ai/stream
Body: { feature: 'suggester'|'co_planner'|'auto_planner'|'enrich', tripId, context }
→ SSE stream with events:
   data: { type: 'token', text }
   data: { type: 'tool', name: 'webSearch', input }
   data: { type: 'tool_result', name, output }
   data: { type: 'final', result: <ZodSchemaForFeature> }
   data: { type: 'error', message }
```

Full prompt and result schemas live in `docs/ai-integration.md`.

## 8. Rate limits — the policy

| Path | Limit | Window | Reasoning |
|---|---|---|---|
| `auth.signUp` | 3 | 1h per IP | Anti-spam |
| `auth.signIn` | 10 | 5m per IP | Brute-force |
| `auth.requestEmailVerification` | 1 | 60s per user | SES cost |
| `tripMember.invite (email)` | 20 | 1h per user | SES + abuse |
| `place.search` | 60 | 1m per user | Foursquare quota |
| `ai.stream` | 30 generations | 24h per user (free tier) | Gemini quota |
| `trip.publish` | 10 | 24h per user | Spam-on-Explore |
| `trip.comment.create` | 30 | 1h per user | Spam |
| `trip.fork` | 50 | 24h per user | Stop fork-spam-bots |
| `upload.sign*Url` | 100 | 1h per user | S3 cost |

Buckets stored in `rate_limit_bucket` (Postgres). When we add Redis (post-launch), swap implementation behind the same `consumeBucket` interface.

## 9. Pagination — the only pattern

Keyset pagination, always. Never `OFFSET`.

```ts
// helper
function keysetCursor<T>({ orderBy, lastRow }: { ... }) {
  return Buffer.from(JSON.stringify({ ts: lastRow.createdAt, id: lastRow.id })).toString('base64url')
}

// usage in trip.listMine
const where = and(
  eq(trip.ownerId, ctx.userId),
  cursor
    ? or(
        lt(trip.updatedAt, cursor.ts),
        and(eq(trip.updatedAt, cursor.ts), lt(trip.id, cursor.id))
      )
    : undefined,
)
const items = await ctx.db.select().from(trip).where(where).orderBy(desc(trip.updatedAt), desc(trip.id)).limit(21)
const hasMore = items.length > 20
return { items: items.slice(0, 20), nextCursor: hasMore ? keysetCursor(...) : null }
```

Default page size: 20. Max: 50.

## 10. Idempotency for mutations

For mutations that could be retried by network conditions (`trip.create`, `tripMode.checkIn`, `trip.fork`), we accept an optional `clientToken` UUID. Server stores last-seen tokens for 24h in a `mutation_log` (in-memory + DB-backed at scale). Same token returns the original result; no duplicate writes. Implemented as a tRPC middleware:

```ts
// server/trpc/middleware/idempotent.ts
export const idempotent = middleware(async ({ ctx, input, next, path }) => {
  const token = (input as { clientToken?: string })?.clientToken
  if (!token) return next()
  const existing = await ctx.db.query.mutationLog.findFirst({ where: ... })
  if (existing) return existing.result as never
  const result = await next()
  await ctx.db.insert(mutationLog).values({ token, path, userId: ctx.userId, result, createdAt: new Date() })
  return result
})
```

## 11. Versioning

We don't version routes for v1 (single client). When iOS lands and a route signature must change, prefer additive changes; reserve `v2.*` namespacing if needed.

## 12. What's deliberately not in the API

| Missing | Why |
|---|---|
| Webhooks | No third-party integrations need them yet. |
| Realtime tRPC subscriptions | Yjs covers all live-update needs. SSE covers AI streaming. |
| Admin endpoints | Build admin in a separate `apps/admin` app post-launch. |
| Public REST API | Not a developer platform. We can introspect tRPC routes for an OpenAPI doc later (trpc-openapi) if needed. |

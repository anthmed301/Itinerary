# Real-time Collaboration

> Yjs CRDT + Hocuspocus on AWS. Per-trip collaborative document, conflict-free reordering, Postgres persistence, presence + awareness. This is the most opinionated piece of the system — read carefully.

---

## 1. The shape of the Yjs document

For each trip, exactly one Yjs document lives in memory on Hocuspocus:

```
TripDoc                                Y.Doc
├── meta: Y.Map                        # title, summary, dates, destination, coverImageKey
├── days: Y.Array<Y.Map>                # ordered by orderKey
│   └── (each Y.Map): id, date, title, notes, orderKey
├── activities: Y.Map<string, Y.Map>    # keyed by activityId for O(1) lookup
│   └── (each Y.Map): id, dayId(nullable), title, notes, startTime, endTime,
│                     orderKey, placeId, aiSuggested
└── notes: Y.Text                       # free-text trip-wide notes (optional, post-v1)
```

**Why these structures:**
- `Y.Map` for entities — it gives us field-level CRDT semantics (two users editing different fields of the same activity merge cleanly).
- `Y.Array<Y.Map>` for days — order matters, but day-level reordering is rare; an array is simpler than another orderKey scheme.
- `Y.Map<id, Y.Map>` for activities — random access by id is the common operation (every drag computes "what's between A and C?"), so a keyed map beats an array. We rebuild day-ordered lists from the `dayId` and `orderKey` fields client-side.

The shared schema lives in `packages/yjs-schema/` so both web client and Hocuspocus persistence extension import the same shape.

```ts
// packages/yjs-schema/src/index.ts
import * as Y from 'yjs'

export type TripDocShape = {
  meta: { title: string; summary: string; ... }
  activities: Record<string, ActivityShape>
  days: DayShape[]
}

export function getMeta(doc: Y.Doc): Y.Map<unknown> { return doc.getMap('meta') }
export function getActivities(doc: Y.Doc): Y.Map<Y.Map<unknown>> { return doc.getMap('activities') }
export function getDays(doc: Y.Doc): Y.Array<Y.Map<unknown>> { return doc.getArray('days') }
```

## 2. Topology: client ↔ Hocuspocus ↔ Postgres

```
[Browser A]──┐
             ├──WSS──→ [Hocuspocus on ECS Fargate] ──→ [Postgres: trip / day / activity]
[Browser B]──┘                                          (via Drizzle, persistence ext.)
```

**Connection lifecycle:**

1. Client requests a Yjs JWT from Next.js: `POST /api/hocuspocus/token { tripId }`. Server verifies trip access, returns a short-lived (30 min) JWT containing `userId`, `tripId`, `role`, `displayName`, `avatarKey`.
2. Client opens `wss://realtime.tripi.app/?token=…` (or local equivalent).
3. Hocuspocus `onAuthenticate` validates the JWT signature and parameters; rejects mismatched `tripId` or expired tokens.
4. `onLoadDocument` either loads from in-memory cache or rehydrates from Postgres (see §3).
5. The doc is broadcast as the initial state; client's local Yjs doc applies it.
6. Subsequent updates flow bidirectionally as Yjs binary updates.

**Why ECS Fargate:**
- Stateful but lightweight; persists docs in memory between connections.
- Single-AZ for POC, multi-AZ behind ALB for production.
- Container image rebuilds on every commit to `services/realtime/`.

## 3. Persistence pipeline

Postgres is the source of truth for the *resolved* state (rows in `day` and `activity`). The Yjs binary update log is the source of truth for *concurrent edits*. We need both because:
- Reading a trip in the browser (without entering edit mode) shouldn't require booting a Yjs doc.
- The Explore feed, search, and the public-trip page render from row data, not from Yjs binary.

So persistence is **two-way**:

### 3.1 Yjs → Postgres (write-through, debounced)

Custom Hocuspocus extension watches doc updates and, after a 500ms quiet period (or every 5s under continuous editing, or on `onDisconnect`), runs:

```ts
// services/realtime/src/extensions/persistence.ts (sketch)
export class PostgresPersistence implements Extension {
  async onChange({ documentName, document }: onChangePayload) {
    this.scheduleFlush(documentName, document)
  }

  async onDisconnect({ documentName, document }: onDisconnectPayload) {
    await this.flush(documentName, document)
  }

  private async flush(documentName: string, doc: Y.Doc) {
    const tripId = parseTripId(documentName)
    const tx = db.transaction(async (tx) => {
      // Upsert meta
      const meta = getMeta(doc).toJSON() as TripMeta
      await tx.update(trip).set({ title: meta.title, summary: meta.summary, ... }).where(eq(trip.id, tripId))

      // Upsert each day (id, date, orderKey)
      for (const day of getDays(doc).toArray()) {
        const d = day.toJSON()
        await tx.insert(dayTbl)
          .values({ id: d.id, tripId, date: d.date, title: d.title, orderKey: d.orderKey })
          .onConflictDoUpdate({ target: dayTbl.id, set: { date: d.date, title: d.title, orderKey: d.orderKey } })
      }

      // Upsert activities; the Yjs map is the truth
      const activitiesMap = getActivities(doc)
      for (const [id, m] of activitiesMap.entries()) {
        const a = m.toJSON()
        await tx.insert(activity)
          .values({ id, tripId, ...a })
          .onConflictDoUpdate({ target: activity.id, set: { ...a, updatedAt: new Date() } })
      }

      // Delete activities that are in DB but not in Yjs doc
      const yjsIds = [...activitiesMap.keys()]
      await tx.delete(activity).where(and(eq(activity.tripId, tripId), notInArray(activity.id, yjsIds)))

      // Persist binary state for fast rehydrate
      const stateUpdate = Y.encodeStateAsUpdate(doc)
      await tx.update(trip).set({
        yjsState: stateUpdate,                         // bytea column
        yjsStateUpdatedAt: new Date(),
      }).where(eq(trip.id, tripId))
    })
  }
}
```

> Add a `yjsState bytea` and `yjsStateUpdatedAt timestamptz` column to `trip` for this. They never leave the server.

### 3.2 Postgres → Yjs (rehydrate on first load)

When Hocuspocus boots a doc for a trip that's not in memory:

```ts
async onLoadDocument({ documentName, context }) {
  const tripId = parseTripId(documentName)
  const row = await db.query.trip.findFirst({ where: eq(trip.id, tripId), columns: { yjsState: true } })

  const doc = new Y.Doc()
  if (row?.yjsState) {
    Y.applyUpdate(doc, row.yjsState)
  } else {
    // First-ever load: seed from row data
    await seedFromRows(doc, tripId)
  }
  return doc
}
```

`seedFromRows` reads `trip`, `day`, `activity` from Postgres and populates the Yjs Maps.

### 3.3 Why both — what the binary state buys us

If we rehydrated only from rows on every cold load, two clients reconnecting after a server restart would lose any in-flight conflicting edits that hadn't been resolved into rows yet. The binary state preserves the CRDT history. We snapshot it on every flush; even after a hard crash, we can rebuild any client's local state perfectly.

## 4. Drag-and-drop interplay

The DnD spec lives in `docs/design-system.md` §7; here we cover how it talks to Yjs.

```ts
// In a React component (apps/web/src/components/trip/ActivityCard.tsx)
import { useYDoc } from '@/lib/yjs/provider'
import { generateKeyBetween } from 'fractional-indexing'
import { getActivities, getDays } from '@tripi/yjs-schema'

function onDragEnd(event) {
  const doc = useYDoc()
  doc.transact(() => {
    const activities = getActivities(doc)
    const moved = activities.get(event.activityId)!
    moved.set('dayId', event.toDayId)

    const beforeKey = event.beforeActivityId ? activities.get(event.beforeActivityId)?.get('orderKey') as string | null : null
    const afterKey = event.afterActivityId ? activities.get(event.afterActivityId)?.get('orderKey') as string | null : null
    moved.set('orderKey', generateKeyBetween(beforeKey, afterKey))
  })
  // The Yjs binding broadcasts. No tRPC call.
}
```

**What about two users dragging the same item to different places at the same time?**
- Both writes happen in their local Yjs doc. Yjs broadcasts both. The Maps merge: last-writer-wins per field. The user whose write arrived last wins on the server's view.
- This is acceptable for trip planning. We add a subtle "snap-back" animation if the server's resolved position differs from what the user dropped at, but that's UX polish, not a requirement.

## 5. Presence + awareness

Hocuspocus ships an awareness provider. We use it for:

| Field | Source | Used by |
|---|---|---|
| `userId`, `displayName`, `avatarKey` | JWT | Avatar stack at top of trip |
| `cursor: { dayId, activityId, fieldName }` | Updated as user focuses inputs | Showing "Sam is editing the Day 2 title" |
| `selection` | DOM selection in textarea | Multi-cursor in shared notes |
| `isOnline` | Connection state | Online indicator |

```ts
// apps/web/src/lib/yjs/awareness.ts
const awareness = provider.awareness
awareness.setLocalStateField('cursor', { dayId, activityId, fieldName: 'notes' })

awareness.on('change', () => {
  const states = Array.from(awareness.getStates().values())
  setCollaborators(states)
})
```

Awareness is ephemeral (not persisted). When everyone disconnects, presence is cleared.

## 6. Auth at the WSS boundary

Two checks, both required:

1. **Connection-time JWT validation.** The `?token=…` param contains a JWT signed by the Next.js server's secret. Hocuspocus's `onAuthenticate` decodes, verifies signature, and checks `tripId` matches the `documentName`.
2. **Per-message authorization (lightweight).** We don't validate every Yjs binary update against the role — that would be expensive and Yjs doesn't expose a clean hook. Instead, the JWT carries a `role`, and the server's persistence extension refuses to flush updates from a `viewer` JWT (`onChange` checks role; if viewer, log + skip). This means a viewer's local edits *appear* to work in their own browser briefly, then disappear when the persistence extension drops them. To avoid the bad UX, the client also gates inputs behind `useTripRole().canEdit`.

```ts
// services/realtime/src/extensions/auth.ts
async onAuthenticate({ token, documentName }) {
  const payload = jwt.verify(token, env.HOCUSPOCUS_JWT_SECRET) as JWTPayload
  if (payload.tripId !== parseTripId(documentName)) throw new Error('tripId mismatch')
  return { userId: payload.userId, role: payload.role, displayName: payload.displayName }
}

// services/realtime/src/extensions/persistence.ts
async onChange({ context, document, documentName }) {
  if (context.role === 'viewer') return  // ignore viewer edits
  // …schedule flush as in §3
}
```

## 7. Scaling notes

| Stage | Concurrent editors | Hocuspocus shape | Notes |
|---|---|---|---|
| POC | 1–10 | 1 task, 0.5 vCPU / 1 GB | Single-AZ; restart = brief disconnect |
| Soft launch | 10–500 | 1–2 tasks behind ALB | Sticky sessions on ALB target group |
| Public | 500–5000 | 3–10 tasks + Redis | `@hocuspocus/extension-redis` for cross-task pub/sub |
| Scale | 5000+ | Per-trip sharding by hash(tripId) % N | Routing layer in front of Hocuspocus |

We don't optimize past 500 editors until we're at that load. Premature multi-instance work is wasted.

## 8. Health, metrics, and runbooks

Hocuspocus exposes:
- `GET /healthz` → 200 if process alive
- `GET /metrics` → Prometheus format: docs_loaded, connections_open, updates_per_sec, persist_failures

Alerts:
- Persist failure count > 0 in 5min → page (data integrity).
- Open connections drop to 0 across all tasks → page (probably a network issue or all tasks died).
- Doc count > 1000 in memory on a single task → scale up.

When Hocuspocus crashes mid-edit:
- Clients auto-reconnect via Hocuspocus's built-in retry.
- Their local Yjs doc is preserved in memory; on reconnect, they sync the diff.
- If the doc didn't flush before the crash, the previous flushed binary is rehydrated; the local edits replay during sync. No data loss unless the server died *and* the client refreshed within a 500ms window.

## 9. Failure modes — explicit

| Failure | What happens | Mitigation |
|---|---|---|
| Hocuspocus task dies | Clients reconnect to next task; Yjs state rehydrates from `trip.yjsState` | Multi-task in production |
| Postgres write fails during flush | Retry with backoff; if 3 failures, alert; client never notices | Persistence extension wraps in try/retry |
| Client loses WSS | They keep editing offline (Yjs allows this); on reconnect, diffs sync | Built-in to Yjs |
| Client opens trip while flush is in progress | They might receive a slightly stale row state, but Yjs binary corrects within seconds | Acceptable |
| Two clients race on creating the same activity ID | UUIDv4 collision is astronomically unlikely; but Yjs Map keys are last-write-wins anyway | Non-issue |
| `viewer` JWT used by a malicious editor | Persistence extension drops their writes; they see local state diverge from server | Document the symptom in security.md |

## 10. What we will *not* build

| Not built | Why |
|---|---|
| Yjs subdocs (one doc per day) | Activities frequently move across days — that's a cross-doc operation. One trip = one doc is correct. |
| Custom CRDT | Yjs is mature, fast, and battle-tested. Roll-your-own is irresponsible. |
| Operational Transform (OT) instead of CRDT | OT requires a central authority for ordering; CRDT works offline. We'd lose offline edits with OT. |
| Cross-trip presence ("see who's online globally") | Not a useful product feature for v1. |
| Voice / video collab | Out of scope forever, probably. |

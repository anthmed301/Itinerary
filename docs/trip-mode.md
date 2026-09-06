# Trip-Mode

> The view that activates when a trip starts. Day-by-day timeline with current/next activity, per-activity check-ins, and opt-in shared live location among collaborators. **No group chat in v1.**

This is the feature most travel apps don't have. Most die after the booking step; Tether keeps earning attention during the trip itself.

---

## 1. Activation logic

A trip is in **trip-mode** for a viewer when:

```
trip.startDate ≤ today (in trip's local TZ) ≤ trip.endDate
```

Implementation:

- Every trip page render computes `tripPhase: 'planning' | 'live' | 'memories'`.
- `live` shows trip-mode UI; `planning` shows the editor; `memories` shows a read-mostly recap.
- The phase is computed in the same TZ as the trip's destination (best-effort; TZ resolved from the activity-with-most-locations on the start day, or fall back to user's browser TZ).
- A "Switch to planner" toggle is always present in `live` mode for a power user who wants to edit during the trip.
- A "Switch to trip-mode" toggle is present in `planning` mode if `today ≥ startDate - 1` (so users can preview the day before).

```ts
// apps/web/src/lib/trip/phase.ts
export function tripPhase(trip: { startDate: string | null; endDate: string | null }, now: Date, tz: string): TripPhase {
  if (!trip.startDate) return 'planning'
  const today = formatLocalDate(now, tz)
  if (today < trip.startDate) return 'planning'
  if (trip.endDate && today > trip.endDate) return 'memories'
  return 'live'
}
```

## 2. The trip-mode layout

```
┌─────────────────────────────────────────────────────┐
│ Header: Trip title · Day 3 of 5 · Sun Jun 14        │
│ Avatars of online collaborators                     │
│─────────────────────────────────────────────────────│
│ Map (60% width)               │ Today (40% width)   │
│  - pinned activities for today│ ┌────────────────┐  │
│  - live locations of opt-ins  │ │ NOW            │  │
│                                │ │ Sushi Saito    │  │
│                                │ │ 8:30am — 9:30am│  │
│                                │ │ [✓ Check in]   │  │
│                                │ └────────────────┘  │
│                                │ ┌────────────────┐  │
│                                │ │ NEXT           │  │
│                                │ │ Imperial Palace│  │
│                                │ │ 10:00am        │  │
│                                │ └────────────────┘  │
│                                │ Later today        │  │
│                                │  - Lunch in Ginza  │  │
│                                │  - Bullet train…   │  │
│─────────────────────────────────────────────────────│
│ Day pills: [D1] [D2] [D3*] [D4] [D5]                │
└─────────────────────────────────────────────────────┘
```

- **NOW** card: the activity whose `[startTime, endTime]` window contains the current time (or the next one if no current). Big, sticky.
- **NEXT** card: the one after.
- **Later today**: a compact list.
- **Day pills**: tap to time-travel; you can scroll into the past or peek the next day. The currently-active day is starred.
- **Map**: today's pins + (opt-in) live dots.

On mobile widths (<768px), Map collapses behind a tab (Today / Map). Desktop default: side-by-side.

## 3. Check-ins

Tap "Check in" on any activity card → POST `tripMode.checkIn`. The card flips to "Checked in by Sam at 8:42am." Every member sees the check-in (broadcast via Yjs awareness or a tRPC subscription — we use a simple `tRPC.tripMode.listCheckIns` query with a 30s SWR refetch to avoid building a separate channel).

```ts
// tRPC procedure (already in api.md §4.7)
tripMode.checkIn({ activityId, note?: z.string().max(500).optional() })
```

Schema (`activity_checkin`) is a many-to-many: any member can check in to the same activity. Notes are optional.

UI rules:
- Activities can be checked in even if `now > endTime` (post-hoc OK).
- Once checked-in, the card shows the checkers' avatars at the bottom-left.
- Owner can "uncheck" their own check-in within 24h; can't undo others.
- Check-in is independent per user — Sam checking in doesn't auto-check-in Pat.

## 4. Live location sharing — privacy is the design

This is the most sensitive feature in the app. Build it like security software.

### 4.1 The model
- **Off by default.** Always.
- Per-trip toggle in trip-mode header: "Share my location with this trip" (off → on).
- When on, browser `navigator.geolocation.watchPosition` fires every ~30s; client throttles writes to **60s** intervals (or on >50m change).
- Each ping `POST /api/trpc/tripMode.shareLocation { tripId, lat, lng, accuracy }`.
- Visible only to other members of *this* trip. Not to followers, not on the public trip page, not anywhere else.
- Tapping "Stop sharing" → `tripMode.stopSharing` → server **hard-deletes** all `location_share` rows for `(tripId, userId)` immediately and broadcasts a "stopped sharing" event so other clients clear the pin.

### 4.2 Storage rules
- TTL: 24h after `trip.endDate`. Nightly Lambda hard-deletes anything older.
- No backups of the `location_share` table to long-term S3.
- Server logs of location writes contain only `tripId` + `userId`, never lat/lng.

### 4.3 UI affordances
- A persistent "📍 Sharing" indicator near the top header while active. Clear state.
- Tapping the indicator shows a dialog: "You're sharing your location with N people in this trip. Stop sharing." — instantaneous off.
- After stopping, a toast: "Your location history for this trip was deleted."
- On a trip's `endDate + 24h`: client refuses to share location even if toggled on.

### 4.4 Permissions
- We use the standard browser geolocation permission. If the user denies at the OS level, we surface a help link explaining how to grant it. Never re-prompt within 7 days.
- iOS Safari: "Always allow" requires the page be added to home screen first; we tell users in a small modal if they hit the v2 mobile path.

### 4.5 Battery + network
- 60s throttle (configurable via `NEXT_PUBLIC_LOCATION_INTERVAL_SEC`).
- If the page is hidden (`document.hidden`), pause updates. Resume on visibility.
- On connection loss, queue up to 5 minutes of pings; on reconnect, send the most recent only.

## 5. Map rendering

```ts
// apps/web/src/components/trip-mode/Map.tsx (sketch)
const map = useMapbox()
useEffect(() => {
  // today's activity pins
  const features = todaysActivities
    .filter(a => a.place?.lat && a.place?.lng)
    .map(a => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.place.lng, a.place.lat] },
      properties: { activityId: a.id, title: a.title, status: checkinStatus(a) }
    }))
  map.getSource('activities').setData({ type: 'FeatureCollection', features })

  // live locations of collaborators
  const locFeatures = sharedLocations.map(l => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
    properties: { userId: l.userId, displayName: l.displayName, avatarKey: l.avatarKey }
  }))
  map.getSource('shared-locations').setData({ ... })
}, [todaysActivities, sharedLocations, checkins])
```

Pin styling:
- Activity pins: numbered (1-N for the day's order), filled when checked-in, outlined when pending.
- Shared-location pins: round avatar with a soft shadow; pulses subtly while live.

## 6. Notifications — what we do (and don't) in v1

| Event | v1 behavior | v2 |
|---|---|---|
| Activity start time approaches | In-app toast at `startTime - 15min` if the page is open | Web push; mobile push |
| Collaborator checks in | In-app toast | Push |
| New check-in note ("found a great spot") | In-app toast | Push |
| Friend posts new public trip | None | Push, if subscribed |

We deliberately skip web push in v1. It adds setup complexity (VAPID keys, service worker), nags users for permission, and most travelers have the app open on their laptop or phone browser anyway during trip-mode.

## 7. Trip-mode for solo travelers

If you're the only member of the trip, trip-mode still works:
- Timeline view, current/next, check-ins (private; no one to share with) — useful as a personal log.
- Location sharing is hidden (nothing to share with).
- After the trip, you can publish + share — your check-ins become part of the recap.

## 8. The "memories" phase

After `endDate`, the page shifts to `memories`:
- Header: "Tokyo · 5 days · 2026-06-12 to 2026-06-16"
- Each day is a collapsed timeline: "12 activities · 9 checked in"
- Activity cards show `checkedInAt` if set, photos uploaded during the trip, notes
- A big CTA: "Make this trip public on Explore" (if private/unlisted) — easiest moment to convert
- Forks made by other people surface as a small "N people forked this trip"

This phase is implicitly the social engagement loop — a trip becomes most postable right after it ends.

## 9. Edge cases

| Case | Behavior |
|---|---|
| Trip has no startDate set | `tripPhase = 'planning'` permanently |
| Trip startDate set but no endDate | After today ≥ startDate, stay in `live` until user manually ends |
| User in a different TZ from trip destination | Compute "today" in destination TZ; show banner: "Tokyo is 14h ahead of you" |
| Trip spans DST shift | Edge case, rare; we round-down activities to local date in destination TZ. No big deal. |
| Two members in different cities of a multi-city trip | Map auto-fits to all today's activities; live location pins show wherever each member is |
| User's device clock is wrong | Server is source of truth for `now`; client recomputes phase on every fetch |

## 10. What "great" looks like

A user opens Tether the morning of Day 1. They see today's plan, current activity highlighted, the map pre-zoomed to the right neighborhood. They tap "Check in" when they arrive at coffee. Their travel partner, on their own phone, sees their pin appear with a soft pulse. At 10am, the next activity card auto-promotes to NOW. They check in. Etc. After the trip, the recap is pre-written by their own actions; one tap publishes it.

## 11. What's deliberately NOT in v1 trip-mode

| Not built | Why |
|---|---|
| Group chat | High moderation surface; check-in notes serve the lightweight comms need |
| Polls / "where should we eat tonight?" | Feels like an everything-app; might come in v2 |
| Offline edit | Read-only offline cache covers 90% of the value; offline edit is hard |
| Photo upload mid-trip | Can be added in Phase 7.5 if we have time; deferred otherwise |
| Push notifications | Phase 9 / v2 |
| Public live location ("see where I am during my trip") | Privacy nightmare; never |
| Calendar export (.ics) | v2 |

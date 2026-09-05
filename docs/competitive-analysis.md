# Tripi — Competitive Landscape

> **Caveat:** This file was written **without live web search** (WebSearch was unavailable at draft time). All specific pricing, free-tier limits, and recent-feature claims below are from training-data and **must be verified before using as fact**. Items marked `⚠️verify` are highest-risk to be stale. The synthesis (gaps, positioning, risks) is based on the structural shape of the market and is robust to small price changes.
>
> To refresh: re-run a research agent with WebSearch + WebFetch granted, and replace the section between the markers `<!-- BEGIN_VERIFIED -->` and `<!-- END_VERIFIED -->`.

---

## 1. The market in one sentence

Trip planning is split into two camps that don't talk to each other: **legacy-bookings-glue tools** (TripIt) and **scrapbook-after-the-fact tools** (Polarsteps). The actual planning still happens in Google Sheets, Google Docs, and group chats. Newer AI-first tools (Mindtrip, Layla, etc.) try to disrupt with chat-based planning but mostly haven't replaced the Sheet either.

## 2. Competitor profiles

<!-- BEGIN_VERIFIED -->

### Wanderlog
The most direct competitor. ⚠️verify

- **Value prop:** Visual day-by-day trip planner with map, place suggestions, and basic collab.
- **Pricing:** Free tier; **Pro** ~$4.99/mo or ~$49/yr. ⚠️verify
- **Strengths:** Mature feature set, good map, large place catalog (Google Places-backed), iOS/Android apps, decent web app, multi-collaborator (with caveats), offline mobile mode on Pro.
- **Weaknesses (from observed user feedback):** UI feels dated and busy; collaborative editing is more "shared list" than real-time CRDT-grade; AI features are recent and feel bolted-on; mobile-first design hurts the desktop planning UX; export/import is paywalled; Pro paywalls feel arbitrary (e.g. multiple trips can be free-tier limited). ⚠️verify
- **Tripi can win on:** modern desktop-first UX, real-time multi-cursor editing, AI as core not bolt-on, social Explore feed (Wanderlog has discover but it's weak).

### TripIt (Concur / SAP)
The legacy leader. ⚠️verify

- **Value prop:** Forward booking confirmation emails to `plans@tripit.com`, get a unified itinerary.
- **Pricing:** Free; **Pro** ~$49/yr. ⚠️verify
- **Strengths:** Email-parsing is excellent and battle-tested; loyalty-program tracking; flight delay alerts (Pro); near-universal travel-blog mention.
- **Weaknesses:** Zero collaborative editing; UI looks like 2010; planning is essentially nonexistent (you organize what you already booked); no social layer; no AI; mobile-first; no Explore.
- **Tripi can win on:** TripIt is for *organizing what's booked*. Tripi is for *planning what to book*. Different jobs. Tripi can integrate ICS/email parsing later as a Pro feature without competing on TripIt's strength.

### Roadtrippers
Niche but loyal. ⚠️verify

- **Value prop:** Plan road trips with map-first routing and curated POIs along the way.
- **Pricing:** Free; **Plus** ~$30-40/yr. ⚠️verify
- **Strengths:** Best-in-class for road trips; routing through multiple stops; offline maps on Plus; vehicle-specific routing (RV).
- **Weaknesses:** Strictly road-trip; useless for flight-based travel; UI is functional, not delightful; collaborative editing is shallow; no social Explore.
- **Tripi can win on:** general-purpose travel (Tripi isn't a road-trip specialist; we don't compete head-on). Roadtrippers is a non-overlap mostly.

### Polarsteps
Trip-tracking, post-trip-focused. ⚠️verify

- **Value prop:** Track your trip route automatically and turn it into a beautiful timeline + printable photo book.
- **Pricing:** Free; **Premium** ~$29/yr. ⚠️verify
- **Strengths:** Stunning post-trip recap UX; passive auto-tracking via location; photo books are a genuine wow moment; loyal user base.
- **Weaknesses:** Almost no planning UI; collab features absent; social is one-way (you publish a "world feed"); not designed for pre-trip work.
- **Tripi can win on:** Tripi is *planning-first* with trip-mode + memories baked in. Polarsteps is recap-only. Tripi's "memories" phase is a softer Polarsteps; we can match the post-trip feel without forcing the pre-trip into a separate tool. **Note:** Polarsteps' photo book is a great upsell idea Tripi could copy in v2 paid tier.

### Travefy
B2B-leaning. ⚠️verify

- **Value prop:** Itinerary builder for travel agents to share polished proposals with clients.
- **Pricing:** Pro ~$59/mo for agents. ⚠️verify
- **Strengths:** Nice client-facing presentation mode; PDF/email export.
- **Weaknesses:** Not for end-consumer planning; no social; no real-time collab between travelers; agent-centric workflows.
- **Tripi can win on:** consumer use case; we don't target agents. Travefy is non-overlap.

### Kayak Trips
Bookings-aggregator's planning tab.

- **Value prop:** Auto-imports bookings parsed from Kayak/email and shows them as an itinerary.
- **Pricing:** Free.
- **Strengths:** Frictionless if you book through Kayak; mobile app integration with flight tracking.
- **Weaknesses:** Not a planning tool; no collab; no social.
- **Tripi can win on:** the entire pre-booking phase. Kayak Trips kicks in *after* a booking exists.

### Google Travel / Saved
Google's own offering.

- **Value prop:** Saves places to lists in Google Maps; aggregates bookings from Gmail.
- **Pricing:** Free.
- **Strengths:** Map data + Gmail data integration is unbeatable on its own turf.
- **Weaknesses:** Lists, not itineraries; no day structure; no collab beyond Maps list sharing; no AI specific to travel; no social discovery.
- **Tripi can win on:** structure (days, ordering, ideas pool). Maps lists are ad-hoc. Tripi is a real document.

### Notion / Google Sheets / Google Docs (the real competition)
The actual default for trip planning.

- **Strengths:** Free, flexible, social (anyone can be invited), works on any device, no data lock-in, real-time collab in Sheets/Docs is mature.
- **Weaknesses:** No travel-specific structure; no map; no place data; no AI tuned to travel; no trip-mode; no Explore community; you build everything from scratch each trip. The empty-spreadsheet problem.
- **Tripi can win on:** **all the structure**. Tripi is "Sheets but it knows what a trip is." This is the central pitch.

### Mindtrip ⚠️verify
AI-first planner. ⚠️verify

- **Value prop:** Chat-based trip planner. "Plan me a 5-day Tokyo trip."
- **Pricing:** Free with limits; paid tier ⚠️verify.
- **Strengths:** AI-native UX; conversational planning is genuinely fast for a first draft.
- **Weaknesses:** Output is a static itinerary, not an editable document; collab is weak; no social Explore; no trip-mode; chat-only paradigm has a ceiling — once you've planned the first draft, editing-by-chat is slower than direct manipulation.
- **Tripi can win on:** Tripi is **chat *and* drag-and-drop**. Both modalities. Mindtrip's reliance on chat-only is a deliberate constraint; we don't share it.

### Layla, GuideGeek, Vacay, Roam Around, Wonderplan ⚠️verify
Wave of 2023–2025 AI-first travel apps. Mostly chat-based. Many have stalled or pivoted. ⚠️verify

- **Common pattern:** chat → output a list/PDF → user copies into Sheets to actually plan.
- **Common weakness:** AI without persistence-as-document; output is fire-and-forget.
- **Tripi can win on:** treating AI output as *suggestions in a real document*, not as the document itself.

<!-- END_VERIFIED -->

## 3. The five gaps Tripi can exploit

Each named with the competitor that falls shortest.

### Gap 1: **Real-time multi-user editing of a planning document is essentially absent.**
Wanderlog has "shared trips" but they're not multi-cursor live; collaboration feels async. TripIt has none. Notion/Sheets has collab but no travel structure. **Tripi's Yjs CRDT + presence is genuinely differentiated** — and it's the table-stakes feature that makes group trips painless.

### Gap 2: **AI is everywhere but rarely as an editing partner.**
Mindtrip et al. give you AI-as-author. Wanderlog has AI-as-bolt-on. Nobody has AI that participates in an editable document the way Tripi's Co-planner does (proposes ops, user accepts). **The AI-as-collaborator-not-author posture is open.**

### Gap 3: **Trip-mode (the live-during-travel view) is unowned.**
Polarsteps is post-trip; everyone else stops engaging once the trip starts. **Tripi has the entire "trip is happening right now" attention space** to itself. The day-timeline + check-ins + opt-in location sharing is a complete feature kit no one else ships together.

### Gap 4: **Social discovery for *plans*, not just *photos*.**
Polarsteps' world feed is photo-based recaps. Wanderlog has a discover tab but it's an afterthought. **Tripi's Explore + fork-with-attribution lets the *itinerary itself* be the unit of social discovery.** A trip you can fork is dramatically more useful than a photo you can like.

### Gap 5: **Modern desktop-first design.**
Most of the field is mobile-first — which means the desktop experience is cramped. Real planning happens on a laptop with multiple tabs open. **Tripi's three-column desktop UI is unusual and matches the actual planning behavior.** Tablet/mobile follow.

## 4. Which Tripi features are genuinely differentiated?

| Feature | Differentiated? | Notes |
|---|---|---|
| Email/booking parsing | No | TripIt is best-in-class; we should integrate via ICS later, not compete |
| Drag-and-drop day planning | Marginal | Wanderlog has it; ours feels better but isn't unique |
| AI auto-planner | Marginal | Mindtrip / Layla offer it |
| AI co-planner (ops-based) | **Yes** | No one ships this exact pattern |
| Smart enrichment | Marginal | Wanderlog enriches via Google Places; same idea |
| Real-time multi-cursor collab | **Yes** | No competitor has it at this fidelity |
| Trip-mode timeline + check-ins + location | **Yes** | Pieces exist elsewhere; combination is unique |
| Fork-with-attribution | **Yes** | Sheets-copy works but isn't social; discovery loop is novel |
| Explore feed of itineraries | Marginal | Wanderlog tries; nobody nails it |
| Social follow + likes + comments | No | Standard |
| Modern design system | **Yes** in this category, niche | Most competitors look 2015-era |

**Three pillars are uniquely strong: real-time collab, trip-mode, and the AI-as-partner pattern.** Lead with these.

## 5. Positioning statement (one sentence)

> **Tripi is the trip-planning document — collaborative, AI-aware, and alive during the trip itself — that finally replaces the spreadsheet.**

Sub-tagline candidates:
- "Plan together. Travel together. Remember together."
- "The only planner that knows what a trip is."
- "Your travel doc, made for travelers."

## 6. Risk: which competitor would be most dangerous if they shipped X?

| Competitor | Feature that would hurt us | Probability |
|---|---|---|
| **Wanderlog** | Real-time multi-cursor collab + a strong AI co-planner | Medium. They have product muscle and could ship in 6–12 months. |
| **Notion** | A "Travel Plans" template with structured day blocks + map embedding | Medium-low. They drift toward verticals occasionally. |
| **Google Travel** | Itinerary editing layer over Maps lists with Gemini integration | High over 2 years. They have all the pieces; but Google ships travel slowly. |
| **TripIt** | Real planning UI on top of their inbox-parser | Low. SAP-owned; product velocity is dead. |
| **Mindtrip** | A real document UI with edit-by-drag in addition to chat | Medium. They could pivot. |

**The biggest risk is Wanderlog cloning our collab + AI experience while keeping their existing user base.** Mitigation: ship trip-mode (which they don't have a clear path to) as our most defensible feature, and lean into the social/Explore loop early.

## 7. What this means for the plan

Every choice in `PLAN.md` either ladders up to one of the five gaps or to a table-stakes table-stake. Concretely:

- **Phase 3 (Real-time collab) is non-negotiable for v1.** Drop it and we're a worse Wanderlog.
- **Phase 5 (AI in the document, not as the document) is non-negotiable.** Especially Co-planner — that's the differentiator vs Mindtrip.
- **Phase 7 (Trip-mode) is the moat.** Ship it solid; this is where we win the post-purchase battle that Polarsteps owns half of.
- **Phase 6 (Social) is what makes growth organic.** Without the fork-with-attribution loop, we're a private utility.
- **Marketing — borrow the "Plan in Tripi instead of Sheets" framing.** It's specific, true, and inverts the implicit user behavior.

## 8. Notes for next refresh

When WebSearch is granted, replace the `<!-- BEGIN_VERIFIED -->` block with current-pricing/feature-data from the agent. Specifically check:

- Wanderlog Pro pricing + free-tier trip limit
- Polarsteps Premium pricing + photo-book pricing
- Mindtrip's current state (alive? freemium model? social or not?)
- Roam Around / Layla / GuideGeek — alive or dead?
- Any new entrants since 2025 (search "AI trip planner 2026", "best itinerary app 2026")
- Reddit `/r/travel` and `/r/solotravel` recurring complaints about Wanderlog and TripIt

The synthesis (sections 3–7) likely doesn't need to change unless a major new entrant arrived.

# Design System

> Three brand directions to choose from, full design token spec, motion system, and the drag-and-drop interaction model. Tokens live in `packages/tokens/`; all components consume them.

---

## 1. Brand directions — pick one before Phase 8

Three directions, each internally consistent. None are "kinda this kinda that" — pick the one that feels right.

### A. Warm-modern (Linear ↔ Airbnb)
**Mood:** confident, considered, slightly editorial. The trip planner that grown-ups use.

| | Light | Dark |
|---|---|---|
| Background | `#FBFAF8` (warm cream) | `#0E0D0B` (warm near-black) |
| Surface | `#FFFFFF` | `#1A1815` |
| Text | `#1A1815` | `#F4F2EE` |
| Accent | `#E8593A` (deep coral) | `#FF7A5C` |
| Muted | `#7A7268` | `#9F968A` |
| Border | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` |

**Type:** Inter (UI) + Source Serif Pro (display). Weight: 400/500/700.
**Vibe sentence:** "Tripi is the tool you use to actually plan the trip."
**Reference:** Linear's structure + Airbnb's warmth.

### B. Playful-vivid (Duolingo-energy, but for adults)
**Mood:** bright, joyful, alive. The app that makes planning fun.

| | Light | Dark |
|---|---|---|
| Background | `#FFFFFF` | `#0B1014` |
| Surface | `#F2F7FA` | `#172227` |
| Text | `#0B1014` | `#F2F7FA` |
| Accent gradient (hero) | `#FF7AB6 → #FFB770` (pink → coral) | same |
| Accent (interactive) | `#3D5BFF` (electric blue) | `#7A92FF` |
| Success | `#22C77E` (mint) | `#3DDC95` |

**Type:** Geist (UI) + Geist Mono (numerical). Weight: 400/500/600/700.
**Vibe sentence:** "Trip planning just got addictive."
**Reference:** Duolingo + Linear's polish.

### C. Premium-minimal (Apple ↔ Roam)
**Mood:** quiet, monochrome, a little cinematic. The app for serious travelers.

| | Light | Dark |
|---|---|---|
| Background | `#FAFAFA` | `#000000` |
| Surface | `#FFFFFF` | `#0E0E0E` |
| Text | `#0A0A0A` | `#FAFAFA` |
| Accent | `#0A0A0A` (pure-black mode) | `#FAFAFA` |
| Highlight | `#3478F6` (system-blue, used sparingly) | `#5C9CFF` |

**Type:** SF Pro (Apple) or Inter as fallback. One typeface only. Weight: 400/500/700.
**Vibe sentence:** "Plan beautifully. Travel deliberately."
**Reference:** Apple Maps, Roam, Things 3.

> **My recommendation:** **A (Warm-modern).** Highest match to Tripi's product positioning (replacement for Sheets — needs to feel premium and considered, not toy-ish). B is a great second choice if you want to lean into virality. C risks feeling too austere for a social app.

The rest of this doc assumes the chosen direction's color slots are bound to semantic token names. Switching brands later means swapping one CSS variable file.

## 2. Design tokens — semantic, not literal

Tokens live in `packages/tokens/src/` and compile to:
- TS objects (consumed by JS code, e.g. animations)
- CSS variables on `:root` (consumed by Tailwind v4 + raw CSS)
- Tailwind theme extension

```ts
// packages/tokens/src/colors.ts
export const colors = {
  bg: { app: 'var(--color-bg-app)', surface: 'var(--color-bg-surface)', sunken: 'var(--color-bg-sunken)' },
  fg: { primary: 'var(--color-fg-primary)', muted: 'var(--color-fg-muted)', inverted: 'var(--color-fg-inverted)' },
  border: { subtle: 'var(--color-border-subtle)', strong: 'var(--color-border-strong)' },
  accent: { fg: 'var(--color-accent-fg)', bg: 'var(--color-accent-bg)', hover: 'var(--color-accent-hover)' },
  feedback: {
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',
  },
}
```

**Why semantic naming:** components reference `bg.surface`, not `#FFFFFF`. Brand swap, dark mode, and theming all work without component changes.

### 2.1 Spacing (8-point scale + half-steps)
```
0 → 0
0.5 → 2px
1 → 4px
2 → 8px
3 → 12px
4 → 16px
5 → 20px
6 → 24px
8 → 32px
10 → 40px
12 → 48px
16 → 64px
20 → 80px
24 → 96px
```

### 2.2 Radii
```
sm → 6px       (chips, pills)
md → 10px      (cards, buttons)
lg → 14px      (modals, panes)
xl → 20px      (hero blocks)
full → 9999px  (avatars, round buttons)
```

### 2.3 Type scale
```
display → 40/48 weight 700  (hero titles)
h1      → 28/36 weight 700  (page titles)
h2      → 22/30 weight 600  (section heads)
h3      → 18/26 weight 600
body    → 15/22 weight 400
small   → 13/18 weight 400
caption → 12/16 weight 500 letter-spacing 0.02em
```

### 2.4 Shadows
```
1 → 0 1px 2px rgba(0,0,0,0.06)
2 → 0 2px 6px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)
3 → 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)
4 → 0 24px 64px rgba(0,0,0,0.16), 0 8px 16px rgba(0,0,0,0.08)
```

In dark mode, shadows lighten the surface above (use `box-shadow` with low-alpha white instead of low-alpha black).

## 3. Motion — every animation has a purpose

We use **physics, not durations**. Springs only; no eased duration curves. Library: `framer-motion`.

```ts
// packages/tokens/src/motion.ts
export const spring = {
  // light, snappy — for chrome (buttons, modals)
  snap: { type: 'spring', stiffness: 600, damping: 40, mass: 0.6 },
  // medium — for cards, list inserts
  flow: { type: 'spring', stiffness: 350, damping: 30, mass: 1 },
  // gentle — for layout moves
  settle: { type: 'spring', stiffness: 200, damping: 28, mass: 1.2 },
} as const

export const stagger = {
  cards: { delayChildren: 0.04, staggerChildren: 0.04 },
  fast: { delayChildren: 0, staggerChildren: 0.02 },
}
```

Rules:
- No animation > 600ms feels.
- Reduce-motion users get instant transitions (use `prefers-reduced-motion` media query).
- Animations always have a *direction* — content arrives from somewhere, doesn't just fade.

## 4. Components — what we build vs adopt

We do **not** adopt a component library wholesale. Instead:
- **Adopt primitives:** Radix UI (accessible unstyled primitives). Use for: Dialog, Popover, DropdownMenu, Tooltip, Toast, Tabs, Accordion, Switch, Checkbox, RadioGroup, Slider, ScrollArea, Avatar.
- **Build our own:** Button, Input, Textarea, Card, Chip, Pill, ActivityCard, DayColumn, MapPin, AvatarStack, EmptyState, Loader, ErrorBoundary, OnboardingTour.

Component code lives in `packages/ui/`. Built with Tailwind v4 + tokens.

```tsx
// packages/ui/src/Button.tsx (skeleton)
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'primary', size = 'md', ...rest }, ref) => (
  <button ref={ref} className={cn(buttonStyles({ variant, size }))} {...rest} />
))

const buttonStyles = cva('inline-flex items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-2 outline-offset-2 outline-accent-bg', {
  variants: {
    variant: {
      primary: 'bg-accent-bg text-accent-fg hover:bg-accent-hover',
      secondary: 'bg-bg-surface text-fg-primary border border-border-subtle hover:border-border-strong',
      ghost: 'text-fg-primary hover:bg-bg-sunken',
      danger: 'bg-danger text-fg-inverted hover:opacity-90',
    },
    size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' },
  },
})
```

## 5. Layout patterns

### 5.1 Trip view (planning)
Three columns on desktop:
```
[Days nav 200px][Day columns flex][AI/Ideas/Map sidebar 360px]
```
On <1100px: collapse Map+AI into a tab bar; on <768px: single-column scroll, AI as floating button.

### 5.2 Trip view (trip-mode)
See `docs/trip-mode.md` §2.

### 5.3 Explore feed
12-col grid; trip cards span 4 cols on desktop (3 per row), 6 cols on tablet, 12 on mobile. Cards have a subtle hover lift (translateY -2px, shadow grows to 3).

### 5.4 Profile
Hero block with avatar + bio + counts (trips · followers · following), followed by a tabbed list (Trips · Liked · Forked).

## 6. Iconography
- **Source:** [Lucide React](https://lucide.dev/). Free, MIT, consistent stroke.
- **Stroke:** 1.5px default. 2px in disabled states.
- **Size:** 16px (inline), 20px (button), 24px (heading), 32px (empty state).
- **Color:** inherits from text.

We bundle only the icons we use (tree-shaking).

## 7. Drag-and-drop interaction spec

Library: `dnd-kit`. Feel: long-press lift → live preview → spring settle.

```
1. Pointer down on activity card.
2. After 180ms long-press OR 6px drag: lift gesture begins.
3. Card scales 1.04, lifts via shadow level 3, slight rotation 0.5°. Cursor swaps to grab.
4. Other items reflow with spring `flow` to make room.
5. While dragging:
   - Source slot shows a 60% opacity dashed outline (where the card came from).
   - Drop zones highlight when crossed (subtle accent border).
   - Cross-day drag slowly auto-scrolls if pointer near top/bottom.
6. On drop:
   - Card scales back to 1.0 with spring `settle`.
   - Server reconciliation: if Yjs's resolved orderKey ≠ local guess, the card animates to the resolved position.
   - Subtle haptic (web: navigator.vibrate(8) where supported).
```

```tsx
// apps/web/src/components/trip/DayColumn.tsx (sketch)
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

export function DayColumn({ dayId, activities }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayId}`, data: { dayId } })
  return (
    <div ref={setNodeRef} className={cn('day-column', isOver && 'is-drop-target')}>
      <SortableContext items={activities.map(a => a.id)} strategy={verticalListSortingStrategy}>
        {activities.map(a => <ActivityCard key={a.id} activity={a} />)}
      </SortableContext>
    </div>
  )
}
```

The actual orderKey computation happens in the `onDragEnd` handler at the page level (see `docs/realtime-collab.md` §4).

## 8. Multi-cursor presence styling

Each collaborator gets a deterministic color from a 12-color palette (hash of userId mod 12). The palette is HSL-spaced for high distinguishability:

```ts
export const presenceColors = [
  '#F87171', '#FBBF24', '#34D399', '#60A5FA',
  '#A78BFA', '#F472B6', '#FB923C', '#22D3EE',
  '#84CC16', '#E879F9', '#38BDF8', '#FCA5A5',
]
```

Cursor visualization in shared text inputs: a thin (2px) vertical bar in the user's color with a small tag at top showing displayName (fades to icon-only after 2s).

## 9. Empty states

The app has many empty states; each gets a custom illustration + a single CTA. Examples:

- **No trips yet** → "Let's plan something." [Create your first trip]
- **Empty day** → "What's on for this day?" [Add activity] [Suggest with AI]
- **Empty ideas pool** → "Drop activities here while you brainstorm."
- **Explore feed empty** → "Follow people whose trips inspire you. Try [Trending]."

## 10. Accessibility

Non-negotiable:
- WCAG AA contrast on text + interactive elements.
- Every interactive element keyboard-reachable + has a visible focus ring.
- Drag-and-drop has keyboard alternative: Space to lift, arrows to move, Space to drop. (`dnd-kit` ships keyboard sensors.)
- All form inputs have visible labels; never placeholder-only.
- Screen-reader announcements for live updates (Yjs changes from collaborators): "Sam added an activity to Day 3."
- Reduced-motion respects user pref globally.
- Color is never the only signal (status badges have icons + colors).

## 11. Light/dark mode

System default; manual override in settings. CSS variables swap on `:root[data-theme='dark']`. We do **not** invert images — trip photos render true-to-life in both modes. We *do* tone down vivid AI-generated cards in dark mode (alpha 0.85 on accent).

## 12. Loading + skeleton states

Three patterns:
- **Skeleton blocks** for known-shape content (trip cards, activity rows). Shimmer pulse 1.4s.
- **Inline spinners** for in-place actions (button loading, save).
- **Toast progress** for long-running ops (auto-planner: "Tripi is planning your trip… (8s)").

We never show a fullscreen spinner. Always content-shaped placeholders.

## 13. Error states

| Scenario | UX |
|---|---|
| Network down | Persistent banner: "You're offline. Edits will sync when you reconnect." |
| 500 from server | Toast: "Something went wrong. Try again." with [Retry] |
| 403 (lost permission) | Modal: "Your access to this trip has changed. [Refresh]" |
| 429 (rate limit) | Toast with countdown |
| Validation | Field-level inline; never modal |

## 14. Marketing site stub

Not part of v1 product but worth designing in concert. Single landing page:
- Hero: headline + product video (auto-loop, muted)
- 3 feature blocks (plan / collab / trip-mode)
- Testimonials (post-launch)
- Footer: privacy, terms, contact

Same brand tokens, slightly larger type. Lives at `apps/marketing/` (separate Amplify app).

## 15. Anti-patterns we will refuse

- **Modal-stacking.** No more than one modal at a time.
- **Toast-spam.** Max 3 toasts on screen; coalesce repeats.
- **Unprompted tooltips.** Tooltips only on icon-only buttons or on hover after 800ms.
- **"AI is thinking…" spinners with no progress.** Always show *what* it's doing.
- **Fake transitions.** Don't animate something that didn't actually move.
- **Tutorial overlays on first load.** A short, dismissible welcome card is enough.

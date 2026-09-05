'use client'

import { getMeta } from '@tripi/shared'
import { useEffect, useState } from 'react'
import { useTripDoc } from '@/lib/use-trip-doc'

// A fixed id so every browser tab joins the same document during Phase 0.
const PHASE_0_TRIP_ID = '00000000-0000-4000-8000-000000000000'

export function RealtimeCounter() {
  const { doc, connected, synced } = useTripDoc(PHASE_0_TRIP_ID)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const meta = getMeta(doc)
    const sync = () => setCount(Number(meta.get('counter') ?? 0))
    sync()
    meta.observe(sync)
    return () => meta.unobserve(sync)
  }, [doc])

  // NOTE: read-then-write on a Y.Map is last-writer-wins, not a CRDT counter —
  // two simultaneous clicks lose one increment. Fine for a connectivity probe.
  // Do not copy this as the pattern for real collaborative state; Phase 2 uses
  // Y.Array/Y.Map mutations that merge, and Y.Text for prose.
  const increment = () => {
    const meta = getMeta(doc)
    meta.set('counter', Number(meta.get('counter') ?? 0) + 1)
  }

  const status = connected && synced ? 'synced' : connected ? 'connected' : 'connecting…'

  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-2 font-semibold">Realtime: Yjs through Hocuspocus</h2>
      <p data-testid="realtime-status">{status}</p>
      <p className="my-2 text-2xl font-bold" data-testid="counter-value">
        {count}
      </p>
      <button
        type="button"
        onClick={increment}
        data-testid="counter-increment"
        className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
      >
        Increment
      </button>
    </section>
  )
}

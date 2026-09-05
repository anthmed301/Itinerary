'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc-client'

export function HealthProbe() {
  const [status, setStatus] = useState<string>('checking…')

  useEffect(() => {
    trpc.health.check
      .query()
      .then((result) => {
        // Date survives the wire only if superjson is wired on both ends.
        const roundTripped = result.checkedAt instanceof Date
        setStatus(`${result.database} · superjson: ${roundTripped ? 'ok' : 'BROKEN'}`)
      })
      .catch((error: unknown) => {
        setStatus(`error: ${error instanceof Error ? error.message : String(error)}`)
      })
  }, [])

  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-2 font-semibold">Browser: tRPC over HTTP</h2>
      <p data-testid="probe-status">{status}</p>
    </section>
  )
}

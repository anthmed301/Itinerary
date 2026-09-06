'use client'

import { HocuspocusProvider } from '@hocuspocus/provider'
import { docNameForTrip } from '@tether/shared'
import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export type TripDocState = {
  doc: Y.Doc
  provider: HocuspocusProvider | null
  /** The websocket is open. Does not mean the document has arrived. */
  connected: boolean
  /** The initial document state has been received. Assert on this, not on connected. */
  synced: boolean
}

/** Opens a Yjs document for a trip and keeps it synced. */
export function useTripDoc(tripId: string): TripDocState {
  const [doc] = useState(() => new Y.Doc())
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [connected, setConnected] = useState(false)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    // Inlined by Next at build time from apps/web/.env.local (a symlink to the
    // repo root file — see Task 5 Step 2). No fallback on purpose: a default of
    // localhost would let a broken deploy look healthy.
    const url = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL
    if (!url) {
      throw new Error(
        'NEXT_PUBLIC_HOCUSPOCUS_URL is not set. Is apps/web/.env.local linked? Run pnpm preflight.',
      )
    }

    const instance = new HocuspocusProvider({
      url,
      name: docNameForTrip(tripId),
      document: doc,
      // Phase 4 replaces this with a short-lived JWT minted by Next.
      token: 'phase-0-stub',
      onStatus: ({ status }) => setConnected(status === 'connected'),
      onSynced: ({ state }) => setSynced(state),
    })

    setProvider(instance)
    return () => {
      instance.destroy()
      setProvider(null)
      setSynced(false)
    }
  }, [doc, tripId])

  return { doc, provider, connected, synced }
}

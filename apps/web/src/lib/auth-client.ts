'use client'

import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import type { auth } from '@/server/auth'

/**
 * `inferAdditionalFields` is a COMPILE-TIME-ONLY shim — its implementation
 * returns a bare descriptor with no runtime behaviour. It exists so `typeof
 * auth` can widen the client's types; without it `signUp.email({ username })`
 * does not typecheck. It does not change what the client sends.
 *
 * `typeof auth` is a TYPE-only import, so no server code reaches the bundle.
 * The Phase 0 CI grep would fail the build if it did.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
})

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } =
  authClient

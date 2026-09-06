import { headers } from 'next/headers'
import { createCallerFactory, createContext, router } from './init'
import { healthRouter } from './routers/health'
import { profileRouter } from './routers/profile'

export const appRouter = router({
  health: healthRouter,
  profile: profileRouter,
})

export type AppRouter = typeof appRouter

const createCaller = createCallerFactory(appRouter)

/** Server-side caller for React Server Components — no HTTP hop. */
export async function serverApi() {
  return createCaller(await createContext({ headers: await headers() }))
}

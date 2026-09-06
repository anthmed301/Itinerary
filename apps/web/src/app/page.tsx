import { HealthProbe } from '@/components/HealthProbe'
import { RealtimeCounter } from '@/components/RealtimeCounter'
import { serverApi } from '@/server/trpc/root'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const api = await serverApi()
  const health = await api.health.check()

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Tripi</h1>
        <p className="text-sm text-neutral-500">Phase 0 foundation</p>
        <p className="text-sm">
          <a className="underline" href="/profile" data-testid="profile-link">
            Your profile
          </a>
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-semibold">Server: tRPC to Postgres</h2>
        <p data-testid="db-status">database: {health.database}</p>
        <p data-testid="place-count">places cached: {health.placeCount}</p>
      </section>

      <HealthProbe />
      <RealtimeCounter />
    </main>
  )
}

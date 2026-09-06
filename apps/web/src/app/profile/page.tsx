import { redirect } from 'next/navigation'
import { ProfileEditor } from '@/components/ProfileEditor'
import { serverApi } from '@/server/trpc/root'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const api = await serverApi()

  // A01: an unauthenticated visitor never sees this page. protectedProcedure
  // throws UNAUTHORIZED; we translate that into a redirect.
  const profile = await api.profile.get().catch(() => null)
  if (!profile) redirect('/login')

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Your profile</h1>
        {/* Rendered as TEXT, not just into an input value, so the stored-XSS
            test has something real to assert on. React escapes this. */}
        <p data-testid="profile-display-name" className="text-lg">
          {profile.name}
        </p>
        <p className="text-sm text-neutral-500">
          <span data-testid="profile-username">@{profile.username}</span>
          {' · '}
          <span data-testid="profile-email">{profile.email}</span>
          {' · '}
          <span data-testid="profile-verified">
            {profile.emailVerified ? 'verified' : 'unverified'}
          </span>
        </p>
      </header>

      <ProfileEditor
        initial={{ name: profile.name, bio: profile.bio, homeCity: profile.homeCity }}
      />
    </main>
  )
}

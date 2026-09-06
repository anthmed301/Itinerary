'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Field } from '@/components/AuthForm'
import { signOut } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc-client'

export function ProfileEditor({
  initial,
}: {
  initial: { name: string; bio: string | null; homeCity: string | null }
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio ?? '')
  const [homeCity, setHomeCity] = useState(initial.homeCity ?? '')
  const [status, setStatus] = useState('')

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('Saving…')
    try {
      // A01: no user id is sent. The server uses the session's id, so there is
      // no parameter an attacker could point at somebody else.
      await trpc.profile.update.mutate({
        name,
        bio: bio.trim() === '' ? null : bio,
        homeCity: homeCity.trim() === '' ? null : homeCity,
      })
      setStatus('Saved')
      router.refresh()
    } catch {
      setStatus('Could not save')
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Display name" name="name" value={name} onChange={setName} />
        <Field label="Bio" name="bio" value={bio} onChange={setBio} />
        <Field label="Home city" name="homeCity" value={homeCity} onChange={setHomeCity} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            data-testid="save-profile"
            className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
          >
            Save
          </button>
          <span data-testid="save-status" className="text-sm text-neutral-500">
            {status}
          </span>
        </div>
      </form>

      <button
        type="button"
        data-testid="sign-out"
        onClick={async () => {
          await signOut()
          router.push('/login')
          router.refresh()
        }}
        className="self-start text-sm underline"
      >
        Sign out
      </button>
    </section>
  )
}

'use client'

import { validateUsername } from '@tether/shared'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { signUp } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc-client'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [availability, setAvailability] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Live availability. A convenience only — the server re-validates on submit
  // and the unique index is the real arbiter (D1.2).
  useEffect(() => {
    if (username.length === 0) {
      setAvailability('')
      return
    }
    const local = validateUsername(username)
    if (!local.ok) {
      setAvailability(local.reason)
      return
    }
    const timer = setTimeout(() => {
      trpc.profile.checkUsernameAvailable
        .query({ username })
        .then((r) => setAvailability(r.available ? 'Available' : (r.reason ?? 'Taken')))
        .catch(() => setAvailability(''))
    }, 300)
    return () => clearTimeout(timer)
  }, [username])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: authError } = await signUp.email({
      email,
      password,
      name,
      username,
      // Review §4.6: without this the emailed link lands on "/" and the
      // /verify-email page is unreachable. Better Auth defaults callbackURL to "/".
      callbackURL: '/verify-email',
    })
    setPending(false)
    if (authError) {
      // M4: a taken username and a taken email both surface as a generic
      // FAILED_TO_CREATE_USER, so name the most likely cause rather than
      // leaving "Could not create the account." as the only feedback.
      setError(
        authError.code === 'FAILED_TO_CREATE_USER'
          ? 'That username is already taken. Try another.'
          : (authError.message ?? 'Could not create the account.'),
      )
      return
    }
    router.push('/profile')
    router.refresh()
  }

  return (
    <AuthForm
      title="Create your Tether account"
      submitLabel="Sign up"
      error={error}
      pending={pending}
      onSubmit={onSubmit}
      footer={
        <p className="text-sm text-neutral-500">
          Already have an account?{' '}
          <a className="underline" href="/login">
            Log in
          </a>
        </p>
      }
    >
      <Field label="Display name" name="name" value={name} onChange={setName} autoComplete="name" />
      <Field
        label="Username"
        name="username"
        value={username}
        onChange={setUsername}
        autoComplete="username"
        hint={
          <span data-testid="username-availability" className="text-xs text-neutral-500">
            {availability}
          </span>
        }
      />
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
      <Field
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={<span className="text-xs text-neutral-500">At least 10 characters.</span>}
      />
    </AuthForm>
  )
}

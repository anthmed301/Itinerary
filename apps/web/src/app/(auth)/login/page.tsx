'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { signIn } from '@/lib/auth-client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: authError } = await signIn.email({ email, password })
    setPending(false)
    if (authError) {
      // A06: one message for a wrong password and an unknown email alike, so
      // login is not a membership oracle.
      setError('Email or password is incorrect.')
      return
    }
    router.push('/profile')
    router.refresh()
  }

  return (
    <AuthForm
      title="Log in to Tether"
      submitLabel="Log in"
      error={error}
      pending={pending}
      onSubmit={onSubmit}
      footer={
        <p className="text-sm text-neutral-500">
          <a className="underline" href="/forgot-password">
            Forgot your password?
          </a>
          {' · '}
          <a className="underline" href="/signup">
            Create an account
          </a>
        </p>
      }
    >
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
        autoComplete="current-password"
      />
    </AuthForm>
  )
}

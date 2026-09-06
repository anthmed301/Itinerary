'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { resetPassword } from '@/lib/auth-client'

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: authError } = await resetPassword({ newPassword: password, token })
    setPending(false)
    if (authError) {
      setError('That reset link is invalid or has already been used.')
      return
    }
    router.push('/login')
  }

  return (
    <AuthForm
      title="Choose a new password"
      submitLabel="Set password"
      error={error}
      pending={pending}
      onSubmit={onSubmit}
    >
      <Field
        label="New password"
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

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}

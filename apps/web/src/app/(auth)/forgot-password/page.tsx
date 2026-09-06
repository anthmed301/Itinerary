'use client'

import { type FormEvent, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { requestPasswordReset } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPending(true)
    await requestPasswordReset({ email, redirectTo: '/reset-password' })
    setPending(false)
    // D1.9 / A06: identical outcome whether or not the address exists. The
    // result is deliberately ignored so no branch can leak membership.
    //
    // Consequence worth knowing (L21): a genuine failure here — a throttle, a
    // dead mailer — still renders success. Debug from the server log, not the UI.
    setSent(true)
  }

  if (sent) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-col gap-4 p-10">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p data-testid="reset-requested" className="text-sm text-neutral-600 dark:text-neutral-400">
          If an account exists for {email}, we have sent a link to reset the password. It expires in
          one hour.
        </p>
      </main>
    )
  }

  return (
    <AuthForm
      title="Reset your password"
      submitLabel="Send reset link"
      error={null}
      pending={pending}
      onSubmit={onSubmit}
    >
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
    </AuthForm>
  )
}

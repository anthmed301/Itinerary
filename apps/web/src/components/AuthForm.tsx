'use client'

import type { FormEvent, ReactNode } from 'react'

export function AuthForm({
  title,
  submitLabel,
  error,
  pending,
  onSubmit,
  children,
  footer,
}: {
  title: string
  submitLabel: string
  error: string | null
  pending: boolean
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {children}
        {error ? (
          <p data-testid="form-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          data-testid="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? 'Working…' : submitLabel}
        </button>
      </form>
      {footer}
    </main>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  hint,
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`field-${name}`}
        className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {hint}
    </label>
  )
}

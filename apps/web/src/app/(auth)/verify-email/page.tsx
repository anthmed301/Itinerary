/**
 * Better Auth verifies the token at its own endpoint and then redirects here
 * via the `callbackURL` the signup form passes. Reaching this page means the
 * token was accepted — an invalid one never gets this far.
 */
export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 p-10">
      <h1 className="text-2xl font-bold">Email confirmed</h1>
      <p data-testid="verify-result" className="text-sm text-neutral-600 dark:text-neutral-400">
        Thanks — your email address is confirmed.
      </p>
      <a className="underline" href="/profile">
        Go to your profile
      </a>
    </main>
  )
}

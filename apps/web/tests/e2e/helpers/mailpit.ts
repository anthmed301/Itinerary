const MAILPIT = 'http://localhost:8025'

type MailpitMessage = { ID: string; To: { Address: string }[]; Subject: string }

/** Deletes every message so a test can assert on what it alone produced. */
export async function clearInbox(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

/** Polls until a message addressed to `to` arrives, then returns its body. */
export async function waitForEmail(
  to: string,
  timeoutMs = 15_000,
): Promise<{ subject: string; html: string; text: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/messages`)
    const body = (await res.json()) as { messages?: MailpitMessage[] }
    const hit = body.messages?.find((m) =>
      m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()),
    )
    if (hit) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)
      const msg = (await full.json()) as { Subject: string; HTML: string; Text: string }
      return { subject: msg.Subject, html: msg.HTML, text: msg.Text }
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(
    `No email for ${to} within ${timeoutMs}ms. ` +
      'If the request was throttled the UI still reports success (D1.9) — check the server log.',
  )
}

/** Pulls the first http(s) link out of an email body. */
export function firstLink(body: string): string {
  const match = body.match(/https?:\/\/[^\s"'<>]+/)
  if (!match) throw new Error('No link found in email body')
  return match[0]
}

/** A unique address per test run, so tests never collide on the unique index. */
export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@tripi.test`
}

export function uniqueUsername(prefix = 'u'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

/** Signs a new account up through the UI and returns its credentials. */
export async function signUpVia(
  page: import('@playwright/test').Page,
  opts: { name?: string; email?: string; password?: string } = {},
) {
  const email = opts.email ?? uniqueEmail()
  const username = uniqueUsername()
  const password = opts.password ?? 'correct-horse-battery'
  await page.goto('/signup')
  await page.getByTestId('field-name').fill(opts.name ?? 'Test Person')
  await page.getByTestId('field-username').fill(username)
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill(password)
  await page.getByTestId('submit').click()
  return { email, username, password }
}

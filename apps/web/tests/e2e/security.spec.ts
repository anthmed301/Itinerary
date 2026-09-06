import { expect, test } from '@playwright/test'
import { clearInbox, firstLink, signUpVia, uniqueEmail, waitForEmail } from './helpers/mailpit'

test('serves the security headers', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
})

test('session cookie is httpOnly and SameSite=Lax', async ({ page, context }) => {
  await signUpVia(page, { name: 'Erin Example' })
  await expect(page).toHaveURL(/\/profile$/)

  const cookies = await context.cookies()
  // Review §4.1: useSecureCookies follows NODE_ENV, and Better Auth renames the
  // cookie to `__Secure-…` when it is on — so match the suffix, not the prefix.
  const session = cookies.find((c) => c.name.endsWith('tripi.session_token'))
  expect(session, 'a tripi session cookie should be set').toBeTruthy()
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')
  // `next start` (CI=1) sets NODE_ENV=production; `next dev` does not.
  expect(session?.secure).toBe(!!process.env.CI)
})

test('redirects an anonymous visitor away from the profile page', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)
})

test('an anonymous tRPC caller cannot read a profile', async ({ request }) => {
  // A01: protectedProcedure, exercised directly rather than through the UI.
  const read = await request.get('/api/trpc/profile.get', { failOnStatusCode: false })
  expect(read.status()).toBeGreaterThanOrEqual(400)
  expect(await read.text()).toContain('UNAUTHORIZED')
})

test('one user cannot modify another user profile', async ({ browser }) => {
  // A01 (IDOR/BOLA). The API exposes no userId parameter at all, so the check
  // is that a crafted call carrying one leaves the victim untouched.
  const aCtx = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.11' },
  })
  const bCtx = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.12' },
  })
  const a = await aCtx.newPage()
  const b = await bCtx.newPage()

  await signUpVia(b, { name: 'Victim' })
  await expect(b).toHaveURL(/\/profile$/)
  await b.getByTestId('field-bio').fill('BELONGS TO B')
  await b.getByTestId('save-profile').click()
  await expect(b.getByTestId('save-status')).toHaveText('Saved')

  await signUpVia(a, { name: 'Attacker' })
  await expect(a).toHaveURL(/\/profile$/)

  await a.evaluate(async () => {
    await fetch('/api/trpc/profile.update?batch=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        0: { json: { name: 'Attacker', bio: 'OVERWRITTEN', homeCity: null, userId: 'not-mine' } },
      }),
    })
  })

  await b.reload()
  await expect(b.getByTestId('field-bio')).toHaveValue('BELONGS TO B')

  await aCtx.close()
  await bCtx.close()
})

test('neutralises HTML supplied in profile fields', async ({ page }) => {
  // A05: stored XSS. The display name is rendered as TEXT on /profile, so this
  // asserts on real escaping rather than on an input value (review M11).
  await signUpVia(page, { name: '<img src=x onerror="window.__pwned=1">' })
  await expect(page).toHaveURL(/\/profile$/)

  await page.reload()
  await expect(page.getByTestId('profile-display-name')).toHaveText(
    '<img src=x onerror="window.__pwned=1">',
  )
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined()
  expect(await page.locator('img[src="x"]').count()).toBe(0)
})

test('escapes a hostile display name in the verification email', async ({ page }) => {
  // A05: the email body is the one place a payload reaches an HTML renderer
  // we do not control.
  await clearInbox()
  const email = uniqueEmail('xssmail')
  await signUpVia(page, { name: '<script>alert(1)</script>', email })
  const mail = await waitForEmail(email)
  expect(mail.html).not.toContain('<script>alert(1)</script>')
  expect(mail.html).toContain('&lt;script&gt;')
})

test('a password reset invalidates a session established beforehand', async ({ browser }) => {
  // A07: revokeSessionsOnPasswordReset is set in the auth config; this proves it.
  const staying = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.21' },
  })
  const other = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.22' },
  })
  const stayingPage = await staying.newPage()
  const otherPage = await other.newPage()

  const { email } = await signUpVia(stayingPage, { name: 'Session Holder' })
  await expect(stayingPage).toHaveURL(/\/profile$/)

  await clearInbox()
  await otherPage.goto('/forgot-password')
  await otherPage.getByTestId('field-email').fill(email)
  await otherPage.getByTestId('submit').click()
  const mail = await waitForEmail(email)
  await otherPage.goto(firstLink(mail.text))
  await otherPage.getByTestId('field-password').fill('an-entirely-new-password')
  await otherPage.getByTestId('submit').click()
  await expect(otherPage).toHaveURL(/\/login$/)

  // The first context's session must now be dead.
  await stayingPage.goto('/profile')
  await expect(stayingPage).toHaveURL(/\/login$/)

  await staying.close()
  await other.close()
})

test.describe('throttling', () => {
  // Its own address so a burst of 429s cannot poison any other test's bucket.
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.99' } })

  test('throttles repeated failed logins', async ({ request }) => {
    // A06/A07. Observable locally only because D1.8 turns rate limiting on in
    // development — better-auth's own default is `enabled ?? isProduction`.
    const email = uniqueEmail('throttle')
    let sawThrottle = false
    for (let i = 0; i < 30; i++) {
      const res = await request.post('/api/auth/sign-in/email', {
        data: { email, password: `wrong-password-${i}` },
        failOnStatusCode: false,
      })
      if (res.status() === 429) {
        sawThrottle = true
        break
      }
    }
    expect(sawThrottle, 'repeated failed logins should eventually return 429').toBe(true)
  })

  test('throttles the username availability oracle', async ({ request }) => {
    // A06. This endpoint is a tRPC route, which Better Auth's limiter never
    // sees — it has its own middleware. Review §4.3.
    let sawThrottle = false
    for (let i = 0; i < 45; i++) {
      const res = await request.get(
        `/api/trpc/profile.checkUsernameAvailable?input=${encodeURIComponent(
          JSON.stringify({ json: { username: `probe${i}` } }),
        )}`,
        { failOnStatusCode: false },
      )
      if (res.status() === 429 || (await res.text()).includes('TOO_MANY_REQUESTS')) {
        sawThrottle = true
        break
      }
    }
    expect(sawThrottle, 'the availability oracle should throttle').toBe(true)
  })
})

test('does not leak internals when a request fails', async ({ request }) => {
  // A10. tRPC attaches data.stack whenever isDev (NODE_ENV !== 'production'),
  // so this control only exists on the production path — which is what CI
  // serves. Review §4.2.
  test.skip(!process.env.CI, 'errorFormatter only strips internals in production')
  const res = await request.post('/api/trpc/profile.update?batch=1', {
    data: { 0: { json: { name: 12345 } } },
    failOnStatusCode: false,
  })
  const body = await res.text()
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(body).not.toContain('/Users/')
  expect(body).not.toContain('node_modules')
  expect(body.toLowerCase()).not.toContain('at async')
})

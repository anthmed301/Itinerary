import { expect, test } from '@playwright/test'
import { clearInbox, firstLink, signUpVia, uniqueEmail, waitForEmail } from './helpers/mailpit'

test('resets a password through the real emailed link and invalidates the old one', async ({
  page,
  context,
}) => {
  const oldPassword = 'correct-horse-battery'
  const newPassword = 'a-completely-different-one'
  const { email } = await signUpVia(page, { name: 'Dave Example', password: oldPassword })
  await expect(page).toHaveURL(/\/profile$/)
  await page.getByTestId('sign-out').click()

  await clearInbox()
  await page.goto('/forgot-password')
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('reset-requested')).toBeVisible()

  const mail = await waitForEmail(email)
  const link = firstLink(mail.text)

  await page.goto(link)
  await page.getByTestId('field-password').fill(newPassword)
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/login$/)

  // The old password must no longer work.
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill(oldPassword)
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('form-error')).toBeVisible()

  await page.getByTestId('field-password').fill(newPassword)
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  // A04/A07: the token is single-use — replaying the same link must fail.
  await context.clearCookies()
  await page.goto(link)
  await page.getByTestId('field-password').fill('yet-another-password')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('form-error')).toBeVisible()
})

test('reset response is identical for a known and an unknown email', async ({ page, request }) => {
  // D1.9 / A06: no membership oracle. Review §4.5 — compare the actual
  // responses rather than only checking that the unknown address renders a
  // success page.
  const { email: known } = await signUpVia(page, { name: 'Erin Known' })
  await expect(page).toHaveURL(/\/profile$/)

  const a = await request.post('/api/auth/request-password-reset', {
    data: { email: known, redirectTo: '/reset-password' },
    failOnStatusCode: false,
  })
  const b = await request.post('/api/auth/request-password-reset', {
    data: { email: uniqueEmail('nobody'), redirectTo: '/reset-password' },
    failOnStatusCode: false,
  })

  expect(a.status()).toBe(b.status())
  expect(await a.text()).toBe(await b.text())
})

import { expect, test } from '@playwright/test'
import { clearInbox, signUpVia, uniqueEmail, uniqueUsername, waitForEmail } from './helpers/mailpit'

test('signs up, lands logged in, and sends a verification email', async ({ page }) => {
  await clearInbox()
  const email = uniqueEmail()
  const username = uniqueUsername()

  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Alice Example')
  await page.getByTestId('field-username').fill(username)
  await expect(page.getByTestId('username-availability')).toHaveText('Available', {
    timeout: 10_000,
  })
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()

  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByTestId('profile-username')).toHaveText(`@${username}`)

  // D1.5: the email is sent even though login is not gated on it.
  const mail = await waitForEmail(email)
  expect(mail.subject).toContain('Confirm')
})

test('rejects a duplicate username without creating an account', async ({ page, context }) => {
  const username = uniqueUsername()
  const first = uniqueEmail('first')
  const second = uniqueEmail('second')

  await page.goto('/signup')
  await page.getByTestId('field-name').fill('First')
  await page.getByTestId('field-username').fill(username)
  await page.getByTestId('field-email').fill(first)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  await context.clearCookies()
  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Second')
  await page.getByTestId('field-username').fill(username)
  await expect(page.getByTestId('username-availability')).toHaveText(/taken/i, { timeout: 10_000 })
  await page.getByTestId('field-email').fill(second)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()

  // D1.2: the unique index refuses it, no account is created, and we stay put.
  await expect(page.getByTestId('form-error')).toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)

  // The second email must not have an account: logging in with it fails.
  await page.goto('/login')
  await page.getByTestId('field-email').fill(second)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('form-error')).toBeVisible()
})

test('logs out and back in, and rejects a wrong password', async ({ page }) => {
  const { email, password } = await signUpVia(page, { name: 'Bob Example' })
  await expect(page).toHaveURL(/\/profile$/)

  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill('wrong-password-entirely')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('form-error')).toHaveText('Email or password is incorrect.')

  await page.getByTestId('field-password').fill(password)
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)
})

test('persists profile edits across a reload', async ({ page }) => {
  await signUpVia(page, { name: 'Carol Example' })
  await expect(page).toHaveURL(/\/profile$/)

  await page.getByTestId('field-bio').fill('Trip planner, spreadsheet refugee.')
  await page.getByTestId('field-homeCity').fill('Lisbon')
  await page.getByTestId('save-profile').click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved')

  await page.reload()
  await expect(page.getByTestId('field-bio')).toHaveValue('Trip planner, spreadsheet refugee.')
  await expect(page.getByTestId('field-homeCity')).toHaveValue('Lisbon')
})

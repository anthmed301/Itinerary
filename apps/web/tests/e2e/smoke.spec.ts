import { expect, test } from '@playwright/test'

test('renders and reaches postgres through tRPC', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tripi' })).toBeVisible()
  await expect(page.getByTestId('db-status')).toHaveText('database: up')
  await expect(page.getByTestId('place-count')).toContainText('places cached:')
})

test('browser reaches tRPC over HTTP with superjson intact', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('probe-status')).toHaveText('up · superjson: ok', {
    timeout: 15_000,
  })
})

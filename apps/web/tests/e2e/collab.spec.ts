import { expect, test } from '@playwright/test'

test('a value set in one tab appears in another through hocuspocus', async ({ browser }) => {
  const alice = await browser.newContext()
  const bob = await browser.newContext()

  const alicePage = await alice.newPage()
  const bobPage = await bob.newPage()

  await alicePage.goto('/')
  await bobPage.goto('/')

  // 'synced', not 'connected': the document state arrives after the socket opens.
  await expect(alicePage.getByTestId('realtime-status')).toHaveText('synced', {
    timeout: 20_000,
  })
  await expect(bobPage.getByTestId('realtime-status')).toHaveText('synced', {
    timeout: 20_000,
  })

  const before = Number(await bobPage.getByTestId('counter-value').innerText())

  await alicePage.getByTestId('counter-increment').click()

  await expect(bobPage.getByTestId('counter-value')).toHaveText(String(before + 1), {
    timeout: 15_000,
  })

  await alice.close()
  await bob.close()
})

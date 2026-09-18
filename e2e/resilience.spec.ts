import { expect, test } from '@playwright/test'

import { openTab, run, terminalOutput } from './helpers'

// #80: a page opened before a deploy asks for the old Editor chunk, which is gone. That used to
// blank the whole app.
test('an Editor chunk from an older deploy asks for a reload, and the game keeps working', async ({
  page,
}) => {
  await page.route(/\/assets\/Editor-[^/]+\.js$/, (route) => route.fulfill({ status: 404 }))
  await page.goto('./?fast=1&chapter=02')
  await openTab(page, /Editor/)

  const alert = page.getByRole('alert').filter({ hasText: 'Flack has been updated' })
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Reload the page' })).toBeVisible()

  // Everything else is still there.
  await expect(page.getByRole('complementary', { name: 'Instructions' })).toBeVisible()
  await run(page, 'git status')
  await expect(terminalOutput(page)).toContainText('On branch main')
})

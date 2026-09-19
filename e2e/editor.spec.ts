import { expect, test } from '@playwright/test'

import { openTab, run, terminalOutput } from './helpers'

// Markdown's own Enter and Backspace rewrote list lines: Enter after a list item added a `- ` of
// its own, and Backspace at the start of an item stripped its marker.
test('Enter and Backspace in a list leave the lines already there alone', async ({ page }) => {
  await page.goto('./?chapter=02')
  await openTab(page, /Editor/)
  await page
    .getByRole('navigation', { name: 'Files' })
    .getByRole('button', { name: /team\.md/ })
    .click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- Ada Lovelace')
  await expect(page.getByText(/This edit changes \d+ lines? that/)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')

  await run(page, 'cat team.md')
  await expect(terminalOutput(page)).toContainText(/- Jordan Lee\s*- Robin Okafor\s*- Ada Lovelace/)
  await expect(terminalOutput(page)).not.toContainText('- - ')
})

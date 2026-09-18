import { expect, test } from '@playwright/test'

import { run, terminalOutput } from './helpers'

const WELCOME = 'docs/welcome.md'

test('Bonus: restore an edit, unstage a stray file, amend a message', async ({ page }) => {
  await page.goto('./?fast=1&chapter=09')
  await run(page, 'git switch -c ada-oops')

  await run(page, `open ${WELCOME}`)
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('asdfghjkl')
  await page.keyboard.press('ControlOrMeta+s')
  await run(page, `git restore ${WELCOME}`)
  // The Editor shows the file as it was.
  await expect(page.locator('.cm-content')).not.toContainText('asdfghjkl')

  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('Welcome, next new starter!')
  await page.keyboard.press('ControlOrMeta+s')
  await run(page, 'git add .')
  await run(page, 'git restore --staged notes.txt')
  await run(page, 'git status')
  await expect(terminalOutput(page)).toContainText('Untracked files')
  await run(page, 'git commit -m "wip"')
  await run(page, 'git commit --amend -m "Welcome the next new starter"')
  await run(page, 'git log --oneline -n 1')
  await expect(terminalOutput(page)).toContainText(/[0-9a-f]{7} \(HEAD -> ada-oops\) Welcome the/)

  const done = page.getByRole('region', { name: 'Bonus complete' })
  await expect(done).toContainText('git restore --staged <file>')
  await expect(page.getByRole('button', { name: 'Keep going' })).toHaveCount(0)
})

import { expect, test, type Page } from '@playwright/test'

const STYLE_GUIDE = 'docs/style-guide.md'
const TIP = '- Say the most important thing first.'

async function run(page: Page, line: string) {
  const input = page.getByRole('textbox', { name: /Terminal command/ })
  await input.fill(line)
  await input.press('Enter')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(line)
}

const gitnub = (page: Page) => page.getByRole('tabpanel', { name: 'GitNub' })

test('Chapter 8: a PR conflict, the Commit Lab, Keep both, and graduation', async ({ page }) => {
  await page.goto('./?fast=1&chapter=08')
  await run(page, 'git switch -c ada-tip')
  await run(page, `open ${STYLE_GUIDE}`)
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(TIP)
  await page.keyboard.press('ControlOrMeta+s')
  await run(page, `git add ${STYLE_GUIDE}`)
  await run(page, 'git commit -m "Add my writing tip"')
  await run(page, 'git push -u origin ada-tip')

  await page.getByRole('tab', { name: /GitNub/ }).click()
  await gitnub(page).getByRole('link', { name: 'docs-site' }).click()
  await gitnub(page)
    .getByRole('link', { name: /Compare & pull request/ })
    .click()
  await gitnub(page).getByRole('button', { name: 'Create pull request' }).click()
  await expect(
    gitnub(page).getByText('This branch has conflicts that must be resolved')
  ).toBeVisible()

  // Why: the Commit Lab, opened from the banner.
  await gitnub(page).getByRole('button', { name: 'See what’s conflicting →' }).click()
  const lab = page.getByRole('dialog', { name: 'Two tips, one spot' })
  await lab
    .getByRole('button', { name: /^Add my tip,/ })
    .dragTo(lab.getByRole('button', { name: /^Add Sam’s tip,/ }))
  await lab.getByRole('button', { name: 'Merge with here' }).click()
  await lab.getByRole('button', { name: 'Keep mine' }).click()
  await expect(lab.getByText(/Sam’s is gone/)).toBeVisible()
  await lab.getByRole('button', { name: 'I get it' }).click()

  // Resolve on the PR: mine first (nudged), then both.
  const choices = gitnub(page).getByRole('group', { name: `Resolve ${STYLE_GUIDE}` })
  await choices.getByRole('button', { name: 'Keep mine' }).click()
  await expect(gitnub(page).getByText(/That drops what’s on main/)).toBeVisible()
  await choices.getByRole('button', { name: 'Keep both' }).click()
  await gitnub(page).getByRole('button', { name: 'Mark as resolved' }).click()
  await expect(gitnub(page).getByText('approved these changes')).toBeVisible()
  await gitnub(page).getByRole('button', { name: 'Squash and merge' }).click()
  await gitnub(page).getByRole('button', { name: 'Confirm squash and merge' }).click()

  await page.getByRole('tab', { name: /Flack/ }).click()
  await page
    .getByRole('navigation', { name: 'Channels' })
    .getByRole('button', { name: /docs-team/ })
    .click()
  await page.getByRole('button', { name: 'Great minds! 🙌' }).click()

  // The bonus round is optional.
  await page.getByRole('button', { name: 'Skip this step' }).click()
  const graduated = page.getByRole('region', { name: 'You’ve graduated' })
  await expect(graduated).toBeVisible()

  // Cheat sheet v2 prints on one or two pages.
  await graduated.getByRole('link', { name: 'Open the cheat sheet' }).click()
  await expect(page.getByRole('heading', { name: 'When your pull request says…' })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  const pdf = await page.pdf({ format: 'Letter' })
  const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0
  expect(pages).toBeGreaterThanOrEqual(1)
  expect(pages).toBeLessThanOrEqual(2)
})

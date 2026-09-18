import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  createMergeRequest,
  expectDone,
  gitnub,
  mergeWhenApproved,
  openTab,
  run,
  selectWordInEditor,
} from './helpers'

/** Serious and critical axe violations on the page as it is now, as readable one-liners. */
async function violations(page: Page): Promise<string[]> {
  // Measure the settled page, not a toast halfway through fading in.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished)
    )
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap((violation) =>
      violation.nodes.map(
        (node) => `${violation.id}: ${node.target.join(' ')} — ${node.failureSummary ?? ''}`
      )
    )
}

test.describe('axe: no serious or critical violations', () => {
  test('Flack, on the first screen', async ({ page }) => {
    await page.goto('./?fast=1')
    await expect(page.getByRole('button', { name: 'Thanks! Happy to be here 👋' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('GitNub repo page and the clone dialog', async ({ page }) => {
    await page.goto('./?fast=1&chapter=01')
    await openTab(page, /GitNub/)
    await gitnub(page).getByRole('link', { name: 'docs-site' }).click()
    expect(await violations(page)).toEqual([])
    await gitnub(page).getByRole('button', { name: /Code/ }).click()
    await expect(page.getByRole('dialog', { name: 'Clone this repository' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('Editor with a file open, and Where are my changes?', async ({ page }) => {
    await page.goto('./?fast=1&chapter=02')
    await run(page, 'open team.md')
    await expect(page.locator('.cm-content')).toContainText('Docs team')
    expect(await violations(page)).toEqual([])
  })

  test('a merge request that needs a rebase', async ({ page }) => {
    await page.goto('./?fast=1&chapter=06')
    await run(page, 'git switch -c ada-typo')
    await run(page, 'open docs/style-guide.md')
    await selectWordInEditor(page, 'recieve')
    await page.keyboard.type('receive')
    await page.keyboard.press('ControlOrMeta+s')
    await run(page, 'git commit -am "Fix a typo"')
    await run(page, 'git push -u origin ada-typo')
    await openTab(page, /GitNub/)
    await createMergeRequest(page)
    await expect(gitnub(page).getByRole('button', { name: 'Rebase' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('the Commit Lab', async ({ page }) => {
    await page.goto('./?fast=1&chapter=07')
    await page.getByRole('tab', { name: /Flack/ }).click()
    await page
      .getByRole('navigation', { name: 'Channels' })
      .getByRole('button', { name: /Robin Okafor/ })
      .click()
    await expect(page.getByRole('dialog', { name: 'Four commits, one change' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('the cheat sheet', async ({ page }) => {
    await page.goto('./?fast=1#/cheat-sheet')
    await expect(page.getByRole('heading', { name: 'The daily loop', level: 1 })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('a busy #docs-team, Robin’s hints, and the chapter-complete card', async ({ page }) => {
    await page.goto('./?fast=1&chapter=05')
    // Robin steps in when status is asked before fetching.
    await run(page, 'git status')
    await run(page, 'git fetch')
    await run(page, 'git status')
    await run(page, 'git log --oneline origin/main')
    await run(page, 'git merge origin/main')
    await run(page, 'git merge main')
    await page.getByRole('button', { name: 'Skip this step' }).click()
    await expect(page.getByRole('region', { name: 'Chapter complete' })).toBeVisible()
    await openTab(page, /Flack/)
    await page
      .getByRole('navigation', { name: 'Channels' })
      .getByRole('button', { name: /docs-team/ })
      .click()
    await expect(page.getByText('Thanks for checking before you started')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('resolving a conflict on GitNub, then graduation', async ({ page }) => {
    await page.goto('./?fast=1&chapter=08')
    await run(page, 'git switch -c ada-tip')
    await run(page, 'open docs/style-guide.md')
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('- Say the most important thing first.')
    await page.keyboard.press('ControlOrMeta+s')
    await run(page, 'git commit -am "Add my writing tip"')
    await run(page, 'git push -u origin ada-tip')
    await openTab(page, /GitNub/)
    await createMergeRequest(page)
    await gitnub(page).getByRole('button', { name: 'See what’s conflicting →' }).click()
    const lab = page.getByRole('dialog', { name: 'Two tips, one spot' })
    await lab
      .getByRole('button', { name: /^Add my tip,/ })
      .dragTo(lab.getByRole('button', { name: /^Add Sam’s tip,/ }))
    await lab.getByRole('button', { name: 'Merge with here' }).click()
    await lab.getByRole('button', { name: 'Keep mine' }).click()
    await expect(lab.getByText(/Sam’s is gone/)).toBeVisible()
    expect(await violations(page)).toEqual([])
    await lab.getByRole('button', { name: 'I get it' }).click()

    const choices = gitnub(page).getByRole('group', { name: 'Resolve docs/style-guide.md' })
    await choices.getByRole('button', { name: 'Keep mine' }).click()
    await expect(gitnub(page).getByText(/That drops what’s on main/)).toBeVisible()
    expect(await violations(page)).toEqual([])

    await choices.getByRole('button', { name: 'Keep both' }).click()
    await gitnub(page).getByRole('button', { name: 'Commit to source branch' }).click()
    await mergeWhenApproved(page)
    await expect(
      gitnub(page)
        .getByText(/Merged/)
        .first()
    ).toBeVisible()
    expect(await violations(page)).toEqual([])

    await openTab(page, /Flack/)
    await page
      .getByRole('navigation', { name: 'Channels' })
      .getByRole('button', { name: /docs-team/ })
      .click()
    await page.getByRole('button', { name: 'Great minds! 🙌' }).click()
    await page.getByRole('button', { name: 'Skip this step' }).click()
    await expect(page.getByRole('region', { name: 'You’ve graduated' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })
})

/**
 * Presses Tab (or Shift+Tab) until the target has focus, as a keyboard user would. Fails if it
 * never does: it can't be reached, or focus is stuck somewhere.
 */
async function tabTo(page: Page, target: Locator, { back = false, max = 80 } = {}) {
  for (let presses = 0; presses < max; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
  }
  throw new Error(`Couldn’t reach ${target} with the keyboard`)
}

test('Chapters 0 and 1 with only a keyboard', async ({ page }) => {
  await page.goto('./?fast=1')
  const terminal = page.getByRole('textbox', { name: /Terminal command/ })
  const type = async (line: string) => {
    await tabTo(page, terminal)
    await page.keyboard.type(line)
    await page.keyboard.press('Enter')
  }

  await tabTo(page, page.getByRole('button', { name: 'Thanks! Happy to be here 👋' }))
  await page.keyboard.press('Enter')
  // Tabs: one stop for the tab list, then the arrow keys.
  await tabTo(page, page.getByRole('tab', { name: /Flack/ }), { back: true })
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /GitNub/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expectDone(page, 'Open the GitNub tab')
  await type('help')
  await tabTo(page, page.getByRole('button', { name: 'Keep going' }), { back: true })
  await page.keyboard.press('Enter')

  // Chapter 1: find the repo, open the clone dialog, copy, and clone.
  await tabTo(page, gitnub(page).getByRole('link', { name: 'docs-site' }))
  await page.keyboard.press('Enter')
  await tabTo(page, gitnub(page).getByRole('button', { name: /Code/ }))
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Clone this repository' })
  await tabTo(page, dialog.getByRole('button', { name: 'Copy' }))
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(gitnub(page).getByRole('button', { name: /Code/ })).toBeFocused()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  await type(`git clone ${copied}`)
  await type('ls')
  await type('cd docs-site')
  await type('cat README.md')
  await tabTo(page, page.getByRole('button', { name: 'Keep going' }), { back: true })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Sign the list', level: 1 })).toBeVisible()
})

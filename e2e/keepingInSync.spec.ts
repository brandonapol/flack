import { expect, test, type Page } from '@playwright/test'

import {
  createMergeRequest,
  expectDone,
  gitnub,
  keepGoing,
  mergeWhenApproved,
  openTab,
  run,
  selectWordInEditor,
  terminalOutput,
} from './helpers'

const STYLE_GUIDE = 'docs/style-guide.md'
const CHAPTERS = 9

const chapterHeading = (page: Page, number: number) =>
  page.getByText(new RegExp(`^Chapter ${number} of ${CHAPTERS}$`))

async function chapter5(page: Page, catchUp: 'merge' | 'pull') {
  await run(page, 'git status')
  await run(page, 'git fetch')
  await run(page, 'git status')
  await expect(terminalOutput(page)).toContainText('behind')
  await run(page, 'git log --oneline origin/main')
  await expect(terminalOutput(page)).toContainText('Fix a typo on the welcome page')
  // Both roads lead to the same place: merge what was fetched, or fetch and merge again in one go.
  await run(page, catchUp === 'merge' ? 'git merge origin/main' : 'git pull')
  await expect(terminalOutput(page)).toContainText('Fast-forward')
  await expectDone(page, 'Bring it into your main')
  await run(page, 'open docs/welcome.md')
  await expect(page.locator('.cm-content')).toContainText('documentation')
  await keepGoing(page)
}

async function chapter6(page: Page) {
  await run(page, 'git switch -c ada-typo')
  await run(page, `open ${STYLE_GUIDE}`)
  await selectWordInEditor(page, 'recieve')
  await page.keyboard.type('receive')
  await page.keyboard.press('ControlOrMeta+s')
  await expectDone(page, 'Fix the typo and save')
  await run(page, `git add ${STYLE_GUIDE}`)
  await run(page, 'git commit -m "Fix a typo in the style guide"')
  await run(page, 'git push -u origin ada-typo')

  await openTab(page, /GitNub/)
  await createMergeRequest(page)

  // Alex's merge request lands while ours waits for review.
  await expect(
    gitnub(page)
      .getByText(/must be rebased onto the target branch/)
      .first()
  ).toBeVisible()
  await gitnub(page).getByRole('button', { name: 'Rebase' }).click()
  await mergeWhenApproved(page)

  await run(page, 'git switch main')
  await run(page, 'git pull')
  await run(page, `cat ${STYLE_GUIDE}`)
  await expect(terminalOutput(page)).toContainText('readers receive it clearly')
  await expect(terminalOutput(page)).toContainText('Ask for a review early')
  await keepGoing(page)
}

test('Chapters 5 and 6: fetch, look, merge; then an MR that needs a rebase', async ({ page }) => {
  await page.goto('./?fast=1&chapter=05')
  await chapter5(page, 'merge')
  await chapter6(page)
  await expect(chapterHeading(page, 8)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A tidier history', level: 1 })).toBeVisible()
})

test('Chapter 5 by git pull instead of merge', async ({ page }) => {
  await page.goto('./?fast=1&chapter=05')
  await chapter5(page, 'pull')
  await expect(chapterHeading(page, 7)).toBeVisible()
})

// Every chapter has to be playable on its own: that's how E2E, playtesters and bug reports get
// straight to it.
for (const [index, id] of ['00', '01', '02', '03', '04', '05', '06', '07', '08'].entries()) {
  test(`?chapter=${id} lands in a playable Chapter ${index + 1}`, async ({ page }) => {
    await page.goto(`./?fast=1&chapter=${id}`)
    await expect(chapterHeading(page, index + 1)).toBeVisible()
    await expect(page.getByRole('region', { name: 'What to do now' })).toBeVisible()
    await run(page, 'git status')
    // Before the clone there's nothing to be in; from Chapter 2 on there always is.
    if (index >= 2) await expect(terminalOutput(page)).toContainText('On branch main')
    else await expect(terminalOutput(page)).toContainText('not a git repository')
  })
}

test('?chapter=09 lands in the playable bonus chapter', async ({ page }) => {
  await page.goto('./?fast=1&chapter=09')
  await expect(page.getByText('Bonus chapter', { exact: true })).toBeVisible()
  await run(page, 'git status')
  await expect(terminalOutput(page)).toContainText('notes.txt')
})

test('Reset everything goes back to Chapter 1 and survives a reload', async ({ page }) => {
  await page.goto('./?fast=1&chapter=05')
  await run(page, 'git fetch')
  await page.getByRole('button', { name: 'Reset everything' }).click()
  await page
    .getByRole('group', { name: 'Erase all progress and start over?' })
    .getByRole('button', { name: 'Reset' })
    .click()
  await expect(chapterHeading(page, 1)).toBeVisible()
  await expect(terminalOutput(page)).not.toContainText('git fetch')

  await page.goto('./?fast=1')
  await expect(chapterHeading(page, 1)).toBeVisible()
})

test('still playable when the browser won’t let us save', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    })
  })
  await page.goto('./?fast=1')
  await page.getByRole('button', { name: 'Thanks! Happy to be here 👋' }).click()
  await openTab(page, /GitNub/)
  await expectDone(page, 'Open the GitNub tab')
  await run(page, 'help')
  await keepGoing(page)
  await expect(chapterHeading(page, 2)).toBeVisible()
})

test('a save from an older version of Flack is set aside, with a notice', async ({ page }) => {
  // Planted before the app starts, and only once: the app saves over it as soon as it's running.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('planted')) return
    sessionStorage.setItem('planted', '1')
    localStorage.setItem('flack:v1', JSON.stringify({ version: 0, game: {}, scheduled: [] }))
  })
  await page.goto('./')

  const notice = page.getByRole('status').filter({ hasText: 'saved progress' })
  await expect(notice).toContainText('couldn’t be loaded')
  await expect(chapterHeading(page, 1)).toBeVisible()
  await notice.getByRole('button', { name: 'OK' }).click()
  await expect(notice).toBeHidden()

  // The next save replaces the old one, so the notice doesn't come back.
  await page.getByRole('button', { name: 'Thanks! Happy to be here 👋' }).click()
  await page.reload()
  await expect(chapterHeading(page, 1)).toBeVisible()
  await expect(page.getByText(/saved progress couldn’t be loaded/)).toBeHidden()
})

test('the Where are my changes? panel follows a commit to GitNub', async ({ page }) => {
  await page.goto('./?fast=1&chapter=03')
  const where = page.getByRole('region', { name: 'Where are my changes?' })
  // Collapsed by default; expand to see the boxes.
  await where.getByRole('button', { name: 'Where are my changes?' }).click()
  await expect(where).toContainText('1 change in your working files')
  await run(page, 'git config --global user.name "Ada Lovelace"')
  await run(page, 'git config --global user.email ada@inkwell.example')
  await run(page, 'git switch -c ada-team-list')
  await run(page, 'git add team.md')
  await expect(where).toContainText('1 change staged')
  await run(page, 'git commit -m "Add me to the team list"')
  await expect(where).toContainText('1 commit waiting to push')
  await run(page, 'git push -u origin ada-team-list')
  await expect(where).toContainText('your branch is on GitNub with no merge request yet')
})

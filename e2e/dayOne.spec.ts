import { expect, test, type Page } from '@playwright/test'

// `?fast=1` shrinks every scripted delay (typing, Jordan's review, Sam's push) a hundredfold.
const START = './?fast=1'
const NAME = 'Ada Lovelace'
const BRANCH = 'ada-team-list'

async function run(page: Page, line: string) {
  const input = page.getByRole('textbox', { name: /Terminal command/ })
  await input.fill(line)
  await input.press('Enter')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(line)
}

async function openTab(page: Page, name: RegExp) {
  await page.getByRole('tab', { name }).click()
}

const gitnub = (page: Page) => page.getByRole('tabpanel', { name: 'GitNub' })

function step(page: Page, title: string) {
  return page
    .getByRole('complementary', { name: 'Instructions' })
    .getByRole('listitem')
    .filter({ hasText: title })
}

async function expectDone(page: Page, title: string) {
  await expect(step(page, title)).toContainText('(done)')
}

async function keepGoing(page: Page) {
  await expect(page.getByRole('region', { name: 'Chapter complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep going' }).click()
}

async function chapter0(page: Page) {
  await page.getByRole('button', { name: 'Thanks! Happy to be here 👋' }).click()
  await openTab(page, /GitNub/)
  await run(page, 'help')
  await keepGoing(page)
}

async function chapter1(page: Page) {
  await openTab(page, /GitNub/)
  await gitnub(page).getByRole('link', { name: 'docs-site' }).click()
  await gitnub(page).getByRole('button', { name: /Code/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Clone this repository' })
  const url = await dialog.getByRole('textbox', { name: 'Clone address' }).inputValue()
  await dialog.getByRole('button', { name: 'Copy' }).click()
  // Paste what was copied, as a learner would.
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(url)
  await run(page, `git clone ${copied}`)
  await run(page, 'ls')
  await run(page, 'cd docs-site')
  await run(page, 'cat README.md')
  await keepGoing(page)
}

async function signTheList(page: Page) {
  await openTab(page, /Editor/)
  await page
    .getByRole('navigation', { name: 'Files' })
    .getByRole('button', { name: /team\.md/ })
    .click()
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(`- ${NAME}`)
  await page.keyboard.press('ControlOrMeta+s')
}

async function chapter2(page: Page) {
  await signTheList(page)
  await expectDone(page, 'Add your name and save')
  await run(page, 'git status')
  await run(page, 'git diff')
  await keepGoing(page)
}

async function chapter3UpToAdd(page: Page) {
  await run(page, `git switch -c ${BRANCH}`)
  await run(page, 'git add team.md')
  await expectDone(page, 'Stage your change')
}

async function chapter3FromCommit(page: Page) {
  // The first commit fails: Git doesn't know who you are yet.
  await run(page, `git commit -m "Add ${NAME} to the team list"`)
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(
    'Author identity unknown'
  )
  await run(page, `git config --global user.name "${NAME}"`)
  await run(page, 'git config --global user.email "ada@inkwell.example"')
  await run(page, `git commit -m "Add ${NAME} to the team list"`)
  await run(page, `git push -u origin ${BRANCH}`)

  await openTab(page, /GitNub/)
  await gitnub(page).getByRole('link', { name: 'docs-site' }).click()
  await gitnub(page)
    .getByRole('link', { name: /Compare & pull request/ })
    .click()
  await expect(gitnub(page).getByRole('textbox', { name: 'Title' })).toHaveValue(
    `Add ${NAME} to the team list`
  )
  await gitnub(page).getByRole('button', { name: 'Create pull request' }).click()
  await expect(gitnub(page).getByText('approved these changes')).toBeVisible()
  await gitnub(page).getByRole('button', { name: 'Squash and merge' }).click()
  await gitnub(page).getByRole('button', { name: 'Confirm squash and merge' }).click()
  await gitnub(page).getByRole('button', { name: 'Delete branch' }).click()

  await run(page, 'git switch main')
  await run(page, 'git pull')
  await keepGoing(page)
}

async function chapter4(page: Page) {
  await openTab(page, /Flack/)
  await page
    .getByRole('navigation', { name: 'Channels' })
    .getByRole('button', { name: /docs-team/ })
    .click()
  await openTab(page, /Editor/)
  await page
    .getByRole('navigation', { name: 'Files' })
    .getByRole('button', { name: /team\.md/ })
    .click()
  await run(page, 'git pull')
  await expect(page.locator('.cm-content')).toContainText('- Sam Rivera')
  await openTab(page, /Flack/)
  await page.getByRole('button', { name: 'Welcome, Sam! 🎉' }).click()
}

test('plays all of Day one, from hello to the cheat sheet', async ({ page }) => {
  await page.goto(START)
  await chapter0(page)
  await chapter1(page)
  await chapter2(page)
  await chapter3UpToAdd(page)
  await chapter3FromCommit(page)
  await chapter4(page)

  const done = page.getByRole('region', { name: 'Day one complete' })
  await expect(done).toBeVisible()
  await expect(page.getByText(`Nice work today, ${NAME}! 🎉`)).toBeVisible()

  // Exactly one squashed commit of yours on main.
  await openTab(page, /GitNub/)
  await gitnub(page).getByRole('link', { name: 'docs-site' }).click()
  await gitnub(page)
    .getByRole('link', { name: /Commits/ })
    .first()
    .click()
  await expect(gitnub(page).getByText(`Add ${NAME} to the team list (#4)`)).toHaveCount(1)

  await done.getByRole('link', { name: 'Open the cheat sheet' }).click()
  await expect(page).toHaveURL(/#\/cheat-sheet$/)
  await expect(page.getByRole('heading', { name: 'The daily loop', level: 1 })).toBeVisible()
})

test('a reload in the middle of Chapter 3 picks up where you left off', async ({ page }) => {
  await page.goto(START)
  await chapter0(page)
  await chapter1(page)
  await chapter2(page)
  await chapter3UpToAdd(page)

  await page.reload()
  await expect(page.getByText('Chapter 4 of 5')).toBeVisible()
  await expectDone(page, 'Stage your change')
  await run(page, 'git status')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(
    'Changes to be committed'
  )
  await chapter3FromCommit(page)
  await chapter4(page)
  await expect(page.getByRole('region', { name: 'Day one complete' })).toBeVisible()
})

test('Restart chapter puts the chapter back how it started', async ({ page }) => {
  await page.goto(START)
  await chapter0(page)
  await chapter1(page)
  await signTheList(page)
  await expectDone(page, 'Add your name and save')

  await page.getByRole('button', { name: 'Restart chapter' }).click()
  await page
    .getByRole('group', { name: 'Start this chapter again?' })
    .getByRole('button', { name: 'Restart' })
    .click()

  await expect(step(page, 'Add your name and save')).toContainText('(not started)')
  await run(page, 'cat team.md')
  await expect(page.getByRole('log', { name: 'Terminal output' })).not.toContainText(NAME)
  await chapter2(page)
})

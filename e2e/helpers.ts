import { expect, type Page } from '@playwright/test'

export async function run(page: Page, line: string) {
  const input = page.getByRole('textbox', { name: /Terminal command/ })
  await input.fill(line)
  await input.press('Enter')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(line)
}

export async function openTab(page: Page, name: RegExp) {
  await page.getByRole('tab', { name }).click()
}

export const gitnub = (page: Page) => page.getByRole('tabpanel', { name: 'GitNub' })

export const terminalOutput = (page: Page) => page.getByRole('log', { name: 'Terminal output' })

export function step(page: Page, title: string) {
  return page
    .getByRole('complementary', { name: 'Instructions' })
    .getByRole('listitem')
    .filter({ hasText: title })
}

export async function expectDone(page: Page, title: string) {
  await expect(step(page, title)).toContainText('(done)')
}

export async function keepGoing(page: Page) {
  await expect(page.getByRole('region', { name: 'Chapter complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep going' }).click()
}

/** Double-clicks a word in the Editor to select it, as a learner would before retyping it. */
export async function selectWordInEditor(page: Page, word: string) {
  const box = await page.locator('.cm-content').evaluate((content, target) => {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(target) ?? -1
      if (at === -1) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + target.length)
      const rect = range.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    return undefined
  }, word)
  if (!box) throw new Error(`“${word}” isn’t in the Editor`)
  await page.mouse.dblclick(box.x, box.y)
}

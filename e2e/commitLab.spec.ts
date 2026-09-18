import { expect, test } from '@playwright/test'

// Chapter 3's Ask Robin includes "What does Squash and merge mean?", which links to the lab.
test('Ask Robin opens the Commit Lab, and a real drag squashes commits', async ({ page }) => {
  await page.goto('./?fast=1&chapter=03')
  await page.getByRole('tab', { name: /Flack/ }).click()
  await page
    .getByRole('navigation', { name: 'Channels' })
    .getByRole('button', { name: /Robin Okafor/ })
    .click()
  await page
    .getByRole('list', { name: 'Questions you can ask Robin' })
    .getByRole('button', { name: /Squash and merge/ })
    .click()
  await page.getByRole('button', { name: 'Try it in the Commit Lab' }).click()

  const lab = page.getByRole('dialog', { name: 'Play with a commit graph' })
  await expect(lab).toBeVisible()
  const commit = (label: string) => lab.getByRole('button', { name: new RegExp(`^${label},`) })

  await commit('Draft the intro').dragTo(commit('Add a tip about links'))
  await lab.getByRole('button', { name: 'Squash into here' }).click()
  await expect(commit('Draft the intro \\+ wip \\+ Add a tip about links')).toBeVisible()
  await expect(lab.getByText(/^Squash turns several small commits/)).toBeVisible()

  // Keyboard: rebase the squashed commit onto main's newest.
  await commit('Draft the intro \\+ wip \\+ Add a tip about links').focus()
  await page.keyboard.press('Enter')
  await commit('Fix a typo').focus()
  await page.keyboard.press('Enter')
  await lab.getByRole('button', { name: 'Rebase onto here' }).click()
  await expect(commit('Draft the intro \\+ wip \\+ Add a tip about links')).toHaveAccessibleName(
    /a new copy/
  )

  await lab.getByRole('button', { name: 'I get it' }).click()
  await expect(lab).toBeHidden()
})

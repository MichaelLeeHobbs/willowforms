/*
 * A hidden component stays authorable on the canvas. Needs a browser: drop targeting measures
 * real rectangles, and jsdom gives every element a zero one.
 */

import type { Page } from '@playwright/test'

import { dragFrom, expect, stableBox, test } from './harness.js'

const hide = async (designer: { page: Page }): Promise<void> => {
  await designer.page.getByLabel('Show when').selectOption('never')
}

test('a hidden container stays on the canvas and says it is hidden', async ({ designer }) => {
  await designer.select('name')
  await designer.openTab('Properties')
  await hide(designer)

  await expect(designer.node('name')).toBeVisible()
  await expect(designer.node('name')).toHaveAttribute('data-fs-hidden', 'true')
  await expect(designer.page.locator('.fs-selection__label')).toContainText('Hidden in preview')
  // Its children come with it, or a conditional container is still a hole.
  await expect(designer.node('firstName')).toBeVisible()
})

test('a component that is shown carries no marker', async ({ designer }) => {
  // The count below proves the marker is emitted at all, so "not hidden" is not vacuous.
  await expect(designer.node('email')).not.toHaveAttribute('data-fs-hidden', 'true')

  await designer.select('name')
  await designer.openTab('Properties')
  await designer.page.getByLabel('Show when').selectOption('never')

  await expect(designer.page.locator('[data-fs-hidden="true"]')).not.toHaveCount(0)
  await expect(designer.node('email')).not.toHaveAttribute('data-fs-hidden', 'true')
})

test('something can still be dropped into a hidden container', async ({ designer }) => {
  await designer.select('name')
  await designer.openTab('Properties')
  await hide(designer)

  await designer.openTab('Components')
  /*
   * `stableBox` for both ends. `boundingBox()` reports coordinates for a
   * palette entry below the fold as readily as for one on screen, and the
   * press then lands outside the window -- Trap 13, and the incident this
   * repository already had.
   */
  const target = await stableBox(designer.node('firstName'))
  const start = await dragFrom(
    designer.page.getByRole('button', { name: 'Text field', exact: true }),
  )

  await designer.page.mouse.move(start.x + 40, start.y + start.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(start.x + 50, start.y + 12, { steps: 4 })
  // The right half of firstName, inside the `name` row.
  await designer.page.mouse.move(target.x + target.width - 4, target.y + target.height / 2, {
    steps: 12,
  })
  await designer.page.mouse.up()

  const doc = await designer.document()
  const row = doc.root.children?.find((child) => child.key === 'name')
  expect(row?.children?.map((child) => child.key)).toContain('textField')
})

test('preview still hides it, because that is what a user sees', async ({ designer }) => {
  await designer.select('name')
  await designer.openTab('Properties')
  await hide(designer)
  await expect(designer.node('name')).toBeVisible()

  await designer.page.getByRole('button', { name: 'Preview' }).click()

  await expect(designer.node('name')).toHaveCount(0)
  await expect(designer.node('email')).toBeVisible()
})

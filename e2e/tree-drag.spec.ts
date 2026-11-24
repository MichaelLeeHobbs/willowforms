// Dragging a row in the structure tree. Needs real layout: the tree measures its rows.

import type { Page } from '@playwright/test'

import { dragFrom, dragOnto, expect, stableBox, test } from './harness.js'

const TREE_ROW = '.fs-tree__row'

test('a row dragged onto a container row moves inside it', async ({ designer }) => {
  expect(await designer.childrenOf('name')).toEqual(['firstName', 'lastName'])

  await dragOnto(designer.page, designer.row('website'), designer.row('name'), 'middle')

  await expect.poll(() => designer.childrenOf('name')).toEqual(['website', 'firstName', 'lastName'])
  expect(await designer.rootChildren()).not.toContain('website')
  await expect(designer.row('website')).toHaveAttribute('aria-level', '3')
})

test('a row dragged between rows lands where the line showed', async ({ designer }) => {
  const before = await designer.rootChildren()

  await dragOnto(designer.page, designer.row('submit'), designer.row('email'), 'top')

  const moved = before.filter((key) => key !== 'submit')
  moved.splice(moved.indexOf('email'), 0, 'submit')
  await expect.poll(() => designer.rootChildren()).toEqual(moved)
})

test('a row dragged out of its container lands beside the row it was dropped under', async ({
  designer,
}) => {
  const before = await designer.rootChildren()

  await dragOnto(designer.page, designer.row('firstName'), designer.row('email'), 'bottom')

  await expect.poll(() => designer.childrenOf('name')).toEqual(['lastName'])
  const moved = [...before]
  moved.splice(moved.indexOf('email') + 1, 0, 'firstName')
  expect(await designer.rootChildren()).toEqual(moved)
})

async function dragOver(
  designer: { page: Page },
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number },
): Promise<void> {
  await designer.page.mouse.move(from.x + 40, from.y + from.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(from.x + 50, from.y + from.height / 2 + 12, { steps: 4 })
  await designer.page.mouse.move(to.x, to.y, { steps: 12 })
}

test('the row under the pointer says where a drop would go, and Escape drops nothing', async ({
  designer,
}) => {
  const before = await designer.rootChildren()
  const from = await dragFrom(designer.row('website'))
  const container = await stableBox(designer.row('name'))
  const field = await stableBox(designer.row('email'))

  await dragOver(designer, from, { x: container.x + 40, y: container.y + container.height / 2 })
  await expect(designer.page.locator(TREE_ROW + '.is-drop-inside')).toHaveAttribute(
    'data-fs-tree-row',
    'name',
  )

  await designer.page.mouse.move(field.x + 40, field.y + 3, { steps: 6 })
  await expect(designer.page.locator(TREE_ROW + '.is-drop-before')).toHaveAttribute(
    'data-fs-tree-row',
    'email',
  )

  await designer.page.mouse.move(field.x + 40, field.y + field.height - 3, { steps: 6 })
  await expect(designer.page.locator(TREE_ROW + '.is-drop-after')).toHaveAttribute(
    'data-fs-tree-row',
    'email',
  )

  await designer.page.keyboard.press('Escape')
  await designer.page.mouse.up()

  await expect(designer.page.locator('[class*="is-drop-"]')).toHaveCount(0)
  // A later, accepted drag, so the order above it is not read before the Escape could have dropped.
  await dragOnto(designer.page, designer.row('submit'), designer.row('heading'), 'top')
  await expect
    .poll(() => designer.rootChildren())
    .toEqual(['submit', ...before.filter((key) => key !== 'submit')])
})

test('a container is not dropped into its own child', async ({ designer }) => {
  const before = await designer.rootChildren()
  const from = await dragFrom(designer.row('name'))
  const child = await stableBox(designer.row('firstName'))

  await dragOver(designer, from, { x: child.x + 40, y: child.y + child.height - 3 })
  await expect(designer.page.locator('.fs-drag-label')).toBeVisible()
  await expect(designer.page.locator('[class*="is-drop-"]')).toHaveCount(0)
  await designer.page.mouse.up()
  await expect(designer.page.locator('.fs-drag-label')).toHaveCount(0)

  await dragOnto(designer.page, designer.row('submit'), designer.row('heading'), 'top')
  await expect
    .poll(() => designer.rootChildren())
    .toEqual(['submit', ...before.filter((key) => key !== 'submit')])
  expect(await designer.childrenOf('name')).toEqual(['firstName', 'lastName'])
})

// Dragging a row in the structure tree. Needs real layout: the tree measures its rows.

import { dragOnto, dragOver, expect, stableBox, test } from './harness.js'

const TREE_ROW = '.fs-tree__row'

test('a row dragged onto a container row moves inside it', async ({ designer }) => {
  expect(await designer.childrenOf('name')).toEqual(['firstName', 'lastName'])

  await dragOnto(designer.page, designer.row('website'), designer.row('name'), 'middle')

  await expect.poll(() => designer.childrenOf('name')).toEqual(['website', 'firstName', 'lastName'])
  expect(await designer.rootChildren()).not.toContain('website')
  await expect(designer.row('website')).toHaveAttribute('aria-level', '3')
})

test('a row dragged up lands above the row it was dropped over', async ({ designer }) => {
  const before = await designer.rootChildren()

  await dragOnto(designer.page, designer.row('submit'), designer.row('email'), 'top')

  const moved = before.filter((key) => key !== 'submit')
  moved.splice(moved.indexOf('email'), 0, 'submit')
  await expect.poll(() => designer.rootChildren()).toEqual(moved)
})

// Taking the row out first shifts every row below it up by one.
test('a row dragged down lands directly below the row it was dropped under', async ({
  designer,
}) => {
  const before = await designer.rootChildren()

  await dragOnto(designer.page, designer.row('heading'), designer.row('email'), 'bottom')

  const moved = before.filter((key) => key !== 'heading')
  moved.splice(moved.indexOf('email') + 1, 0, 'heading')
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

test('the row under the pointer says where a drop would go, and Escape drops nothing', async ({
  designer,
}) => {
  const before = await designer.rootChildren()
  // Not the row below `email`, which a drop under `email` would leave where it is.
  await dragOver(designer.page, designer.row('subscribe'), designer.row('name'), 'middle')
  await expect(designer.page.locator(TREE_ROW + '.is-drop-inside')).toHaveAttribute(
    'data-fs-tree-row',
    'name',
  )

  const field = await stableBox(designer.row('email'))
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
  // A later, accepted drag, so the order is not read before a drop on release could be saved.
  await dragOnto(designer.page, designer.row('submit'), designer.row('heading'), 'top')
  await expect
    .poll(() => designer.rootChildren())
    .toEqual(['submit', ...before.filter((key) => key !== 'submit')])
})

test('a container is not dropped into its own child', async ({ designer }) => {
  const before = await designer.rootChildren()

  await dragOver(designer.page, designer.row('name'), designer.row('firstName'), 'bottom')
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

/*
 * Drop targeting needs real rectangles. The canvas has no data, so edit mode draws one row to
 * make a repeater's subtree reachable.
 */

import { dragOnto, expect, test } from './harness.js'

test('a repeater is authorable even though it has no rows', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()

  await expect(designer.node('repeater')).toBeVisible()
  await expect(designer.node('repeater')).not.toHaveAttribute('data-fs-row', /.*/)
})

test('a field dropped into a repeater lands in the authored row, once', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()

  await dragOnto(
    designer.page,
    designer.page.getByRole('button', { name: 'Text field', exact: true }),
    designer.node('repeater'),
  )

  // One node in the document, not one per row: rows are a projection of the authored subtree.
  await expect.poll(() => designer.childrenOf('repeater')).toEqual(['textField'])

  // Row zero is the one edit mode draws.
  await expect(designer.node('textField')).toHaveAttribute('data-fs-row', 'repeater[0]')
})

/*
 * Nothing in the designer adds a row, so rows per answer are covered against supplied data in
 * `renderer.test.tsx`.
 */
test('preview renders the repeater and draws no rows until there are answers', async ({
  designer,
}) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()

  await dragOnto(
    designer.page,
    designer.page.getByRole('button', { name: 'Text field', exact: true }),
    designer.node('repeater'),
  )

  await designer.page.getByRole('button', { name: 'Preview' }).click()

  // A control: without these, the zero count below could be an empty page.
  await expect(designer.page.locator('[data-fs-key="email"]')).toBeVisible()
  await expect(designer.node('repeater')).toBeVisible()

  await expect(designer.page.locator('[data-fs-key="textField"]')).toHaveCount(0)

  await expect(designer.page.locator('.fs-canvas__data pre').first()).not.toContainText('repeater')
})

test('a row is addressed by the repeater data key, not its node key', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()
  // Adding while the repeater is selected puts the field inside it.
  await designer.page.getByRole('button', { name: 'Text field', exact: true }).click()

  await expect(designer.node('textField')).toHaveAttribute('data-fs-row', 'repeater[0]')

  await designer.openTab('Tree')
  await designer.select('repeater')
  await designer.openTab('Properties')

  const dataKey = designer.page.getByLabel('Data key')
  await dataKey.fill('contacts')
  await dataKey.press('Enter')

  await expect(designer.node('textField')).toHaveAttribute('data-fs-row', 'contacts[0]')

  // The key must stay `repeater`; a rename that also moved the key would prove nothing.
  await expect
    .poll(async () => {
      const { root } = await designer.document()
      return root.children?.find((child) => child.key === 'repeater')?.dataKey
    })
    .toBe('contacts')
})

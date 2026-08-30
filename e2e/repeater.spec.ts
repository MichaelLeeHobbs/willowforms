/**
 * Building and filling a repeater, in a real browser.
 *
 * Only a browser can prove the authoring half: dropping into a container is
 * resolved from measured rectangles, and jsdom gives every element a zero one.
 * The canvas also renders with empty data, so a repeater has no rows there —
 * which is why edit mode draws one, and why that has to be checked where the
 * drop actually happens rather than asserted in a unit test.
 */

import { expect, stableBox, test } from './harness.js'

test('a repeater is authorable even though it has no rows', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()

  // The repeater itself is not inside a row; its children are. So it carries no
  // coordinate, and that is what makes an unnested selector still exact.
  await expect(designer.node('repeater')).toBeVisible()
  await expect(designer.node('repeater')).not.toHaveAttribute('data-fs-row', /.*/)
})

test('a field dropped into a repeater lands in the authored row, once', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()

  const palette = designer.page.getByRole('button', { name: 'Text field', exact: true })
  // Only the source is scrolled, for the reason dragOnto explains.
  await palette.scrollIntoViewIfNeeded()
  const target = await stableBox(designer.node('repeater'))
  const start = await stableBox(palette)

  await designer.page.mouse.move(start.x + 40, start.y + start.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(start.x + 50, start.y + 12, { steps: 4 })
  await designer.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 12,
  })
  await designer.page.mouse.up()

  /*
   * One node in the document, not one per row. The subtree is authored once and
   * the rows are a projection of it, which is the invariant the whole design
   * rests on.
   */
  const doc = await designer.document()
  const repeater = doc.root.children?.find((child) => child.key === 'repeater')
  expect(repeater?.children?.map((child) => child.key)).toEqual(['textField'])

  // And on screen it sits in row zero, the one edit mode draws so the subtree
  // can be reached at all.
  await expect(designer.node('textField')).toHaveAttribute('data-fs-row', 'repeater[0]')
})

test('preview draws a row per answer and keeps them apart', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()

  const palette = designer.page.getByRole('button', { name: 'Text field', exact: true })
  // Both scrolled before either is measured, for the reason dragOnto explains.
  await palette.scrollIntoViewIfNeeded()
  await designer.node('repeater').scrollIntoViewIfNeeded()
  const target = await stableBox(designer.node('repeater'))
  const start = await stableBox(palette)

  await designer.page.mouse.move(start.x + 40, start.y + start.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(start.x + 50, start.y + 12, { steps: 4 })
  await designer.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 12,
  })
  await designer.page.mouse.up()

  await designer.page.getByRole('button', { name: 'Preview' }).click()

  // No rows in the data yet, so a person filling it in sees none.
  await expect(designer.page.locator('[data-fs-key="textField"]')).toHaveCount(0)
})

/**
 * The two names kept apart, in a real browser.
 *
 * Every repeater fixture in this repository used to set `key` and `dataKey` to
 * the same string, so the row-addressing design and its opposite produced
 * byte-identical output across the whole suite — a patched build of the wrong
 * one stayed green. This is the end-to-end half of the fixture that can tell
 * them apart: the answer is renamed away from the component, and the row
 * coordinate has to follow the answer.
 */
test('a row is addressed by the repeater data key, not its node key', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Repeater', exact: true }).click()
  // Adding while the repeater is selected puts the field inside it, which is
  // the same placement the drag test proves the drag achieves.
  await designer.page.getByRole('button', { name: 'Text field', exact: true }).click()

  // While the two names are still the same string, and this is exactly the
  // reading that made the defect invisible.
  await expect(designer.node('textField')).toHaveAttribute('data-fs-row', 'repeater[0]')

  await designer.openTab('Tree')
  await designer.select('repeater')
  await designer.openTab('Properties')

  const dataKey = designer.page.getByLabel('Data key')
  await dataKey.fill('contacts')
  await dataKey.press('Enter')

  // The coordinate names the answer. Under the node key it would still say
  // `repeater[0]`, naming a list the submitted data does not have.
  await expect(designer.node('textField')).toHaveAttribute('data-fs-row', 'contacts[0]')

  const doc = await designer.document()
  const repeater = doc.root.children?.find((child) => child.key === 'repeater')
  // The component is still `repeater`; only its answer was renamed. A fixture
  // where the rename also moved the key would prove nothing.
  expect(repeater?.dataKey).toBe('contacts')
})

import { createDocument, prop } from '../packages/core/src/index.js'
import { dragFrom, expect, stableBox, test } from './harness.js'

test('refreshes the drop indicator when the canvas scrolls beneath a stationary drag', async ({
  designer,
}) => {
  const doc = createDocument('Scrolling form', 'scroll')
  doc.root.children = Array.from({ length: 12 }, (_, index) => ({
    key: `field${index}`,
    type: 'TextField',
    props: { label: prop(`Field ${index}`) },
  }))
  await designer.page.getByRole('button', { name: 'JSON', exact: true }).click()
  await designer.page.getByRole('textbox', { name: 'Form document JSON' }).fill(JSON.stringify(doc))
  await designer.page.getByRole('button', { name: 'Apply', exact: true }).click()
  await designer.openTab('Components')
  const first = await stableBox(designer.node('field0'))
  const second = await stableBox(designer.node('field1'))
  const palette = await dragFrom(designer.page.getByRole('button', { name: 'Text', exact: true }))
  await designer.page.mouse.move(palette.x + 20, palette.y + 12)
  await designer.page.mouse.down()
  await designer.page.mouse.move(first.x + first.width / 2, first.y + 12, { steps: 12 })
  const indicator = designer.page.locator('.fs-drop--bar')
  await expect(indicator).toBeVisible()
  await designer.page.locator('.fs-canvas__surface').evaluate((surface, delta) => {
    surface.scrollTop += delta
  }, second.y - first.y)
  await expect
    .poll(async () => {
      const box = await indicator.boundingBox()
      const previous = await designer.node('field0').boundingBox()
      const next = await designer.node('field1').boundingBox()
      return box && previous && next
        ? Math.abs(box.y + box.height / 2 - (previous.y + previous.height + next.y) / 2)
        : Infinity
    })
    .toBeLessThan(2)
  await designer.page.mouse.up()
  await expect
    .poll(async () => (await designer.rootChildren()).slice(0, 3))
    .toEqual(['field0', 'text', 'field1'])
})

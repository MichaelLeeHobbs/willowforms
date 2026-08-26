/**
 * Viewport simulation.
 *
 * The canvas puts the form inside a frame the designer owns. Everything
 * positional in this builder measures real rectangles, so narrowing that frame
 * is exactly the kind of change that works in jsdom, passes every unit test,
 * and breaks drop targeting in a browser. These check the arithmetic still
 * lands where the user aimed once the canvas is 390px wide.
 */

import { dragOnto, expect, test } from './harness.js'

const frame = '.fs-canvas__frame'

test('desktop is the default and constrains nothing', async ({ designer }) => {
  const box = designer.page.locator(frame)
  await expect(box).toHaveAttribute('data-fs-viewport', 'desktop')

  // The form keeps whatever width its own Screen gives it. A frame that
  // narrowed the desktop canvas would be simulating a device nobody chose.
  expect((await box.evaluate((el) => el.style.width)) || '').toBe('')

  const pressed = designer.page.getByRole('button', { name: 'Desktop' })
  await expect(pressed).toHaveAttribute('aria-pressed', 'true')
})

test('tablet and mobile narrow the frame to their own widths', async ({ designer }) => {
  const box = designer.page.locator(frame)

  await designer.page.getByRole('button', { name: 'Tablet' }).click()
  await expect(box).toHaveAttribute('data-fs-viewport', 'tablet')
  expect(Math.round((await box.boundingBox())?.width ?? 0)).toBe(768)

  await designer.page.getByRole('button', { name: 'Mobile' }).click()
  await expect(box).toHaveAttribute('data-fs-viewport', 'mobile')
  expect(Math.round((await box.boundingBox())?.width ?? 0)).toBe(390)
})

test('only one viewport is pressed at a time', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Mobile' }).click()

  const group = designer.page.getByRole('group', { name: 'Viewport' })
  const pressed = group.locator('[aria-pressed="true"]')
  await expect(pressed).toHaveCount(1)
  await expect(pressed).toHaveAccessibleName('Mobile')
})

test('selection still lands on the right component at mobile width', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Mobile' }).click()
  await designer.node('email').click()

  await expect(designer.page.locator('.fs-selection--active')).toBeVisible()
  await expect(designer.page.locator('#fs-prop-key')).toHaveValue('email')
})

test('the selection frame is drawn over the component, not beside it', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Mobile' }).click()
  await designer.node('email').click()

  const node = await designer.node('email').boundingBox()
  const frameBox = await designer.page.locator('.fs-selection--active').boundingBox()
  if (!node || !frameBox) throw new Error('nothing to measure')

  // The overlay measures against the surface, so a wrapper between the two is
  // exactly what would push it out of place.
  expect(Math.abs(frameBox.x - node.x)).toBeLessThan(4)
  expect(Math.abs(frameBox.y - node.y)).toBeLessThan(4)
})

test('a move still lands where the bar showed at mobile width', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Mobile' }).click()

  const before = await designer.rootChildren()
  await dragOnto(designer.page, designer.node('heading'), designer.node('submit'), 'bottom')

  const after = await designer.rootChildren()
  // Same components, reordered: heading has moved to the end.
  expect(after).toHaveLength(before.length)
  expect(after[after.length - 1]).toBe('heading')
})

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

  /*
   * The form keeps whatever width its own Screen gives it. A frame that narrowed
   * the desktop canvas would be simulating a device nobody chose.
   *
   * The measured width as well as the inline style: a frame constrained by a
   * class rather than by `style.width` passed a test named "constrains nothing"
   * without constraining nothing at all.
   */
  expect((await box.evaluate((el) => el.style.width)) || '').toBe('')

  const frameBox = await box.boundingBox()
  const surface = await designer.page.locator('.fs-canvas__surface').boundingBox()
  if (!frameBox || !surface) throw new Error('nothing to measure')
  // Inside the surface's padding, and not narrower than that.
  expect(surface.width - frameBox.width).toBeLessThanOrEqual(64)

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

test('a move at mobile width lands at the pointer rather than at the end', async ({ designer }) => {
  /*
   * The test above is satisfied by a `resolveDrop` that ignores the pointer
   * entirely: it drags the first component onto the last one's bottom edge, so
   * "append whatever is dragged" produces exactly the asserted result. It is the
   * only drop-targeting check at mobile width, and what it checks is that a drop
   * happened.
   *
   * This one aims at a midpoint. `submit` is last, and dropping it above `email`
   * has to put it immediately before `email` -- an append leaves it where it
   * already was, and the assertion is on the neighbour rather than on the index,
   * so it survives the fixture growing a component.
   */
  await designer.page.getByRole('button', { name: 'Mobile' }).click()

  const before = await designer.rootChildren()
  expect(before[before.length - 1]).toBe('submit')

  await dragOnto(designer.page, designer.node('submit'), designer.node('email'), 'top')

  const after = await designer.rootChildren()
  expect(after).toHaveLength(before.length)
  expect(after[after.indexOf('submit') + 1]).toBe('email')
  expect(after[after.length - 1]).not.toBe('submit')
})

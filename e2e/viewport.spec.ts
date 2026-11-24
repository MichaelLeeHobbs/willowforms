// A narrowed canvas frame can break positional arithmetic that only a browser measures.

import { dragOnto, expect, test } from './harness.js'

const frame = '.fs-canvas__frame'

test('desktop is the default and constrains nothing', async ({ designer }) => {
  const box = designer.page.locator(frame)
  await expect(box).toHaveAttribute('data-fs-viewport', 'desktop')

  // The measured width as well as the inline style: a class could constrain the frame too.
  expect((await box.evaluate((el) => el.style.width)) || '').toBe('')

  const frameBox = await box.boundingBox()
  if (!frameBox) throw new Error('nothing to measure')
  // `clientWidth` leaves out a scrollbar, so this is all the room the frame has.
  const room = await designer.page.locator('.fs-canvas__surface').evaluate((element) => {
    const style = getComputedStyle(element)
    return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  })
  expect(Math.abs(frameBox.width - room)).toBeLessThanOrEqual(1)

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
  await expect(designer.page.getByRole('textbox', { name: 'Key', exact: true })).toHaveValue(
    'email',
  )
})

test('the selection frame is drawn over the component, not beside it', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Mobile' }).click()
  await designer.node('email').click()

  const node = await designer.node('email').boundingBox()
  const frameBox = await designer.page.locator('.fs-selection--active').boundingBox()
  if (!node || !frameBox) throw new Error('nothing to measure')

  // The overlay measures against the surface, so a wrapper between them would offset it.
  expect(Math.abs(frameBox.x - node.x)).toBeLessThan(4)
  expect(Math.abs(frameBox.y - node.y)).toBeLessThan(4)
})

test('a move still lands where the bar showed at mobile width', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Mobile' }).click()

  const before = await designer.rootChildren()
  await dragOnto(designer.page, designer.node('heading'), designer.node('submit'), 'bottom')

  await expect
    .poll(() => designer.rootChildren())
    .toEqual([...before.filter((key) => key !== 'heading'), 'heading'])
})

test('a move at mobile width lands at the pointer rather than at the end', async ({ designer }) => {
  /*
   * The test above also passes if drops ignore the pointer and append. This asserts the
   * neighbour rather than the index, so a growing fixture does not break it.
   */
  await designer.page.getByRole('button', { name: 'Mobile' }).click()

  const before = await designer.rootChildren()
  expect(before[before.length - 1]).toBe('submit')

  await dragOnto(designer.page, designer.node('submit'), designer.node('email'), 'top')

  const moved = before.filter((key) => key !== 'submit')
  moved.splice(moved.indexOf('email'), 0, 'submit')
  await expect.poll(() => designer.rootChildren()).toEqual(moved)
})

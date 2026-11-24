// Needs real layout: jsdom gives every rectangle zero size.

import { dragFrom, dragOnto, expect, stableBox, test } from './harness.js'

test('clicking a component on the canvas selects it and shows its properties', async ({
  designer,
}) => {
  await designer.node('email').click()

  const frame = designer.page.locator('.fs-selection--active')
  await expect(frame).toBeVisible()
  await expect(designer.page.locator('.fs-selection__label')).toHaveText('TextField')
  await expect(designer.page.getByRole('textbox', { name: 'Key', exact: true })).toHaveValue(
    'email',
  )
})

test('the selection frame sits on the component it selected', async ({ designer }) => {
  await designer.node('email').click()

  const frame = await designer.page.locator('.fs-selection--active').boundingBox()
  const node = await designer.node('email').boundingBox()
  if (!frame || !node) throw new Error('nothing to measure')

  // All four sides: forgetting the scroll offset can leave the position right and the height wrong.
  expect(Math.abs(frame.x - node.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.y - node.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.width - node.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.height - node.height)).toBeLessThanOrEqual(1)
})

test('the frame follows the component when the canvas scrolls', async ({ designer }) => {
  await designer.page.setViewportSize({ width: 1280, height: 420 })

  const surface = designer.page.locator('.fs-canvas__surface')
  const overflow = await surface.evaluate((element) => element.scrollHeight - element.clientHeight)
  expect(overflow, 'the canvas has to overflow or there is no scroll to follow').toBeGreaterThan(
    120,
  )

  await designer.node('message').click()
  const before = await stableBox(designer.node('message'))

  await surface.evaluate((element) => {
    element.scrollTop = 120
    element.dispatchEvent(new Event('scroll'))
  })

  // Distance, not direction: the click already scrolled the target into view, so it may move down.
  expect(await surface.evaluate((element) => element.scrollTop)).toBe(120)
  const node = await stableBox(designer.node('message'))
  expect(Math.abs(before.y - node.y)).toBeGreaterThan(100)

  const frame = await designer.page.locator('.fs-selection--active').boundingBox()
  if (!frame) throw new Error('nothing to measure')
  expect(Math.abs(frame.y - node.y)).toBeLessThanOrEqual(1)
})

test('selecting a field does not type into it, and the keystrokes reach the shell', async ({
  designer,
}) => {
  const input = designer.node('email').locator('input')
  await designer.node('email').locator('input').click()
  await designer.page.keyboard.type('typed')

  await expect(input).toHaveValue('')

  await expect(
    designer.page.evaluate(() => document.activeElement?.classList.contains('fs-shell') === true),
  ).resolves.toBe(true)
})

test('clicking a select does not open its dropdown', async ({ designer }) => {
  await designer.node('topic').click()

  // Waits for the frame first: `toHaveCount(0)` passes at once, before a dropdown could open.
  await expect(designer.page.locator('.fs-selection--active')).toBeVisible()
  await expect(designer.page.locator('.MuiPopover-root, .MuiMenu-root')).toHaveCount(0)
})

test('dragging from the palette drops the component where the bar showed', async ({ designer }) => {
  await designer.openTab('Components')
  const before = await designer.rootChildren()
  expect(before).not.toContain('checkbox')

  await dragOnto(
    designer.page,
    designer.page.getByRole('button', { name: 'Checkbox', exact: true }),
    designer.node('email'),
    'top',
  )

  await expect
    .poll(async () => (await designer.rootChildren()).indexOf('checkbox'))
    .toBe(before.indexOf('email'))
})

test('dragging a component on the canvas moves it', async ({ designer }) => {
  await dragOnto(designer.page, designer.node('heading'), designer.node('submit'), 'bottom')

  await expect.poll(async () => (await designer.rootChildren()).at(-1)).toBe('heading')
})

test('dropping into a row container infers the horizontal axis', async ({ designer }) => {
  await designer.openTab('Components')
  const palette = designer.page.getByRole('button', { name: 'Text field', exact: true })
  const start = await dragFrom(palette)
  const first = await stableBox(designer.node('firstName'))

  await designer.page.mouse.move(start.x + 40, start.y + start.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(start.x + 50, start.y + 12, { steps: 4 })
  // The right half of firstName: between firstName and lastName.
  await designer.page.mouse.move(first.x + first.width - 4, first.y + first.height / 2, {
    steps: 12,
  })
  await designer.page.mouse.up()

  await expect
    .poll(() => designer.childrenOf('name'))
    .toEqual(['firstName', 'textField', 'lastName'])
})

test('a plain click is still a click, not a swallowed drag', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Checkbox', exact: true }).click()

  await expect.poll(() => designer.rootChildren()).toContain('checkbox')
})

test('Escape abandons a drag without changing the document', async ({ designer }) => {
  const before = await designer.rootChildren()
  const from = await dragFrom(designer.node('heading'))
  const to = await stableBox(designer.node('submit'))

  await designer.page.mouse.move(from.x + 40, from.y + from.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(from.x + 50, from.y + 20, { steps: 4 })
  await designer.page.mouse.move(to.x + 40, to.y + to.height - 3, { steps: 12 })
  await expect(designer.page.locator('.fs-drag-label')).toBeVisible()

  await designer.page.keyboard.press('Escape')
  await designer.page.mouse.up()

  await expect(designer.page.locator('.fs-drag-label')).toHaveCount(0)

  // Polled: the playground persists from a passive effect, after `press()` has resolved.
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

test('the palette does not offer the root component', async ({ designer }) => {
  await designer.openTab('Components')
  const panel = designer.page.locator('.fs-panel').first()
  await expect(panel.getByRole('button', { name: 'Screen', exact: true })).toHaveCount(0)

  // A control: the palette is not simply empty.
  await expect(panel.getByRole('button', { name: 'Stack', exact: true })).toBeVisible()
})

test('every palette entry carries an icon beside its label', async ({ designer }) => {
  await designer.openTab('Components')
  const items = designer.page.locator('.fs-palette__item')
  const count = await items.count()
  expect(count).toBeGreaterThan(5)

  // An icon that renders no geometry is a blank square, which looks like a bug.
  for (let i = 0; i < count; i++) {
    const glyph = items.nth(i).locator('svg.fs-icon')
    await expect(glyph).toHaveCount(1)
    expect(await glyph.locator('*').count()).toBeGreaterThan(0)
  }
})

test('the selection frame carries a toolbar, and the root does not', async ({ designer }) => {
  await designer.node('email').click()
  await expect(designer.page.locator('.fs-selection__toolbar')).toBeVisible()

  await designer.row('root').click()
  await expect(designer.page.locator('.fs-selection__toolbar')).toHaveCount(0)
})

test('the toolbar is clickable, despite sitting on a frame that is not', async ({ designer }) => {
  await designer.node('email').click()
  const before = await designer.rootChildren()

  await designer.page.getByRole('button', { name: 'Duplicate email' }).click()

  const at = before.indexOf('email') + 1
  await expect
    .poll(() => designer.rootChildren())
    .toEqual([...before.slice(0, at), 'email2', ...before.slice(at)])
})

test('add a sibling makes a fresh component, not a copy', async ({ designer }) => {
  const before = await designer.rootChildren()
  await designer.node('email').click()
  await designer.page.getByRole('button', { name: 'Add a sibling after email' }).click()
  await expect.poll(() => designer.rootChildren()).toHaveLength(before.length + 1)

  const doc = await designer.document()
  const children = doc.root.children ?? []
  const added = children[children.findIndex((child) => child.key === 'email') + 1]

  expect(added?.type).toBe('TextField')
  expect(added?.key).not.toBe('email2')
  expect(added?.props['label']).toEqual({ kind: 'static', value: 'Label' })
})

test('the toolbar removes the selected component', async ({ designer }) => {
  await designer.node('website').click()

  // Scoped: the tree row has a Remove button with the same name.
  const toolbar = designer.page.locator('.fs-selection__toolbar')
  await toolbar.getByRole('button', { name: 'Remove website' }).click()

  await expect.poll(() => designer.rootChildren()).not.toContain('website')
})

test('a palette drag released off the canvas adds nothing', async ({ designer }) => {
  /*
   * The half jsdom cannot check. `Canvas.test.tsx` drives this gesture and can only
   * assert that the label appeared and went away again: every rectangle there is zero,
   * so no point is inside anything and an unchanged document is also what a canvas with
   * its whole release path deleted would produce.
   *
   * Here the rectangles are real, so a release over the toolbar is genuinely outside
   * every drop zone, and an unchanged document means the drop was refused.
   */
  await designer.openTab('Components')
  const before = await designer.rootChildren()

  const item = designer.page.getByRole('button', { name: 'Checkbox', exact: true })

  /*
   * Released over the toolbar: it is not a drop zone, and unlike the left pane it is far enough
   * from the press for the drag to pass its threshold.
   */
  const start = await dragFrom(item)
  const away = await stableBox(designer.page.locator('.fs-toolbar'))

  await designer.page.mouse.move(start.x + 20, start.y + start.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(start.x + 40, start.y + start.height / 2 + 20, { steps: 4 })
  await designer.page.mouse.move(away.x + away.width / 2, away.y + away.height / 2, { steps: 8 })

  await expect(designer.page.locator('.fs-drag-label')).toBeVisible()

  await designer.page.mouse.up()

  await expect(designer.page.locator('.fs-drag-label')).toHaveCount(0)
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

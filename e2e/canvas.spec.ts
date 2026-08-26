/**
 * Canvas selection and drag and drop, in a browser that has layout.
 *
 * None of this is testable in jsdom: every rectangle there is zero, so the drop
 * arithmetic has nothing to work with and a selection frame has nowhere to be.
 * The unit tests cover the arithmetic on fixture rectangles; these cover whether
 * the real thing lands where the user aimed.
 */

import { dragOnto, expect, test } from './harness.js'

test('clicking a component on the canvas selects it and shows its properties', async ({
  designer,
}) => {
  await designer.node('email').click()

  const frame = designer.page.locator('.fs-selection--active')
  await expect(frame).toBeVisible()
  await expect(designer.page.locator('.fs-selection__label')).toHaveText('TextField')
  await expect(designer.page.locator('#fs-prop-key')).toHaveValue('email')
})

test('the selection frame sits on the component it selected', async ({ designer }) => {
  await designer.node('email').click()

  const frame = await designer.page.locator('.fs-selection--active').boundingBox()
  const node = await designer.node('email').boundingBox()
  if (!frame || !node) throw new Error('nothing to measure')

  // The whole point of the overlay is that it lands on the target.
  expect(Math.abs(frame.x - node.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.y - node.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.width - node.width)).toBeLessThanOrEqual(1)
})

test('the frame follows the component when the canvas scrolls', async ({ designer }) => {
  await designer.node('email').click()

  await designer.page.locator('.fs-canvas__surface').evaluate((surface) => {
    surface.scrollTop = 120
    surface.dispatchEvent(new Event('scroll'))
  })

  const frame = await designer.page.locator('.fs-selection--active').boundingBox()
  const node = await designer.node('email').boundingBox()
  if (!frame || !node) throw new Error('nothing to measure')
  expect(Math.abs(frame.y - node.y)).toBeLessThanOrEqual(1)
})

test('selecting a field does not focus it or type into it', async ({ designer }) => {
  const input = designer.node('email').locator('input')
  await designer.node('email').click()
  await designer.page.keyboard.type('typed')

  // While editing, a click is a selection gesture and nothing else.
  await expect(input).toHaveValue('')
})

test('clicking a select does not open its dropdown', async ({ designer }) => {
  await designer.node('topic').click()

  await expect(designer.page.locator('.fs-selection--active')).toBeVisible()
  await expect(designer.page.locator('.MuiPopover-root, .MuiMenu-root')).toHaveCount(0)
})

test('dragging from the palette drops the component where the bar showed', async ({ designer }) => {
  const before = await designer.rootChildren()
  expect(before).not.toContain('checkbox')

  await dragOnto(
    designer.page,
    designer.page.getByRole('button', { name: 'Checkbox', exact: true }),
    designer.node('email'),
    'top',
  )

  const after = await designer.rootChildren()
  // Aimed above email, so it lands immediately above email.
  expect(after.indexOf('checkbox')).toBe(before.indexOf('email'))
})

test('dragging a component on the canvas moves it', async ({ designer }) => {
  await dragOnto(designer.page, designer.node('heading'), designer.node('submit'), 'bottom')

  const after = await designer.rootChildren()
  expect(after[after.length - 1]).toBe('heading')
})

test('dropping into a row container infers the horizontal axis', async ({ designer }) => {
  // `name` lays its children out in a row, so the insertion point comes from x.
  const first = await designer.node('firstName').boundingBox()
  if (!first) throw new Error('nothing to measure')

  const palette = designer.page.getByRole('button', { name: 'Text field', exact: true })
  const start = await palette.boundingBox()
  if (!start) throw new Error('nothing to measure')

  await designer.page.mouse.move(start.x + 40, start.y + start.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(start.x + 50, start.y + 12, { steps: 4 })
  // Just right of firstName's midpoint: between firstName and lastName.
  await designer.page.mouse.move(first.x + first.width - 4, first.y + first.height / 2, {
    steps: 12,
  })
  await designer.page.mouse.up()

  const doc = await designer.document()
  const stack = doc.root.children?.find((child) => child.key === 'name')
  expect(stack?.children?.map((child) => child.key)).toEqual(['firstName', 'textField', 'lastName'])
})

test('a plain click is still a click, not a swallowed drag', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Checkbox', exact: true }).click()

  // Clicking a palette entry adds under the selection rather than doing nothing.
  expect(await designer.rootChildren()).toContain('checkbox')
})

test('Escape abandons a drag without changing the document', async ({ designer }) => {
  const before = await designer.rootChildren()
  const from = await designer.node('heading').boundingBox()
  const to = await designer.node('submit').boundingBox()
  if (!from || !to) throw new Error('nothing to measure')

  await designer.page.mouse.move(from.x + 40, from.y + from.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(from.x + 50, from.y + 20, { steps: 4 })
  await designer.page.mouse.move(to.x + 40, to.y + to.height - 3, { steps: 12 })
  await expect(designer.page.locator('.fs-drag-label')).toBeVisible()

  await designer.page.keyboard.press('Escape')
  await designer.page.mouse.up()

  await expect(designer.page.locator('.fs-drag-label')).toHaveCount(0)
  expect(await designer.rootChildren()).toEqual(before)
})

test('the palette does not offer the root component', async ({ designer }) => {
  /*
   * Screen is the document root and every kit declares it, so the palette
   * showed it alongside everything else: it could be clicked or dragged onto
   * the canvas, nesting a screen inside the screen. The contract test pins the
   * metadata; this pins what a user can actually reach.
   */
  const panel = designer.page.locator('.fs-panel').first()
  await expect(panel.getByRole('button', { name: 'Screen', exact: true })).toHaveCount(0)

  // The rest of the layout group is still there, so this is an exclusion and
  // not an empty palette.
  await expect(panel.getByRole('button', { name: 'Stack', exact: true })).toBeVisible()
})

test('every palette entry carries an icon beside its label', async ({ designer }) => {
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

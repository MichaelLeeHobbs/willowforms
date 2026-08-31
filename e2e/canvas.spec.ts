/**
 * Canvas selection and drag and drop, in a browser that has layout.
 *
 * None of this is testable in jsdom: every rectangle there is zero, so the drop
 * arithmetic has nothing to work with and a selection frame has nowhere to be.
 * The unit tests cover the arithmetic on fixture rectangles; these cover whether
 * the real thing lands where the user aimed.
 */

import { dragFrom, dragOnto, expect, stableBox, test } from './harness.js'

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

  // The whole point of the overlay is that it lands on the target. All four
  // sides: a frame with the right position and the wrong height is the shape a
  // measurement that forgets the scroll offset produces.
  expect(Math.abs(frame.x - node.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.y - node.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.width - node.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(frame.height - node.height)).toBeLessThanOrEqual(1)
})

test('the frame follows the component when the canvas scrolls', async ({ designer }) => {
  /*
   * Short enough that the canvas has to overflow.
   *
   * The test set `scrollTop` and then measured, without ever checking that the
   * scroll moved anything. On a viewport where the whole form fits, assigning
   * `scrollTop` does nothing, the component stays exactly where it was, and the
   * frame passes for standing still. It was a test of the overlay's ability to
   * not move, which no version of this code has ever failed.
   */
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

  /*
   * The component moved, so what follows is a claim about following. Distance
   * rather than direction: clicking scrolls the target into view first, so the
   * canvas is already somewhere below 120 by the time this sets it, and the
   * component travels back down the screen rather than up.
   */
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

  // While editing, a click is a selection gesture and nothing else.
  await expect(input).toHaveValue('')

  /*
   * And the second half, which the name promised and nothing checked.
   *
   * An empty input proves the field did not take the text. It does not prove
   * where the text went, and "nowhere at all" passed this test just as well as
   * "the shell" -- which is exactly what was happening: the canvas cancels
   * mousedown's default so the field cannot focus, and the shell's own focus
   * handler then exempted `input` from being focused on its behalf. Delete,
   * Ctrl+Z and Escape did nothing after clicking a field.
   */
  await expect(
    designer.page.evaluate(() => document.activeElement?.classList.contains('fs-shell') === true),
  ).resolves.toBe(true)
})

test('clicking a select does not open its dropdown', async ({ designer }) => {
  await designer.node('topic').click()

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
  await designer.openTab('Components')
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
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Checkbox', exact: true }).click()

  // Clicking a palette entry adds under the selection rather than doing nothing.
  expect(await designer.rootChildren()).toContain('checkbox')
})

test('Escape abandons a drag without changing the document', async ({ designer }) => {
  const before = await designer.rootChildren()
  // `dragFrom` for the source, which scrolls it into view before measuring:
  // a box read off screen is a press that lands nowhere. `stableBox` for the
  // target, which only has to stop moving.
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

  /*
   * Polled, not read once.
   *
   * `rootChildren()` reads what the playground has persisted, and it persists
   * from a passive effect: React schedules those after commit, while
   * Playwright's `press()` resolves on event dispatch. A single read can
   * therefore be of the value from before the gesture -- which is exactly the
   * value this assertion expects, so the test was biased towards passing
   * whether or not the escape worked.
   */
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

test('the palette does not offer the root component', async ({ designer }) => {
  await designer.openTab('Components')
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

  // The root has no siblings to sit among and cannot be removed, so three
  // buttons that refused would be worse than no toolbar.
  await designer.row('root').click()
  await expect(designer.page.locator('.fs-selection__toolbar')).toHaveCount(0)
})

test('the toolbar is clickable, despite sitting on a frame that is not', async ({ designer }) => {
  /*
   * The selection frame is pointer-events: none so a click meant for the
   * component passes through it. The toolbar opts back in. Without that these
   * buttons look dead rather than broken, which is why this is worth a test in
   * a real browser.
   */
  await designer.node('email').click()
  const before = await designer.rootChildren()

  await designer.page.getByRole('button', { name: 'Duplicate email' }).click()

  const after = await designer.rootChildren()
  expect(after.length).toBe(before.length + 1)
  expect(after[after.indexOf('email') + 1]).toBe('email2')
})

test('add a sibling makes a fresh component, not a copy', async ({ designer }) => {
  await designer.node('email').click()
  await designer.page.getByRole('button', { name: 'Add a sibling after email' }).click()

  const doc = await designer.document()
  const children = doc.root.children ?? []
  const added = children[children.findIndex((child) => child.key === 'email') + 1]

  // Same type, default props: "another one of these", not "another one
  // configured like this".
  expect(added?.type).toBe('TextField')
  expect(added?.key).not.toBe('email2')
  expect(added?.props['label']).toEqual({ kind: 'static', value: 'Label' })
})

test('the toolbar removes the selected component', async ({ designer }) => {
  await designer.node('website').click()

  // Scoped: the tree row offers a Remove with the same name, which is correct
  // for a screen reader and ambiguous for a locator.
  const toolbar = designer.page.locator('.fs-selection__toolbar')
  await toolbar.getByRole('button', { name: 'Remove website' }).click()

  expect(await designer.rootChildren()).not.toContain('website')
})

test('a palette drag released off the canvas adds nothing', async ({ designer }) => {
  /*
   * The half jsdom cannot check. `Canvas.test.tsx` drives this gesture and can
   * only assert that the label appeared and went away again: every rectangle
   * there is zero, so no point is inside anything and an unchanged document is
   * also what a canvas with its whole release path deleted would produce.
   *
   * Here the rectangles are real, so a release over the left pane is genuinely
   * outside every drop zone the canvas offers -- and the document being
   * unchanged means the drop was refused rather than unreachable.
   */
  await designer.openTab('Components')
  const before = await designer.rootChildren()

  const item = designer.page.getByRole('button', { name: 'Checkbox', exact: true })
  const pane = designer.page.locator('.fs-panel').first()

  const start = await stableBox(item)
  const away = await stableBox(pane)

  await designer.page.mouse.move(start.x + 20, start.y + start.height / 2)
  await designer.page.mouse.down()
  await designer.page.mouse.move(start.x + 40, start.y + start.height / 2 + 20, { steps: 4 })
  await designer.page.mouse.move(away.x + 10, away.y + away.height - 4, { steps: 8 })

  // Armed, so the release below is a release from a real drag.
  await expect(designer.page.locator('.fs-drag-label')).toBeVisible()

  await designer.page.mouse.up()

  await expect(designer.page.locator('.fs-drag-label')).toHaveCount(0)
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

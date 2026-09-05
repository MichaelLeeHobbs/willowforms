/**
 * Operating the builder without a pointer.
 *
 * Drag and drop is a pointer gesture, so without the keyboard moves below there
 * is no way to rearrange a form with a keyboard at all. jsdom can check that the
 * handlers fire; only a browser can check that focus really lands where it
 * should and that the tab order is what a user meets.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './harness.js'

test('the whole tree is one tab stop', async ({ designer }) => {
  const stops = designer.page.locator('[data-fs-tree-row][tabindex="0"]')
  await expect(stops).toHaveCount(1)
  await expect(stops).toHaveAttribute('data-fs-tree-row', 'root')
})

test('arrows walk the tree and step into containers', async ({ designer }) => {
  await designer.row('root').focus()

  await designer.page.keyboard.press('ArrowDown')
  await expect(designer.row('heading')).toBeFocused()

  await designer.page.keyboard.press('ArrowDown')
  await expect(designer.row('name')).toBeFocused()

  // `name` is a container, so down continues into it.
  await designer.page.keyboard.press('ArrowDown')
  await expect(designer.row('firstName')).toBeFocused()

  await designer.page.keyboard.press('ArrowLeft')
  await expect(designer.row('name')).toBeFocused()

  await designer.page.keyboard.press('ArrowRight')
  await expect(designer.row('firstName')).toBeFocused()
})

test('Home and End reach the ends', async ({ designer }) => {
  await designer.row('name').focus()

  await designer.page.keyboard.press('End')
  await expect(designer.row('submit')).toBeFocused()

  await designer.page.keyboard.press('Home')
  await expect(designer.row('root')).toBeFocused()
})

test('focus selects, so the panels follow the keyboard', async ({ designer }) => {
  await designer.row('root').focus()
  await designer.page.keyboard.press('ArrowDown')

  await expect(designer.row('heading')).toHaveAttribute('aria-selected', 'true')
  await expect(designer.page.getByRole('textbox', { name: 'Key', exact: true })).toHaveValue(
    'heading',
  )
})

test('Alt with the arrows reorders a component', async ({ designer }) => {
  const before = await designer.rootChildren()
  await designer.row('submit').focus()

  await designer.page.keyboard.press('Alt+ArrowUp')

  const after = await designer.rootChildren()
  expect(after.indexOf('submit')).toBe(before.indexOf('submit') - 1)
})

test('Alt with the arrows moves a component in and out of a container', async ({ designer }) => {
  await designer.row('email').focus()
  // `name` sits directly above `email` and takes children.
  await designer.page.keyboard.press('Alt+ArrowRight')

  let doc = await designer.document()
  let stack = doc.root.children?.find((child) => child.key === 'name')
  expect(stack?.children?.map((child) => child.key)).toContain('email')

  await designer.row('email').focus()
  await designer.page.keyboard.press('Alt+ArrowLeft')

  doc = await designer.document()
  stack = doc.root.children?.find((child) => child.key === 'name')
  expect(stack?.children?.map((child) => child.key)).not.toContain('email')
  expect(await designer.rootChildren()).toContain('email')
})

test('a move that cannot happen is announced rather than ignored', async ({ designer }) => {
  const before = await designer.rootChildren()
  await designer.row('heading').focus()

  // Already first among its siblings.
  await designer.page.keyboard.press('Alt+ArrowUp')

  await expect(designer.page.locator('[aria-live="polite"]')).toContainText(/cannot move/)
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

test('Delete removes once, and one undo brings it back', async ({ designer }) => {
  await designer.row('website').focus()
  await designer.page.keyboard.press('Delete')

  expect(await designer.rootChildren()).not.toContain('website')
  await expect(designer.page.locator('[aria-live="polite"]')).toContainText(/website removed/)

  await designer.undo()

  // One undo, not two: the keypress used to reach both the row and the shell.
  expect(await designer.rootChildren()).toContain('website')
})

test('the inspector tabs are reachable and navigable by keyboard', async ({ designer }) => {
  await designer.page.getByRole('tab', { name: 'Properties' }).focus()

  await designer.page.keyboard.press('ArrowRight')
  await expect(designer.page.getByRole('tab', { name: 'Style' })).toBeFocused()
  await expect(designer.page.getByRole('tab', { name: 'Style' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  // Three tabs: Properties, Style, Rules. End lands on the last.
  await designer.page.keyboard.press('End')
  await expect(designer.page.getByRole('tab', { name: 'Rules' })).toBeFocused()
})

test('the left pane tabs are reachable and navigable by keyboard', async ({ designer }) => {
  await designer.page.getByRole('tab', { name: 'Components' }).focus()

  await designer.page.keyboard.press('ArrowRight')
  await expect(designer.page.getByRole('tab', { name: 'Tree' })).toBeFocused()

  await designer.page.keyboard.press('End')
  await expect(designer.page.getByRole('tab', { name: 'Settings' })).toBeFocused()

  // Wraps, like the inspector's, because it is the same component.
  await designer.page.keyboard.press('ArrowRight')
  await expect(designer.page.getByRole('tab', { name: 'Components' })).toBeFocused()
})

test('the JSON dialog traps focus and closes on Escape', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()

  const dialog = designer.page.locator('dialog.fs-dialog')
  await expect(dialog).toBeVisible()
  // A native modal dialog, so the browser owns the trap rather than our code.
  expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true)
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)

  await designer.page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('Control+D duplicates a component beside itself and focuses the copy', async ({
  designer,
}) => {
  await designer.row('website').focus()
  await designer.page.keyboard.press('Control+d')

  const children = await designer.rootChildren()
  expect(children).toContain('website')
  expect(children.filter((key) => key.startsWith('website'))).toHaveLength(2)

  // Directly after the original, not appended at the end.
  const original = children.indexOf('website')
  expect(children[original + 1]).toMatch(/^website\d$/)

  await expect(designer.page.locator('[aria-live="polite"]')).toContainText(/website duplicated as/)
  await expect(designer.page.locator('[data-fs-tree-row][tabindex="0"]')).toHaveAttribute(
    'data-fs-tree-row',
    children[original + 1] as string,
  )
})

test('Control+D refuses the root rather than nesting a screen in itself', async ({ designer }) => {
  const before = await designer.rootChildren()
  await designer.row('root').focus()
  await designer.page.keyboard.press('Control+d')

  await expect(designer.page.locator('[aria-live="polite"]')).toContainText(/root cannot be/i)
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

/**
 * The keyboard after a click on the canvas, which is how a person selects.
 *
 * Every test above reaches the keyboard through `.focus()` on a tree row, which
 * is a method no user has. So the whole file passed while the shortcut model was
 * broken for the gesture people actually use: on the canvas, the click that
 * selects a component left focus nowhere at all.
 *
 * Two guards disagreed about one click. The canvas cancels mousedown's default
 * in the capture phase, so clicking a field selects rather than types; the
 * shell's focus handler exempted `input, textarea, select, button` on the theory
 * that anything taking focus keeps it. On the canvas nothing does, so the
 * exemption fired on exactly the elements whose focus had just been cancelled.
 *
 * No `.focus()` anywhere below. That is the point of these three.
 *
 * Each starts by clicking outside the shell, and that is not decoration. The
 * shell's key handler is a React `onKeyDown` on the container, so it catches
 * anything bubbling from a descendant -- and the harness opens the Tree tab
 * during setup, which parks focus on a button inside the shell. With focus
 * already in there the shortcuts work whether or not the click moved it, and the
 * defect is invisible. Measured: after clicking a field on the canvas,
 * `document.activeElement` was still the Tree tab button.
 *
 * A person meets it on the first interaction with the page.
 */

/** Put focus outside the builder, the way a fresh page load leaves it. */
async function focusOutsideTheShell(designer: { page: Page }): Promise<void> {
  await designer.page.locator('body').click({ position: { x: 2, y: 2 } })
  await expect(
    designer.page.evaluate(() => document.activeElement?.closest('.fs-shell') !== null),
  ).resolves.toBe(false)
}
test('Delete removes a component selected by clicking a field on the canvas', async ({
  designer,
}) => {
  await focusOutsideTheShell(designer)

  const before = await designer.rootChildren()
  expect(before).toContain('email')

  await designer.node('email').locator('input').click()
  await expect(designer.page.locator('.fs-selection--active')).toBeVisible()

  await designer.page.keyboard.press('Delete')

  expect(await designer.rootChildren()).not.toContain('email')
})

test('Control+Z undoes after a click on the canvas', async ({ designer }) => {
  await focusOutsideTheShell(designer)

  const before = await designer.rootChildren()

  await designer.node('email').locator('input').click()
  await designer.page.keyboard.press('Delete')
  expect(await designer.rootChildren()).not.toContain('email')

  await designer.page.keyboard.press('Control+z')

  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

test('Escape clears a selection made by clicking a field on the canvas', async ({ designer }) => {
  await focusOutsideTheShell(designer)

  await designer.node('email').locator('input').click()
  await expect(designer.page.locator('.fs-selection--active')).toBeVisible()

  await designer.page.keyboard.press('Escape')

  await expect(designer.page.locator('.fs-selection--active')).toHaveCount(0)
})

/**
 * Tab order, which this file's own docblock claimed to check and never did.
 *
 * "only a browser can check that focus really lands where it should and that
 * the tab order is what a user meets" -- and no spec in `e2e/` pressed Tab. The
 * shell is `tabIndex={-1}` on purpose, so it is reachable by script and not by
 * Tab, and what a keyboard user actually meets is the toolbar first.
 */
test('Tab walks the shell from the top, and the shell itself is not a stop', async ({
  designer,
}) => {
  // From the document, not from an element: this is what a person gets after
  // clicking into the page and pressing Tab.
  await designer.page.locator('body').click({ position: { x: 2, y: 2 } })

  const stops: { tag: string; inShell: boolean; isShell: boolean; label: string }[] = []
  for (let i = 0; i < 12; i += 1) {
    await designer.page.keyboard.press('Tab')
    stops.push(
      await designer.page.evaluate(() => {
        const active = document.activeElement
        if (!active) return { tag: 'nothing', inShell: false, isShell: false, label: '' }
        return {
          tag: active.tagName.toLowerCase(),
          inShell: active.closest('.fs-shell') !== null,
          isShell: active.classList.contains('fs-shell'),
          label: (active.getAttribute('aria-label') ?? active.textContent ?? '')
            .trim()
            .slice(0, 24),
        }
      }),
    )
  }

  // Something takes focus on every press. A shell that swallowed Tab would
  // report `body` for the rest of the run.
  expect(stops.filter((stop) => stop.tag === 'body' || stop.tag === 'nothing')).toEqual([])

  // The container is never itself a stop, which is what `tabIndex={-1}` says and
  // what nothing in this repository checked.
  expect(stops.filter((stop) => stop.isShell)).toEqual([])

  /*
   * Tab reaches the builder rather than stopping at the playground's own chrome
   * above it -- the first stop on this page is the kit switcher, which belongs
   * to the demo and not to the designer.
   */
  const first = stops.findIndex((stop) => stop.inShell)
  expect(first, 'Tab never reached the designer').toBeGreaterThanOrEqual(0)
  expect(stops[first]?.tag).toBe('button')
})

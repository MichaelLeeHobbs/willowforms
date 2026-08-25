/**
 * Operating the builder without a pointer.
 *
 * Drag and drop is a pointer gesture, so without the keyboard moves below there
 * is no way to rearrange a form with a keyboard at all. jsdom can check that the
 * handlers fire; only a browser can check that focus really lands where it
 * should and that the tab order is what a user meets.
 */

import { expect, test } from './harness.js'

test('the whole tree is one tab stop', async ({ designer }) => {
  const stops = designer.page.locator('[data-fs-row][tabindex="0"]')
  await expect(stops).toHaveCount(1)
  await expect(stops).toHaveAttribute('data-fs-row', 'root')
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
  await expect(designer.page.locator('#fs-prop-key')).toHaveValue('heading')
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
  expect(await designer.rootChildren()).toEqual(before)
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
  await expect(designer.page.getByRole('tab', { name: 'Rules' })).toBeFocused()
  await expect(designer.page.getByRole('tab', { name: 'Rules' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await designer.page.keyboard.press('End')
  await expect(designer.page.getByRole('tab', { name: 'Form' })).toBeFocused()
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

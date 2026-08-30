/**
 * Getting a document in and out, and swapping the kit under it.
 *
 * The JSON editor is where untrusted input meets the builder, so most of what
 * follows is about refusing things without falling over. The kit switch is the
 * architecture's central claim, exercised on one document.
 */

import { expect, test } from './harness.js'

test('the dialog opens showing the current document', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()

  const text = await designer.page.getByLabel('Form document JSON').inputValue()
  expect(JSON.parse(text)).toMatchObject({ name: 'Contact request' })
})

test('an edited document is applied', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  const editor = designer.page.getByLabel('Form document JSON')
  const doc = JSON.parse(await editor.inputValue()) as { name: string }
  doc.name = 'Renamed form'

  await editor.fill(JSON.stringify(doc))
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  await expect(editor).toHaveCount(0)
  await expect(designer.page.locator('.fs-toolbar__title')).toHaveText('Renamed form')
})

test('malformed JSON is refused and the form is left alone', async ({ designer }) => {
  const before = await designer.rootChildren()
  await designer.page.getByRole('button', { name: 'JSON' }).click()

  await designer.page.getByLabel('Form document JSON').fill('{ not json')
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  await expect(designer.page.getByRole('alert')).toBeVisible()
  await expect(designer.page.getByLabel('Form document JSON')).toBeVisible()
  expect(await designer.rootChildren()).toEqual(before)
})

test('a document with a children field that is not an array is refused, not crashed on', async ({
  designer,
}) => {
  const before = await designer.rootChildren()
  await designer.page.getByRole('button', { name: 'JSON' }).click()

  // This used to throw out of the click handler and take the builder down.
  await designer.page
    .getByLabel('Form document JSON')
    .fill('{"version":"1","id":"a","name":"b","root":{"key":"r","type":"Screen","children":5}}')
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  await expect(designer.page.getByRole('alert')).toBeVisible()
  // Still a working builder afterwards, which is the whole point.
  await expect(designer.page.locator('.fs-shell')).toBeVisible()
  expect(await designer.rootChildren()).toEqual(before)
})

test('every missing field is named at once, not one at a time', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByLabel('Form document JSON').fill('{}')
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  const problems = designer.page.getByRole('alert').getByRole('listitem')
  await expect(problems).toHaveCount(4)
})

test('a duplicate key is caught even though the JSON is well formed', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  const editor = designer.page.getByLabel('Form document JSON')
  const doc = JSON.parse(await editor.inputValue()) as {
    root: { children: { key: string; type: string; props: unknown }[] }
  }
  doc.root.children = [
    { key: 'same', type: 'TextField', props: {} },
    { key: 'same', type: 'TextField', props: {} },
  ]

  await editor.fill(JSON.stringify(doc))
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  await expect(designer.page.getByRole('alert')).toContainText('Duplicate key: same')
})

test('a cancelled edit is forgotten', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByLabel('Form document JSON').fill('{"abandoned": true}')
  await designer.page.getByRole('button', { name: 'Close' }).click()

  await designer.page.getByRole('button', { name: 'JSON' }).click()
  const text = await designer.page.getByLabel('Form document JSON').inputValue()
  expect(JSON.parse(text)).toMatchObject({ name: 'Contact request' })
})

test('the schema view describes the data, not the layout', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByRole('tab', { name: 'JSON Schema' }).click()

  /*
   * The textarea, not the tabpanel. The dialog's views are real tabs now, and a
   * tabpanel is labelled by its own tab — so "JSON Schema" names two elements
   * and the looser locator resolved to the wrong one.
   */
  const schema = JSON.parse(
    await designer.page.getByRole('textbox', { name: 'JSON Schema' }).inputValue(),
  ) as {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }

  expect(schema.type).toBe('object')
  // Data-bound components only: no heading, no stack, no button.
  expect(Object.keys(schema.properties)).toContain('email')
  expect(Object.keys(schema.properties)).not.toContain('heading')
  expect(Object.keys(schema.properties)).not.toContain('name')
  expect(schema.required).toContain('email')
})

test('the schema view cannot be edited', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByRole('tab', { name: 'JSON Schema' }).click()

  await expect(designer.page.getByRole('textbox', { name: 'JSON Schema' })).toHaveAttribute(
    'readonly',
    '',
  )
})

test('the same document renders through either kit', async ({ designer }) => {
  // The architecture's central claim, on one document, at runtime.
  await expect(designer.node('email').locator('.MuiInputBase-root')).toHaveCount(1)

  await designer.page.locator('#pg-kit').selectOption('html')

  await expect(designer.page.locator('.fsh-screen')).toBeVisible()
  await expect(designer.page.locator('.fs-canvas__surface .MuiInputBase-root')).toHaveCount(0)
  // Still the same document, still selectable, still keyed the same way.
  await expect(designer.node('email')).toBeVisible()
  await designer.node('email').click()
  await expect(designer.page.locator('.fs-selection--active')).toBeVisible()
})

test('the html kit wires up its own accessibility', async ({ designer }) => {
  await designer.page.locator('#pg-kit').selectOption('html')
  await designer.page.getByRole('button', { name: 'Preview' }).click()
  await designer.page.getByRole('button', { name: 'Validate' }).click()

  const input = designer.node('firstName').locator('input')
  await expect(input).toHaveAttribute('aria-invalid', 'true')

  const describedBy = await input.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  const message = designer.page.locator('#' + String(describedBy))
  await expect(message).toHaveAttribute('role', 'alert')
  await expect(message).toHaveText('This field is required.')
})

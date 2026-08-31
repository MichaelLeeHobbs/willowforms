/**
 * Getting a document in and out, and swapping the kit under it.
 *
 * The JSON editor is where untrusted input meets the builder, so most of what
 * follows is about refusing things without falling over. The kit switch is the
 * architecture's central claim, exercised on one document.
 */

import { STORAGE_KEY, expect, test } from './harness.js'

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

  /*
   * Named, not counted. `toHaveCount(4)` passes for any four messages, so a
   * change that reported the same problem twice and dropped another one kept it
   * green -- and the point of this test is that an empty document is refused for
   * every reason at once rather than one at a time.
   */
  const problems = designer.page.getByRole('alert').getByRole('listitem')
  const text = (await problems.allTextContents()).join(' ')

  expect(text).toContain('version')
  expect(text).toContain('id')
  expect(text).toContain('name')
  expect(text).toContain('root')
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

test('a stored draft that is not a document loads the sample instead', async ({ designer }) => {
  /*
   * Valid JSON, invalid document. The playground guarded the parse and nothing
   * else, so a draft like this one came back out of localStorage as a
   * `FormDocument` on the strength of a type assertion and took the app down on
   * first render, with no way out from inside a page that failed to start. The
   * JSON dialog refuses exactly this input; the path that runs before anyone can
   * open the dialog did not.
   *
   * The init script the fixture uses to clear the key runs first, so this plants
   * a draft rather than racing one.
   */
  await designer.page.addInitScript((key: string) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: '1',
        id: 'broken',
        name: 'Broken draft',
        languages: [{ code: 'en', region: 'US', name: 'English' }],
        defaultLanguage: 'en-US',
        translations: {},
        root: 'not a node',
      }),
    )
  }, STORAGE_KEY)
  await designer.page.reload()

  await expect(designer.page.locator('.fs-toolbar__title')).toHaveText('Contact request')
  await expect(designer.page.locator('[data-fs-key="email"]')).toBeVisible()
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

  /*
   * With an edit first, because the switch remounts the designer and the
   * document it remounts from is a choice this spec is the only one to make.
   * Switching an unedited document proves the kit swap and nothing about
   * whether the edit survives it -- and the version that read the boot document
   * discarded every change since page load, silently, with no way back.
   */
  await designer.select('email')
  await designer.openTab('Properties')
  await designer.page.locator('#fs-prop-label').fill('Work email')

  await designer.page.locator('#pg-kit').selectOption('html')

  await expect(designer.node('email').locator('label').first()).toHaveText(/Work email/)
  expect((await designer.document()).root.children?.some((c) => c.key === 'email')).toBe(true)

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

test('an edit survives switching the kit', async ({ designer }) => {
  /*
   * The playground held its boot document in a `useState` that never updated,
   * and remounted the designer on a kit change with `key={kitId}`. The mount
   * effect then fired `onChange` with that stale document, which the playground
   * persists — so switching kits discarded every edit since page load, and a
   * reload did not bring them back.
   *
   * The existing kit-switch test above switches without editing first, so it
   * could not see this. That is the whole defect: the state being thrown away
   * is the state a test has to create before it looks.
   */
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Text field', exact: true }).click()

  const before = await designer.rootChildren()
  expect(before).toContain('textField')

  await designer.page.locator('#pg-kit').selectOption('html')
  await expect(designer.page.locator('.fsh-screen')).toBeVisible()

  // The document the new kit is drawing, and the one that was persisted.
  expect(await designer.rootChildren()).toEqual(before)
  await expect(designer.node('textField')).toBeVisible()
})

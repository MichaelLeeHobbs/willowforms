// The JSON editor is where untrusted input meets the builder.

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
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

test('a document with a children field that is not an array is refused, not crashed on', async ({
  designer,
}) => {
  const before = await designer.rootChildren()
  await designer.page.getByRole('button', { name: 'JSON' }).click()

  await designer.page
    .getByLabel('Form document JSON')
    .fill('{"version":"1","id":"a","name":"b","root":{"key":"r","type":"Screen","children":5}}')
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  await expect(designer.page.getByRole('alert')).toBeVisible()
  await expect(designer.page.locator('.fs-shell')).toBeVisible()
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

test('every missing field is named at once, not one at a time', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByLabel('Form document JSON').fill('{}')
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  // Named as well as counted: a count alone passes with one problem reported twice.
  const problems = designer.page.getByRole('alert').getByRole('listitem')
  const text = (await problems.allTextContents()).join(' ')

  expect(text).toContain('version')
  expect(text).toContain('id')
  expect(text).toContain('name')
  expect(text).toContain('root')
  await expect(problems).toHaveCount(6)
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
  // Runs after the fixture's init script that clears the key, so this plants rather than races.
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

  // The textbox, not the tabpanel: a tabpanel is labelled by its tab, so the name matches both.
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
  await expect(designer.node('email').locator('.MuiInputBase-root')).toHaveCount(1)

  // An edit first: the switch remounts the designer, and the edit must survive it.
  await designer.select('email')
  await designer.openTab('Properties')
  await designer.page.getByRole('textbox', { name: /^Label/ }).fill('Work email')

  await designer.page.locator('#pg-kit').selectOption('html')

  await expect(designer.node('email').locator('label').first()).toHaveText(/Work email/)
  await expect
    .poll(async () => {
      const { root } = await designer.document()
      return root.children?.find((child) => child.key === 'email')?.props['label']
    })
    .toEqual({ kind: 'static', value: 'Work email' })

  await expect(designer.page.locator('.fsh-screen')).toBeVisible()
  await expect(designer.page.locator('.fs-canvas__surface .MuiInputBase-root')).toHaveCount(0)
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

  // `aria-describedby` is a space-separated list of ids, so each one is resolved.
  const describedBy = await input.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()

  const described = (describedBy ?? '').split(/\s+/).filter(Boolean)
  expect(described.length).toBeGreaterThan(0)

  const texts = await Promise.all(
    described.map(async (id) => {
      const element = designer.page.locator('#' + id)
      return {
        role: await element.getAttribute('role'),
        text: (await element.textContent())?.trim() ?? '',
      }
    }),
  )

  expect(texts).toContainEqual({ role: 'alert', text: 'This field is required.' })
})

test('an edit survives switching the kit', async ({ designer }) => {
  await designer.openTab('Components')
  await designer.page.getByRole('button', { name: 'Text field', exact: true }).click()

  await expect.poll(() => designer.rootChildren()).toContain('textField')
  const before = await designer.rootChildren()

  await designer.page.locator('#pg-kit').selectOption('html')
  await expect(designer.page.locator('.fsh-screen')).toBeVisible()

  await expect.poll(() => designer.rootChildren()).toEqual(before)
  await expect(designer.node('textField')).toBeVisible()
})

// Modality needs a browser: jsdom has no `<dialog>`, so `test/a11y.test.tsx` cannot check it.
test('the JSON dialog is modal, not merely open', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()

  const dialog = designer.page.getByRole('dialog', { name: 'Form JSON', exact: true })
  await expect(dialog).toBeVisible()

  // `:modal` matches only a top-layer dialog, with an inert background; `open` alone does not.
  expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true)
})

test('focus stays inside the open dialog', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await expect(designer.page.getByRole('dialog', { name: 'Form JSON', exact: true })).toBeVisible()

  // Cycle past the last control to check that background controls stay inert.
  const outside: string[] = []
  const inside = new Set<string>()
  for (let i = 0; i < 15; i += 1) {
    await designer.page.keyboard.press('Tab')

    // Chromium reports body while focus passes through browser chrome.
    const landed = await designer.page.evaluate(() => {
      const active = document.activeElement
      if (!active || active === document.body) return null
      return {
        inside: active.closest('dialog[aria-label="Form JSON"]') !== null,
        what: active.getAttribute('aria-label') ?? active.textContent ?? '',
        html: active.outerHTML.slice(0, 80),
      }
    })

    if (landed?.inside) inside.add(landed.what.trim())
    else if (landed) outside.push(landed.html)
  }

  expect(outside, 'focus reached a control behind the dialog').toEqual([])
  // A dialog with nothing to focus also keeps focus off the page behind it.
  expect([...inside]).toEqual(expect.arrayContaining(['Close', 'Apply', 'Copy', 'Revert']))
})

test('Escape closes the dialog and leaves the document alone', async ({ designer }) => {
  const before = await designer.rootChildren()
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await expect(designer.page.getByLabel('Form document JSON')).toBeVisible()

  // The browser's own close. A dialog that ignores Escape is a keyboard trap.
  await designer.page.keyboard.press('Escape')

  await expect(designer.page.getByLabel('Form document JSON')).toHaveCount(0)
  await expect.poll(() => designer.rootChildren()).toEqual(before)
})

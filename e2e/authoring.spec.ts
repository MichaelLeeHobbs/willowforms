// These assert what the browser rendered, not what the document stored.

import { expect, test } from './harness.js'

test('editing a property updates the canvas', async ({ designer }) => {
  await designer.select('email')
  await designer.page.getByRole('textbox', { name: /^Label/ }).fill('Work email')

  await expect(designer.node('email').locator('label').first()).toHaveText(/Work email/)
})

test('typing a label is one undo step, not one per keystroke', async ({ designer }) => {
  await designer.select('message')
  const before = await designer.node('message').locator('label').first().textContent()

  // Per keystroke, not `fill()`: one event would pass one undo without any coalescing.
  const label = designer.page.getByRole('textbox', { name: /^Label/ })
  await label.click()
  await label.press('ControlOrMeta+a')
  await label.pressSequentially('Tell us more')
  await expect(designer.node('message').locator('label').first()).toHaveText(/Tell us more/)

  await designer.undo()

  await expect(designer.node('message').locator('label').first()).toHaveText(before ?? '')
})

test('renaming to a key that is taken says so and changes nothing', async ({ designer }) => {
  await designer.select('website')
  await designer.page.getByRole('textbox', { name: 'Key', exact: true }).fill('email')
  await designer.page.getByRole('textbox', { name: 'Key', exact: true }).press('Enter')

  await expect(designer.page.getByRole('alert')).toHaveText(/already used by another component/)
  await expect(designer.page.getByRole('textbox', { name: 'Key', exact: true })).toHaveValue(
    'website',
  )
  await expect(designer.row('website')).toHaveAttribute('aria-selected', 'true')
  expect(await designer.rootChildren()).toContain('website')
})

test('renaming to a free key renames the component', async ({ designer }) => {
  await designer.select('website')
  await designer.page.getByRole('textbox', { name: 'Key', exact: true }).fill('homepage')
  await designer.page.getByRole('textbox', { name: 'Key', exact: true }).press('Enter')

  expect(await designer.rootChildren()).toContain('homepage')
  await expect(designer.row('homepage')).toHaveAttribute('aria-selected', 'true')
})

test('a rule authored in the panel fails a real submit with its own message', async ({
  designer,
}) => {
  await designer.select('email')
  await designer.openTab('Rules')

  await designer.page.getByLabel('Add a rule').selectOption('minLength')
  await designer.page.getByLabel('Value').fill('12')
  // Scoped to the rule, not `.last()`, so another Message field cannot take the text.
  const rule = designer.page.locator('.fs-rule').filter({ hasText: 'Minimum length' })
  await rule.getByLabel('Message').selectOption('custom')
  await rule.getByLabel('Custom message').fill('Needs at least 12 characters.')

  await designer.page.getByRole('button', { name: 'Preview' }).click()
  await designer.node('email').locator('input').fill('a@b.co')
  await designer.page.getByRole('button', { name: 'Validate' }).click()
  await designer.page.getByRole('button', { name: 'Diagnostics' }).click()

  // `.fs-canvas__data` holds both Data and Errors, so this scopes to Errors.
  const errors = designer.page
    .locator('.fs-canvas__data section')
    .filter({ has: designer.page.getByRole('heading', { name: 'Errors' }) })

  await expect(errors.locator('pre')).toContainText('Needs at least 12 characters.')
})

test('a field hidden by a condition does not fail the submit', async ({ designer }) => {
  // Through the JSON dialog, which can set the visibility and the rule in one step.
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  const editor = designer.page.getByLabel('Form document JSON')
  const doc = JSON.parse(await editor.inputValue()) as {
    root: { children: { key: string; renderWhen?: unknown }[] }
  }
  const website = doc.root.children.find((child) => child.key === 'website')
  if (!website) throw new Error('no website field in the sample')
  website.renderWhen = { kind: 'static', value: false }
  // Make it required so it would block a submit if it were validated.
  ;(website as { schema?: unknown }).schema = {
    type: 'string',
    validations: [{ key: 'required' }],
  }

  await editor.fill(JSON.stringify(doc))
  await designer.page.getByRole('button', { name: 'Apply' }).click()

  await designer.page.getByRole('button', { name: 'Preview' }).click()
  await designer.page.getByRole('button', { name: 'Validate' }).click()

  const errors = designer.page.locator('.fs-canvas__data')
  await expect(errors).toContainText('firstName')
  await expect(errors).not.toContainText('website')
})

test('a translated label reaches the canvas', async ({ designer }) => {
  await designer.select('email')
  await designer.page.getByLabel('Label binding').selectOption('i18n')
  await designer.page.getByLabel('English').fill('Email address')

  await expect(designer.node('email').locator('label').first()).toHaveText(/Email address/)

  const doc = await designer.document()
  expect(doc.translations[doc.defaultLanguage]).toMatchObject({ email_label: 'Email address' })
})

test('adding a language leaves the document valid', async ({ designer }) => {
  await designer.openTab('Settings')
  await designer.page.getByLabel('Code', { exact: true }).fill('fr')
  await designer.page.getByRole('textbox', { name: 'Name', exact: true }).fill('French')
  await designer.page.getByRole('button', { name: 'Add language' }).click()

  const doc = await designer.document()
  expect(doc.languages.map((language) => language.code)).toContain('fr')
  expect(doc.languages.find((language) => language.code === 'fr')?.name).toBe('French')

  expect(doc.defaultLanguage).toBe('en-US')

  // Applying the JSON dialog unchanged runs the document through the import gate.
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByRole('button', { name: 'Apply' }).click()
  await expect(designer.page.getByLabel('Form document JSON')).toHaveCount(0)
})

test('a computed property renders nothing rather than throwing', async ({ designer }) => {
  await designer.select('email')
  await designer.page.getByLabel('Helper text binding').selectOption('computed')
  await designer.page
    .getByLabel('Helper text expression', { exact: true })
    .fill("'hi ' + data.firstName")

  /*
   * The playground has no evaluator, so this resolves to nothing: neither the expression source
   * nor `null` may appear on the canvas.
   */
  await expect(designer.node('email')).toBeVisible()
  await expect(designer.node('email')).not.toContainText('data.firstName')
  await expect(designer.node('email')).not.toContainText('null')
})

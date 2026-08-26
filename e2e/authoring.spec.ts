/**
 * Authoring a form: properties, rules, localization, and undo.
 *
 * These read what the browser rendered rather than what the document stored.
 * The distinction is not academic. Localization was once "verified in a browser"
 * by reading the stored translation, which was written to a bundle the renderer
 * never looked at, so the check passed while the canvas showed a raw key.
 */

import { expect, test } from './harness.js'

test('editing a property updates the canvas', async ({ designer }) => {
  await designer.select('email')
  await designer.page.locator('#fs-prop-label').fill('Work email')

  await expect(designer.node('email').locator('label').first()).toHaveText(/Work email/)
})

test('typing a label is one undo step, not one per keystroke', async ({ designer }) => {
  await designer.select('message')
  const before = await designer.node('message').locator('label').first().textContent()

  await designer.page.locator('#fs-prop-label').fill('Tell us more')
  await expect(designer.node('message').locator('label').first()).toHaveText(/Tell us more/)

  await designer.undo()

  // One undo takes back the whole edit rather than the last character.
  await expect(designer.node('message').locator('label').first()).toHaveText(before ?? '')
})

test('renaming to a key that is taken says so and changes nothing', async ({ designer }) => {
  await designer.select('website')
  await designer.page.locator('#fs-prop-key').fill('email')
  await designer.page.locator('#fs-prop-key').press('Enter')

  await expect(designer.page.getByRole('alert')).toHaveText(/already used by another component/)
  // The refusal must not quietly move the panel onto the other component.
  await expect(designer.page.locator('#fs-prop-key')).toHaveValue('website')
  await expect(designer.row('website')).toHaveAttribute('aria-selected', 'true')
  expect(await designer.rootChildren()).toContain('website')
})

test('renaming to a free key renames the component', async ({ designer }) => {
  await designer.select('website')
  await designer.page.locator('#fs-prop-key').fill('homepage')
  await designer.page.locator('#fs-prop-key').press('Enter')

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
  await designer.page.getByLabel('Message').last().fill('Needs at least 12 characters.')

  await designer.page.getByRole('button', { name: 'Preview' }).click()
  await designer.node('email').locator('input').fill('a@b.co')
  await designer.page.getByRole('button', { name: 'Validate' }).click()

  await expect(designer.page.locator('.fs-canvas__data')).toContainText(
    'Needs at least 12 characters.',
  )
})

test('a field hidden by a condition does not fail the submit', async ({ designer }) => {
  // Authored through the JSON editor, since there is no visibility UI yet.
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
  // The user cannot see this field, so it must never be what stops them.
  await expect(errors).not.toContainText('website')
})

test('a translated label reaches the canvas', async ({ designer }) => {
  await designer.select('email')
  await designer.page.getByLabel('Label binding').selectOption('i18n')
  await designer.page.getByLabel('English').fill('Email address')

  // The assertion that matters: what the kit rendered, not what was stored.
  await expect(designer.node('email').locator('label').first()).toHaveText(/Email address/)

  const doc = await designer.document()
  expect(doc.translations[doc.defaultLanguage]).toMatchObject({ email_label: 'Email address' })
})

test('adding a language leaves the document valid', async ({ designer }) => {
  await designer.openTab('Settings')
  // Scoped by id: "Name" and "Code" both appear in more than one panel.
  await designer.page.locator('#fs-language-code').fill('fr')
  await designer.page.locator('#fs-language-name').fill('French')
  await designer.page.getByRole('button', { name: 'Add language' }).click()

  const doc = await designer.document()
  // Comparing a tag against a bare code used to rewrite this silently.
  expect(doc.defaultLanguage).toBe('en-US')

  // And the document it produced still passes its own import gate.
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByRole('button', { name: 'Apply' }).click()
  await expect(designer.page.getByLabel('Form document JSON')).toHaveCount(0)
})

test('a computed property renders nothing rather than throwing', async ({ designer }) => {
  await designer.select('email')
  await designer.page.getByLabel('Helper text binding').selectOption('computed')
  // Exact: the binding picker's label also starts with "Helper text".
  await designer.page.getByLabel('Helper text', { exact: true }).fill("'hi ' + data.firstName")

  // The playground injects no evaluator, so this resolves to nothing and the
  // field keeps rendering.
  await expect(designer.node('email')).toBeVisible()
  await expect(designer.page.locator('.fs-shell')).toBeVisible()
})

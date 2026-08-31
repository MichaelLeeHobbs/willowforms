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

  /*
   * Typed one character at a time, because a run of keystrokes is the thing
   * under test. This used `fill()`, which sets the whole value in a single
   * event: the label changed once, so one undo took it back whether or not
   * anything coalesced, and a build that pushed an entry per character passed.
   */
  const label = designer.page.locator('#fs-prop-label')
  await label.click()
  await label.press('ControlOrMeta+a')
  await label.pressSequentially('Tell us more')
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
  /*
   * Scoped to the rule, not `.last()`. Disambiguating by DOM order means a
   * panel that grows another Message field, or one that reorders its rows,
   * silently fills a different box -- and the assertion below would then be
   * about the default message rather than the authored one.
   */
  await designer.page
    .locator('.fs-rule')
    .filter({ hasText: 'Minimum length' })
    .getByLabel('Message')
    .fill('Needs at least 12 characters.')

  await designer.page.getByRole('button', { name: 'Preview' }).click()
  await designer.node('email').locator('input').fill('a@b.co')
  await designer.page.getByRole('button', { name: 'Validate' }).click()

  /*
   * The Errors block, not the whole pane.
   *
   * `.fs-canvas__data` holds both the Data and the Errors `<pre>`, so a message
   * that somehow reached the *data* would satisfy this -- the assertion names
   * the panel and means one section of it.
   */
  const errors = designer.page
    .locator('.fs-canvas__data section')
    .filter({ has: designer.page.getByRole('heading', { name: 'Errors' }) })

  await expect(errors.locator('pre')).toContainText('Needs at least 12 characters.')
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
  /*
   * The language landed, under the name that was typed. The only assertion here
   * was the one below, on a value the sample already ships: the button could
   * have done nothing at all and this test would have said so approvingly.
   */
  expect(doc.languages.map((language) => language.code)).toContain('fr')
  expect(doc.languages.find((language) => language.code === 'fr')?.name).toBe('French')

  // And it did not become the default. Comparing a tag against a bare code used
  // to rewrite this silently.
  expect(doc.defaultLanguage).toBe('en-US')

  // And the document it produced still passes its own import gate.
  await designer.page.getByRole('button', { name: 'JSON' }).click()
  await designer.page.getByRole('button', { name: 'Apply' }).click()
  await expect(designer.page.getByLabel('Form document JSON')).toHaveCount(0)
})

test('a computed property renders nothing rather than throwing', async ({ designer }) => {
  await designer.select('email')
  await designer.page.getByLabel('Helper text binding').selectOption('computed')
  /*
   * "Helper text expression". The box had no accessible name of its own — the
   * only label on the row points at the mode select — so it announced itself as
   * nothing, and the accessibility suite audits a component at rest, which is a
   * state this box is not in.
   */
  await designer.page
    .getByLabel('Helper text expression', { exact: true })
    .fill("'hi ' + data.firstName")

  /*
   * The playground injects no evaluator, so this resolves to nothing and the
   * field keeps rendering. "Nothing" is the part this used to leave out: a
   * helper text of `null` renders as an empty message, and the expression's own
   * text must not appear on the canvas -- printing the source of an unevaluated
   * expression to the person filling in the form is the other way this fails.
   */
  // Not `.fs-shell` again: the fixture already waits for it before any test
  // body runs, so asserting it here cannot fail and reads as a check.
  await expect(designer.node('email')).toBeVisible()
  await expect(designer.node('email')).not.toContainText('data.firstName')
  await expect(designer.node('email')).not.toContainText('null')
})

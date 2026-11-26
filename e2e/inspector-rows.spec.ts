import type { Locator, Page } from '@playwright/test'

import { createDocument, prop } from '../packages/core/src/index.js'
import type { Condition } from '../packages/core/src/index.js'
import { STORAGE_KEY, expect, test } from './harness.js'

// Tall, so the panel never scrolls and no scrollbar takes width from a row.
test.use({ viewport: { width: 1280, height: 2000 } })

const panelOf = (page: Page): Locator =>
  page.getByRole('complementary', { name: 'Component properties' })

const LONG_KEY = 'an_answer_whose_key_is_longer_than_one_line_of_the_panel_is_wide'

const ANSWERED: Condition = { op: 'notEmpty', value: { kind: 'ref', dataKey: 'age' } }

async function open(page: Page): Promise<void> {
  const doc = createDocument('Rows', 'rows')
  doc.languages.push({ code: 'fr', name: 'French', bidi: 'ltr' })
  doc.translations['fr'] = {}
  doc.root.children = [
    {
      key: 'age',
      type: 'TextField',
      props: { label: prop('Age') },
      schema: {
        type: 'string',
        validations: [{ key: 'required' }, { key: 'pattern', value: 'a' }],
      },
    },
    {
      key: LONG_KEY,
      type: 'TextField',
      props: { label: prop('Other') },
      schema: { type: 'string' },
    },
    { key: 'trail', type: 'Breadcrumbs', props: { items: prop([]) } },
    { key: 'box', type: 'Box', props: {}, children: [] },
    {
      // No shipped property offers a condition, but a document can hold one.
      key: 'bound',
      type: 'TextField',
      props: {
        label: {
          kind: 'condition',
          condition: { op: 'and', conditions: [{ op: 'or', conditions: [ANSWERED] }] },
        },
      },
    },
  ]
  await page.addInitScript(
    ({ key, text }) => {
      localStorage.setItem(key, text)
      localStorage.setItem('willowforms.playground.kit', 'html')
    },
    { key: STORAGE_KEY, text: JSON.stringify(doc) },
  )
  await page.goto('/')
  await page.getByRole('tab', { name: 'Tree', exact: true }).click()
  await select(page, 'age')
}

const select = (page: Page, key: string): Promise<void> =>
  page.locator(`[data-fs-tree-row="${key}"]`).click()

const widthOf = async (locator: Locator): Promise<number> =>
  (await locator.boundingBox())?.width ?? 0

/** The space between the bottom of one and the top of the other. */
const gap = async (above: Locator, below: Locator): Promise<number> => {
  const [first, second] = [await above.boundingBox(), await below.boundingBox()]
  return first && second ? second.y - first.y - first.height : NaN
}

/** Controls that cover each other, or reach outside the box that holds them. */
const collisions = (box: Locator): Promise<string[]> =>
  box.evaluate((holder) => {
    const limit = holder.getBoundingClientRect()
    const controls = [...holder.querySelectorAll('select, input, textarea, button')].map(
      (each) => ({
        name: each.getAttribute('aria-label') ?? each.id,
        rect: each.getBoundingClientRect(),
      }),
    )
    return controls.flatMap(({ name, rect }, at) => [
      ...(rect.right > limit.right || rect.left < limit.left ? [name + ' is outside'] : []),
      ...controls
        .slice(at + 1)
        .filter(
          (next) =>
            Math.min(rect.right, next.rect.right) - Math.max(rect.left, next.rect.left) > 0.5 &&
            Math.min(rect.bottom, next.rect.bottom) - Math.max(rect.top, next.rect.top) > 0.5,
        )
        .map((next) => name + ' covers ' + next.name),
    ])
  })

/** A choice opens an editor that is as wide as its picker, and both wider than the picker was. */
async function expectOpens(
  box: Locator,
  [label, choice, editor]: readonly [label: string, choice: string, editor: string],
): Promise<void> {
  const picker = box.getByLabel(label, { exact: true })
  await picker.selectOption({ index: 0 })
  const resting = await widthOf(picker)
  await picker.selectOption(choice)

  const opened = box.getByLabel(editor, { exact: true })
  expect(await widthOf(picker), choice).toBeGreaterThan(resting)
  expect(await widthOf(opened), editor).toBe(await widthOf(picker))
  expect(await gap(picker, opened), editor).toBeGreaterThan(4)
  expect(await collisions(box), choice).toEqual([])
}

/** Two levels of conditions, each of which indents, still leave fields that can be read. */
async function expectReadable(box: Locator): Promise<void> {
  await expect(box.getByLabel('Comparison', { exact: true })).toHaveCount(3)
  expect(await collisions(box)).toEqual([])
  for (const field of await box.locator('select, input').all()) {
    expect(await widthOf(field)).toBeGreaterThan(140)
  }
}

async function nest(box: Locator): Promise<void> {
  await box.getByLabel('Comparison', { exact: true }).selectOption('and')
  await box.getByLabel('Comparison', { exact: true }).nth(1).selectOption('or')
}

test('a picker in a rule and the editor it opens each take the whole row', async ({ page }) => {
  await open(page)
  await page.getByRole('tab', { name: 'Rules', exact: true }).click()
  const rule = panelOf(page).getByRole('listitem').filter({ hasText: 'Required' }).first()

  for (const row of [
    ['Message', 'custom', 'Custom message'],
    ['Message', 'i18n', 'Translation key'],
    ['Message', 'i18n', 'French'],
    ['Apply when', 'computed', 'Guard expression'],
    ['Apply when', 'condition', 'Comparison'],
  ] as const) {
    await expectOpens(rule, row)
  }
  await nest(rule)
  await expectReadable(rule)
})

test('a bound property, and Show when, each take the whole row', async ({ page }) => {
  await open(page)
  const rowOf = (label: string): Locator =>
    panelOf(page)
      .locator('.fs-prop-row')
      .filter({ has: page.getByLabel(label, { exact: true }) })

  const bound = rowOf('Label binding')
  const caption = bound.locator('> label, > .fs-prop-row__caption')
  for (const row of [
    ['Label binding', 'i18n', 'Translation key'],
    ['Label binding', 'i18n', 'French'],
    ['Label binding', 'computed', 'Label expression'],
  ] as const) {
    await expectOpens(bound, row)
    // On the label's line, and not in a column of its own.
    const reset = bound.getByRole('button', { name: 'Reset Label', exact: true })
    expect(await gap(reset, bound.getByLabel('Label binding', { exact: true }))).toBeGreaterThan(4)
    expect(await widthOf(caption)).toBeGreaterThan(150)
  }

  const show = rowOf('Show when')
  await expectOpens(show, ['Show when', 'computed', 'Show when expression'])
  await expectOpens(show, ['Show when', 'condition', 'Comparison'])
  await nest(show)
  await expectReadable(show)

  await select(page, 'bound')
  await expectReadable(bound)
  expect(await widthOf(caption)).toBeGreaterThan(150)
})

test('setting a property leaves its field where it was and as wide, with Reset under the label', async ({
  page,
}) => {
  await open(page)
  // The narrowest pane, where a column for Reset left a field 48px.
  await page.getByRole('separator', { name: 'Resize Component properties' }).press('Home')
  await expect(page.locator('aside.fs-panel--right')).toHaveCSS('width', '240px')
  const panel = panelOf(page)
  type Role = 'textbox' | 'checkbox' | 'combobox' | 'spinbutton'
  // A field's name gains "(modified)" once it is set.
  const named = (label: string): { name: RegExp } => ({
    name: new RegExp('^' + label + '( \\(modified\\))?$'),
  })
  const right = async (locator: Locator): Promise<number> => {
    const box = (await locator.boundingBox())!
    return box.x + box.width
  }

  const sets = async (
    [role, label]: [Role, string],
    set: (field: Locator) => Promise<unknown>,
    next?: [Role, string],
  ): Promise<void> => {
    const field = panel.getByRole(role, named(label))
    const row = panel.locator('.fs-prop-row').filter({ has: page.getByRole(role, named(label)) })
    const reset = row.getByRole('button', { name: 'Reset ' + label, exact: true })
    const below = next && panel.getByRole(next[0], named(next[1]))
    await expect(reset).toHaveCount(0)
    const [before, belowBefore] = [await field.boundingBox(), await below?.boundingBox()]
    await set(field)

    await expect(reset).toBeVisible()
    expect(await field.boundingBox(), 'the field moved').toEqual(before)
    if (below) expect(await below.boundingBox(), 'the row below moved').toEqual(belowBefore)
    const under = await gap(row.locator('> label'), reset)
    expect(under, 'Reset is not just under the label').toBeGreaterThan(0)
    expect(under, 'Reset is not just under the label').toBeLessThan(12)
    expect(await right(reset), 'Reset reaches the field').toBeLessThan(before!.x)
    expect(await widthOf(reset), 'Reset fills the label column').toBeLessThan(
      await widthOf(row.locator('> label')),
    )
    // The control takes the rest of the row: no column is kept for Reset.
    expect(await right(row.locator('> .fs-prop-row__control'))).toBeCloseTo(await right(row), 0)
    expect(await collisions(row)).toEqual([])

    await reset.click()
    await expect(reset).toHaveCount(0)
    expect(await field.boundingBox(), 'Reset moved the field').toEqual(before)
  }

  await sets(['textbox', 'Placeholder'], (field) => field.fill('x'), ['textbox', 'Helper text'])
  // A field with no control wrapper ends at the same edge.
  expect(await right(panel.getByRole('textbox', named('Key')))).toBeCloseTo(
    await right(panel.getByRole('textbox', named('Placeholder'))),
    0,
  )
  await sets(['checkbox', 'Multiline'], (field) => field.check())

  await select(page, 'box')
  await page.getByRole('tab', { name: 'Style', exact: true }).click()
  await sets(['textbox', 'Background'], (field) => field.fill('#336699'), [
    'spinbutton',
    'Corner radius',
  ])
  // No binding picker, so Reset makes this row taller: the field still stays put.
  await sets(['combobox', 'Density'], (field) => field.selectOption('compact'))
})

test('a refused value leaves its field as wide as it was, with the reason under it', async ({
  page,
}) => {
  await open(page)
  const panel = panelOf(page)
  const danger = await page.locator('.fs-shell').evaluate((shell) => {
    const probe = shell.appendChild(document.createElement('i'))
    probe.style.color = 'var(--fs-danger)'
    const { color } = getComputedStyle(probe)
    probe.remove()
    return color
  })
  const refuses = async (field: Locator, value: string): Promise<void> => {
    const before = await widthOf(field)
    await field.fill(value)
    await field.press('Tab')

    const reason = panel.getByRole('alert')
    await expect(reason).toHaveCSS('color', danger)
    expect(await widthOf(field)).toBe(before)
    // Clear of the field's focus ring.
    expect(await gap(field, reason)).toBeGreaterThan(4)
    const end = await reason.evaluate((each) => {
      const text = document.createRange()
      text.selectNodeContents(each)
      return text.getBoundingClientRect().right
    })
    const edge = await panel.evaluate((each) => each.getBoundingClientRect().right)
    expect(end, 'the reason reaches out of the panel').toBeLessThan(edge)
    await field.press('Escape')
  }

  // Already another component's, and long enough to need breaking.
  await refuses(panel.getByLabel('Key', { exact: true }), LONG_KEY)
  await refuses(panel.getByLabel('Data key', { exact: true }), 'not a key')

  await page.getByRole('tab', { name: 'Style', exact: true }).click()
  await panel.getByText('Advanced CSS', { exact: true }).click()
  await refuses(panel.getByLabel('Padding', { exact: true }), '}')

  await page.getByRole('tab', { name: 'Rules', exact: true }).click()
  await refuses(panel.getByLabel('Regular expression', { exact: true }), '(')

  await select(page, 'trail')
  await page.getByRole('tab', { name: 'Properties', exact: true }).click()
  await refuses(panel.getByRole('textbox', { name: /^Items/ }), '[')
})

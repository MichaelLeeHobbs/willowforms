import type { Locator, Page } from '@playwright/test'

import { createDocument, prop } from '../packages/core/src/index.js'
import { STORAGE_KEY, expect, test } from './harness.js'

const panelOf = (page: Page): Locator =>
  page.getByRole('complementary', { name: 'Component properties' })

const LONG_KEY = 'an_answer_whose_key_is_longer_than_one_line_of_the_panel_is_wide'

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

test('a picker in a rule and the editor it opens each take the whole row', async ({ page }) => {
  await open(page)
  await page.getByRole('tab', { name: 'Rules', exact: true }).click()
  const rule = panelOf(page).getByRole('listitem').filter({ hasText: 'Required' }).first()

  for (const [label, choice, editor] of [
    ['Message', 'custom', 'Custom message'],
    ['Message', 'i18n', 'Translation key'],
    ['Message', 'i18n', 'French'],
    ['Apply when', 'computed', 'Guard expression'],
    ['Apply when', 'condition', 'Comparison'],
  ] as const) {
    const picker = rule.getByLabel(label, { exact: true })
    await picker.selectOption({ index: 0 })
    const resting = await widthOf(picker)
    await picker.selectOption(choice)

    const opened = rule.getByLabel(editor, { exact: true })
    expect(await widthOf(picker), choice).toBeGreaterThan(resting)
    expect(await widthOf(opened), editor).toBe(await widthOf(picker))
    expect(await gap(picker, opened), editor).toBeGreaterThan(4)
    expect(await collisions(rule), choice).toEqual([])
  }

  // A group indents its conditions, and is where a narrow row shows first.
  await rule.getByLabel('Comparison', { exact: true }).selectOption('and')
  await expect(rule.getByRole('button', { name: 'Remove condition 1' })).toBeVisible()
  expect(await collisions(rule)).toEqual([])
  for (const field of await rule.getByLabel('Comparison', { exact: true }).all()) {
    expect(await widthOf(field)).toBeGreaterThan(150)
  }
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

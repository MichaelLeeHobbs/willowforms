import type { Locator, Page } from '@playwright/test'

import { createDocument, prop } from '../packages/core/src/index.js'
import { STORAGE_KEY, expect, test } from './harness.js'

const panelOf = (page: Page): Locator =>
  page.getByRole('complementary', { name: 'Component properties' })

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
      key: 'other',
      type: 'TextField',
      props: { label: prop('Other') },
      schema: { type: 'string' },
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
  await page.locator('[data-fs-tree-row="age"]').click()
}

const widthOf = async (locator: Locator): Promise<number> =>
  (await locator.boundingBox())?.width ?? 0

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

    expect(await widthOf(picker), choice).toBeGreaterThan(resting)
    expect(await widthOf(rule.getByLabel(editor, { exact: true })), editor).toBe(
      await widthOf(picker),
    )
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
    await field.press('Enter')

    const reason = panel.getByRole('alert')
    await expect(reason).toHaveCSS('color', danger)
    expect(await widthOf(field)).toBe(before)
    const box = await field.boundingBox()
    expect((await reason.boundingBox())?.y).toBeGreaterThanOrEqual(
      (box?.y ?? Infinity) + (box?.height ?? 0),
    )
    await field.press('Escape')
  }

  await refuses(panel.getByLabel('Key', { exact: true }), 'not a key')
  await refuses(panel.getByLabel('Data key', { exact: true }), 'not a key')

  await page.getByRole('tab', { name: 'Rules', exact: true }).click()
  await refuses(panel.getByLabel('Regular expression', { exact: true }), '(')
})

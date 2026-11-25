import type { Locator } from '@playwright/test'

import { createDocument, prop } from '../packages/core/src/index.js'
import type { Operand } from '../packages/core/src/index.js'
import { PIXEL_PNG, STORAGE_KEY, expect, test } from './harness.js'

const answer = (dataKey: string): Operand => ({ kind: 'ref', dataKey })

/** One of everything the designer can remove. */
function everythingRemovable(): ReturnType<typeof createDocument> {
  const doc = createDocument('Removable', 'removable')
  doc.languages.push({ code: 'fr', name: 'French', bidi: 'ltr' })
  doc.translations['fr'] = {}
  doc.actions = { greet: { name: 'greet', body: 'return []', params: {} } }
  doc.root.children = [
    {
      key: 'choice',
      type: 'Select',
      props: { label: prop('Choice'), options: prop([{ label: 'One', value: 'one' }]) },
      schema: { type: 'string' },
    },
    {
      key: 'age',
      type: 'TextField',
      props: { label: prop('Age') },
      schema: {
        type: 'string',
        validations: [
          {
            key: 'required',
            when: {
              kind: 'condition',
              condition: { op: 'and', conditions: [{ op: 'notEmpty', value: answer('choice') }] },
            },
          },
        ],
      },
    },
    {
      key: 'trigger',
      type: 'Button',
      props: { label: prop('Apply') },
      events: { onClick: [{ type: 'builtin', name: 'clearValue', params: { address: 'age' } }] },
    },
    {
      key: 'art',
      type: 'Image',
      props: {
        alt: prop('Art'),
        src: prop('data:image/png;base64,' + PIXEL_PNG.toString('base64')),
      },
    },
  ]
  return doc
}

test('every button that removes something draws the trash icon, and × only closes', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, text }) => {
      localStorage.setItem(key, text)
      localStorage.setItem('willowforms.playground.kit', 'html')
    },
    { key: STORAGE_KEY, text: JSON.stringify(everythingRemovable()) },
  )
  await page.goto('/')

  const tab = (name: string): Promise<void> => page.getByRole('tab', { name, exact: true }).click()
  const row = (key: string): Locator => page.locator(`[data-fs-tree-row="${key}"]`)
  const select = async (key: string): Promise<void> => {
    await tab('Tree')
    await row(key).click()
    await expect(row(key)).toHaveAttribute('aria-selected', 'true')
  }

  await select('choice')
  const onCanvas = page
    .locator('.fs-selection__toolbar')
    .getByRole('button', { name: 'Remove choice', exact: true })
  const trash = await onCanvas.locator('svg').innerHTML()

  const expectTrash = async (button: Locator, text = ''): Promise<void> => {
    const icon = button.locator('svg')
    await expect(icon).toHaveJSProperty('innerHTML', trash)
    await expect(button).toHaveText(text)
    await expect(icon).toHaveCSS(
      'color',
      await button.evaluate((element) => getComputedStyle(element).color),
    )
    // The target size WCAG 2.5.8 asks for.
    const box = await button.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(24)
    expect(box?.height).toBeGreaterThanOrEqual(24)
  }
  const expectAll = async (region: Locator, names: string[], text = ''): Promise<void> => {
    await expect(region.getByRole('button', { name: /^Remove/ })).toHaveCount(names.length)
    for (const name of names) {
      await expectTrash(region.getByRole('button', { name, exact: true }), text)
    }
    await expect(page.getByRole('button').filter({ hasText: /^[×−]/ })).toHaveCount(0)
  }
  const panel = page.getByRole('complementary', { name: 'Component properties' })

  await expectTrash(onCanvas)
  await expectAll(page.getByRole('tree'), [
    'Remove choice',
    'Remove age',
    'Remove trigger',
    'Remove art',
  ])

  await tab('Properties')
  await expectAll(panel, ['Remove option 1'])

  await select('age')
  await tab('Rules')
  await expectAll(panel, ['Remove Required', 'Remove condition 1'])

  await select('trigger')
  await tab('Actions')
  await expectAll(panel, ['Remove clearValue'])

  await select('art')
  await tab('Properties')
  await expectAll(panel, ['Remove image'], 'Remove image')

  await tab('Settings')
  await expectAll(page.getByRole('tabpanel', { name: 'Settings', exact: true }), [
    'Remove English',
    'Remove French',
    'Remove greet',
  ])

  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }),
  ).toHaveText('×')
})

test('a Remove button makes no tree row taller, and stays inside its row', async ({ designer }) => {
  const rows = designer.page.locator('[data-fs-tree-row]')
  await expect(designer.row('root').getByRole('button')).toHaveCount(0)

  // The second makes the text shorter than the button, as a host's font can.
  for (const font of ['--fs-font-size: 14px', '--fs-font-size: 10px; line-height: 1']) {
    await designer.page.addStyleTag({ content: `.fs-shell { ${font} }` })
    const measured = await rows.evaluateAll((all) =>
      all.map((row) => {
        const { top, bottom, height } = row.getBoundingClientRect()
        const button = row.querySelector('button')?.getBoundingClientRect()
        return { height, inside: !button || (button.top >= top && button.bottom <= bottom) }
      }),
    )
    const [root, ...others] = measured
    expect(others.length).toBeGreaterThan(0)
    for (const row of others) expect(row).toEqual({ height: root?.height, inside: true })
  }
  expect((await designer.row('root').boundingBox())?.height).toBe(24)
})

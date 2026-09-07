import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import axe from 'axe-core'
import { createDocument, prop } from '../packages/core/src/index.js'
import type { FormDocument } from '../packages/core/src/index.js'

const key = 'willowforms.playground.document'
const read = (
  page: Page,
): Promise<{ type: string; name: string; params?: Record<string, unknown> }[]> =>
  page.evaluate(
    (key) =>
      (JSON.parse(localStorage.getItem(key)!) as FormDocument).root.children![0]!.events!.onClick!,
    key,
  )
async function setup(page: Page, kit = 'mui'): Promise<void> {
  const doc = createDocument('Action controls', 'actions')
  doc.root.children = [
    {
      key: 'trigger',
      type: 'Button',
      props: { label: prop('Apply') },
      events: {
        onClick: [
          {
            type: 'builtin',
            name: 'setValue',
            params: { address: '', value: null, custom: 'keep' },
          },
        ],
      },
    },
    {
      key: 'age',
      dataKey: 'years',
      type: 'NumberField',
      props: { label: prop('Age') },
      schema: { type: 'number' },
    },
    {
      key: 'name',
      dataKey: 'fullName',
      type: 'TextField',
      props: { label: prop('Full name') },
      schema: { type: 'string' },
    },
    {
      key: 'consent',
      dataKey: 'approved',
      type: 'Checkbox',
      props: { label: prop('Approved') },
      schema: { type: 'boolean' },
    },
    {
      key: 'rating',
      dataKey: 'score',
      type: 'Select',
      props: {
        label: prop('Rating'),
        options: prop([
          { label: 'Zero', value: 0 },
          { label: 'Five', value: 5 },
        ]),
      },
      schema: { type: 'number' },
    },
    {
      key: 'addressList',
      dataKey: 'addresses',
      type: 'Repeater',
      props: { label: prop('Addresses') },
      schema: { type: 'array' },
      children: [
        {
          key: 'street',
          dataKey: 'line1',
          type: 'TextField',
          props: { label: prop('Street') },
          schema: { type: 'string' },
        },
      ],
    },
  ]
  await page.addInitScript(({ key, text }) => localStorage.setItem(key, text), {
    key,
    text: JSON.stringify(doc),
  })
  await page.goto('/')
  await page.getByLabel('Kit', { exact: true }).selectOption(kit)
  await page.locator('[data-fs-key="trigger"]').click()
  await page.getByRole('tab', { name: 'Actions', exact: true }).click()
}

for (const kit of ['html', 'mui']) {
  test(`${kit}: action field selection uses data addresses and typed values without JSON`, async ({
    page,
  }) => {
    await setup(page, kit)
    const panel = page.getByRole('tabpanel', { name: 'Actions', exact: true })
    await expect(panel.getByLabel('Parameters', { exact: true })).not.toBeVisible()
    const target = panel.getByLabel('Target field')
    await expect(target.getByRole('option', { name: 'Age — years', exact: true })).toHaveCount(1)
    await target.selectOption('years')
    const value = panel.getByLabel('Value', { exact: true })
    await expect(value).toHaveAttribute('type', 'number')
    await value.fill('42.5')
    await value.press('Enter')
    await expect(value).toBeFocused()
    await expect
      .poll(() => read(page))
      .toEqual([
        {
          type: 'builtin',
          name: 'setValue',
          params: { address: 'years', value: 42.5, custom: 'keep' },
        },
      ])
    await value.fill('')
    await value.pressSequentially('1e')
    await value.press('Tab')
    await expect(panel.getByRole('alert')).toContainText('valid number')
    await expect.poll(async () => (await read(page))[0]!.params!['value']).toBe(42.5)
    await value.fill('42.5')
    await value.press('Tab')
    await target.selectOption('approved')
    await value.selectOption('false')
    await expect.poll(async () => (await read(page))[0]!.params!['value']).toBe(false)
    await target.selectOption('score')
    await value.selectOption({ label: 'Zero' })
    await expect.poll(async () => (await read(page))[0]!.params!['value']).toBe(0)
    await target.selectOption('fullName')
    await value.fill('Mira the Bold')
    await value.press('Tab')
    await expect.poll(async () => (await read(page))[0]!.params!['value']).toBe('Mira the Bold')
    await panel.getByRole('button', { name: 'Clear value', exact: true }).click()
    await expect.poll(async () => (await read(page))[0]!.params!['value']).toBeNull()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveValue('')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(target).toHaveValue('fullName')
  })
}

test('repeated targets use explicit row coordinates and raw edits preserve unavailable targets', async ({
  page,
}) => {
  await setup(page)
  const panel = page.getByRole('tabpanel', { name: 'Actions', exact: true })
  await panel.getByLabel('Target field').selectOption('addresses[].line1')
  await panel.getByLabel('Row number', { exact: true }).fill('2')
  await panel.getByLabel('Row number', { exact: true }).press('Enter')
  await panel.getByLabel('Value', { exact: true }).fill('North road')
  await panel.getByLabel('Value', { exact: true }).press('Enter')
  await expect
    .poll(() => read(page))
    .toEqual([
      {
        type: 'builtin',
        name: 'setValue',
        params: { address: 'addresses[1].line1', value: 'North road', custom: 'keep' },
      },
    ])
  await panel.getByLabel('Row number', { exact: true }).fill('0')
  await panel.getByLabel('Row number', { exact: true }).press('Tab')
  await expect(panel.getByRole('alert')).toContainText('at least 1')
  await expect
    .poll(async () => (await read(page))[0]!.params!['address'])
    .toBe('addresses[1].line1')
  await panel.getByLabel('Row number', { exact: true }).fill('2')
  await panel.getByLabel('Row number', { exact: true }).press('Tab')
  await panel.getByText('Advanced parameters', { exact: true }).click()
  const raw = panel.getByLabel('Parameters', { exact: true })
  await raw.fill('{"address":"removedField","value":15,"custom":"kept"}')
  await raw.press('Tab')
  await expect(panel.getByLabel('Target field')).toHaveValue('removedField')
  await expect(
    panel.getByLabel('Target field').getByRole('option', { name: /Unavailable field/ }),
  ).toHaveCount(1)
  await raw.fill('{bad')
  await raw.press('Tab')
  await expect(panel.getByRole('alert')).toContainText('valid JSON')
  await expect.poll(async () => (await read(page))[0]!.params!['value']).toBe(15)
  await raw.fill('{"address":"years","value":16}')
  await raw.press('Tab')
  await expect(panel.getByLabel('Value', { exact: true })).toHaveValue('16')
  await page.screenshot({ path: 'tmp/action-fields.png' })
  await page.addScriptTag({ content: axe.source })
  expect(
    await page.evaluate(async () =>
      (
        await (window as typeof window & { axe: typeof axe }).axe.run('.fs-panel--right', {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
    ),
  ).toEqual([])
})

test('message and focus editors retain the correct parameters when actions are reordered or removed', async ({
  page,
}) => {
  await setup(page)
  const panel = page.getByRole('tabpanel', { name: 'Actions', exact: true })
  await panel.getByLabel('Action for onClick').selectOption('builtin:announce')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await panel.getByLabel('Message', { exact: true }).fill('Ready to continue')
  await panel.getByLabel('Message', { exact: true }).press('Tab')
  await panel.getByLabel('Action for onClick').selectOption('builtin:focus')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await panel.getByLabel('Component to focus').selectOption('age')
  await panel.getByRole('button', { name: 'Move focus up', exact: true }).click()
  await expect
    .poll(() => read(page))
    .toEqual([
      { type: 'builtin', name: 'setValue', params: { address: '', value: null, custom: 'keep' } },
      { type: 'builtin', name: 'focus', params: { nodeKey: 'age' } },
      { type: 'builtin', name: 'announce', params: { message: 'Ready to continue' } },
    ])
  await panel.getByRole('button', { name: 'Remove announce', exact: true }).click()
  await expect(panel.getByLabel('Message', { exact: true })).toHaveCount(0)
  await expect(panel.getByLabel('Component to focus')).toHaveValue('age')
  await expect.poll(async () => (await read(page)).length).toBe(2)
})

test('host context values offer types and preserve unfinished JSON until commit', async ({
  page,
}) => {
  await setup(page)
  const panel = page.getByRole('tabpanel', { name: 'Actions', exact: true })
  await panel.getByLabel('Action for onClick').selectOption('builtin:setContext')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await panel.getByLabel('Context path', { exact: true }).fill('wizard.ready')
  await panel.getByLabel('Context path', { exact: true }).press('Tab')
  await panel.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('boolean')
  await panel.getByLabel('Value', { exact: true }).selectOption('true')
  await expect
    .poll(async () => (await read(page))[1]!.params)
    .toEqual({ path: 'wizard.ready', value: true })
  await panel.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('object')
  const value = panel.getByLabel('Value (JSON)', { exact: true })
  await value.fill('{\n  "ready":')
  await expect(value).toHaveValue('{\n  "ready":')
  await value.press('Tab')
  await expect(panel.getByRole('alert')).toBeVisible()
  await expect.poll(async () => (await read(page))[1]!.params!['value']).toEqual({})
  await value.fill('{\n  "ready": false\n}')
  await value.press('Tab')
  await expect.poll(async () => (await read(page))[1]!.params!['value']).toEqual({ ready: false })
})

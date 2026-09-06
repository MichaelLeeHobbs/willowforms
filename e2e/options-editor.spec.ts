import type { Locator } from '@playwright/test'
import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import type { FormDocument, JsonValue } from '../packages/core/src/index.js'
import { createDocument, prop } from '../packages/core/src/index.js'

for (const kit of ['html', 'mui']) {
  test(`${kit}: authors choice labels, typed values, and order without JSON`, async ({ page }) => {
    const doc = createDocument('Options', 'options-test')
    doc.root.children = [
      {
        key: 'choice',
        type: 'Select',
        props: {
          label: prop('Priority'),
          options: prop([
            { label: 'Zebra', value: 0 },
            { label: 'Apple', value: false },
            { label: 'Middle', value: 'mid' },
          ]),
        },
        schema: { type: 'string' },
      },
    ]
    await page.addInitScript(
      (text) => localStorage.setItem('formsmith.playground.document', text),
      JSON.stringify(doc),
    )
    await page.goto('/')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.locator('[data-fs-key="choice"]').click()
    const panel = page.getByRole('complementary', { name: 'Component properties' })
    const editor = panel.getByRole('group', { name: 'Options', exact: true })
    const row = (at: number): Locator =>
      editor.getByRole('group', { name: `Option ${at}`, exact: true })
    const saved = (): Promise<JsonValue> =>
      page.evaluate(() => {
        const doc = JSON.parse(
          localStorage.getItem('formsmith.playground.document')!,
        ) as FormDocument
        const options = doc.root.children![0]!.props['options']!
        return options.kind === 'static' ? options.value : null
      })
    await expect(editor.locator('textarea')).toHaveCount(0)
    await editor.getByRole('combobox', { name: /Order/ }).selectOption('az')
    await expect(row(1).getByLabel('Label', { exact: true })).toHaveValue('Apple')
    await expect.poll(saved).toEqual([
      { label: 'Apple', value: false },
      { label: 'Middle', value: 'mid' },
      { label: 'Zebra', value: 0 },
    ])
    await editor.getByRole('combobox', { name: /Order/ }).selectOption('za')
    await expect(row(1).getByLabel('Label', { exact: true })).toHaveValue('Zebra')
    await editor.getByRole('button', { name: 'Move option 1 down' }).click()
    await row(1).getByLabel('Label', { exact: true }).fill('Normal')
    await row(1).getByLabel('Value', { exact: true }).fill('normal')
    await editor.getByRole('button', { name: 'Remove option 3' }).click()
    await editor.getByRole('button', { name: 'Add option' }).click()
    await row(3).getByLabel('Label', { exact: true }).fill('Urgent')
    await row(3).getByLabel('Value type').selectOption('number')
    await row(3).getByLabel('Value', { exact: true }).fill('10')
    await row(3).getByLabel('Value', { exact: true }).press('Tab')
    await expect.poll(saved).toEqual([
      { label: 'Normal', value: 'normal' },
      { label: 'Zebra', value: 0 },
      { label: 'Urgent', value: 10 },
    ])
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(row(1).getByLabel('Label', { exact: true })).toHaveValue('Zebra')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    const bounds = await editor.boundingBox()
    const pane = await panel.boundingBox()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(pane!.x + pane!.width)
    await page.evaluate(axe.source)
    const results = await page.evaluate(
      async () =>
        (await (window as typeof window & { axe: typeof axe }).axe.run('.fs-panel--right'))
          .violations,
    )
    expect(results).toEqual([])
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const choice = page
      .getByRole('main', { name: 'Form canvas' })
      .getByRole('combobox', { name: 'Priority' })
    if (kit === 'html')
      await expect(choice.locator('option')).toHaveText(['Choose…', 'Normal', 'Zebra', 'Urgent'])
    else {
      await choice.click()
      await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
        'Choose…',
        'Normal',
        'Zebra',
        'Urgent',
      ])
    }
  })
}

import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { createDocument, prop } from '../packages/core/src/index.js'

for (const kit of ['html', 'mui']) {
  test(`${kit}: Preview exposes answer JSON with data keys, types, rows, and clipboard fallback`, async ({
    page,
  }) => {
    const doc = createDocument('Data preview', 'preview-data')
    doc.root.children = [
      {
        key: 'nameControl',
        dataKey: 'name',
        type: 'TextField',
        props: { label: prop('Name') },
        schema: { type: 'string' },
      },
      {
        key: 'countControl',
        dataKey: 'count',
        type: 'NumberField',
        props: { label: prop('Count') },
        schema: { type: 'number' },
      },
      {
        key: 'consentControl',
        dataKey: 'consent',
        type: 'Checkbox',
        props: { label: prop('Consent') },
        schema: { type: 'boolean' },
      },
      {
        key: 'unusedControl',
        dataKey: 'unused',
        type: 'TextField',
        props: { label: prop('Unanswered') },
        schema: { type: 'string' },
      },
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: { label: prop('Address') },
        schema: { type: 'array' },
        children: [
          {
            key: 'streetControl',
            dataKey: 'street',
            type: 'TextField',
            props: { label: prop('Street') },
            schema: { type: 'string' },
          },
        ],
      },
    ]
    await page.addInitScript((text) => {
      localStorage.setItem('formsmith.playground.document', text)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      })
    }, JSON.stringify(doc))
    await page.goto('/')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await expect(page.getByRole('button', { name: 'Form data JSON', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const form = page.getByRole('main', { name: 'Form canvas' })
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Mira')
    await form.getByRole('spinbutton', { name: 'Count', exact: true }).fill('0')
    await form.getByRole('checkbox', { name: 'Consent', exact: true }).check()
    await form.getByRole('checkbox', { name: 'Consent', exact: true }).uncheck()
    await form.getByRole('button', { name: 'Add Address', exact: true }).click()
    await form.getByRole('textbox', { name: 'Street', exact: true }).fill('12 Oak Lane')
    const trigger = form.getByRole('button', { name: 'Form data JSON', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Form data', exact: true })
    const output = dialog.getByRole('textbox', { name: 'Form data JSON', exact: true })
    const expected = {
      name: 'Mira',
      count: 0,
      consent: false,
      addresses: [{ street: '12 Oak Lane' }],
    }
    await expect(output).toHaveValue(JSON.stringify(expected, null, 2))
    await expect(output).toHaveAttribute('readonly', '')
    await expect(output).toBeFocused()
    await dialog.getByRole('button', { name: 'Copy JSON', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Clipboard access is unavailable')
    expect(
      await output.evaluate((input) => {
        const field = input as HTMLTextAreaElement
        return field.value.slice(field.selectionStart, field.selectionEnd)
      }),
    ).toBe(JSON.stringify(expected, null, 2))
    await page.evaluate(axe.source)
    expect(
      await page.evaluate(
        async () =>
          (await (window as typeof window & { axe: typeof axe }).axe.run('dialog[open]'))
            .violations,
      ),
    ).toEqual([])
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            document.body.dataset['copiedJson'] = text
            return Promise.resolve()
          },
        },
      }),
    )
    await dialog.getByRole('button', { name: 'Copy JSON', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Form data copied')
    await expect(page.locator('body')).toHaveAttribute(
      'data-copied-json',
      JSON.stringify(expected, null, 2),
    )
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.locator('dialog.fs-preview-data')).not.toHaveAttribute('aria-describedby')
    await expect(trigger).toBeFocused()
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Lena')
    await page.setViewportSize({ width: 390, height: 844 })
    await trigger.click()
    await expect(output).toHaveValue(JSON.stringify({ ...expected, name: 'Lena' }, null, 2))
    const bounds = await dialog.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await form.getByRole('button', { name: 'Clear data', exact: true }).click()
    await trigger.click()
    await expect(output).toHaveValue('{}')
  })
}

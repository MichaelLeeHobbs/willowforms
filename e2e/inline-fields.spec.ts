import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { createDocument, prop } from '../packages/core/src/index.js'
import { transitionsEnd } from './harness.js'

for (const kit of ['html', 'mui']) {
  test(`${kit} inline fields keep labels, control widths, errors, and keyboard input usable`, async ({
    page,
  }) => {
    const document = createDocument('Compact records', 'inline-fields')
    document.root.props = { density: prop('compact'), maxWidth: prop(420) }
    document.root.children = [
      {
        key: 'bonus',
        type: 'NumberField',
        props: {
          label: prop('Investigation bonus'),
          inlineLabel: prop(true),
          inputWidth: prop(64),
        },
        schema: { type: 'number', validations: [{ key: 'required' }] },
      },
      {
        key: 'training',
        type: 'Select',
        props: {
          label: prop('Investigation training'),
          inlineLabel: prop(true),
          inputWidth: prop(140),
          options: prop([{ label: 'Proficient', value: 'trained' }]),
        },
        schema: { type: 'string', validations: [{ key: 'required' }] },
      },
    ]
    await page.addInitScript(
      ({ json, kitId }) => {
        localStorage.setItem('willowforms.playground.document', json)
        localStorage.setItem('willowforms.playground.kit', kitId)
      },
      { json: JSON.stringify(document), kitId: kit },
    )
    await page.goto('/')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const form = page.locator('[data-fs-key="root"]')
    const bonus = form.getByRole('spinbutton', { name: 'Investigation bonus', exact: true })
    const training = form.getByRole('combobox', { name: /Investigation training/ })
    for (const [key, width] of [
      ['bonus', 64],
      ['training', 140],
    ] as const) {
      const field = form.locator(`[data-fs-key="${key}"]`)
      const label = (await field.locator('label').boundingBox())!
      const input = (await (key === 'bonus' ? bonus : training).boundingBox())!
      expect(input.x).toBeGreaterThan(label.x + label.width - 1)
      expect(Math.abs(input.y + input.height / 2 - label.y - label.height / 2)).toBeLessThan(2)
      expect(Math.abs(input.width - width)).toBeLessThan(4)
    }
    await page.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect(bonus).toHaveAttribute('aria-invalid', 'true')
    await expect(bonus).toHaveAccessibleDescription(/required/i)
    await expect(training).toHaveAccessibleDescription(/required/i)
    await bonus.fill('3')
    await bonus.press('ArrowUp')
    if (kit === 'html') await training.selectOption('trained')
    else {
      await training.click()
      await page.getByRole('option', { name: 'Proficient', exact: true }).click()
    }
    await expect(bonus).toHaveValue('4')
    await expect(bonus).not.toHaveAttribute('aria-invalid', 'true')
    await expect(training).not.toHaveAttribute('aria-invalid', 'true')
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(theme)
      await transitionsEnd(page)
      await page.addScriptTag({ content: axe.source })
      const violations = await form.evaluate(async (element) =>
        (
          await (window as typeof window & { axe: typeof axe }).axe.run(element, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
          })
        ).violations.map(({ id }) => id),
      )
      expect(violations).toEqual([])
    }
  })
}

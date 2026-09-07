import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { createDocument, prop } from '../packages/core/src/index.js'
import type { ComponentNode } from '../packages/core/src/index.js'

for (const kit of ['html', 'mui']) {
  test(`${kit} imports density, inherits it, and keeps section overrides and errors usable`, async ({
    page,
  }) => {
    const document = createDocument('Density', 'density')
    const field = (key: string): ComponentNode => ({
      key: key.replaceAll(' ', ''),
      type: 'TextField',
      props: { label: prop(key), helperText: prop('A short hint.') },
      schema: { type: 'string', validations: [{ key: 'required' }] },
    })
    document.root.props['density'] = prop('compact')
    document.root.children = [
      { key: 'autoGroup', type: 'Stack', props: {}, children: [field('Compact field')] },
      {
        key: 'comfortableGroup',
        type: 'Stack',
        props: { density: prop('comfortable') },
        children: [field('Comfortable field')],
      },
      {
        key: 'explicitGap',
        type: 'Stack',
        props: { gap: prop(29) },
        children: [field('Another field')],
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
    await page.getByRole('tab', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Form density' })).toHaveValue('compact')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const compact = page.getByRole('textbox', { name: 'Compact field', exact: true })
    const comfortable = page.getByRole('textbox', { name: 'Comfortable field', exact: true })
    expect((await compact.boundingBox())!.height).toBeLessThan(
      (await comfortable.boundingBox())!.height - 4,
    )
    await expect(compact).toHaveAccessibleDescription('A short hint.')
    expect(
      await page
        .locator('[data-fs-key="autoGroup"]')
        .evaluate((element) => getComputedStyle(element).gap),
    ).toBe('12px')
    expect(
      await page
        .locator('[data-fs-key="explicitGap"]')
        .evaluate((element) => getComputedStyle(element).gap),
    ).toBe('29px')
    await page.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect(compact).toHaveAttribute('aria-invalid', 'true')
    await expect(compact).toHaveAccessibleDescription(/required/i)
    await compact.fill('Answered')
    await comfortable.fill('Answered')
    await page.getByRole('textbox', { name: 'Another field', exact: true }).fill('Answered')
    await expect(compact).not.toHaveAttribute('aria-invalid', 'true')
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(theme)
      await page.addScriptTag({ content: axe.source })
      const violations = await page.locator('[data-fs-key="root"]').evaluate(async (element) =>
        (
          await (window as typeof window & { axe: typeof axe }).axe.run(element, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations.map(({ id }) => id),
      )
      expect(violations).toEqual([])
    }
    await page.getByRole('button', { name: 'Back to editing' }).click()
    await page.getByRole('combobox', { name: 'Form density' }).selectOption('comfortable')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    expect((await compact.boundingBox())!.height).toBeCloseTo(
      (await comfortable.boundingBox())!.height,
      0,
    )
  })
}

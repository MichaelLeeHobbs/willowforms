import axe from 'axe-core'
import { createDocument, instantiate, prop } from '../packages/core/src/factory.js'
import type { FormDocument } from '../packages/core/src/types.js'
import { htmlKit } from '../packages/kit-html/src/definitions.js'
import { expect, test, STORAGE_KEY } from './harness.js'

function catalogue(): FormDocument {
  const document = createDocument('Accessible form', 'accessibility')
  for (const def of htmlKit.components.filter((def) => !def.root && def.type !== 'RadioItem')) {
    const node = instantiate(def, document.root)
    if (!node) throw new Error('Could not create ' + def.type)
    delete node.renderWhen
    if (def.props.some((schema) => schema.name === 'label'))
      node.props['label'] = prop(def.type + ' question')
    if (def.props.some((schema) => schema.name === 'helperText'))
      node.props['helperText'] = prop('Instructions for ' + def.type)
    if (def.props.some((schema) => schema.name === 'options'))
      node.props['options'] = prop([
        { label: 'First option', value: 'first' },
        { label: 'Second option', value: 'second' },
      ])
    if (def.type === 'Image') node.props['alt'] = prop('Example illustration')
    if (def.type === 'Link') node.props['href'] = prop('#example')
    if (def.type === 'Breadcrumbs')
      node.props['items'] = prop([{ label: 'Forms', href: '#forms' }, { label: 'Current form' }])
    if (def.type === 'Repeater')
      node.children = [
        {
          key: 'rowAnswer',
          type: 'TextField',
          props: { label: prop('Repeated answer'), helperText: prop('Instructions for this row') },
          schema: { type: 'string' },
        },
      ]
    document.root.children?.push(node)
  }
  return document
}

for (const kit of ['html', 'mui']) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${kit} ${theme} runtime catalogue has accessible names, descriptions, and browser markup`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(
        ({ key, document, kit }) => {
          localStorage.setItem(key, document)
          localStorage.setItem('willowforms.playground.kit', kit)
        },
        { key: STORAGE_KEY, document: JSON.stringify(catalogue()), kit },
      )
      await page.goto('/')
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      const form = page.locator('[data-fs-key="root"]')
      await form.getByRole('button', { name: 'Add Repeater question' }).click()
      await form.getByRole('button', { name: 'Add Repeater question' }).click()
      const answers = form.getByRole('textbox', { name: 'Repeated answer' })
      await expect(answers).toHaveCount(2)
      await answers.nth(0).fill('First row')
      await answers.nth(0).press('Tab')
      await expect(
        form.getByRole('button', { name: 'Remove Repeater question item 1' }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(answers.nth(1)).toBeFocused()
      await expect(answers.nth(0)).toHaveAccessibleDescription('Instructions for this row')
      await expect(answers.nth(1)).toHaveAccessibleDescription('Instructions for this row')
      await expect(form.getByRole('radiogroup', { name: 'RadioGroup question' })).toBeVisible()
      await expect(form.getByRole('img', { name: 'Example illustration' })).toBeVisible()
      await expect(form.getByRole('navigation', { name: 'Breadcrumbs question' })).toBeVisible()
      await page.addScriptTag({ content: axe.source })
      const violations = await page.evaluate(async () => {
        const result = await (window as typeof window & { axe: typeof axe }).axe.run(
          '[data-fs-key="root"]',
          {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          },
        )
        return result.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        }))
      })
      expect(violations).toEqual([])
    })
  }
}

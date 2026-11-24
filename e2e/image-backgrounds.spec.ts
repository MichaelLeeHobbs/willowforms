import { expect, test } from '@playwright/test'
import { createDocument, prop } from '../packages/core/src/index.js'
import type { ComponentNode } from '../packages/core/src/index.js'
import { PIXEL_PNG } from './harness.js'

for (const kit of ['html', 'mui']) {
  test(`${kit}: backgrounds stay on each container and refuse unsafe sources`, async ({ page }) => {
    const doc = createDocument('Backgrounds', 'backgrounds')
    const source = '/background-test.svg'
    doc.root.props['backgroundImage'] = prop(source)
    doc.root.children = ['Stack', 'Step', 'Repeater', 'Grid', 'Box', 'Card'].map((type) => ({
      type,
      key: type.toLowerCase(),
      props: {
        backgroundImage: prop(source),
        backgroundFit: prop('contain'),
        backgroundPosition: prop('bottom; color: red'),
      },
      children: [],
      ...(type === 'Repeater' ? { schema: { type: 'array' as const } } : {}),
    }))
    doc.root.children.push({
      type: 'Box',
      key: 'unsafe',
      props: { backgroundImage: prop('javascript:alert(1)') },
      children: [],
    })
    await page.addInitScript(
      (text) => localStorage.setItem('willowforms.playground.document', text),
      JSON.stringify(doc),
    )
    await page.route('**/background-test.svg', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>',
      }),
    )
    await page.goto('/')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    for (const key of ['root', 'stack', 'step', 'repeater', 'grid', 'box', 'card']) {
      const element = page.locator(`[data-fs-key="${key}"]`)
      await expect(element).toHaveCSS('background-image', /background-test\.svg/)
      await expect(element).toHaveCSS('background-position', '50% 50%')
      if (key !== 'root') await expect(element).toHaveCSS('background-size', 'contain')
    }
    await expect(page.locator('[data-fs-key="unsafe"]')).toHaveCSS('background-image', 'none')
  })

  test(`${kit}: a Box keeps its own background when its image is removed`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    const box = (key: string, background: string): ComponentNode => ({
      type: 'Box',
      key,
      props: { background: prop(background), backgroundImage: prop('/background-test.png') },
      children: [],
    })
    const doc = createDocument('Backgrounds', 'backgrounds')
    doc.root.children = [
      box('coloured', '#ff0000'),
      box('graded', 'linear-gradient(red, blue)'),
      box('bare', ''),
    ]
    await page.addInitScript(
      (text) => localStorage.setItem('willowforms.playground.document', text),
      JSON.stringify(doc),
    )
    await page.route('**/background-test.png', (route) =>
      route.fulfill({ contentType: 'image/png', body: PIXEL_PNG }),
    )
    await page.goto('/')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('tab', { name: 'Tree', exact: true }).click()

    await expect(page.locator('[data-fs-key="coloured"]')).toHaveCSS(
      'background-color',
      'rgb(255, 0, 0)',
    )

    const panel = page.locator('.fs-panel--right')
    for (const key of ['coloured', 'graded', 'bare']) {
      const element = page.locator(`[data-fs-key="${key}"]`)
      await expect(element).toHaveCSS('background-image', /background-test\.png/)

      await page.locator(`[data-fs-tree-row="${key}"]`).click()
      await page.getByRole('tab', { name: 'Style', exact: true }).click()
      const disclosure = panel.locator('details').filter({ hasText: /^Background image/ })
      if (!(await disclosure.evaluate((each) => (each as HTMLDetailsElement).open))) {
        await disclosure.locator('summary').click()
      }
      await panel.getByRole('button', { name: 'Remove image' }).click()
      await expect(element).not.toHaveCSS('background-image', /background-test\.png/)
    }

    await expect(page.locator('[data-fs-key="coloured"]')).toHaveCSS(
      'background-color',
      'rgb(255, 0, 0)',
    )
    await expect(page.locator('[data-fs-key="graded"]')).toHaveCSS(
      'background-image',
      'linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))',
    )
    await expect(page.locator('[data-fs-key="bare"]')).toHaveCSS('background-image', 'none')
    expect(errors).toEqual([])
  })
}

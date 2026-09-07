import { expect, test } from '@playwright/test'
import { createDocument, prop } from '../packages/core/src/index.js'

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
}

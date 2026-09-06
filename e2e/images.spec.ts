import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { createDocument, prop } from '../packages/core/src/index.js'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
)

for (const kit of ['html', 'mui']) {
  test(`${kit}: images and backgrounds load, fit, embed, clear, and undo`, async ({ page }) => {
    const doc = createDocument('Image controls', 'images')
    doc.root.children = [
      {
        type: 'Box',
        key: 'backdrop',
        props: {},
        children: [
          { type: 'Text', key: 'caption', props: { text: prop('Conference') } },
          { type: 'Image', key: 'art', props: { alt: prop('Community illustration') } },
        ],
      },
    ]
    await page.addInitScript(
      (text) => localStorage.setItem('formsmith.playground.document', text),
      JSON.stringify(doc),
    )
    await page.route('**/visual-test.svg', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#2563eb"/></svg>',
      }),
    )
    await page.goto('/')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    const art = page.locator('[data-fs-key="art"]')
    await art.click()
    const panel = page.getByRole('complementary', { name: 'Component properties' })
    const source = panel.getByLabel(/^Source(?: \(modified\))?$/)
    await source.fill('/visual-test.svg')
    await source.press('Tab')
    await expect
      .poll(() => art.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(400)
    await expect(panel.getByRole('img', { name: 'Preview' })).toBeVisible()
    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    await panel.getByLabel(/^Height(?: \(modified\))?$/).fill('100')
    await panel.getByRole('spinbutton', { name: /^Width(?: \(modified\))?$/ }).fill('240')
    await panel.getByLabel(/^Fit(?: \(modified\))?$/).selectOption('contain')
    await expect(art).toHaveCSS('height', '100px')
    await expect(art).toHaveCSS('width', '240px')
    await expect(art).toHaveCSS('object-fit', 'contain')
    await page.getByRole('tab', { name: 'Properties', exact: true }).click()
    await panel
      .getByLabel('Embed an image')
      .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png })
    await expect(art).toHaveAttribute('src', /^data:image\/png;base64,/)
    await expect
      .poll(() => art.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(1)
    await expect(source).toHaveValue('Embedded image')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(source).toHaveValue('/visual-test.svg')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await panel.getByRole('button', { name: 'Remove image' }).click()
    await expect(art).not.toHaveAttribute('src')
    await source.fill('javascript:alert(1)')
    await source.press('Tab')
    await expect(panel.getByRole('alert')).toContainText('Use an image URL')
    await expect(art).not.toHaveAttribute('src')
    await page.route('**/missing-image.png', (route) => route.abort())
    await source.fill('/missing-image.png')
    await source.press('Tab')
    await expect(panel.getByRole('alert')).toContainText('could not be loaded')
    await source.fill('/visual-test.svg')
    await source.press('Tab')
    await panel.getByLabel('Embed an image').setInputFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    })
    await expect(panel.getByRole('alert')).toContainText('up to 2 MiB')
    await expect(art).toHaveAttribute('src', '/visual-test.svg')
    await page.getByRole('tab', { name: 'Tree', exact: true }).click()
    await page.getByRole('treeitem', { name: /backdrop/ }).click()
    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    await panel
      .locator('summary')
      .filter({ hasText: /^Background image$/ })
      .click()
    const background = panel.getByLabel(/^Background image(?: \(modified\))?$/)
    await background.fill('/visual-test.svg')
    await background.press('Tab')
    const box = page.locator('[data-fs-key="backdrop"]')
    await expect(box).toHaveCSS('background-image', /visual-test\.svg/)
    await expect(box).toHaveCSS('background-size', 'cover')
    await panel.getByLabel(/^Image fit(?: \(modified\))?$/).selectOption('tile')
    await panel.getByLabel(/^Image position(?: \(modified\))?$/).selectOption('right bottom')
    await panel.getByLabel(/^Readability overlay(?: \(modified\))?$/).selectOption('dark')
    await expect(box).toHaveCSS('background-repeat', 'repeat, repeat')
    await expect(box).toHaveCSS('background-position', '100% 100%, 100% 100%')
    await expect(box).toHaveCSS('background-image', /linear-gradient/)
    await page.evaluate(axe.source)
    const results = await page.evaluate(
      async () =>
        (await (window as typeof window & { axe: typeof axe }).axe.run('.fs-panel--right'))
          .violations,
    )
    expect(results).toEqual([])
    await panel.getByRole('button', { name: 'Remove image' }).click()
    await expect(box).toHaveCSS('background-image', 'none')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(art).toHaveAttribute('alt', 'Community illustration')
    await expect
      .poll(() => art.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(400)
  })
}

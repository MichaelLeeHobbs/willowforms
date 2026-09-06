import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { createDocument, prop } from '../packages/core/src/index.js'
import type { ComponentNode } from '../packages/core/src/index.js'

for (const kit of ['html', 'mui']) {
  test(`${kit} authors new grids with Fill width enabled`, async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    const fill = page.getByRole('checkbox', { name: /^Fill width/ })
    await expect(fill).toBeChecked()
    await fill.uncheck()
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const grid = page.locator('[data-fs-key="grid"]')
    expect((await grid.boundingBox())!.width).toBeCloseTo(432, 0)
    await page.getByRole('button', { name: 'Back to editing' }).click()
    await fill.check()
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    expect((await grid.boundingBox())!.width).toBeGreaterThan(500)
  })

  test(`${kit} fill-width Grid caps columns, reflows, and preserves legacy sizing`, async ({
    page,
  }) => {
    const document = createDocument('Grid layout', 'grid-layout')
    const field = (key: string): ComponentNode => ({
      key,
      type: 'TextField',
      props: { label: prop(key) },
      schema: { type: 'string', validations: [] },
    })
    const grid = (key: string, fill: boolean): ComponentNode => ({
      key,
      type: 'Grid',
      props: {
        columns: prop(2),
        minColumnWidth: prop(200),
        gap: prop(16),
        ...(fill ? { fillWidth: prop(true) } : {}),
      },
      children: [field(key + 'First'), field(key + 'Second'), field(key + 'Third')],
    })
    document.root.props = { maxWidth: prop(1100) }
    document.root.children = [grid('stretch', true), grid('legacy', false)]
    await page.addInitScript(
      ({ doc, kitId }) => {
        localStorage.setItem('formsmith.playground.document', doc)
        localStorage.setItem('formsmith.playground.kit', kitId)
      },
      { doc: JSON.stringify(document), kitId: kit },
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const bounds = (key: string): ReturnType<Locator['boundingBox']> =>
      page.locator(`[data-fs-key="${key}"]`).boundingBox()
    const wide = await bounds('stretch')
    expect(wide!.width).toBeGreaterThan(1000)
    const first = (await bounds('stretchFirst'))!
    const second = (await bounds('stretchSecond'))!
    const third = (await bounds('stretchThird'))!
    expect(Math.abs(first.y - second.y)).toBeLessThan(1)
    expect(third.y).toBeGreaterThan(first.y + first.height)
    expect(Math.abs(third.x - first.x)).toBeLessThan(1)
    expect((await bounds('legacy'))!.width).toBeCloseTo(432, 0)
    await page.setViewportSize({ width: 390, height: 844 })
    const narrowFirst = (await bounds('stretchFirst'))!
    const narrowSecond = (await bounds('stretchSecond'))!
    expect(narrowSecond.y).toBeGreaterThan(narrowFirst.y + narrowFirst.height)
    expect(Math.abs(narrowSecond.x - narrowFirst.x)).toBeLessThan(1)
    const surface = page.locator('.fs-canvas__surface')
    expect(
      await surface.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
  })
}

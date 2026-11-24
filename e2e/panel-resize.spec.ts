import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import axe from 'axe-core'
import { transitionsEnd } from './harness.js'

const key = 'willowforms.designer.panel-widths.v1'
const leftName = 'Resize Components and structure'
const rightName = 'Resize Component properties'
const width = async (panel: Locator): Promise<number> => (await panel.boundingBox())!.width
async function drag(page: Page, handle: Locator, dx: number): Promise<void> {
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 })
}

test('both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  const left = page.locator('aside.fs-panel--left')
  const right = page.locator('aside.fs-panel--right')
  await expect(left).toHaveCSS('width', '288px')
  const before = await page.evaluate(() => localStorage.getItem('willowforms.playground.document'))
  expect(before).not.toBeNull()
  await drag(page, page.getByRole('separator', { name: leftName }), 92)
  await page.mouse.up()
  await expect(left).toHaveCSS('width', '380px')
  await drag(page, page.getByRole('separator', { name: rightName }), -132)
  await page.mouse.up()
  await expect(right).toHaveCSS('width', '420px')
  expect(await page.evaluate(() => localStorage.getItem('willowforms.playground.document'))).toBe(
    before,
  )
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.reload()
  await expect(left).toHaveCSS('width', '380px')
  await expect(right).toHaveCSS('width', '420px')
  await page.getByLabel('Kit', { exact: true }).selectOption('html')
  await expect(left).toHaveCSS('width', '380px')
  await expect(right).toHaveCSS('width', '420px')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('separator')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to editing', exact: true }).click()
  await page.getByRole('button', { name: 'Hide Components and structure' }).click()
  await expect(page.getByRole('separator', { name: leftName })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show Components and structure' }).click()
  await expect(left).toHaveCSS('width', '380px')
  await page.setViewportSize({ width: 960, height: 900 })
  await expect.poll(() => width(page.locator('.fs-canvas'))).toBeGreaterThanOrEqual(320)
  expect(await width(left)).toBeLessThan(380)
  expect(await width(right)).toBeLessThan(420)
  expect(await page.locator('.fs-body').evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0)
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(page.getByRole('separator')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Components and structure', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await expect(left).toHaveCSS('width', '380px')
  await expect(right).toHaveCSS('width', '420px')
  expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), key))!)).toEqual({
    left: 380,
    right: 420,
  })
})

test('keyboard resizing, canceled drags, and default reset keep selection and accessible separator values intact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.locator('[data-fs-key="email"] input').click()
  const handle = page.getByRole('separator', { name: leftName })
  const panel = page.locator('aside.fs-panel--left')
  await handle.press('ArrowRight')
  await expect(panel).toHaveCSS('width', '298px')
  await handle.press('Shift+ArrowRight')
  await expect(panel).toHaveCSS('width', '338px')
  await drag(page, handle, 80)
  await expect(panel).toHaveCSS('width', '418px')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(panel).toHaveCSS('width', '338px')
  await expect(page.getByRole('textbox', { name: 'Key', exact: true })).toHaveValue('email')
  expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), key))!)).toEqual({
    left: 338,
  })
  await handle.press('Home')
  await expect(panel).toHaveCSS('width', '240px')
  await handle.press('End')
  await expect(panel).toHaveCSS('width', '560px')
  await expect(handle).toHaveAttribute('aria-valuenow', '560')
  await handle.press('Enter')
  await expect(panel).toHaveCSS('width', '288px')
  const right = page.getByRole('separator', { name: rightName })
  await right.press('ArrowLeft')
  await expect(page.locator('aside.fs-panel--right')).toHaveCSS('width', '298px')
  await right.dblclick()
  await expect(page.locator('aside.fs-panel--right')).toHaveCSS('width', '288px')
  expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), key))!)).toEqual({})
  await page.getByRole('tab', { name: 'Properties', exact: true }).press('Escape')
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Designer theme').selectOption(theme)
    await transitionsEnd(page)
    await page.addScriptTag({ content: axe.source })
    const violations = await page.evaluate(async () =>
      (
        await (window as typeof window & { axe: typeof axe }).axe.run('.fs-body', {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
    )
    expect(violations).toEqual([])
  }
})

for (const stored of ['not json', '{"left":-1,"right":1e999}', '{"left":"900px","right":null}']) {
  test(`invalid saved widths recover and resizing survives blocked storage: ${stored}`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, stored }) => {
        localStorage.setItem(key, stored)
        const save = localStorage.setItem.bind(localStorage)
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException('Storage unavailable', 'QuotaExceededError')
          save(name, value)
        }
      },
      { key, stored },
    )
    await page.goto('/')
    await expect(page.locator('aside.fs-panel--left')).toHaveCSS('width', '288px')
    await expect(page.locator('aside.fs-panel--right')).toHaveCSS('width', '288px')
    await page.getByRole('separator', { name: leftName }).press('ArrowRight')
    await expect(page.locator('aside.fs-panel--left')).toHaveCSS('width', '298px')
  })
}

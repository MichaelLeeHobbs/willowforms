import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createDocument, flatten, loadDocument } from '../packages/core/src/index.js'

for (const kit of ['html', 'mui']) {
  test(`${kit} presets are editable, exportable, and usable on a phone`, async ({ page }) => {
    await page.addInitScript(
      ({ json, kitId }) => {
        localStorage.setItem('formsmith.playground.document', json)
        localStorage.setItem('formsmith.playground.kit', kitId)
      },
      { json: JSON.stringify(createDocument('Starting layouts', 'startingLayouts')), kitId: kit },
    )
    await page.goto('/')
    const palette = page.getByRole('tabpanel', { name: 'Components', exact: true })
    for (const label of ['Ruled section', 'Statistics row', 'Repeatable entry']) {
      await page.getByRole('tab', { name: 'Tree', exact: true }).click()
      await page.locator('[data-fs-tree-row="root"]').click()
      await page.getByRole('tab', { name: 'Components', exact: true }).click()
      await palette.getByRole('searchbox').fill(label)
      const preset = palette.getByRole('button', { name: label, exact: true })
      await preset.focus()
      await page.keyboard.press('Enter')
    }
    await palette.getByRole('searchbox').fill('')
    await page.getByRole('tab', { name: 'Tree', exact: true }).click()
    await page.locator('[data-fs-tree-row="heading"]').click()
    await page
      .getByRole('tabpanel', { name: 'Properties', exact: true })
      .getByRole('textbox', { name: /^Text/ })
      .fill('Vitals')
    await page.locator('[data-fs-tree-row="divider"]').click()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-fs-key="divider"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'JSON', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Form JSON', exact: true })
    const downloaded = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download', exact: true }).click()
    const download = await downloaded
    const bytes = await readFile(await download.path())
    const loaded = loadDocument(JSON.parse(bytes.toString()))
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('Exported presets did not load')
    expect(loaded.document.root.children).toHaveLength(3)
    expect(new Set(flatten(loaded.document.root).map(({ node }) => node.type))).toEqual(
      new Set(['Screen', 'Stack', 'Heading', 'TextField', 'Grid', 'NumberField', 'Repeater']),
    )
    await dialog.getByRole('textbox', { name: 'Form document JSON' }).fill('{}')
    await dialog.getByLabel('Import file').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/json',
      buffer: bytes,
    })
    await expect(dialog.getByRole('textbox', { name: 'Form document JSON' })).toHaveValue(
      bytes.toString(),
    )
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const form = page.locator('[data-fs-key="root"]')
    await expect(form.getByRole('heading', { name: 'Vitals', exact: true })).toBeVisible()
    await expect(form.getByRole('spinbutton', { name: /^Statistic/ })).toHaveCount(3)
    const first = await form
      .getByRole('spinbutton', { name: 'Statistic 1', exact: true })
      .boundingBox()
    const last = await form
      .getByRole('spinbutton', { name: 'Statistic 3', exact: true })
      .boundingBox()
    expect(first!.y).toBeCloseTo(last!.y, 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await form.getByRole('button', { name: 'Add Entry', exact: true }).click()
    await form.getByRole('button', { name: 'Add Entry', exact: true }).click()
    const items = form.getByRole('textbox', { name: 'Item', exact: true })
    await expect(items).toHaveCount(2)
    await items.nth(0).fill('Rope')
    await items.nth(1).fill('Torch')
    await expect(items.nth(0)).toHaveValue('Rope')
    const surface = page.locator('.fs-canvas__surface')
    expect(
      await surface.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await page.getByRole('button', { name: 'Diagnostics', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Data', exact: true })).toContainText('Rope')
    await expect(page.getByRole('group', { name: 'Data', exact: true })).toContainText('Torch')
  })
}

test('adding a preset from the phone drawer reveals the inserted layout and undoes it as a whole', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?example=contact-request')
  await page.getByRole('button', { name: 'Components and structure', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Components and structure', exact: true })
  const layouts = drawer.getByRole('button', { name: 'Starting layouts', exact: true })
  await expect(layouts).toHaveAttribute('aria-expanded', 'false')
  await expect(drawer.getByRole('button', { name: 'Statistics row', exact: true })).toBeHidden()
  await layouts.click()
  await expect(layouts).toHaveAttribute('aria-expanded', 'true')
  await drawer.getByRole('button', { name: 'Statistics row', exact: true }).click()
  await expect(drawer).toBeHidden()
  const statistics = page
    .locator('[data-fs-key="root"]')
    .getByRole('spinbutton', { name: /^Statistic/ })
  await expect(statistics).toHaveCount(3)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(statistics).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(statistics).toHaveCount(3)
})

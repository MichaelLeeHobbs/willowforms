import { expect, test } from '@playwright/test'
import axe from 'axe-core'

for (const kit of ['html', 'mui']) {
  test(`${kit}: center and format the D&D heading without opening CSS`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/?example=dnd-character-sheet')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    const heading = page.locator('[data-fs-key="heading"]')
    await heading.click()
    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    const panel = page.getByRole('tabpanel', { name: 'Style', exact: true })
    await expect(panel.getByLabel('CSS', { exact: true })).not.toBeVisible()
    await expect(heading).not.toHaveCSS('text-align', 'center')
    await panel.getByRole('button', { name: 'Center', exact: true }).click()
    await expect(heading).toHaveCSS('text-align', 'center')
    await panel.getByRole('button', { name: 'Italic', exact: true }).click()
    await expect(heading).toHaveCSS('font-style', 'italic')
    await panel.getByRole('button', { name: 'Underline', exact: true }).click()
    await expect(heading).toHaveCSS('text-decoration-line', 'underline')
    await panel.getByRole('button', { name: 'Bold', exact: true }).click()
    await expect(heading).toHaveCSS('font-weight', '400')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(heading).not.toHaveCSS('text-align', 'center')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(heading).toHaveCSS('text-align', 'center')
    await page.screenshot({ path: `tmp/friendly-style-${kit}.png` })
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(theme)
      await page.addScriptTag({ content: axe.source })
      expect(
        await page.evaluate(async () =>
          (
            await (window as typeof window & { axe: typeof axe }).axe.run(
              ['.fs-panel--right', '.fs-selection__toolbar'],
              { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } },
            )
          ).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
        ),
      ).toEqual([])
    }
  })
}

test('spacing and borders expand existing shorthand, preserve other CSS, and respect device overrides', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-fs-key="email"] input').click()
  await page.getByRole('tab', { name: 'Style', exact: true }).click()
  const panel = page.getByRole('tabpanel', { name: 'Style', exact: true })
  await panel.getByText('Advanced CSS', { exact: true }).click()
  const raw = panel.getByLabel('CSS', { exact: true })
  await raw.fill(
    'padding: 4px 8px !important; border: 1px solid red; text-decoration: line-through; --brandColor: blue; letter-spacing: 2px',
  )
  await raw.press('Tab')
  await panel.getByText('Advanced CSS', { exact: true }).click()
  await panel.getByText('Spacing', { exact: true }).click()
  await expect(panel.getByLabel('Inside top', { exact: true })).toHaveValue('4')
  await expect(panel.getByLabel('Inside right', { exact: true })).toHaveValue('8')
  await panel.getByLabel('Inside top', { exact: true }).fill('20')
  await panel.getByLabel('Inside top', { exact: true }).press('Enter')
  const field = page.locator('[data-fs-key="email"]')
  await expect(field).toHaveCSS('padding-top', '20px')
  await expect(field).toHaveCSS('padding-right', '8px')
  await panel.getByRole('button', { name: 'Underline', exact: true }).click()
  await expect(field).toHaveCSS('text-decoration-line', 'underline line-through')
  await panel.getByRole('button', { name: 'Underline', exact: true }).click()
  await expect(field).toHaveCSS('text-decoration-line', 'line-through')
  await panel.getByText('Background and border', { exact: true }).click()
  await expect(panel.getByLabel('Border thickness', { exact: true })).toHaveValue('1')
  await panel.getByLabel('Border thickness', { exact: true }).fill('3')
  await panel.getByLabel('Border thickness', { exact: true }).press('Enter')
  await expect(field).toHaveCSS('border-right-width', '3px')
  await expect(field).toHaveCSS('border-bottom-color', 'rgb(255, 0, 0)')
  await panel.getByLabel('Applies to').selectOption('mobile')
  await panel.getByText('Spacing', { exact: true }).click()
  await panel.getByLabel('Inside top', { exact: true }).fill('6')
  await panel.getByLabel('Inside top', { exact: true }).press('Enter')
  await expect(field).toHaveCSS('padding-top', '6px')
  await page.getByRole('button', { name: 'Desktop', exact: true }).click()
  await expect(field).toHaveCSS('padding-top', '20px')
  await panel.getByText('Advanced CSS', { exact: true }).click()
  await panel.getByLabel('Applies to').selectOption('any')
  await expect(raw).toHaveValue(/--brandColor: blue/)
  await expect(field).toHaveCSS('letter-spacing', '2px')
})

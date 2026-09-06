import { expect, test } from '@playwright/test'

for (const kit of ['html', 'mui']) {
  test(`${kit}: font controls style the D&D heading, preserve decorations, and follow device overrides`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/?example=dnd-character-sheet')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    const heading = page.locator('[data-fs-key="heading"]')
    const original = await heading.evaluate((element) => ({
      size: getComputedStyle(element).fontSize,
      family: getComputedStyle(element).fontFamily,
    }))
    await heading.click()
    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    const panel = page.getByRole('tabpanel', { name: 'Style', exact: true })
    await expect(panel.getByLabel('CSS', { exact: true })).not.toBeVisible()
    await panel.getByLabel('Font family', { exact: true }).selectOption({ label: 'Arial' })
    await expect(heading).toHaveCSS('font-family', 'Arial, sans-serif')
    const size = panel.getByLabel('Text size', { exact: true })
    await size.fill('36')
    await size.press('Enter')
    await expect(heading).toHaveCSS('font-size', '36px')
    await panel.getByRole('button', { name: 'Strikethrough', exact: true }).click()
    await panel.getByRole('button', { name: 'Underline', exact: true }).click()
    await expect(heading).toHaveCSS('text-decoration-line', 'underline line-through')
    await panel.getByRole('button', { name: 'Strikethrough', exact: true }).click()
    await expect(heading).toHaveCSS('text-decoration-line', 'underline')
    await expect(panel.getByRole('button', { name: 'Underline', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(heading).toHaveCSS('font-size', original.size)
    await expect(heading).toHaveCSS('font-family', original.family)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await panel.getByLabel('Applies to').selectOption('mobile')
    await size.fill('20')
    await size.press('Enter')
    await expect(heading).toHaveCSS('font-size', '20px')
    await page.getByRole('button', { name: 'Desktop', exact: true }).click()
    await expect(heading).toHaveCSS('font-size', '36px')
    await panel.getByLabel('Applies to').selectOption('any')
    await panel.getByText('Advanced CSS', { exact: true }).click()
    const raw = panel.getByLabel('CSS', { exact: true })
    await raw.fill('font-family: "HostFont", serif; letter-spacing: 1px')
    await raw.press('Tab')
    await expect(
      panel
        .getByLabel('Font family', { exact: true })
        .getByRole('option', { name: /Custom — HostFont/ }),
    ).toHaveCount(1)
    await size.fill('1.5')
    await size.press('Enter')
    await panel.getByLabel('Text size unit', { exact: true }).selectOption('rem')
    const rootSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize),
    )
    await expect(heading).toHaveCSS('font-size', `${rootSize * 1.5}px`)
    await expect(heading).toHaveCSS('font-family', 'HostFont, serif')
    await expect(heading).toHaveCSS('letter-spacing', '1px')
    await panel.getByLabel('Font family', { exact: true }).selectOption({ label: 'Default font' })
    await expect(raw).not.toHaveValue(/font-family/)
  })
}

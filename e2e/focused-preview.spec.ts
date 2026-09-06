import { expect, test } from '@playwright/test'

test('Preview preserves editing panels and keeps diagnostics optional', async ({ page }) => {
  await page.goto('/?example=dnd-character-sheet')
  await page.getByRole('button', { name: 'Hide Component properties' }).click()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Data', exact: true })).toBeHidden()
  const form = page.locator('[data-fs-key="root"]')
  await form.getByRole('textbox', { name: 'Character name', exact: true }).fill('Mira')
  const diagnostics = page.getByRole('button', { name: 'Diagnostics' })
  await diagnostics.click()
  await expect(diagnostics).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('group', { name: 'Data', exact: true })).toContainText('Mira')
  await diagnostics.click()
  await expect(page.getByRole('group', { name: 'Data', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Back to editing' }).click()
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeFocused()
  await expect(page.getByRole('complementary', { name: 'Components and structure' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Component properties' })).toBeHidden()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(form.getByRole('textbox', { name: 'Character name', exact: true })).toHaveValue(
    'Mira',
  )
})

test('phone authoring panels are keyboard-accessible drawers and leave Preview usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?example=contact-request')
  const open = page.getByRole('button', { name: 'Components and structure', exact: true })
  await open.click()
  const drawer = page.getByRole('dialog', { name: 'Components and structure', exact: true })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Close Components and structure' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  // Native dialogs allow the browser chrome in the cycle, but never the inert page.
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).not.toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(open).toBeFocused()
  const fields = page.locator('.fs-canvas [data-fs-key] input')
  const count = await fields.count()
  await open.click()
  await drawer.getByRole('button', { name: 'Text field', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(fields).toHaveCount(count + 1)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Authoring panels' })).toBeHidden()
  const surface = page.locator('.fs-canvas__surface')
  const box = await surface.boundingBox()
  expect(box!.width).toBeGreaterThan(350)
  expect(box!.height).toBeGreaterThan(400)
  expect(
    await surface.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1)
  await expect(page.getByRole('group', { name: 'Data', exact: true })).toBeHidden()
})

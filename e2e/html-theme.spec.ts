import { expect, test } from '@playwright/test'

test('Plain HTML follows explicit and system themes after switching kits', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?example=contact-request')
  await page.getByLabel('Designer theme').selectOption('light')
  await page.getByLabel('Kit', { exact: true }).selectOption('html')
  const screen = page.locator('[data-fs-key="root"]')
  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.getByLabel('Designer theme').selectOption('dark')
  await expect(screen).toHaveCSS('background-color', 'rgb(22, 24, 29)')
  await page.getByLabel('Designer theme').selectOption('system')
  await expect(screen).toHaveCSS('background-color', 'rgb(22, 24, 29)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
})

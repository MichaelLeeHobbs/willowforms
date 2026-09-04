import { expect, test } from '@playwright/test'

test('published package exports produce a working browser bundle', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Contact request' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Components' })).toBeVisible()
  await page.getByLabel('Kit').selectOption('html')
  await expect(page.getByRole('tab', { name: 'Components' })).toBeVisible()

  expect(errors).toEqual([])
})

import { expect, test } from '@playwright/test'
import { STORAGE_KEY } from './harness.js'

test('preserves an unreadable saved draft and explains that local saving is paused', async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{broken draft'), STORAGE_KEY)
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Local saving is paused to preserve it')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'Form name' }).fill('Recovery session')
  await expect(page.getByRole('heading', { name: 'Recovery session' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('{broken draft')
})

test('reports failed local writes while keeping the form editable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Local saving is unavailable')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'Form name' }).fill('Unsaved changes')
  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Form document JSON' })).toHaveValue(
    /Unsaved changes/,
  )
})

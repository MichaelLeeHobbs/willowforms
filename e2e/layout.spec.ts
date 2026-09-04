import { expect, test } from './harness.js'

test.use({ colorScheme: 'dark' })

test('light designer chrome keeps MUI fields visible while editing and previewing', async ({
  designer,
}) => {
  await designer.page.getByLabel('Designer theme').selectOption('light')

  const screen = designer.node('root')
  const input = designer.node('email').locator('input')

  await expect(screen).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(input).toBeVisible()

  await designer.page.getByRole('button', { name: 'Preview' }).click()

  await expect(screen).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(input).toBeVisible()
})

test('pane handles remove the panes from layout and restore them', async ({ designer }) => {
  const left = designer.page.locator('#fs-pane-left')
  const right = designer.page.locator('#fs-pane-right')

  await designer.page.getByRole('button', { name: 'Hide Components and structure' }).click()
  await designer.page.getByRole('button', { name: 'Hide Component properties' }).click()

  await expect(left).toHaveCSS('display', 'none')
  await expect(right).toHaveCSS('display', 'none')

  await designer.page.getByRole('button', { name: 'Show Components and structure' }).click()
  await designer.page.getByRole('button', { name: 'Show Component properties' }).click()

  await expect(left).toHaveCSS('display', 'flex')
  await expect(right).toHaveCSS('display', 'flex')
})

test('setting a boolean property leaves its checkbox visible beside the reset action', async ({
  designer,
}) => {
  await designer.select('email')

  const checkbox = designer.page.getByRole('checkbox', { name: 'Multiline' })
  await checkbox.check()

  await expect(checkbox).toBeChecked()
  await expect(checkbox).toBeVisible()
  await expect(designer.page.getByRole('button', { name: 'Reset Multiline' })).toBeVisible()
})

import { expect, test } from './harness.js'

test.use({ colorScheme: 'dark' })

test('the full-screen demo keeps scrolling inside the designer', async ({ designer }) => {
  for (const size of [
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
  ]) {
    await designer.page.setViewportSize(size)

    const documentSize = await designer.page.locator('html').evaluate((element) => ({
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    }))

    expect(documentSize.scrollWidth, 'the page has a horizontal scrollbar').toBe(
      documentSize.clientWidth,
    )
    expect(documentSize.scrollHeight, 'the page has a vertical scrollbar').toBe(
      documentSize.clientHeight,
    )
  }
})

test('keeps the desktop shell within a laptop viewport with a long form name', async ({
  designer,
}) => {
  await designer.page.setViewportSize({ width: 1024, height: 768 })
  await designer.openTab('Settings')
  await designer.page
    .getByRole('textbox', { name: 'Form name' })
    .fill('A very long beta form title '.repeat(8))
  const dimensions = await designer.page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    canvas: document.querySelector('.fs-canvas__surface')?.getBoundingClientRect().width ?? 0,
  }))
  expect(dimensions.scrollWidth).toBe(dimensions.width)
  expect(dimensions.scrollHeight).toBe(dimensions.height)
  expect(dimensions.canvas).toBeGreaterThan(350)
  await expect(designer.page.getByRole('button', { name: 'Mobile', exact: true })).toBeInViewport()
})

test('light mode applies to the MUI form while editing and previewing', async ({ designer }) => {
  await designer.page.getByLabel('Designer theme').selectOption('light')

  const screen = designer.node('root')
  const input = designer.node('email').locator('input')

  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(input).toBeVisible()

  await designer.page.getByRole('button', { name: 'Preview' }).click()

  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(input).toBeVisible()
})

test('pane handles remove the panes from layout and restore them', async ({ designer }) => {
  const left = designer.page.locator('.fs-panel--left')
  const right = designer.page.locator('.fs-panel--right')

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

test('resetting Screen max width shows the effective kit default', async ({ designer }) => {
  await designer.select('root')
  await designer.openTab('Style')

  const stylePanel = designer.page.getByRole('tabpanel', { name: 'Style' })
  const maxWidth = stylePanel.getByRole('spinbutton', { name: /^Max width/ })
  const reset = stylePanel.getByRole('button', { name: 'Reset Max width' })

  await expect(maxWidth).toHaveValue('560')
  await reset.click()

  await expect(maxWidth).toHaveValue('640')
  await expect(reset).toHaveCount(0)
})

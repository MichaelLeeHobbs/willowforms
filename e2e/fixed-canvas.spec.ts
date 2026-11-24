import { dragOnto, expect, test } from './harness.js'

test('paper presets, orientation, and custom dimensions size a guide without changing the document', async ({
  designer,
}) => {
  const { page } = designer
  const original = await designer.rootChildren()
  const frame = page.locator('.fs-canvas__frame')
  const guide = page.locator('.fs-canvas__page-guide')
  await page.getByRole('button', { name: 'Fixed size', exact: true }).click()
  const controls = page.getByRole('group', { name: 'Fixed canvas size' })
  for (const [preset, width, height] of [
    ['letter', 816, 1056],
    ['legal', 816, 1344],
    ['a4', 794, 1123],
    ['a3', 1123, 1587],
  ] as const) {
    await controls.getByLabel('Size', { exact: true }).selectOption(preset)
    const box = (await guide.boundingBox())!
    expect(Math.round(box.width)).toBe(width)
    expect(Math.round(box.height)).toBe(height)
  }
  await controls.getByLabel('Orientation').selectOption('landscape')
  expect(Math.round((await guide.boundingBox())!.width)).toBe(1587)
  expect(Math.round((await guide.boundingBox())!.height)).toBe(1123)
  await controls.getByLabel('Size', { exact: true }).selectOption('custom')
  await controls.getByLabel('Width (px)').fill('700')
  await controls.getByLabel('Height (px)').fill('500')
  await controls.getByLabel('Height (px)').press('Enter')
  expect(Math.round((await guide.boundingBox())!.width)).toBe(700)
  expect(Math.round((await guide.boundingBox())!.height)).toBe(500)
  expect(await designer.rootChildren()).toEqual(original)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await controls.getByLabel('Width (px)').fill('-1')
  await controls.getByLabel('Width (px)').press('Tab')
  await expect(controls.getByLabel('Width (px)')).toHaveValue('700')
  await page.getByRole('button', { name: 'Desktop', exact: true }).click()
  await expect(guide).toHaveCount(0)
  expect(await frame.evaluate((element) => element.style.width)).toBe('')
  await page.getByRole('button', { name: 'Fixed size', exact: true }).click()
  expect(Math.round((await guide.boundingBox())!.width)).toBe(700)
})

test('selection and dragging remain aligned on a paper canvas', async ({ designer }) => {
  await designer.page.getByRole('button', { name: 'Fixed size', exact: true }).click()
  await designer.node('email').click()
  await designer.openTab('Style')
  await expect(designer.page.getByLabel('Applies to')).toHaveValue('tablet')
  const field = (await designer.node('email').boundingBox())!
  const selection = (await designer.page.locator('.fs-selection--active').boundingBox())!
  expect(Math.abs(field.x - selection.x)).toBeLessThan(4)
  expect(Math.abs(field.y - selection.y)).toBeLessThan(4)
  await dragOnto(designer.page, designer.node('submit'), designer.node('email'), 'top')
  await expect
    .poll(async () => {
      const children = await designer.rootChildren()
      return children[children.indexOf('submit') + 1]
    })
    .toBe('email')
  await designer.page.getByLabel('Applies to').selectOption('desktop')
  await expect(designer.page.getByRole('button', { name: 'Desktop', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(designer.page.locator('.fs-canvas__page-guide')).toHaveCount(0)
})

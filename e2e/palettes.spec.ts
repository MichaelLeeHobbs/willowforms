import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { contrast, luminance, parseHex } from '../test/contrast.js'

for (const kit of ['html', 'mui']) {
  test(`${kit}: chrome palettes preserve form styling and answers in explicit and system modes`, async ({
    page,
  }) => {
    await page.goto('/?example=contact-request')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const form = page.locator('[data-fs-key="root"]')
    await form.getByRole('textbox', { name: 'First name', exact: true }).fill('Willow tester')
    const palette = page.getByLabel('Palette', { exact: true })
    const mode = page.getByLabel('Designer theme')
    const shell = page.getByTestId('willowforms-designer')

    for (const dark of [false, true]) {
      await page.emulateMedia({ colorScheme: dark ? 'light' : 'dark' })
      await mode.selectOption(dark ? 'dark' : 'light')
      await palette.selectOption('willow')
      const original = await shell.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--fs-bg-panel').trim(),
      )
      const formStyle = (): Promise<string[]> =>
        form.evaluate((element) => {
          const style = getComputedStyle(element)
          return [style.backgroundColor, style.color, style.fontFamily]
        })
      const before = await formStyle()

      for (const id of ['shade', 'desert']) {
        await palette.selectOption(id)
        const tokens = await shell.evaluate((element) => {
          const css = getComputedStyle(element)
          return Object.fromEntries(
            [
              'bg-app',
              'bg-panel',
              'bg-well',
              'text',
              'text-muted',
              'primary',
              'primary-text',
              'control-border',
              'scrollbar-thumb',
              'accent',
              'danger',
            ].map((name) => [name, css.getPropertyValue('--fs-' + name).trim()]),
          )
        })
        const token = (name: string): string => {
          const value = tokens[name]
          expect(value, name).toMatch(/^#[a-f0-9]{6}$/i)
          return value ?? ''
        }
        expect(token('bg-panel')).toBe(
          id === 'shade' ? (dark ? '#202e27' : '#e0e5db') : dark ? '#362b33' : '#e9ddd2',
        )
        if (!dark && id === 'shade') {
          expect(luminance(parseHex(token('bg-panel')))).toBeLessThan(
            luminance(parseHex(original)) * 0.85,
          )
        }
        for (const bg of ['bg-app', 'bg-panel', 'bg-well']) {
          for (const fg of ['text', 'text-muted', 'danger']) {
            expect(contrast(token(fg), token(bg)), `${id}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(
              4.5,
            )
          }
          for (const fg of ['control-border', 'scrollbar-thumb', 'primary', 'accent']) {
            expect(contrast(token(fg), token(bg)), `${id}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(
              3,
            )
          }
        }
        expect(contrast(token('primary-text'), token('primary'))).toBeGreaterThanOrEqual(4.5)
        expect(await formStyle()).toEqual(before)
        await expect(form.getByRole('textbox', { name: 'First name', exact: true })).toHaveValue(
          'Willow tester',
        )

        await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
        await mode.selectOption('system')
        for (const [name, value] of Object.entries(tokens)) {
          await expect(shell).toHaveCSS('--fs-' + name, value)
        }
        await mode.selectOption(dark ? 'dark' : 'light')
      }
    }
    await page.reload()
    await expect(palette).toHaveValue('desert')
  })
}

test('invalid stored palettes fall back and blocked storage still allows switching', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('willowforms.playground.palette', 'missing-palette')
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable')
    }
  })
  await page.goto('/')
  const palette = page.getByLabel('Palette', { exact: true })
  await expect(palette).toHaveValue('willow')
  await page.getByLabel('Designer theme').selectOption('light')
  await palette.selectOption('shade')
  await expect(page.getByTestId('willowforms-designer')).toHaveCSS('--fs-bg-panel', '#e0e5db')
  await expect(palette).toHaveValue('shade')
})

test('new palettes keep header controls and the gallery accessible on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await page.addScriptTag({ content: axe.source })
  for (const id of ['shade', 'desert']) {
    await page.getByLabel('Palette', { exact: true }).selectOption(id)
    for (const mode of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(mode)
      const bounds = await page.getByLabel('Palette', { exact: true }).boundingBox()
      expect(bounds).not.toBeNull()
      expect((bounds?.x ?? -1) + (bounds?.width ?? 1000)).toBeLessThanOrEqual(320)
      const headerViolations = await page.evaluate(async () =>
        (
          await axe.run('.pg-kit-switch', {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations.map(({ id }) => id),
      )
      expect(headerViolations).toEqual([])
      await page.getByRole('button', { name: /^Examples/ }).click()
      const galleryViolations = await page.evaluate(async () =>
        (
          await axe.run('.pg-gallery', {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations.map(({ id }) => id),
      )
      expect(galleryViolations).toEqual([])
      await page.getByRole('button', { name: 'Close examples' }).click()
    }
  }
})

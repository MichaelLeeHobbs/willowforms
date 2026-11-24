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

      for (const id of ['willow', 'desert']) {
        await palette.selectOption(id)
        const tokens = await shell.evaluate((element) => {
          const css = getComputedStyle(element)
          return Object.fromEntries(
            [
              'bg-app',
              'bg-panel',
              'bg-well',
              'bg-field',
              'bg-hover',
              'bg-selected',
              'text-selected',
              'primary-hover',
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
        expect(token('bg-panel')).toBe(dark ? '#202e27' : '#eceeed')
        expect(token('bg-panel')).toBe(original)
        if (!dark) {
          expect(luminance(parseHex(token('bg-panel')))).toBeLessThan(
            luminance(parseHex('#fbfcf8')) * 0.9,
          )
        }
        for (const bg of ['bg-app', 'bg-panel', 'bg-well', 'bg-field']) {
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
        expect(contrast(token('primary-text'), token('primary-hover'))).toBeGreaterThanOrEqual(4.5)
        expect(contrast(token('text-selected'), token('bg-selected'))).toBeGreaterThanOrEqual(4.5)
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
    localStorage.setItem('willowforms.playground.palette', 'shade')
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable')
    }
  })
  await page.goto('/')
  const palette = page.getByLabel('Palette', { exact: true })
  await expect(palette).toHaveValue('willow')
  await page.getByLabel('Designer theme').selectOption('light')
  await palette.selectOption('desert')
  await expect(page.getByTestId('willowforms-designer')).toHaveCSS('--fs-primary', '#873c62')
  await expect(palette).toHaveValue('desert')
})

test('new palettes keep header controls and the gallery accessible on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await page.addScriptTag({ content: axe.source })
  for (const id of ['willow', 'desert']) {
    await page.getByLabel('Palette', { exact: true }).selectOption(id)
    for (const mode of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(mode)
      const bounds = await page.getByLabel('Palette', { exact: true }).boundingBox()
      expect(bounds).not.toBeNull()
      expect((bounds?.x ?? -1) + (bounds?.width ?? 1000)).toBeLessThanOrEqual(320)
      const headerViolations = await page.evaluate(async () =>
        (
          await axe.run('.pg-kit-switch', {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
          })
        ).violations.map(({ id }) => id),
      )
      expect(headerViolations).toEqual([])
      await page.getByRole('button', { name: /^Examples/ }).click()
      const galleryViolations = await page.evaluate(async () =>
        (
          await axe.run('.pg-gallery', {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
          })
        ).violations.map(({ id }) => id),
      )
      expect(galleryViolations).toEqual([])
      await page.getByRole('button', { name: 'Close examples' }).click()
    }
  }
})

test('editing chrome distinguishes fields, selection, hover, and focus in both palettes', async ({
  page,
}) => {
  await page.goto('/?example=contact-request')
  await page.locator('[data-fs-key="firstName"]').click()
  await page.getByRole('tab', { name: 'Tree', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: 'Component properties' })
  const field = inspector.getByRole('textbox', { name: 'Key', exact: true })
  const row = page.locator('.fs-tree__row.is-selected')
  const preview = page.getByRole('button', { name: 'Preview', exact: true })
  await page.addScriptTag({ content: axe.source })
  for (const palette of ['willow', 'desert']) {
    await page.getByLabel('Palette', { exact: true }).selectOption(palette)
    for (const mode of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(mode)
      await expect(field).toHaveCSS(
        'background-color',
        mode === 'light' ? 'rgb(245, 246, 245)' : 'rgb(24, 35, 31)',
      )
      await field.hover()
      const selected = await row.evaluate((element) => getComputedStyle(element).backgroundColor)
      const normal = await preview.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(selected).not.toBe(normal)
      await preview.hover()
      await expect(preview).not.toHaveCSS('background-color', normal)
      await field.focus()
      await expect(field).toHaveCSS('outline-style', 'solid')
      await expect(field).toHaveCSS('outline-width', '2px')
      const violations = await page.evaluate(async () =>
        (
          await axe.run('.fs-panel', {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
          })
        ).violations.map(({ id }) => id),
      )
      expect(violations).toEqual([])
    }
  }
})

test('the dark palette deepens the chrome shadows and the dialog backdrop', async ({ page }) => {
  await page.goto('/?example=contact-request')
  await page.getByRole('button', { name: 'Tablet', exact: true }).click()
  await page.locator('[data-fs-key="firstName"]').click()
  const frame = page.locator('.fs-canvas__frame')
  const toolbar = page.locator('.fs-selection__toolbar')
  const dialog = page.locator('dialog.fs-dialog[aria-label="Form JSON"]')

  for (const [mode, frameAlpha, toolbarAlpha, backdrop] of [
    ['light', '0.12', '0.22', 'rgba(0, 0, 0, 0.5)'],
    ['dark', '0.45', '0.55', 'rgba(0, 0, 0, 0.65)'],
  ] as const) {
    await page.getByLabel('Designer theme').selectOption(mode)
    await expect(frame).toHaveCSS('box-shadow', new RegExp(`^rgba\\(0, 0, 0, ${frameAlpha}\\)`))
    await expect(toolbar).toHaveCSS('box-shadow', new RegExp(`^rgba\\(0, 0, 0, ${toolbarAlpha}\\)`))

    // A browser check: `::backdrop` gets the token by inheriting it from the dialog.
    await page.getByRole('button', { name: 'JSON', exact: true }).click()
    await expect(dialog).toBeVisible()
    await expect
      .poll(() =>
        dialog.evaluate((element) => getComputedStyle(element, '::backdrop').backgroundColor),
      )
      .toBe(backdrop)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
})

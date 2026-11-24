import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { EXAMPLES } from '../apps/playground/src/examples/index.js'

test('browses examples without losing the original draft or edited examples', async ({ page }) => {
  await page.goto('/')
  const reset = page.getByRole('button', { name: 'Reset example', exact: true })
  await expect(reset).toHaveCount(0)
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'Form name' }).fill('My original draft')
  await page.getByRole('button', { name: /^Examples/ }).click()
  const gallery = page.getByRole('dialog', { name: 'Find your starting point.' })
  await expect(gallery.getByRole('article')).toHaveCount(10)
  await gallery.getByRole('searchbox', { name: 'Search examples' }).fill('feedback')
  await expect(gallery.getByRole('article')).toHaveCount(1)
  await gallery.getByRole('button', { name: 'Open example: Customer feedback' }).click()
  await expect(gallery).not.toBeVisible()
  await expect(page).toHaveURL(/example=customer-feedback/)
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'Form name' }).fill('My feedback form')
  await page.getByRole('button', { name: /^Examples/ }).click()
  await gallery.getByRole('button', { name: 'Back to your draft' }).click()
  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('textbox', { name: 'Form name' })).toHaveValue('My original draft')
  await page.getByRole('button', { name: /^Examples/ }).click()
  await gallery.getByRole('button', { name: 'Open example: Customer feedback' }).click()
  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('textbox', { name: 'Form name' })).toHaveValue('My feedback form')
  await page.getByLabel('Kit', { exact: true }).selectOption('html')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('textbox', { name: 'Form name' })).toHaveValue('My feedback form')
  await expect(reset).toBeInViewport()
  await reset.click()
  const confirmation = page.getByRole('dialog', { name: 'Reset this example?' })
  await expect(gallery).not.toBeVisible()
  await expect(confirmation.getByRole('button', { name: 'Cancel reset' })).toBeFocused()
  await confirmation.getByRole('button', { name: 'Cancel reset' }).click()
  await expect(reset).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Form name' })).toHaveValue('My feedback form')
  await reset.click()
  await page.keyboard.press('Escape')
  await expect(confirmation).not.toBeVisible()
  await expect(reset).toBeFocused()
  await reset.click()
  await confirmation.getByRole('button', { name: 'Reset design' }).click()
  await expect(reset).toBeFocused()
  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('textbox', { name: 'Form name' })).toHaveValue('Tell us how we did')
})

test('keeps edits in memory when storage is unavailable and examples are switched', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    }
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'Form name' }).fill('Keep my unsaved work')
  await page.getByRole('button', { name: /^Examples/ }).click()
  await page.getByRole('button', { name: 'Open example: Customer feedback' }).click()
  await page.getByRole('button', { name: /^Examples/ }).click()
  await page.getByRole('button', { name: 'Back to your draft' }).click()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('textbox', { name: 'Form name' })).toHaveValue('Keep my unsaved work')
  await expect(page.getByRole('alert')).toContainText('Local saving is unavailable')
})

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} gallery and header reset pass the browser accessibility audit`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByLabel('Designer theme').selectOption(theme)
    await page.getByRole('button', { name: /^Examples/ }).click()
    await page.addScriptTag({ content: axe.source })
    const violations = await page.evaluate(async () => {
      const result = await (window as typeof window & { axe: typeof axe }).axe.run('.pg-gallery', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      })
      return result.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      }))
    })
    expect(violations).toEqual([])
    await page
      .getByRole('dialog', { name: 'Find your starting point.' })
      .getByRole('button', { name: 'Open example: Contact request' })
      .click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const reset = page.getByRole('button', { name: 'Reset example', exact: true })
    await expect(reset).toBeInViewport()
    await reset.click()
    const confirmation = page.getByRole('dialog', { name: 'Reset this example?' })
    await expect(confirmation.getByRole('button', { name: 'Reset design' })).toBeInViewport()
    expect(
      await confirmation.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBe(0)
    const resetViolations = await confirmation.evaluate(async (element) =>
      (
        await (window as typeof window & { axe: typeof axe }).axe.run(element, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
        })
      ).violations.map(({ id }) => id),
    )
    expect(resetViolations).toEqual([])
  })
}

test('previews every example through both kits', async ({ page }) => {
  for (const example of EXAMPLES) {
    await page.goto('/?example=' + example.id)
    for (const kit of ['html', 'mui']) {
      await page.getByLabel('Kit', { exact: true }).selectOption(kit)
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      const form = page.locator('[data-fs-key="root"]')
      await expect(
        form.getByRole('heading', { name: example.document.name, exact: true }),
      ).toBeVisible()
      await expect(form.getByRole('alert')).toHaveCount(0)
    }
  }
})

test('shows French labels and validation messages in the workshop', async ({ page }) => {
  await page.goto('/?example=workshop-enrollment')
  await page.getByLabel('Canvas language').selectOption('fr-CA')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const form = page.locator('[data-fs-key="root"]')
  await expect(form.getByRole('heading', { name: 'Atelier créatif', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Validate', exact: true }).click()
  await expect(
    form.getByRole('textbox', { name: 'Courriel', exact: true }),
  ).toHaveAccessibleDescription('Veuillez remplir ce champ.')
  await form.getByRole('textbox', { name: 'Courriel', exact: true }).fill('reader@example.com')
  await expect(form.getByRole('textbox', { name: 'Courriel', exact: true })).not.toHaveAttribute(
    'aria-invalid',
    'true',
  )
})

test('filters, closes with Escape, and fits the example gallery on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const open = page.getByRole('button', { name: /^Examples/ })
  await open.click()
  const gallery = page.getByRole('dialog', { name: 'Find your starting point.' })
  await gallery.getByRole('combobox', { name: 'Category' }).selectOption('Adventure')
  await expect(gallery.getByRole('article')).toHaveCount(1)
  const bounds = await gallery.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  expect(await gallery.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await gallery.getByRole('searchbox').fill('nothing matches this')
  await expect(gallery.getByRole('heading', { name: 'No examples found' })).toBeVisible()
  await gallery.getByRole('button', { name: 'Clear filters' }).click()
  await expect(gallery.getByRole('article')).toHaveCount(10)
  await page.keyboard.press('Escape')
  await expect(gallery).not.toBeVisible()
  await expect(open).toBeFocused()
})

for (const kit of ['mui', 'html']) {
  test(`${kit} previews the D&D character sheet and retains answers between its pages`, async ({
    page,
  }) => {
    await page.goto('/?example=dnd-character-sheet')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const form = page.locator('[data-fs-key="root"]')
    await form.getByRole('textbox', { name: 'Character name', exact: true }).fill('Mira Ashvale')
    await form.getByRole('spinbutton', { name: 'STR score', exact: true }).fill('16')
    await form.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(form.getByRole('heading', { name: '2 · Classes and features' })).toBeVisible()
    await form.getByRole('button', { name: 'Add Class', exact: true }).click()
    await form.getByRole('textbox', { name: 'Subclass', exact: true }).fill('Champion')
    await form.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(form.getByRole('textbox', { name: 'Character name', exact: true })).toHaveValue(
      'Mira Ashvale',
    )
    await expect(form.getByRole('spinbutton', { name: 'STR score', exact: true })).toHaveValue('16')
    await form.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(form.getByRole('textbox', { name: 'Subclass', exact: true })).toHaveValue(
      'Champion',
    )
    for (const title of ['3 · Equipment and treasure', '4 · Spellcasting']) {
      await form.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(form.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
    await expect(form.getByRole('button', { name: 'Add Spell', exact: true })).toHaveCount(0)
    await form.getByRole('checkbox', { name: 'This character uses spells' }).check()
    await form.getByRole('spinbutton', { name: 'L9 available', exact: true }).fill('1')
    await form.getByRole('button', { name: 'Add Spell', exact: true }).click()
    await form.getByRole('textbox', { name: 'Spell name', exact: true }).fill('Guiding spark')
    await form.getByRole('spinbutton', { name: 'Spell level (0 = cantrip)', exact: true }).fill('0')
    for (const title of ['5 · Personality and backstory', '6 · Adventures and notes']) {
      await form.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(form.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
    await form.getByRole('button', { name: 'Back', exact: true }).click()
    await form.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(form.getByRole('textbox', { name: 'Spell name', exact: true })).toHaveValue(
      'Guiding spark',
    )
    await expect(
      form.getByRole('spinbutton', { name: 'Spell level (0 = cantrip)', exact: true }),
    ).toHaveValue('0')
    await expect(form.getByRole('spinbutton', { name: 'L9 available', exact: true })).toHaveValue(
      '1',
    )
  })
}

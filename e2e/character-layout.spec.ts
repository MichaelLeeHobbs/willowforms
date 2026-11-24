import { expect, test } from '@playwright/test'
import axe from 'axe-core'

for (const kit of ['mui', 'html']) {
  test(`${kit} character folio uses desktop columns and keeps every page within the desktop canvas`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/?example=dnd-character-sheet')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Hide Components and structure' }).click()
    await page.getByRole('button', { name: 'Hide Component properties' }).click()
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const form = page.locator('[data-fs-key="root"]')
    const step = page.getByRole('combobox', { name: 'Step', exact: true })
    await expect(form.getByText('Step 1', { exact: true })).toBeVisible()
    await expect(form.getByRole('button', { name: 'Back', exact: true })).toBeDisabled()
    const [abilities, skills, combat] = await Promise.all(
      ['abilities', 'skills', 'combatColumn'].map((key) =>
        form.locator(`[data-fs-key="${key}"]`).boundingBox(),
      ),
    )
    expect(Math.abs(abilities!.y - skills!.y)).toBeLessThan(2)
    expect(Math.abs(skills!.y - combat!.y)).toBeLessThan(2)
    expect(abilities!.width).toBeLessThan(skills!.width * 0.6)
    expect(skills!.x).toBeGreaterThan(abilities!.x + abilities!.width)
    expect(combat!.x).toBeGreaterThan(skills!.x + skills!.width)
    const scores = await Promise.all(
      ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((name) =>
        form.getByRole('spinbutton', { name: name + ' score', exact: true }).boundingBox(),
      ),
    )
    expect(scores.every((box) => box !== null)).toBe(true)
    expect(
      Math.max(...scores.map((box) => box!.x)) - Math.min(...scores.map((box) => box!.x)),
    ).toBeLessThan(2)
    expect(scores[5]!.y - scores[0]!.y).toBeGreaterThan(500)
    expect(scores[0]!.width).toBeLessThan(110)
    const clippedLabels = await form
      .locator('[data-fs-key="abilityCards"] label')
      .evaluateAll((labels) =>
        labels
          .filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent),
      )
    expect(clippedLabels).toEqual([])
    const skillRows = form.locator('[data-fs-key="skillRows"] > [data-fs-key]')
    await expect(skillRows).toHaveCount(18)
    for (const row of await skillRows.all()) {
      const box = (await row.boundingBox())!
      expect(box.height).toBeLessThan(70)
      expect(box.width).toBeLessThan(510)
    }
    expect(
      (await form
        .getByRole('spinbutton', { name: 'Current hit points', exact: true })
        .boundingBox())!.width,
    ).toBeCloseTo(110, 0)
    await form.getByRole('button', { name: 'Add Attack', exact: true }).click()
    const attacks = (await form.locator('[data-fs-key="attacksSection"]').boundingBox())!
    expect(attacks.width).toBeGreaterThan(1200)
    const currentCombat = (await form.locator('[data-fs-key="combatColumn"]').boundingBox())!
    expect(attacks.y).toBeGreaterThan(currentCombat.y + currentCombat.height)
    await form.getByRole('textbox', { name: 'Weapon / attack name', exact: true }).fill('Longsword')
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(theme)
      await page.addScriptTag({ content: axe.source })
      const violations = await form.evaluate(async (element) => {
        const result = await (window as typeof window & { axe: typeof axe }).axe.run(element, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
        })
        return result.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map(({ target }) => target),
        }))
      })
      expect(violations).toEqual([])
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    const pages = await step.locator('option').allTextContents()
    for (const title of pages) {
      await step.selectOption({ label: title })
      await expect(
        form.getByText(`Step ${String(pages.indexOf(title) + 1)}`, { exact: true }),
      ).toBeVisible()
      if (title === '4 · Spellcasting') {
        await form.getByRole('checkbox', { name: 'This character uses spells' }).check()
        const slots = await Promise.all(
          Array.from({ length: 9 }, (_, index) =>
            form.locator(`[data-fs-key="slotLevel${String(index + 1)}"]`).boundingBox(),
          ),
        )
        expect(
          Math.max(...slots.map((box) => box!.y)) - Math.min(...slots.map((box) => box!.y)),
        ).toBeLessThan(2)
        expect(slots[8]!.x - slots[0]!.x).toBeGreaterThan(1000)
      }
      for (const add of await form.getByRole('button', { name: /^Add / }).all()) await add.click()
      expect(
        await form.evaluate((element) => element.scrollWidth - element.clientWidth),
        title,
      ).toBeLessThanOrEqual(1)
      expect(
        await page
          .locator('.fs-canvas__surface')
          .evaluate((element) => element.scrollWidth - element.clientWidth),
        title,
      ).toBeLessThanOrEqual(1)
    }
  })
}

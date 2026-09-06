import { expect, test } from '@playwright/test'
import axe from 'axe-core'

for (const kit of ['mui', 'html']) {
  test(`${kit} character sheet fills the page and reflows without horizontal scrolling`, async ({
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
    await step.selectOption({ label: '2 · Abilities, saves, and skills' })
    const scores = await Promise.all(
      ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((name) =>
        form.getByRole('spinbutton', { name: name + ' score', exact: true }).boundingBox(),
      ),
    )
    expect(scores.every((box) => box !== null)).toBe(true)
    expect(
      Math.max(...scores.map((box) => box!.y)) - Math.min(...scores.map((box) => box!.y)),
    ).toBeLessThan(2)
    expect(scores[5]!.x - scores[0]!.x).toBeGreaterThan(800)
    const skills = form.locator('[data-fs-key="skillRows"]')
    expect((await skills.boundingBox())!.width).toBeGreaterThan(1000)
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Designer theme').selectOption(theme)
      await page.addScriptTag({ content: axe.source })
      const violations = await form.evaluate(async (element) => {
        const result = await (window as typeof window & { axe: typeof axe }).axe.run(element, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
        return result.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map(({ target }) => target),
        }))
      })
      expect(violations).toEqual([])
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const pages = await step.locator('option').allTextContents()
    for (const title of pages) {
      await step.selectOption({ label: title })
      if (title === '6 · Spellcasting')
        await form.getByRole('checkbox', { name: 'This character uses spells' }).check()
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

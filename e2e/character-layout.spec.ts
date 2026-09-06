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
    await form.getByRole('button', { name: 'Add Class', exact: true }).click()
    const identity = (await form.locator('[data-fs-key="identityCard"]').boundingBox())!
    const classes = (await form.locator('[data-fs-key="classesSection"]').boundingBox())!
    expect(Math.abs(identity.y - classes.y)).toBeLessThan(2)
    expect(classes.x).toBeGreaterThan(identity.x + identity.width)
    expect((await form.locator('[data-fs-key="classesRow"]').boundingBox())!.width).toBeGreaterThan(
      classes.width - 30,
    )
    expect(
      (await form.getByRole('button', { name: 'Next', exact: true }).boundingBox())!.x,
    ).toBeGreaterThan(1200)
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
    const skillColumns = await Promise.all(
      ['Acrobatics', 'AnimalHandling', 'Arcana'].map((key) =>
        skills.locator(`[data-fs-key="${key}Skill"]`).boundingBox(),
      ),
    )
    expect(
      Math.max(...skillColumns.map((box) => box!.y)) -
        Math.min(...skillColumns.map((box) => box!.y)),
    ).toBeLessThan(2)
    expect(skillColumns[2]!.x - skillColumns[0]!.x).toBeGreaterThan(700)
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
    await page.setViewportSize({ width: 1280, height: 900 })
    const pages = await step.locator('option').allTextContents()
    for (const title of pages) {
      await step.selectOption({ label: title })
      if (title === '6 · Spellcasting') {
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

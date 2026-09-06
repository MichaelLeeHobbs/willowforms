import { expect, test } from '@playwright/test'

for (const kit of ['mui', 'html']) {
  test(`${kit} starts each preview page at the top and restores keyboard navigation`, async ({
    page,
  }) => {
    await page.goto('/?example=dnd-character-sheet')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const surface = page.locator('.fs-canvas__surface')
    const form = surface.locator('[data-fs-key="root"]')
    const step = page.getByRole('combobox', { name: 'Step', exact: true })
    const next = form.getByRole('button', { name: 'Next', exact: true })
    await next.scrollIntoViewIfNeeded()
    expect(await surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
    await next.click()
    await expect(form.getByRole('heading', { name: '2 · Classes and features' })).toBeInViewport()
    await expect(step).toBeFocused()
    await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBe(0)
    const experience = form.getByRole('spinbutton', { name: 'Experience points', exact: true })
    await experience.fill('300')
    await expect(experience).toBeFocused()
    await expect(experience).toHaveValue('300')
    const back = form.getByRole('button', { name: 'Back', exact: true })
    await back.scrollIntoViewIfNeeded()
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(form.getByRole('heading', { name: '1 · Character and combat' })).toBeInViewport()
    await expect(step).toBeFocused()
    await form.getByRole('button', { name: 'Add Attack', exact: true }).click()
    await next.scrollIntoViewIfNeeded()
    expect(await surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
    await step.selectOption({ label: '3 · Equipment and treasure' })
    await expect(form.getByRole('heading', { name: '3 · Equipment and treasure' })).toBeInViewport()
    await expect(step).toBeFocused()
  })
}

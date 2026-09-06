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
    await expect(
      form.getByRole('heading', { name: '2 · Abilities, saves, and skills' }),
    ).toBeInViewport()
    await expect(step).toBeFocused()
    await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBe(0)
    const strength = form.getByRole('spinbutton', { name: 'STR score', exact: true })
    await strength.fill('16')
    await expect(strength).toBeFocused()
    await expect(strength).toHaveValue('16')
    const back = form.getByRole('button', { name: 'Back', exact: true })
    await back.scrollIntoViewIfNeeded()
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(form.getByRole('heading', { name: '1 · Identity and origins' })).toBeInViewport()
    await expect(step).toBeFocused()
    await form.getByRole('button', { name: 'Add Class', exact: true }).click()
    await next.scrollIntoViewIfNeeded()
    expect(await surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
    await step.selectOption({ label: '3 · Combat and conditions' })
    await expect(form.getByRole('heading', { name: '3 · Combat and conditions' })).toBeInViewport()
    await expect(step).toBeFocused()
  })
}

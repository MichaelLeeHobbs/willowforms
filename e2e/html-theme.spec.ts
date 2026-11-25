import { expect, test } from '@playwright/test'

test('Plain HTML follows explicit and system themes after switching kits', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/?example=contact-request')
  await page.getByLabel('Designer theme').selectOption('light')
  await page.getByLabel('Kit', { exact: true }).selectOption('html')
  const screen = page.locator('[data-fs-key="root"]')
  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.getByLabel('Designer theme').selectOption('dark')
  await expect(screen).toHaveCSS('background-color', 'rgb(22, 24, 29)')
  await page.getByLabel('Designer theme').selectOption('system')
  await expect(screen).toHaveCSS('background-color', 'rgb(22, 24, 29)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(screen).toHaveCSS('background-color', 'rgb(255, 255, 255)')
})

test("a host's token overrides hold in every theme, chosen or from the system", async ({
  page,
}) => {
  await page.goto('/?example=contact-request')
  await page.getByLabel('Kit', { exact: true }).selectOption('html')
  const shell = page.getByTestId('willowforms-designer')
  const screen = page.locator('[data-fs-key="root"]')
  const mode = page.getByLabel('Designer theme')

  await mode.selectOption('dark')
  await expect(shell).toHaveCSS('--fs-primary', '#9bc7a2')
  await expect(screen).toHaveCSS('--fsh-accent', '#5fb3e6')

  // What the theming spec tells a host to write, after the stylesheets have loaded.
  await page.addStyleTag({
    content: '.fs-shell { --fs-primary: #6d28d9 } .fsh-screen { --fsh-accent: #6d28d9 }',
  })
  for (const system of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: system })
    for (const choice of ['system', 'light', 'dark']) {
      await mode.selectOption(choice)
      // The playground sets the kit's attribute after the designer's.
      await expect(screen).toHaveAttribute('data-fsh-theme', choice)
      const dark = (choice === 'system' ? system : choice) === 'dark'
      // Tokens the host left alone, which say the palette really is the one named.
      await expect(shell).toHaveCSS('--fs-bg-panel', dark ? '#202e27' : '#eceeed')
      await expect(screen).toHaveCSS('--fsh-surface', dark ? '#16181d' : '#ffffff')
      const where = `${choice} on a ${system} system`
      await expect(shell, where).toHaveCSS('--fs-primary', '#6d28d9')
      await expect(screen, where).toHaveCSS('--fsh-accent', '#6d28d9')
    }
  }

  // And what it tells a host that wants another value in dark.
  await page.addStyleTag({
    content: `
      @media (prefers-color-scheme: dark) {
        .fs-shell:not([data-fs-theme='light']) { --fs-primary: #c4b5fd }
        .fsh-screen:not([data-fsh-theme='light']) { --fsh-accent: #c4b5fd }
      }
      .fs-shell[data-fs-theme='dark'] { --fs-primary: #c4b5fd }
      .fsh-screen[data-fsh-theme='dark'] { --fsh-accent: #c4b5fd }`,
  })
  for (const system of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: system })
    for (const choice of ['system', 'light', 'dark']) {
      await mode.selectOption(choice)
      // The playground sets the kit's attribute after the designer's.
      await expect(screen).toHaveAttribute('data-fsh-theme', choice)
      const dark = (choice === 'system' ? system : choice) === 'dark'
      const where = `${choice} on a ${system} system`
      await expect(shell, where).toHaveCSS('--fs-primary', dark ? '#c4b5fd' : '#6d28d9')
      await expect(screen, where).toHaveCSS('--fsh-accent', dark ? '#c4b5fd' : '#6d28d9')
    }
  }
})

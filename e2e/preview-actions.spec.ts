import { expect, test } from '@playwright/test'
import { createDocument, prop } from '../packages/core/src/index.js'

for (const kit of ['html', 'mui']) {
  test(`${kit}: button emphasis survives switching kits`, async ({ page }) => {
    const document = createDocument('Button styles', 'button-styles')
    document.root.children = ['solid', 'contained', 'outline', 'outlined', 'plain', 'text'].map(
      (variant) => ({
        key: variant,
        type: 'Button',
        props: { text: prop(variant), variant: prop(variant) },
      }),
    )
    await page.addInitScript(
      (document) => localStorage.setItem('willowforms.playground.document', document),
      JSON.stringify(document),
    )
    await page.goto('/')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const form = page.locator('[data-fs-key="root"]')
    for (const variant of ['solid', 'contained'])
      await expect(form.getByRole('button', { name: variant, exact: true })).not.toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      )
    for (const variant of ['outline', 'outlined', 'plain', 'text']) {
      const button = form.getByRole('button', { name: variant, exact: true })
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      if (variant === 'outline' || variant === 'outlined')
        await expect(button).toHaveCSS('border-top-width', '1px')
    }
  })

  test(`${kit}: example buttons validate answers and simulate submission without a request`, async ({
    page,
  }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST') requests.push(request.url())
    })
    await page.goto('/?example=customer-feedback')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const canvas = page.getByRole('main', { name: 'Form canvas' })
    const form = canvas.locator('[data-fs-key="root"]')
    const status = canvas.getByRole('status')
    await form.getByRole('button', { name: 'Send feedback', exact: true }).click()
    await expect(status).toHaveText('Check 1 field before submitting.')
    await expect(
      form.getByRole('radiogroup', { name: 'How was your experience?' }),
    ).toHaveAttribute('aria-invalid', 'true')
    await form.getByRole('radio', { name: 'Good', exact: true }).check()
    await expect(status).toBeEmpty()
    await form.getByRole('button', { name: 'Check answers', exact: true }).click()
    await expect(status).toHaveText('All answers are valid.')
    await form.getByRole('checkbox', { name: 'I would like someone to follow up' }).check()
    await form.getByRole('button', { name: 'Check answers', exact: true }).click()
    await expect(form.getByRole('textbox', { name: 'Email', exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await form.getByRole('textbox', { name: 'Email', exact: true }).fill('reader@example.com')
    await form.getByRole('button', { name: 'Send feedback', exact: true }).click()
    await expect(status).toHaveText('Form is valid. Submission simulated; no data was sent.')
    expect(requests).toEqual([])
    await canvas.getByRole('button', { name: 'Clear data', exact: true }).click()
    await expect(status).toBeEmpty()
    await form.getByRole('button', { name: 'Send feedback', exact: true }).click()
    await expect(status).toHaveText('Check 1 field before submitting.')
  })

  test(`${kit}: submitting from the last page checks earlier pages and keeps answers`, async ({
    page,
  }) => {
    await page.goto('/?example=job-application')
    await page.getByLabel('Kit', { exact: true }).selectOption(kit)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const canvas = page.getByRole('main', { name: 'Form canvas' })
    const form = canvas.locator('[data-fs-key="root"]')
    const submit = form.getByRole('button', { name: 'Submit application', exact: true })
    await expect(submit).toHaveCount(0)
    const step = canvas.getByRole('combobox', { name: 'Step', exact: true })
    await step.selectOption({ label: 'Practical details' })
    await form.getByRole('checkbox', { name: 'You may contact me about this application' }).check()
    await submit.click()
    await expect(step).toHaveValue(JSON.stringify('About you'))
    await expect(form.getByRole('textbox', { name: 'Full name', exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(canvas.getByRole('status')).toHaveText('Check 3 fields before submitting.')
    await form.getByRole('textbox', { name: 'Full name', exact: true }).fill('Mira Ashvale')
    await form.getByRole('textbox', { name: 'Email', exact: true }).fill('reader@example.com')
    const role = form.getByRole('combobox', { name: 'Role', exact: true })
    if (kit === 'html') await role.selectOption({ label: 'Software engineer' })
    else {
      await role.click()
      await page.getByRole('option', { name: 'Software engineer', exact: true }).click()
    }
    await step.selectOption({ label: 'Practical details' })
    await expect(
      form.getByRole('checkbox', { name: 'You may contact me about this application' }),
    ).toBeChecked()
    await submit.click()
    await expect(canvas.getByRole('status')).toHaveText(
      'Form is valid. Submission simulated; no data was sent.',
    )
  })
}

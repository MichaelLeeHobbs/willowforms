// jsdom has no cascade, so whether a rule reaches its element needs a browser.

import type { Page } from '@playwright/test'

import { expect, test } from './harness.js'

const styleOf = async (designer: { page: Page }, key: string, property: string): Promise<string> =>
  designer.page.evaluate(
    ([k, prop]) => {
      const element = document.querySelector(`[data-fs-key="${k as string}"]`)
      return element ? getComputedStyle(element).getPropertyValue(prop as string) : ''
    },
    [key, property],
  )

// Polled: `press()` resolves on dispatch, before the React commit and `<style>` insertion.
const expectStyle = (
  designer: { page: Page },
  key: string,
  property: string,
): ReturnType<typeof expect.poll> => expect.poll(() => styleOf(designer, key, property))

test('a structured control styles the component on the canvas', async ({ designer }) => {
  await designer.select('website')
  await designer.openTab('Style')
  await designer.page.getByText('Advanced CSS', { exact: true }).click()

  // Enter commits: the control holds a draft so a half-typed value is never parsed.
  await designer.page.getByLabel('Padding').fill('24px')
  await designer.page.getByLabel('Padding').press('Enter')
  await designer.page.getByLabel('Radius').fill('9px')
  await designer.page.getByLabel('Radius').press('Enter')

  await expectStyle(designer, 'website', 'padding-top').toBe('24px')
  await expectStyle(designer, 'website', 'border-top-left-radius').toBe('9px')
})

test('a device rule overrides the base layer when that device is shown', async ({ designer }) => {
  await designer.select('website')
  await designer.openTab('Style')
  await designer.page.getByText('Advanced CSS', { exact: true }).click()

  await designer.page.getByLabel('Padding').fill('24px')
  await designer.page.getByLabel('Padding').press('Enter')

  await designer.page.getByLabel('Applies to').selectOption('mobile')
  await designer.page.getByLabel('Padding').fill('4px')
  await designer.page.getByLabel('Padding').press('Enter')

  // Choosing a device in the Style tab also moves the canvas to it.
  await expectStyle(designer, 'website', 'padding-top').toBe('4px')

  await designer.page.getByRole('button', { name: 'Desktop' }).click()
  await expectStyle(designer, 'website', 'padding-top').toBe('24px')
})

test('CSS that would escape the component is not applied', async ({ designer }) => {
  await designer.select('website')
  await designer.openTab('Style')
  await designer.page.getByText('Advanced CSS', { exact: true }).click()

  // A real declaration first, so the refusal is not just "no styling at all".
  await designer.page.getByLabel('Padding').fill('24px')
  await designer.page.getByLabel('Padding').press('Enter')

  await designer.page.getByLabel('CSS', { exact: true }).fill('color: red } body { display: none')
  await designer.page.getByLabel('Padding').click()

  await expect(designer.page.getByRole('alert')).toContainText('Declarations only')
  expect(await designer.page.evaluate(() => getComputedStyle(document.body).display)).not.toBe(
    'none',
  )

  // A control: `display` is not `none` on a page with no styles either.
  const rules = await designer.page.evaluate(() =>
    [...document.querySelectorAll('style')]
      .map((element) => element.textContent ?? '')
      // Only this component's sheet: `designer.css` and MUI's styles also mention `body`.
      .filter((text) => text.includes('[data-fs-key="website"]'))
      .join(' '),
  )
  expect(rules, 'the per-component stylesheet never reached the page').not.toBe('')
  expect(rules).toContain('padding')
  expect(rules).not.toContain('body')
  await expectStyle(designer, 'website', 'padding-top').toBe('24px')
})

test('the canvas does not draw the form in the designer own typeface', async ({ designer }) => {
  /*
   * `revert` on an inherited property with no user-agent rule computes to `inherit`, so the
   * frame's reset is checked here: jsdom has no cascade to roll back through.
   */
  const seen = await designer.page.evaluate(() => {
    const read = (selector: string): { font: string; size: string } => {
      const element = document.querySelector(selector)
      if (!element) throw new Error('no ' + selector)
      const style = getComputedStyle(element)
      return { font: style.fontFamily, size: style.fontSize }
    }
    return { shell: read('.fs-shell'), frame: read('.fs-canvas__frame') }
  })

  expect(seen.frame.font).not.toBe(seen.shell.font)
  expect(seen.frame.size).not.toBe(seen.shell.size)
})

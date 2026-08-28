/**
 * Per-component styling, applied.
 *
 * jsdom has no cascade: it will happily report that a `<style>` element exists
 * while telling you nothing about whether its rule reached the element. Whether
 * the declaration actually lands, and whether a device rule beats the base
 * layer, is a browser question.
 */

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

test('a structured control styles the component on the canvas', async ({ designer }) => {
  await designer.select('website')
  await designer.openTab('Style')

  await designer.page.getByLabel('Padding').fill('24px')
  await designer.page.getByLabel('Radius').fill('9px')

  expect(await styleOf(designer, 'website', 'padding-top')).toBe('24px')
  expect(await styleOf(designer, 'website', 'border-top-left-radius')).toBe('9px')
})

test('a device rule overrides the base layer when that device is shown', async ({ designer }) => {
  await designer.select('website')
  await designer.openTab('Style')

  await designer.page.getByLabel('Padding').fill('24px')

  await designer.page.getByLabel('Applies to').selectOption('mobile')
  await designer.page.getByLabel('Padding').fill('4px')

  // Choosing a device in the Style tab moves the canvas to it, so what is on
  // screen is the rule being edited.
  expect(await styleOf(designer, 'website', 'padding-top')).toBe('4px')

  await designer.page.getByRole('button', { name: 'Desktop' }).click()
  expect(await styleOf(designer, 'website', 'padding-top')).toBe('24px')
})

test('CSS that would escape the component is not applied', async ({ designer }) => {
  /*
   * The whole reason the text is declarations only. A `}` would end the block
   * and let one component's styling reach the page, so the value is kept in the
   * document, reported to the author, and never rendered.
   */
  await designer.select('website')
  await designer.openTab('Style')

  await designer.page.getByLabel('CSS', { exact: true }).fill('color: red } body { display: none')
  await designer.page.getByLabel('Padding').click()

  await expect(designer.page.getByRole('alert')).toContainText('Declarations only')
  expect(await designer.page.evaluate(() => getComputedStyle(document.body).display)).not.toBe(
    'none',
  )
})

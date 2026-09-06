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

/**
 * The same reading, polled.
 *
 * Every assertion in this file used to be `expect(await styleOf(...)).toBe(...)`
 * taken straight after `press('Enter')` -- a plain assertion, read once, on a
 * value that needs a React commit and a `<style>` insertion to be true.
 * `press()` resolves when the event is dispatched, not when the page has
 * finished reacting to it, so those were races that happened to win.
 *
 * `expect.poll` retries until the timeout, which is what every other assertion
 * in this suite gets from Playwright's own matchers.
 */
const expectStyle = (
  designer: { page: Page },
  key: string,
  property: string,
): ReturnType<typeof expect.poll> => expect.poll(() => styleOf(designer, key, property))

test('a structured control styles the component on the canvas', async ({ designer }) => {
  await designer.select('website')
  await designer.openTab('Style')
  await designer.page.getByText('Advanced CSS', { exact: true }).click()

  /*
   * Enter commits, and so does moving focus away. The control holds a draft
   * rather than writing through on every keystroke, because parsing what is
   * half-typed removed the space from `8px auto` as it was being typed.
   */
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

  // Choosing a device in the Style tab moves the canvas to it, so what is on
  // screen is the rule being edited.
  await expectStyle(designer, 'website', 'padding-top').toBe('4px')

  await designer.page.getByRole('button', { name: 'Desktop' }).click()
  await expectStyle(designer, 'website', 'padding-top').toBe('24px')
})

test('CSS that would escape the component is not applied', async ({ designer }) => {
  /*
   * The whole reason the text is declarations only. A `}` would end the block
   * and let one component's styling reach the page, so the value is kept in the
   * document, reported to the author, and never rendered.
   */
  await designer.select('website')
  await designer.openTab('Style')
  await designer.page.getByText('Advanced CSS', { exact: true }).click()

  // A real declaration first, so there is a stylesheet on the page to inspect
  // and the refusal below can be told apart from "no styling at all".
  await designer.page.getByLabel('Padding').fill('24px')
  await designer.page.getByLabel('Padding').press('Enter')

  await designer.page.getByLabel('CSS', { exact: true }).fill('color: red } body { display: none')
  await designer.page.getByLabel('Padding').click()

  await expect(designer.page.getByRole('alert')).toContainText('Declarations only')
  expect(await designer.page.evaluate(() => getComputedStyle(document.body).display)).not.toBe(
    'none',
  )

  /*
   * And the stylesheet is on the page at all. `display` is not `none` on a page
   * with no formsmith styles either, so on its own that assertion holds for a
   * build that never emitted a rule -- it carries weight only next to something
   * that says the mechanism works. The earlier tests in this file set real
   * padding, so a `[data-fs-key]` rule is there to find.
   */
  const rules = await designer.page.evaluate(() =>
    [...document.querySelectorAll('style')]
      .map((element) => element.textContent ?? '')
      /*
       * The sheet the renderer emitted for this document, which is the one that
       * names the styled component. Filtering on `data-fs-key` alone also
       * catches `designer.css`, whose own comments mention `body`, and MUI's
       * has `body` rules of its own -- so the question would be answered by a
       * stylesheet the test is not about.
       */
      .filter((text) => text.includes('[data-fs-key="website"]'))
      .join(' '),
  )
  expect(rules, 'the per-component stylesheet never reached the page').not.toBe('')
  expect(rules).toContain('padding')
  expect(rules).not.toContain('body')
  // And the component still has the styling that was accepted.
  await expectStyle(designer, 'website', 'padding-top').toBe('24px')
})

test('the canvas does not draw the form in the designer own typeface', async ({ designer }) => {
  /*
   * `.fs-canvas__frame` resets the three inherited properties that would
   * otherwise come from the shell, and it used `revert` -- which rolls back to
   * the user-agent origin, and for an inherited property with no UA rule that
   * computes to `inherit`. So the reset did nothing, and an author judged
   * wrapping and spacing against the builder's font rather than a form's.
   *
   * Only a browser can settle this: jsdom has no cascade to roll back through,
   * which is why the review could not decide it and why this test is here rather
   * than beside the stylesheet.
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

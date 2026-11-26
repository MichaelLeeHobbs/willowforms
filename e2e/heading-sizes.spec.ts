import { createDocument, prop } from '../packages/core/src/index.js'
import type { ComponentNode } from '../packages/core/src/index.js'
import { STORAGE_KEY, expect, test } from './harness.js'

const LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
const SIZES = [32, 24, 20, 18, 16, 16]

for (const density of ['comfortable', 'compact']) {
  test(`the HTML kit sizes each heading level itself, in a ${density} form`, async ({ page }) => {
    const heading = (level: string): ComponentNode => ({
      key: level,
      type: 'Heading',
      props: { text: prop('Level ' + level), level: prop(level) },
    })
    const doc = createDocument('Headings', 'headings')
    doc.root.props['density'] = prop(density)
    doc.root.children = [
      { key: 'card', type: 'Card', props: {}, children: LEVELS.map(heading) },
      { ...heading('h5'), key: 'authored', css: { any: 'font-size: 29px; font-weight: 400' } },
      {
        key: 'field',
        type: 'TextField',
        props: { label: prop('Name') },
        schema: { type: 'string', validations: [] },
      },
    ]
    await page.addInitScript(
      ({ key, text }) => {
        localStorage.setItem(key, text)
        localStorage.setItem('willowforms.playground.kit', 'html')
      },
      { key: STORAGE_KEY, text: JSON.stringify(doc) },
    )
    await page.goto('/')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.locator('[data-fs-key="root"]')).toHaveAttribute('data-fs-density', density)

    const size = (key: string): Promise<number> =>
      page
        .locator(`[data-fs-key="${key}"]`)
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
    const levelsHold = async (where: string): Promise<void> => {
      expect(await Promise.all(LEVELS.map(size)), where).toEqual(SIZES)
      for (const level of LEVELS) {
        const element = page.locator(`[data-fs-key="${level}"]`)
        expect(await element.evaluate((each) => each.tagName.toLowerCase())).toBe(level)
        await expect(element, where).toHaveCSS('font-weight', '600')
      }
    }

    await levelsHold('as the kit draws them')
    // A host reset on the bare elements, which sits below the kit's rules only by specificity.
    await page.addStyleTag({
      content: 'h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit }',
    })
    await levelsHold('under a host reset')

    const label = await page
      .locator('[data-fs-key="field"] .fsh-field__label')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
    expect(Math.min(...SIZES)).toBeGreaterThan(label)

    const authored = page.locator('[data-fs-key="authored"]')
    await expect(authored).toHaveCSS('font-size', '29px')
    await expect(authored).toHaveCSS('font-weight', '400')

    // What a host may write to size every level alike.
    await page.addStyleTag({ content: '.fsh-heading { font-size: 21px }' })
    expect(await Promise.all(LEVELS.map(size))).toEqual(LEVELS.map(() => 21))
    await expect(authored).toHaveCSS('font-size', '29px')
  })
}

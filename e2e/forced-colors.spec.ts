// jsdom has no forced colours and no system colours to resolve.

import type { Locator } from '@playwright/test'

import { createDocument, prop } from '../packages/core/src/index.js'
import { STORAGE_KEY, expect, test } from './harness.js'

test('a switch and a progress bar still show their state under forced colours', async ({
  page,
}) => {
  const doc = createDocument('Forced colours', 'forced-colours')
  doc.root.children = [
    {
      key: 'subscribe',
      type: 'Switch',
      props: { label: prop('Subscribe') },
      schema: { type: 'boolean', validations: [] },
    },
    { key: 'upload', type: 'Progress', props: { label: prop('Upload'), value: prop(40) } },
  ]
  await page.addInitScript(
    ({ key, text }) => {
      localStorage.setItem(key, text)
      localStorage.setItem('willowforms.playground.kit', 'html')
    },
    { key: STORAGE_KEY, text: JSON.stringify(doc) },
  )
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()

  const system = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.setProperty('forced-color-adjust', 'none')
    document.body.append(probe)
    const read = (name: string): string => {
      probe.style.backgroundColor = name
      return getComputedStyle(probe).backgroundColor
    }
    const colours = {
      canvas: read('Canvas'),
      text: read('CanvasText'),
      highlight: read('Highlight'),
    }
    probe.remove()
    return colours
  })
  expect(new Set(Object.values(system)).size, 'the system colours are not distinct').toBe(3)

  const track = page.locator('[data-fs-key="subscribe"] .fsh-switch__track')
  const thumb = (): Promise<string> =>
    track.evaluate((element) => getComputedStyle(element, '::after').backgroundColor)
  const outlined = async (element: Locator): Promise<void> => {
    await expect(element).toHaveCSS('outline-style', 'solid')
    await expect(element).toHaveCSS('outline-color', system.text)
  }

  await expect(track).toHaveCSS('background-color', system.canvas)
  await expect.poll(thumb).toBe(system.text)
  await outlined(track)

  await page.getByRole('switch', { name: 'Subscribe' }).check({ force: true })
  await expect(track).toHaveCSS('background-color', system.highlight)
  await expect.poll(thumb).toBe(system.canvas)

  const progress = page.getByRole('progressbar', { name: 'Upload' })
  await expect(progress).toHaveCSS('background-color', system.canvas)
  await expect(progress.locator('.fsh-progress__fill')).toHaveCSS(
    'background-color',
    system.highlight,
  )
  await outlined(progress)
})

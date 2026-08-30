/**
 * Shared setup and vocabulary for the end-to-end tests.
 *
 * The playground persists to localStorage, so every test starts by clearing it
 * before the app boots. Without that the suite passes or fails depending on what
 * the previous test left behind, which is worse than having no suite.
 */

import { expect, test as base } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const STORAGE_KEY = 'formsmith.playground.document'

export interface Designer {
  page: Page
  /** A row in the structure tree. */
  row: (key: string) => Locator
  /** A component as the kit actually rendered it on the canvas. */
  node: (key: string) => Locator
  /** The keys of the root's children, in document order. */
  rootChildren: () => Promise<string[]>
  /** The whole document as the playground has persisted it. */
  document: () => Promise<FormDocumentShape>
  select: (key: string) => Promise<void>
  /**
   * Open a tab in either pane. The left pane holds Components, Tree and
   * Settings; the inspector holds Properties and Rules.
   */
  openTab: (
    name: 'Components' | 'Tree' | 'Settings' | 'Properties' | 'Style' | 'Rules',
  ) => Promise<void>
  undo: () => Promise<void>
}

/** Only the parts these tests read. */
interface FormDocumentShape {
  name: string
  defaultLanguage: string
  translations: Record<string, Record<string, string>>
  root: { key: string; type: string; children?: NodeShape[] }
}

interface NodeShape {
  key: string
  type: string
  props: Record<string, { kind: string; value?: unknown; key?: string; expression?: string }>
  children?: NodeShape[]
  schema?: { type: string; validations: { key: string }[] }
}

export const test = base.extend<{ designer: Designer }>({
  designer: async ({ page }, use) => {
    await page.addInitScript((key: string) => {
      window.localStorage.removeItem(key)
    }, STORAGE_KEY)

    await page.goto('/')
    // The shell is the signal that React has mounted and the kit has rendered.
    await expect(page.locator('.fs-shell')).toBeVisible()
    await expect(page.locator('[data-fs-key="root"]')).toBeVisible()

    /*
     * The structure tree is behind a tab in the left pane. Opened here so every
     * test starts where it used to; the few that want the palette open the
     * Components tab themselves.
     */
    await page.getByRole('tab', { name: 'Tree' }).click()
    await expect(page.locator('[data-fs-row="root"]')).toBeVisible()

    const designer: Designer = {
      page,
      row: (key) => page.locator(`[data-fs-row="${key}"]`),
      node: (key) => page.locator(`[data-fs-key="${key}"]`),

      rootChildren: async () =>
        page.evaluate((storageKey: string) => {
          const raw = window.localStorage.getItem(storageKey)
          if (!raw) return []
          const doc = JSON.parse(raw) as FormDocumentShape
          return (doc.root.children ?? []).map((child) => child.key)
        }, STORAGE_KEY),

      document: async () =>
        page.evaluate((storageKey: string) => {
          const raw = window.localStorage.getItem(storageKey)
          if (!raw) throw new Error('The playground has not persisted a document yet.')
          return JSON.parse(raw) as FormDocumentShape
        }, STORAGE_KEY),

      select: async (key) => {
        await designer.row(key).click()
        await expect(designer.row(key)).toHaveAttribute('aria-selected', 'true')
      },

      openTab: async (name) => {
        await page.getByRole('tab', { name }).click()
        await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
      },

      undo: async () => {
        await page.getByRole('button', { name: 'Undo' }).click()
      },
    }

    await use(designer)
  },
})

/**
 * Measure an element only once it has stopped moving.
 *
 * `boundingBox()` waits for the element to be attached and visible, but not for
 * it to be still — that check is part of Playwright's actionability, and a bare
 * measurement does not get it. So a box read while the left pane is still
 * settling after a tab change describes where the element *was*, and the
 * `mouse.down()` that follows lands wherever that coordinate now points, which
 * is usually nothing at all.
 *
 * That is not hypothetical. The palette drag failed nine CI runs out of ten
 * while passing locally every time, and the failure snapshot showed the whole
 * gesture completing with Undo still disabled: no mutation, so the press never
 * reached the button. A developer machine settles before the next statement
 * runs; a loaded runner does not.
 *
 * Two consecutive equal readings, which is the same definition of stable that
 * Playwright's own actionability uses.
 *
 * This deliberately does not scroll anything into view. Scrolling to reach the
 * target moves the source that was already measured, which broke two passing
 * drags the first time this was written.
 */
export async function stableBox(
  target: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  let previous = await target.boundingBox()
  for (let attempt = 0; attempt < 20; attempt++) {
    await target
      .page()
      .evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    const current = await target.boundingBox()
    if (
      previous &&
      current &&
      previous.x === current.x &&
      previous.y === current.y &&
      previous.width === current.width &&
      previous.height === current.height
    ) {
      return current
    }
    previous = current
  }

  throw new Error(
    previous
      ? 'An element never stopped moving, so it cannot be dragged reliably.'
      : 'Cannot drag something that is not on screen.',
  )
}

/**
 * Drag one element onto another with real mouse events.
 *
 * Steps through intermediate positions rather than jumping: the drag controller
 * needs a move to cross its threshold, and the drop zones measure on the moves
 * that follow. A single jump is not a gesture any user performs.
 */
export async function dragOnto(
  page: Page,
  from: Locator,
  to: Locator,
  where: 'top' | 'middle' | 'bottom' = 'middle',
): Promise<void> {
  const start = await stableBox(from)
  const end = await stableBox(to)

  const targetY =
    where === 'top'
      ? end.y + 3
      : where === 'bottom'
        ? end.y + end.height - 3
        : end.y + end.height / 2

  await page.mouse.move(start.x + Math.min(40, start.width / 2), start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + 50, start.y + start.height / 2 + 12, { steps: 4 })
  await page.mouse.move(end.x + Math.min(40, end.width / 2), targetY, { steps: 12 })
  await page.mouse.up()
}

export { expect }

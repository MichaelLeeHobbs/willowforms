import { expect, test as base } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

export const STORAGE_KEY = 'willowforms.playground.document'

export interface Designer {
  page: Page
  /** A row in the structure tree. */
  row: (key: string) => Locator
  /** A component as the kit actually rendered it on the canvas. */
  node: (key: string) => Locator
  rootChildren: () => Promise<string[]>
  /** The whole document as the playground has persisted it. */
  document: () => Promise<FormDocumentShape>
  select: (key: string) => Promise<void>
  openTab: (
    name: 'Components' | 'Tree' | 'Settings' | 'Properties' | 'Style' | 'Rules' | 'Actions',
  ) => Promise<void>
  undo: () => Promise<void>
}

/** Only the parts these tests read. */
interface FormDocumentShape {
  name: string
  languages: { code: string; region?: string; name: string }[]
  defaultLanguage: string
  translations: Record<string, Record<string, string>>
  root: { key: string; type: string; children?: NodeShape[] }
}

interface NodeShape {
  key: string
  dataKey?: string
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

    // Tests start on the Tree tab; those that need the palette open Components themselves.
    await page.getByRole('tab', { name: 'Tree' }).click()
    await expect(page.locator('[data-fs-tree-row="root"]')).toBeVisible()

    const designer: Designer = {
      page,
      row: (key) => page.locator(`[data-fs-tree-row="${key}"]`),
      // `.first()`: a repeater draws its subtree once per row, so a key can match many elements.
      node: (key) => page.locator(`[data-fs-key="${key}"]`).first(),

      /*
       * Throws rather than answering `[]`, so `toEqual(before)` cannot pass for a designer that
       * saved nothing.
       */
      rootChildren: async () =>
        page.evaluate((storageKey: string) => {
          const raw = window.localStorage.getItem(storageKey)
          if (!raw) throw new Error('The playground has not persisted a document yet.')
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
 * `boundingBox()` does not wait for an element to stop moving, so this waits for two equal
 * readings across frames. It does not scroll; callers finish scrolling before measuring.
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
      : // `boundingBox()` is null only for no box at all, never for an element off screen.
        'That element has no box at all, so it was never rendered.',
  )
}

/**
 * Scrolls the drag source into view before measuring: `boundingBox()` gives page coordinates
 * for an element below the fold, so the press would land outside the window. Never scroll the
 * target; that moves the source out from under the press.
 */
export async function dragFrom(
  source: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await source.scrollIntoViewIfNeeded()
  return stableBox(source)
}

/*
 * Moves in steps: the drag controller needs a move past its threshold, and the drop zones measure
 * on the moves after it.
 */
export async function dragOnto(
  page: Page,
  from: Locator,
  to: Locator,
  where: 'top' | 'middle' | 'bottom' = 'middle',
): Promise<void> {
  const start = await dragFrom(from)
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

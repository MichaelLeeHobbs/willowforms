/**
 * Shared setup and vocabulary for the end-to-end tests.
 *
 * The playground persists to localStorage, so every test starts by clearing it
 * before the app boots. Without that the suite passes or fails depending on what
 * the previous test left behind, which is worse than having no suite.
 */

import { expect, test as base } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/** Where the playground persists its draft. Exported so a test can plant one. */
export const STORAGE_KEY = 'formsmith.playground.document'

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
  languages: { code: string; region?: string; name: string }[]
  defaultLanguage: string
  translations: Record<string, Record<string, string>>
  root: { key: string; type: string; children?: NodeShape[] }
}

interface NodeShape {
  key: string
  /** The answer's name, when it has been renamed away from the key. */
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

    /*
     * The structure tree is behind a tab in the left pane. Opened here so every
     * test starts where it used to; the few that want the palette open the
     * Components tab themselves.
     */
    await page.getByRole('tab', { name: 'Tree' }).click()
    await expect(page.locator('[data-fs-tree-row="root"]')).toBeVisible()

    const designer: Designer = {
      page,
      row: (key) => page.locator(`[data-fs-tree-row="${key}"]`),
      /*
       * The first element drawing this node. A repeater draws its subtree once
       * per row, so a key names any number of elements and an unscoped locator
       * becomes a strict-mode violation the moment a spec previews two rows --
       * in every test that uses it, not only the one that added the rows.
       */
      node: (key) => page.locator(`[data-fs-key="${key}"]`).first(),

      /*
       * Throws when nothing has been persisted, rather than answering `[]`.
       *
       * Five specs assert `expect(after).toEqual(before)` to show a gesture
       * changed nothing, and with an empty answer on both sides that is
       * `[] === []` -- an assertion that passes hardest when the app has not
       * saved anything at all, which is the state a broken designer is in.
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
 * Measure an element only once it has stopped moving.
 *
 * `boundingBox()` waits for an element to be attached and visible but not for it
 * to be still; stability is part of Playwright's actionability and a bare
 * measurement does not get it. That matters here because `dragOnto` now scrolls
 * before it measures, and a scroll takes frames to land.
 *
 * Two consecutive equal readings, the same definition of stable actionability
 * uses. It does not scroll anything itself: the caller has to finish all its
 * scrolling before any measuring starts, for the reason given there.
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
      : /*
         * Not "not on screen": `boundingBox()` answers for an element below the
         * fold as readily as for one in view, and returns `null` only when the
         * element has no box at all -- `display: none`, detached, or never
         * rendered. The message used to advertise a guard this function does
         * not have, which is `dragFrom`'s job.
         */
        'That element has no box at all, so it was never rendered.',
  )
}

/**
 * Drag one element onto another with real mouse events.
 *
 * Steps through intermediate positions rather than jumping: the drag controller
 * needs a move to cross its threshold, and the drop zones measure on the moves
 * that follow. A single jump is not a gesture any user performs.
 *
 * The source is scrolled into view first; the target deliberately is not.
 *
 * `boundingBox()` reports page coordinates whether or not the element is on
 * screen, so a palette entry below the fold yields a perfectly plausible box
 * that `mouse.down()` then presses at a point outside the window, turning the
 * whole gesture into a text selection across the canvas. That is what took out
 * the palette drag: the Step and Repeater entries this branch adds made the
 * Layout group a row taller, which pushed Selection past the bottom of a 720px
 * viewport. Linux CI renders it just tall enough; Windows does not, which is why
 * it failed every CI run and passed every local one.
 *
 * The target needs no such help, and giving it some actively breaks things. A
 * press has to land on the source, but the target is only ever approached by
 * moving the mouse, which the drag controller already handles. Scrolling it
 * moves whatever was measured before it and pushes the source off screen when
 * both live in the canvas: that failed two passing canvas drags twice here, once
 * by measuring before scrolling and once by scrolling both.
 */
/**
 * Where a drag starts, scrolled into view before it is measured.
 *
 * Trap 13. `boundingBox()` answers for an element below the fold as readily as
 * for one on screen -- the coordinates are simply outside the viewport, so
 * `mouse.down()` presses on nothing, the gesture becomes a text selection, and
 * the failure surfaces several steps later as a wrong document. That has
 * already happened here, to a palette entry the layout pushed down; one more
 * entry in the `layout` or `display` group puts the next one below the fold.
 *
 * The source only. Scrolling the *target* moves the source out from under a
 * press that has already happened, which is a different way to lose the same
 * gesture -- and a drop target that is off screen is a real failure worth
 * seeing rather than one to paper over.
 *
 * Exported because two specs roll their own drag: one needs a modifier key
 * mid-gesture, the other needs to press Escape, and neither fits `dragOnto`.
 */
export async function dragFrom(
  source: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await source.scrollIntoViewIfNeeded()
  return stableBox(source)
}

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

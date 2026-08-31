import { afterEach } from 'vitest'

/**
 * How many elements the stubbed observers are watching, and how often they let
 * go.
 *
 * On `globalThis` rather than in module scope. This file runs once per test
 * file, while the stub it installs is set on `globalThis` and therefore
 * installed by whichever file ran first -- so counters held in a module would be
 * incremented by that file's instance and read as zero by every other one. A
 * counter that always reads zero is precisely the silent pass the counting was
 * added to prevent.
 */
interface Counts {
  made: number
  observing: number
  disconnects: number
}

const counts: Counts = ((
  globalThis as { formsmithObserverCounts?: Counts }
).formsmithObserverCounts ??= { made: 0, observing: 0, disconnects: 0 })

/** What the `ResizeObserver` stub has seen. A test asserting a leak reads this. */
export const observerCount = (): Counts => ({ ...counts })

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)

  /*
   * `ResizeObserver` does not exist in jsdom and the selection layer uses one.
   *
   * The stub counts. A stub that records nothing makes an observer leak
   * invisible -- the layer observes the surface and the form root, and an effect
   * that rebuilt them per render would look identical to one that does not --
   * and the counters cost two integers. `observerCount()` below is what a test
   * asks.
   */
  /*
   * Installed always, not only when jsdom has none.
   *
   * The guard used to be `if (!('ResizeObserver' in globalThis))`, and the
   * environment now provides one -- so the stub was never installed, the
   * counters read zero forever, and the leak this file says it can see became
   * invisible. That is the same always-reads-zero silent pass the paragraph
   * above describes, arriving through the other door.
   *
   * Overwriting a real implementation is right for this suite: jsdom has no
   * layout, so a real `ResizeObserver` here observes elements that never
   * change size and reports nothing. What a test can ask is how many were made
   * and how many were let go.
   */
  {
    globalThis.ResizeObserver = class implements ResizeObserver {
      constructor() {
        counts.made += 1
      }
      observe(): void {
        counts.observing += 1
      }
      unobserve(): void {
        counts.observing -= 1
      }
      disconnect(): void {
        counts.disconnects += 1
      }
    }
  }

  /*
   * jsdom really does not implement `scrollIntoView`. The designer no longer
   * calls it -- the selection layer scrolls the canvas by its own offsets, so a
   * host page is not dragged around when somebody clicks a tree row -- but
   * `userEvent` calls it while typing, and a kit is free to. Widened to an
   * optional property so assigning it is neither an unbound-method read nor a
   * narrowing to `never`.
   */
  const elementProto = Element.prototype as { scrollIntoView?: Element['scrollIntoView'] }
  elementProto.scrollIntoView ??= function scrollIntoView(): void {}
}

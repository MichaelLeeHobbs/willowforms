import { afterEach } from 'vitest'

import { installConsoleErrorGate } from './console-errors.js'

installConsoleErrorGate()

/**
 * How many elements the stubbed observers are watching, and how often they let
 * go.
 *
 * `observing` is live targets rather than a lifetime total: `observe` counts a
 * target once, `unobserve` takes it away, and `disconnect` subtracts whatever
 * that observer still held. A number that only ever went up could not show a
 * leak, which was the one thing it was here to show.
 *
 * On `globalThis` rather than in module scope. The pool is `forks` with
 * isolation on, so each test file is its own process and module scope would in
 * fact do; this is belt and braces against a second module instance, and it
 * costs nothing. The comment that used to be here claimed the counters were
 * incremented by whichever file ran first and read as zero everywhere else.
 * They did read zero, but that was not why -- see
 * `SelectionLayer.tsx`, where a layout effect read a ref its ancestor had not
 * attached yet and no observer was ever constructed.
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
   * Installed unconditionally, overwriting anything already there.
   *
   * jsdom 30 ships no `ResizeObserver`, so the old `if (!('ResizeObserver' in
   * globalThis))` guard did install this -- the comment claiming the
   * environment now provides one, and that the stub was therefore never
   * installed, was wrong about the environment as well as about the zero it was
   * written to explain. Dropping the guard is still right: overwriting a real
   * implementation is what this suite wants, because jsdom has no layout, so a
   * real observer here watches elements that never change size and reports
   * nothing. What a test can ask is how many were made, how many targets are
   * live, and how many were let go.
   */
  globalThis.ResizeObserver = class implements ResizeObserver {
    /** This observer's own targets, so `disconnect` knows what to give back. */
    private readonly targets = new Set<Element>()

    constructor() {
      counts.made += 1
    }

    observe(target: Element): void {
      // Observing the same element twice is one target, as it is in a browser.
      if (!this.targets.has(target)) {
        this.targets.add(target)
        counts.observing += 1
      }
    }

    unobserve(target: Element): void {
      if (this.targets.delete(target)) counts.observing -= 1
    }

    disconnect(): void {
      counts.observing -= this.targets.size
      this.targets.clear()
      counts.disconnects += 1
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

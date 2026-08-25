/**
 * Component test setup.
 *
 * Runs for every test file, so everything DOM-related is behind a guard: core's
 * tests run in the node environment on purpose, to keep proving that core works
 * without a DOM, and importing Testing Library there would break that.
 *
 * jsdom has no layout engine, so getBoundingClientRect returns zeros for every
 * element. Anything that measures geometry, which means the selection frame's
 * position and size, cannot be asserted here and has to be checked in a real
 * browser. What these tests do cover is behaviour: hit-testing, selection
 * wiring, and that design-mode clicks never reach the kit's components.
 */

import { afterEach } from 'vitest'

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)

  // Neither of these exists in jsdom, and the selection layer uses both.
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  }
  // jsdom really does not implement scrollIntoView, and the selection layer calls
  // it whenever the tree moves the selection. Widened to an optional property so
  // assigning it is neither an unbound-method read nor a narrowing to `never`.
  const elementProto = Element.prototype as { scrollIntoView?: Element['scrollIntoView'] }
  elementProto.scrollIntoView ??= function scrollIntoView(): void {}
}

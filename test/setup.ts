import { afterEach } from 'vitest'

import { installConsoleErrorGate } from './console-errors.js'

installConsoleErrorGate()

/**
 * `observing` is live targets, not a lifetime total, so a leak shows as a count
 * that does not come back down. On `globalThis` in case a second module
 * instance loads.
 */
interface Counts {
  made: number
  observing: number
  disconnects: number
}

const counts: Counts = ((
  globalThis as { willowformsObserverCounts?: Counts }
).willowformsObserverCounts ??= { made: 0, observing: 0, disconnects: 0 })

export const observerCount = (): Counts => ({ ...counts })

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)

  /*
   * jsdom has no `ResizeObserver`. Installed unconditionally: without layout a
   * real one never reports, and the stub counts so a test can see a leak.
   */
  globalThis.ResizeObserver = class implements ResizeObserver {
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
   * jsdom has no `scrollIntoView` and a kit may call it. Widened to optional so
   * the assignment is neither an unbound-method read nor a narrowing to `never`.
   */
  const elementProto = Element.prototype as { scrollIntoView?: Element['scrollIntoView'] }
  elementProto.scrollIntoView ??= function scrollIntoView(): void {}

  // jsdom has no modal dialogs: no top layer, focus trap, backdrop or inert page here.
  const dialogProto = HTMLDialogElement.prototype as {
    showModal?: () => void
    close?: () => void
  }
  dialogProto.showModal ??= function showModal(this: HTMLDialogElement): void {
    this.open = true
  }
  dialogProto.close ??= function close(this: HTMLDialogElement): void {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

/**
 * @vitest-environment jsdom
 */

/**
 * Tree keyboard navigation and the live region.
 *
 * The arithmetic behind the moves lives in keyboard.ts and is tested there.
 * What matters here is the wiring a keyboard user actually meets: one tab stop
 * for the whole tree, arrows that move focus, Alt with arrows that move the
 * component, and something said out loud when the document changes underneath
 * a focus that has not moved.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { FormDocument, Kit } from '@formsmith/core'
import { flatten } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'

function Box({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

const rendererKit: RendererKit = { id: 'fake', renderers: { Screen: Box, Stack: Box, Field: Box } }

const kit: Kit = {
  id: 'fake',
  label: 'Fake',
  components: [
    {
      type: 'Stack',
      label: 'Stack',
      group: 'layout',
      container: true,
      defaultProps: {},
      props: [],
      events: [],
    },
    {
      type: 'Field',
      label: 'Field',
      group: 'inputs',
      dataBound: true,
      dataType: 'string',
      defaultProps: {},
      props: [{ name: 'label', label: 'Label', editor: 'string' }],
      events: [],
    },
  ],
}

/**
 * root
 *   heading
 *   stack     (container)
 *     first
 *   footer
 */
function makeDocument(): FormDocument {
  return {
    version: '1',
    id: 'doc',
    name: 'Test form',
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'heading', type: 'Field', props: {} },
        {
          key: 'stack',
          type: 'Stack',
          props: {},
          children: [{ key: 'first', type: 'Field', props: {} }],
        },
        { key: 'footer', type: 'Field', props: {} },
      ],
    },
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  view: ReturnType<typeof render>
  latest: () => FormDocument
  row: (key: string) => HTMLElement
  focused: () => string | undefined
  live: () => string
  keys: () => string[]
}

function setup(): Harness {
  const user = userEvent.setup()
  let current = makeDocument()
  const view = render(
    <Designer
      initialDocument={current}
      kit={kit}
      rendererKit={rendererKit}
      onChange={(doc) => {
        current = doc
      }}
    />,
  )

  const row = (key: string): HTMLElement => {
    const element = view.container.querySelector<HTMLElement>(`[data-fs-row="${key}"]`)
    if (!element) throw new Error('no tree row for ' + key)
    return element
  }

  return {
    user,
    view,
    latest: () => current,
    row,
    focused: () =>
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset['fsRow']
        : undefined,
    live: () => {
      const region = view.container.querySelector('[aria-live="polite"]')
      return (region?.textContent ?? '').replace(new RegExp(String.fromCharCode(0x200b), 'g'), '')
    },
    keys: () =>
      Array.from(view.container.querySelectorAll('[data-fs-row]')).map(
        (el) => (el as HTMLElement).dataset['fsRow'] ?? '',
      ),
  }
}

/** The key of a node's parent in the current document. */
function parentOf(doc: FormDocument, key: string): string | undefined {
  return flatten(doc.root).find((r) => r.node.key === key)?.parentKey
}

/** The keys of a node's children, in order. */
function childrenOf(doc: FormDocument, key: string): string[] {
  const node = flatten(doc.root).find((r) => r.node.key === key)?.node
  return (node?.children ?? []).map((c) => c.key)
}

describe('tree keyboard navigation', () => {
  it('exposes exactly one tab stop for the whole tree', () => {
    const { view } = setup()
    const rows = Array.from(view.container.querySelectorAll('[data-fs-row]'))
    const stops = rows.filter((r) => r.getAttribute('tabindex') === '0')

    // Every row being a tab stop buries the rest of the page behind them.
    expect(stops).toHaveLength(1)
    expect((stops[0] as HTMLElement).dataset['fsRow']).toBe('root')
  })

  it('moves the tab stop to whatever is selected', async () => {
    const { user, row, view } = setup()

    await user.click(row('footer'))

    const stops = Array.from(view.container.querySelectorAll('[data-fs-row]')).filter(
      (r) => r.getAttribute('tabindex') === '0',
    )
    expect(stops).toHaveLength(1)
    expect((stops[0] as HTMLElement).dataset['fsRow']).toBe('footer')
  })

  it('walks down the flattened tree, stepping into containers', async () => {
    const { user, row, focused } = setup()

    row('root').focus()
    await user.keyboard('{ArrowDown}')
    expect(focused()).toBe('heading')
    await user.keyboard('{ArrowDown}')
    expect(focused()).toBe('stack')
    await user.keyboard('{ArrowDown}')
    expect(focused()).toBe('first')
    await user.keyboard('{ArrowDown}')
    expect(focused()).toBe('footer')
  })

  it('stops at the last row rather than wrapping', async () => {
    const { user, row, focused } = setup()

    row('footer').focus()
    await user.keyboard('{ArrowDown}')
    expect(focused()).toBe('footer')
  })

  it('steps right into the first child and left back out to the parent', async () => {
    const { user, row, focused } = setup()

    row('stack').focus()
    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('first')
    await user.keyboard('{ArrowLeft}')
    expect(focused()).toBe('stack')
  })

  it('jumps to the ends with Home and End', async () => {
    const { user, row, focused } = setup()

    row('stack').focus()
    await user.keyboard('{End}')
    expect(focused()).toBe('footer')
    await user.keyboard('{Home}')
    expect(focused()).toBe('root')
  })

  it('selects the row it moves to, so the panels follow', async () => {
    const { user, row } = setup()

    row('root').focus()
    await user.keyboard('{ArrowDown}')

    expect(row('heading').getAttribute('aria-selected')).toBe('true')
  })
})

describe('moving a component from the keyboard', () => {
  it('reorders among siblings with Alt and the arrows', async () => {
    const { user, row, keys } = setup()

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    expect(keys()).toEqual(['root', 'heading', 'footer', 'stack', 'first'])
  })

  it('moves into the container above it', async () => {
    const { user, row, latest } = setup()

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')

    // The flattened order is unchanged by this move, so parentage is the only
    // thing that shows it happened at all.
    expect(parentOf(latest(), 'footer')).toBe('stack')
    expect(childrenOf(latest(), 'stack')).toEqual(['first', 'footer'])
  })

  it('moves out one level, landing after the parent it left', async () => {
    const { user, row, latest } = setup()

    expect(parentOf(latest(), 'first')).toBe('stack')

    row('first').focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')

    expect(parentOf(latest(), 'first')).toBe('root')
    // Immediately after the stack it came out of, not at the end.
    expect(childrenOf(latest(), 'root')).toEqual(['heading', 'stack', 'first', 'footer'])
  })

  it('refuses an impossible move and says so rather than doing nothing', async () => {
    const { user, row, keys, live } = setup()

    row('heading').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    expect(keys()).toEqual(['root', 'heading', 'stack', 'first', 'footer'])
    expect(live()).toMatch(/cannot move/)
  })

  it('never moves the root', async () => {
    const { user, row, keys } = setup()

    row('root').focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    expect(keys()).toEqual(['root', 'heading', 'stack', 'first', 'footer'])
  })

  it('removes a component with Delete', async () => {
    const { user, row, keys, live } = setup()

    row('footer').focus()
    await user.keyboard('{Delete}')

    expect(keys()).not.toContain('footer')
    expect(live()).toMatch(/footer removed/)
  })
})

describe('the live region', () => {
  it('is a polite status region, hidden from sight', () => {
    const { view } = setup()
    const region = view.container.querySelector('[aria-live="polite"]')

    expect(region).not.toBeNull()
    expect(region?.getAttribute('role')).toBe('status')
    expect(region?.className).toContain('fs-visually-hidden')
  })

  it('announces a canvas selection, which moves no focus', async () => {
    const { user, view, live } = setup()

    const node = view.container.querySelector<HTMLElement>('[data-fs-key="heading"]')
    if (!node) throw new Error('no canvas node')
    await user.click(node)

    expect(live()).toMatch(/heading selected/)
  })

  it('says nothing extra for tree navigation, which is read on arrival', async () => {
    const { user, row, live } = setup()

    row('root').focus()
    await user.keyboard('{ArrowDown}')

    // Focus landed on the row, so the row is announced by the browser. A second
    // announcement here would say everything twice.
    expect(live()).toBe('')
  })

  it('announces a keyboard move', async () => {
    const { user, row, live } = setup()

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    expect(live()).toMatch(/footer moved up/)
  })

  it('repeats an identical announcement rather than falling silent', async () => {
    const { user, row, view } = setup()
    const region = (): string =>
      view.container.querySelector('[aria-live="polite"]')?.textContent ?? ''

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    const first = region()

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    // Identical text would not change the node, and an unchanged live region is
    // never read out. The second move must still be announced.
    expect(region()).not.toBe(first)
    expect(region().replace(new RegExp(String.fromCharCode(0x200b), 'g'), '')).toMatch(
      /footer moved up/,
    )
  })

  it('announces a palette addition', async () => {
    const { user, live } = setup()

    await user.click(screen.getByTitle('Add Field, or drag it onto the canvas'))

    expect(live()).toMatch(/Field added/)
  })
})

describe('landmarks and names', () => {
  it('gives every region an accessible name', () => {
    setup()

    expect(screen.getByRole('tree', { name: 'Form structure' })).toBeTruthy()
    expect(screen.getByRole('main', { name: 'Form canvas' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Components and structure' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Component properties' })).toBeTruthy()
  })

  it('names every button in the shell', () => {
    const { view } = setup()
    const unnamed = Array.from(view.container.querySelectorAll('button')).filter((button) => {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? ''
      return name.trim() === ''
    })

    // The teardown in docs/prior-art counted 30 unnamed buttons in the product
    // this project studied. Zero is the bar.
    expect(unnamed.map((b) => b.outerHTML)).toEqual([])
  })

  it('labels every form control in the shell', () => {
    const { view } = setup()
    const controls = Array.from(view.container.querySelectorAll('input, select, textarea'))

    const unlabelled = controls.filter((control) => {
      if (control.getAttribute('aria-label')) return false
      const id = control.getAttribute('id')
      if (id && view.container.querySelector(`label[for="${id}"]`)) return false
      return !control.closest('label')
    })

    expect(unlabelled.map((c) => c.outerHTML)).toEqual([])
  })
})

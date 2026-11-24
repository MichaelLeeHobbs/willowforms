/**
 * @vitest-environment jsdom
 */

// Move arithmetic is tested in keyboard.test.ts; this file tests the wiring.

import { readdirSync, readFileSync } from 'node:fs'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { FormDocument, Kit } from '@willowforms/core'
import { flatten } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

import { Designer } from '../Designer.js'
import { Tree } from './Tree.js'
import type { TreeProps } from './Tree.js'

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
        // Holds form data, so the Rules tab has controls to sweep.
        { key: 'footer', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      ],
    },
    actions: {},
    // `en-US`, as `createDocument` produces: without a dialect, a bundle keyed
    // by tag and one keyed by bare code are the same string.
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
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

  fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))

  const row = (key: string): HTMLElement => {
    const element = view.container.querySelector<HTMLElement>(`[data-fs-tree-row="${key}"]`)
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
        ? document.activeElement.dataset['fsTreeRow']
        : undefined,
    live: () => {
      const region = view.container.querySelector('[aria-live="polite"]')
      return (region?.textContent ?? '').replace(new RegExp(String.fromCharCode(0x200b), 'g'), '')
    },
    keys: () =>
      Array.from(view.container.querySelectorAll('[data-fs-tree-row]')).map(
        (el) => (el as HTMLElement).dataset['fsTreeRow'] ?? '',
      ),
  }
}

function parentOf(doc: FormDocument, key: string): string | undefined {
  return flatten(doc.root).find((r) => r.node.key === key)?.parentKey
}

function childrenOf(doc: FormDocument, key: string): string[] {
  const node = flatten(doc.root).find((r) => r.node.key === key)?.node
  return (node?.children ?? []).map((c) => c.key)
}

describe('tree keyboard navigation', () => {
  it('exposes exactly one tab stop for the whole tree', () => {
    const { view } = setup()
    const rows = Array.from(view.container.querySelectorAll('[data-fs-tree-row]'))
    const stops = rows.filter((r) => r.getAttribute('tabindex') === '0')

    // Every row being a tab stop buries the rest of the page behind them.
    expect(stops).toHaveLength(1)
    expect((stops[0] as HTMLElement).dataset['fsTreeRow']).toBe('root')
  })

  it('moves the tab stop to whatever is selected', async () => {
    const { user, row, view } = setup()

    await user.click(row('footer'))

    const stops = Array.from(view.container.querySelectorAll('[data-fs-tree-row]')).filter(
      (r) => r.getAttribute('tabindex') === '0',
    )
    expect(stops).toHaveLength(1)
    expect((stops[0] as HTMLElement).dataset['fsTreeRow']).toBe('footer')
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

  const nextFrame = async (): Promise<void> => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })
  }

  it('leaves focus on the next row after a delete', async () => {
    const { user, row, focused } = setup()

    row('stack').focus()
    await user.keyboard('{Delete}')
    await nextFrame()

    // `first` went with its parent, so the row after `stack` is `footer`.
    expect(focused()).toBe('footer')
  })

  it('falls back to the previous row when the last one is deleted', async () => {
    const { user, row, focused } = setup()

    row('footer').focus()
    await user.keyboard('{Delete}')
    await nextFrame()

    expect(focused()).toBe('first')
  })

  it('keeps focus somewhere in the tree, never on the body', async () => {
    const { user, row } = setup()

    row('heading').focus()
    await user.keyboard('{Delete}')
    await nextFrame()

    expect(document.activeElement).not.toBe(document.body)
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

    // An unchanged live region is never read out.
    expect(region()).not.toBe(first)
    expect(region().replace(new RegExp(String.fromCharCode(0x200b), 'g'), '')).toMatch(
      /footer moved up/,
    )
  })

  it('announces a palette addition', async () => {
    const { user, live } = setup()

    await user.click(screen.getByRole('tab', { name: 'Components' }))
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

  const STATES: [string, (harness: Harness) => Promise<void>][] = [
    ['at rest', (): Promise<void> => Promise.resolve()],
    [
      'with a component selected',
      async ({ user, row }) => {
        await user.click(row('heading'))
      },
    ],
    [
      'on the Style tab',
      async ({ user, row }) => {
        await user.click(row('heading'))
        await user.click(screen.getByRole('tab', { name: 'Style' }))
      },
    ],
    [
      'on the Rules tab, with a rule on the field',
      async ({ user, row }) => {
        await user.click(row('footer'))
        await user.click(screen.getByRole('tab', { name: 'Rules' }))
        await user.selectOptions(screen.getByLabelText('Add a rule'), 'pattern')
      },
    ],
    [
      'with a condition being edited',
      async ({ user, row }) => {
        await user.click(row('heading'))
        await user.selectOptions(screen.getByLabelText('Show when'), 'condition')
      },
    ],
    [
      'on the Settings tab',
      async ({ user }) => {
        await user.click(screen.getByRole('tab', { name: 'Settings' }))
      },
    ],
    [
      'with the palette open',
      async ({ user }) => {
        await user.click(screen.getByRole('tab', { name: 'Components' }))
      },
    ],
  ]

  it.each(STATES)('names every button in the shell, %s', async (_label, drive) => {
    const harness = setup()
    await drive(harness)

    const unnamed = Array.from(harness.view.container.querySelectorAll('button')).filter(
      (button) => {
        const name = button.getAttribute('aria-label') ?? button.textContent ?? ''
        return name.trim() === ''
      },
    )

    expect(unnamed.map((b) => b.outerHTML)).toEqual([])
  })

  const controlsIn = (harness: Harness): Element[] =>
    Array.from(harness.view.container.querySelectorAll('input, select, textarea'))

  // Unmounted before the state under test mounts: two designers make every
  // `screen` query ambiguous.
  const atRestCount = (): number => {
    const harness = setup()
    const count = controlsIn(harness).length
    harness.view.unmount()
    return count
  }

  it.each(STATES)('labels every form control in the shell, %s', async (label, drive) => {
    const atRest = atRestCount()

    const harness = setup()
    await drive(harness)

    const controls = controlsIn(harness)

    // A measured floor, not `> 0`: the toolbar renders a `<select>` in every
    // state.
    const floor = label === 'at rest' ? 0 : atRest
    expect(
      controls.length,
      'this state sweeps nothing it did not already have before the driver ran',
    ).toBeGreaterThan(floor)

    const unlabelled = controls.filter((control) => {
      if (control.getAttribute('aria-label')) return false
      const id = control.getAttribute('id')
      if (id && harness.view.container.querySelector(`label[for="${id}"]`)) return false
      return !control.closest('label')
    })

    expect(unlabelled.map((c) => c.outerHTML)).toEqual([])
  })
})

/**
 * Two kinds of row, two attribute names. `data-fs-row` is a repeater coordinate on the
 * canvas (`addresses[1]`), written by the renderer and part of the public
 * `NodeAttributes`. `data-fs-tree-row` is the key of a row in this panel.
 *
 * Under one name, the queries that find tree rows would also match canvas elements once
 * a document holds a repeater, and would measure a longer list without failing.
 */
describe('the tree rows and the canvas rows are told apart', () => {
  function withRepeater(): FormDocument {
    return {
      ...makeDocument(),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'addressList',
            dataKey: 'addresses',
            type: 'Stack',
            props: {},
            schema: { type: 'array', validations: [] },
            children: [
              {
                key: 'street',
                dataKey: 'line1',
                type: 'Field',
                props: {},
                schema: { type: 'string', validations: [] },
              },
            ],
          },
        ],
      },
    }
  }

  function renderBoth(): ReturnType<typeof render> {
    const view = render(
      <Designer
        initialDocument={withRepeater()}
        kit={kit}
        rendererKit={rendererKit}
        onChange={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))
    return view
  }

  it('puts both attributes in the DOM, so this is not measuring an empty page', () => {
    const view = renderBoth()

    expect(view.container.querySelectorAll('[data-fs-tree-row]').length).toBeGreaterThan(0)
    expect(view.container.querySelectorAll('[data-fs-row]').length).toBeGreaterThan(0)
  })

  it('never puts both on one element', () => {
    const view = renderBoth()

    const both = Array.from(view.container.querySelectorAll('[data-fs-row][data-fs-tree-row]'))
    expect(both).toEqual([])
  })

  it('is never written by the designer, which owns only the tree one', () => {
    // From the repository root: this file runs under jsdom, where
    // `import.meta.url` is not a file URL and cannot be resolved against.
    const src = process.cwd() + '/packages/designer/src/'
    const offenders: string[] = []

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = dir + entry.name
        if (entry.isDirectory()) {
          walk(path + '/')
          continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue
        // Source only: tests read the attribute to assert on it.
        if (/\.test\.tsx?$/.test(entry.name)) continue
        // Three write shapes: a JSX expression, a quoted literal, and an object
        // key about to be spread.
        const source = readFileSync(path, 'utf8')
        // `(?<!\[)` lets an attribute selector through: `geometry.ts` reads rows
        // it did not write.
        const writes =
          /(?<!\[)data-fs-row\s*=\s*[{'"`]/.test(source) || /['"`]data-fs-row['"`]\s*:/.test(source)
        if (writes) offenders.push(entry.name)
      }
    }
    walk(src)

    expect(offenders).toEqual([])
  })

  it('gives the canvas a coordinate and the tree a key', () => {
    const view = renderBoth()

    const canvas = Array.from(view.container.querySelectorAll('[data-fs-row]')).map((el) =>
      el.getAttribute('data-fs-row'),
    )
    const tree = Array.from(view.container.querySelectorAll('[data-fs-tree-row]')).map((el) =>
      el.getAttribute('data-fs-tree-row'),
    )

    expect(canvas).toContain('addresses[0]')
    expect(tree).toEqual(['root', 'addressList', 'street'])
    // The names cannot overlap: a coordinate always carries an index.
    expect(tree.filter((key) => canvas.includes(key))).toEqual([])
  })
})

/*
 * The 4px drag threshold is smaller than a trackpad right-click's wander, so an
 * armed right-press would move the component under its own context menu.
 */
describe('a right-press on a tree row', () => {
  it('does not arm a drag, so the tree is unchanged', () => {
    const harness = setup()
    const before = harness.keys()

    act(() => {
      fireEvent.pointerDown(harness.row('first'), { button: 2, clientX: 100, clientY: 100 })
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 140, clientY: 160, bubbles: true }),
      )
    })

    // The drag label, not the document: jsdom has no layout, so the drop
    // resolves nowhere either way.
    expect(
      harness.view.container.querySelector('.fs-drag-label'),
      'a right-press armed a drag',
    ).toBeNull()

    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 140, clientY: 160, bubbles: true }),
      )
    })
    expect(harness.keys()).toEqual(before)
  })

  it('still arms one for the primary button', () => {
    const harness = setup()

    act(() => {
      fireEvent.pointerDown(harness.row('first'), { button: 0, clientX: 100, clientY: 100 })
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 140, clientY: 160, bubbles: true }),
      )
    })

    expect(harness.view.container.querySelector('.fs-drag-label')).not.toBeNull()

    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 140, clientY: 160, bubbles: true }),
      )
    })
  })
})

/*
 * Backspace is a typo correction, and in some browsers the back gesture, so it
 * deletes only where nothing else can be meant.
 */
describe('Backspace and where it is aimed', () => {
  it('does not delete when focus is on a toolbar button', () => {
    const harness = setup()
    const before = harness.keys()

    fireEvent.click(harness.row('first'))
    const undo = screen.getByRole('button', { name: 'Undo' })
    act(() => {
      undo.focus()
    })
    fireEvent.keyDown(undo, { key: 'Backspace', bubbles: true })

    expect(harness.keys(), 'Backspace on a toolbar button deleted a component').toEqual(before)
  })

  it('still deletes from a tree row, where it can only mean one thing', () => {
    const harness = setup()

    const row = harness.row('first')
    act(() => {
      row.focus()
    })
    fireEvent.keyDown(row, { key: 'Backspace', bubbles: true })

    expect(harness.keys()).not.toContain('first')
  })

  it('still deletes with Delete from a toolbar button', () => {
    const harness = setup()

    fireEvent.click(harness.row('first'))
    const undo = screen.getByRole('button', { name: 'Undo' })
    act(() => {
      undo.focus()
    })
    fireEvent.keyDown(undo, { key: 'Delete', bubbles: true })

    expect(harness.keys()).not.toContain('first')
  })
})

describe('what a row promises the keyboard', () => {
  it('marks every row that has children as expanded', async () => {
    const { user, view } = setup()
    await user.click(screen.getByRole('tab', { name: 'Tree' }))

    const rows = [...view.container.querySelectorAll('[data-fs-tree-row]')]
    expect(rows.length, 'no rows were drawn, so this proves nothing').toBeGreaterThan(1)

    const withChildren = rows.filter((row) => row.getAttribute('aria-expanded') !== null)
    expect(withChildren.length, 'no row claims to be expandable at all').toBeGreaterThan(0)

    const collapsed = withChildren
      .filter((row) => row.getAttribute('aria-expanded') !== 'true')
      .map((row) => row.getAttribute('data-fs-tree-row'))

    expect(collapsed, 'these rows say they are collapsed and nothing can open them').toEqual([])
  })

  it('does not claim expandability on a row with no children', async () => {
    const { user, view } = setup()
    await user.click(screen.getByRole('tab', { name: 'Tree' }))

    const leaf = view.container.querySelector('[data-fs-tree-row="heading"]')
    expect(leaf, 'the fixture has no heading row').not.toBeNull()
    expect(leaf?.getAttribute('aria-expanded')).toBeNull()
  })
})

describe('a keyboard move the tree refuses', () => {
  // Driven against `Tree`, not `Designer`: a refusal through the whole builder
  // needs a kit whose container flag disagrees with the node.
  function drawTree(onMove: (key: string, parentKey: string, index: number) => boolean): {
    user: ReturnType<typeof userEvent.setup>
    row: (key: string) => HTMLElement
    said: string[]
  } {
    const said: string[] = []
    const user = userEvent.setup()
    const view = render(
      <Tree
        root={makeDocument().root}
        kit={kit}
        selectedKey={undefined}
        onSelect={() => undefined}
        onRemove={() => undefined}
        onMove={onMove}
        onDuplicate={() => undefined}
        announce={(message) => said.push(message)}
        drag={
          {
            begin: () => undefined,
            state: undefined,
            registerZone: () => () => undefined,
          } as unknown as TreeProps['drag']
        }
      />,
    )

    return {
      user,
      row: (key) => {
        const element = view.container.querySelector<HTMLElement>(`[data-fs-tree-row="${key}"]`)
        if (!element) throw new Error('no tree row for ' + key)
        return element
      },
      said,
    }
  }

  it('says it cannot move rather than announcing a move that did not happen', async () => {
    const { user, row, said } = drawTree(() => false)

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    expect(said, 'nothing was announced at all').not.toEqual([])
    expect(said.join(' ')).not.toMatch(/footer moved/)
    expect(said.join(' ')).toMatch(/cannot move/)
  })

  it('still announces a move that does happen', async () => {
    const { user, row, said } = drawTree(() => true)

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    expect(said.join(' ')).toMatch(/footer moved up/)
  })

  it('asks before it announces, with the target the keyboard chose', async () => {
    const asked: [string, string, number][] = []
    const { user, row } = drawTree((key, parentKey, index) => {
      asked.push([key, parentKey, index])
      return true
    })

    row('footer').focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')

    expect(asked).toHaveLength(1)
    expect(asked[0]?.[0]).toBe('footer')
  })
})

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

import { readdirSync, readFileSync } from 'node:fs'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
 *   footer    (holds form data)
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
        /*
         * `footer` holds form data, so the Rules tab has something to build
         * controls from. Without a schema anywhere in this fixture, the "on the
         * Rules tab" state below swept a panel showing one sentence and no
         * controls at all -- the state named in the label never existed.
         */
        { key: 'footer', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      ],
    },
    actions: {},
    // `en-US`, which is what `createDocument` produces. A dialect-free
    // fixture makes a bundle keyed by tag and one keyed by bare code the
    // same string, which is Trap 5 in the write-tests skill and the shape
    // that made the language filter green here and broken for real
    // documents.
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

  // The structure tree is behind a tab in the left pane. Opened here so every
  // test starts where it used to, rather than repeating the click in each.
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

  /**
   * Where focus lands after a delete, which is the half nothing checked.
   *
   * `Tree.tsx` measures the neighbouring row *before* the removal and focuses
   * it in a frame, and its comment says why: deleting from the keyboard used to
   * drop focus onto `document.body`, so every subsequent arrow key went
   * nowhere and the tree had to be tabbed back into. The test above asserts the
   * document and the announcement, and `e2e/keyboard.spec.ts` asserts the same
   * two, so deleting the restoration was caught by nothing in either suite.
   */
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
    /*
     * The claim in the source, stated as itself. A restoration that focused the
     * wrong row would still be better than this, and this is what shipped.
     */
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

    // Back to the palette: setup() opens the Tree tab, which most tests want.
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

  /*
   * Both sweeps below used to run against one state: the Tree tab, with nothing
   * selected. That is the toolbar and five rows, and it is not where controls
   * come from -- the Style tab has seven inputs, the condition editor has a
   * select and a Remove button per row, and the Rules tab builds its controls
   * from whatever rule was added. None of them was ever swept.
   *
   * So each state is driven, then swept. The drivers are ordinary interactions
   * rather than fixtures, because a panel that renders nothing would otherwise
   * pass every sweep in this file.
   */
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
        /*
         * `footer`, which holds form data, and a rule actually added.
         *
         * This drove `heading`, which has no schema, so the Rules panel showed
         * one sentence and no controls -- the state in the label never existed,
         * and the rule editors it claims to sweep were never rendered. The
         * comment above says the tab "builds its controls from whatever rule was
         * added", so a state that adds none is a state with nothing to sweep.
         */
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

    // The study in docs/prior-art counted 30 unnamed buttons in the product
    // this project studied. Zero is the bar.
    expect(unnamed.map((b) => b.outerHTML)).toEqual([])
  })

  /** Every form control the shell is currently rendering. */
  const controlsIn = (harness: Harness): Element[] =>
    Array.from(harness.view.container.querySelectorAll('input, select, textarea'))

  /**
   * How many controls the shell renders having done nothing.
   *
   * Measured with its own mount, taken down again before the state under test
   * is driven: two designers in one document make every `screen` query
   * ambiguous, and the drivers all use `screen`.
   */
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

    /*
     * More than the toolbar, for a state that claims to have opened something.
     *
     * The guard here was `controls.length > 0`, which cannot fail: the toolbar
     * renders the theme `<select>` in every state, whatever the driver did or
     * did not do. It reported green for a driver that navigated nowhere, which
     * is the shape it was written to prevent -- and it was: the Rules state
     * above rendered no controls at all and this said the sweep was fine.
     *
     * The baseline is measured rather than written down, so a control moving
     * into or out of the toolbar does not turn this into a wrong number.
     */
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
 * Two kinds of row, two attribute names.
 *
 * `data-fs-tree-row` meant two different things in one DOM. On the canvas it is a
 * repeater coordinate — `addresses[1]`, written by the renderer and part of the
 * public `NodeAttributes` — and in this panel it was the key of a list row.
 * Neither name was wrong on its own; having one name was.
 *
 * The collision is not theoretical. `[data-fs-tree-row][tabindex="0"]` is how the
 * keyboard specs find the focused tree row, and `Canvas.test.tsx` reads
 * `[data-fs-tree-row]` specifically to get the tree's projection rather than the
 * canvas's — a distinction Trap 9 exists for. Both start matching canvas
 * elements the moment a document holds a repeater, and neither would fail
 * loudly: they would silently be measuring a longer list.
 *
 * The renderer keeps the name. It is the published one, it is in the type a kit
 * spreads, and there "row" means an actual row of data. The panel's rows are
 * rows of a list, which is a different word wearing the same spelling.
 */
describe('the tree rows and the canvas rows are told apart', () => {
  /** A document with a repeater, so both attributes are in the DOM at once. */
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
    /*
     * The runtime check above needs a repeater in the fixture to see anything.
     * This one needs nothing: `data-fs-row` belongs to the renderer and is part
     * of the `NodeAttributes` a kit spreads, so the designer must never *write*
     * one — a second author of the same attribute is how it came to mean two
     * things in the first place.
     *
     * Reading one is a different matter and is now how the selection frame finds
     * the row an author clicked in, so the check is for a JSX attribute rather
     * than for any mention of the name.
     */
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
        /*
         * Source only. A test reads the attribute to assert on it -- that is
         * this file doing its job, not a second author writing it -- and the
         * widened pattern below matches a quoted string, so without this the
         * guard reports its own suite.
         */
        if (/\.test\.tsx?$/.test(entry.name)) continue
        /*
         * `data-fs-row` and nothing longer: `data-fs-tree-row` is this panel's.
         *
         * Any spelling of the attribute, not only a JSX expression. This
         * matched `/data-fs-row=\{/`, so it saw `data-fs-row={...}` and nothing
         * else -- a string literal `data-fs-row="addresses[0]"` passed it, and
         * so did the attribute arriving through a spread, while re-introducing
         * the two-authors-of-one-attribute collision this whole describe is
         * about.
         *
         * Three shapes now: the JSX expression, a quoted literal, and a
         * property named in an object that is about to be spread.
         */
        const source = readFileSync(path, 'utf8')
        /*
         * A write, not a read. `(?<!\[)` excludes an attribute *selector* --
         * `[data-fs-row="..."]` -- which is how `geometry.ts` legitimately
         * finds a row it did not write. Everything else that assigns the
         * attribute is a second author for it.
         */
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

    // The canvas says which row of which answer. The tree says which node.
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

/**
 * The button a tree row's drag is armed by.
 *
 * `Canvas.tsx` and `Palette.tsx` both guard `event.button !== 0`, and both carry
 * a comment saying why: a right-press and a small movement relocated the
 * component under its own context menu -- the menu opens, the component has
 * already moved, and nothing about the gesture said it would. The tree armed a
 * drag for any button at all. Three call sites, two comments, one missing guard.
 *
 * Four pixels is all it takes. The threshold that separates a click from a drag
 * is smaller than the wander of a trackpad right-click.
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

    /*
     * The drag label, not the document. jsdom has no layout engine, so a drop
     * resolves nowhere and the tree is unchanged whether or not the gesture was
     * armed -- trap 6, and the first version of this test asserted exactly that
     * and proved nothing. The label is rendered from `drag.state`, which is what
     * says the controller took the gesture.
     */
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
    /*
     * The control. A guard that refused every button would make the tree
     * undraggable, which is the only thing rows are dragged for -- and jsdom has
     * no layout, so the drop resolves nowhere and the document is unchanged
     * either way. What is asserted is that the gesture reached the controller at
     * all, which the drag label shows.
     */
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

/**
 * Backspace is not Delete.
 *
 * Delete is unambiguous. Backspace is what somebody presses expecting to correct
 * a typo, and in some browser settings it is the back gesture -- and this fired
 * whenever focus was on *any* chrome button. Tabbing to Undo and pressing
 * Backspace deleted the selected component: a destructive edit from a key nobody
 * aimed at the canvas.
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
    // The control, and the gesture this shortcut exists for. A tree row takes no
    // text and is about the selection, so Backspace there is unambiguous.
    const harness = setup()

    const row = harness.row('first')
    act(() => {
      row.focus()
    })
    fireEvent.keyDown(row, { key: 'Backspace', bubbles: true })

    expect(harness.keys()).not.toContain('first')
  })

  it('still deletes with Delete from a toolbar button', () => {
    // The other control: only Backspace is ambiguous, and only Backspace is
    // narrowed.
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
  /*
   * `aria-expanded` is asserted nowhere, though `keyboard.ts:38-53` states that
   * Right stepping into the first child depends on every node being expanded
   * and names this attribute as "the other half of this promise".
   *
   * A tree that never collapses has to say so, or a screen-reader user is told
   * a row might be closed and given no way to open it.
   */
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
    /*
     * The other half: `aria-expanded` on a leaf tells a screen reader there is
     * something to open, and there is not.
     */
    const { user, view } = setup()
    await user.click(screen.getByRole('tab', { name: 'Tree' }))

    const leaf = view.container.querySelector('[data-fs-tree-row="heading"]')
    expect(leaf, 'the fixture has no heading row').not.toBeNull()
    expect(leaf?.getAttribute('aria-expanded')).toBeNull()
  })
})

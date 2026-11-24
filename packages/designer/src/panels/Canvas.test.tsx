/**
 * @vitest-environment jsdom
 */

/**
 * A minimal fake kit, not kit-mui: the designer must not depend on a component
 * library. The kit's one obligation is spreading `nodeProps` onto a root element.
 *
 * No geometry here: jsdom returns zero rectangles.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, PropValue } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

import { observerCount } from '../../../../test/setup.js'
import { Designer } from '../Designer.js'

const staticProp = (value: string): PropValue => ({ kind: 'static', value })

// Field commits: the only way to see a render whose output did not change.
let fieldRenders = 0

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

function Field({ nodeProps, props, value, error, onChange }: NodeRendererProps): ReactNode {
  // Counted on commit, since render must stay pure. A subtree React skips
  // never commits, so this still counts renders.
  useEffect(() => {
    fieldRenders += 1
  })
  const label = typeof props['label'] === 'string' ? props['label'] : ''
  // A wrapper with the input nested inside it, so a click lands on a descendant
  // of the element carrying data-fs-key rather than on the element itself.
  return (
    <div {...nodeProps}>
      <label>
        {label}
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {/* Displaying the error is a kit obligation, so the fake does it too. */}
      <span data-testid={nodeProps['data-fs-key'] + '-error'}>{error ?? ''}</span>
    </div>
  )
}

/** Deliberately drops nodeProps, to pin down what a non-conforming kit costs. */
function Silent({ props }: NodeRendererProps): ReactNode {
  return <div>{typeof props['label'] === 'string' ? props['label'] : ''}</div>
}

const rendererKit: RendererKit = {
  id: 'fake',
  renderers: { Screen: Screen_, Field, Silent },
}

const kit: Kit = {
  id: 'fake',
  label: 'Fake',
  components: [
    {
      type: 'Field',
      label: 'Field',
      group: 'inputs',
      dataBound: true,
      dataType: 'string',
      defaultProps: { label: 'Field' },
      props: [{ name: 'label', label: 'Label', editor: 'string' }],
      events: [],
    },
    /*
     * The root's type. `measureNow` asks the kit whether a candidate is a
     * container, so without this entry no drop could land. `root: true` keeps it
     * out of the palette.
     */
    {
      type: 'Screen',
      label: 'Screen',
      group: 'layout',
      container: true,
      root: true,
      defaultProps: {},
      props: [],
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
        { key: 'first', type: 'Field', props: { label: staticProp('First') } },
        { key: 'second', type: 'Field', props: { label: staticProp('Second') } },
        { key: 'quiet', type: 'Silent', props: { label: staticProp('Quiet') } },
      ],
    },
    actions: {},
    // `en-US`, as `createDocument` makes. Without a dialect, a bundle keyed by
    // tag and one keyed by bare code would be the same string.
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  }
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  view: ReturnType<typeof render>
  node: (key: string) => HTMLElement
  frame: () => HTMLElement | null
  hoverFrame: () => HTMLElement | null
  /** Keys of the root's children, in document order. */
  keys: () => string[]
  renders: () => number
}

function setup(): Harness {
  const user = userEvent.setup()
  fieldRenders = 0
  const view = render(
    <Designer initialDocument={makeDocument()} kit={kit} rendererKit={rendererKit} />,
  )

  fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))
  const node = (key: string): HTMLElement => {
    const el = view.container.querySelector<HTMLElement>(`[data-fs-key="${key}"]`)
    if (!el) throw new Error(`no rendered node for key ${key}`)
    return el
  }
  const frame = (): HTMLElement | null => view.container.querySelector('.fs-selection--active')
  const hoverFrame = (): HTMLElement | null => view.container.querySelector('.fs-selection--hover')
  /*
   * Reads the tree, and makes sure it is showing first. It has to be the tree
   * rather than the canvas: a node hidden by `renderWhen` is a row here and no
   * element there, so the two lists are not the same list.
   */
  const keys = (): string[] => {
    fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))
    return Array.from(view.container.querySelectorAll('[data-fs-tree-row]'))
      .map((el) => (el as HTMLElement).dataset['fsTreeRow'])
      .filter((key): key is string => Boolean(key) && key !== 'root')
  }
  return { user, view, node, frame, hoverFrame, keys, renders: () => fieldRenders }
}

describe('canvas selection', () => {
  it('selects the component that was clicked', async () => {
    const { user, node, frame } = setup()

    await user.click(node('second'))

    expect(frame()).not.toBeNull()
    expect(frame()?.textContent).toBe('Field')
    // The properties panel is the observable proof that the store selection moved.
    expect(screen.getByDisplayValue('Second')).toBeTruthy()
  })

  it('walks up from a nested element to the component that owns it', async () => {
    const { user, node, frame } = setup()

    const input = node('first').querySelector('input')
    expect(input).not.toBeNull()
    await user.click(input as HTMLElement)

    expect(frame()).not.toBeNull()
    expect(screen.getByDisplayValue('First')).toBeTruthy()
  })

  it('does not let a design-mode click reach the kit component', async () => {
    const { user, node } = setup()

    const input = node('first').querySelector('input') as HTMLInputElement
    await user.click(input)
    await user.keyboard('typed')

    expect(document.activeElement).not.toBe(input)
    expect(input.value).toBe('')
  })

  it('deselects when the click misses every component', async () => {
    const { user, view, node, frame } = setup()

    await user.click(node('first'))
    expect(frame()).not.toBeNull()

    const surface = view.container.querySelector('.fs-canvas__surface') as HTMLElement
    await user.click(surface)

    expect(frame()).toBeNull()
  })

  it('selects the nearest ancestor when a kit drops nodeProps', async () => {
    const { user, view, node, frame } = setup()

    expect(view.container.querySelector('[data-fs-key="quiet"]')).toBeNull()

    await user.click(screen.getByText('Quiet'))

    expect(frame()?.textContent).toBe('Screen')
    expect(node('root')).toBeTruthy()
  })

  it('draws a hover frame for the component under the pointer', async () => {
    const { user, node, hoverFrame } = setup()

    expect(hoverFrame()).toBeNull()
    await user.hover(node('second'))
    expect(hoverFrame()).not.toBeNull()
  })

  it('drops the hover frame once it is also the selection', async () => {
    const { user, node, hoverFrame } = setup()

    await user.hover(node('second'))
    expect(hoverFrame()).not.toBeNull()

    await user.click(node('second'))
    expect(hoverFrame()).toBeNull()
  })

  it('clears the selection on Escape', async () => {
    const { user, node, frame } = setup()

    await user.click(node('first'))
    expect(frame()).not.toBeNull()

    await user.keyboard('{Escape}')

    expect(frame()).toBeNull()
  })

  it('hands events back to the form in preview mode', async () => {
    const { user, view, node, frame } = setup()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    const input = node('first').querySelector('input') as HTMLInputElement
    await user.click(input)
    await user.keyboard('hello')

    expect(input.value).toBe('hello')
    expect(frame()).toBeNull()
    expect(view.container.querySelector('.fs-selection')).toBeNull()
  })
})

/** Wiring only: drop arithmetic needs real rectangles and is tested in dnd.test.ts. */
describe('drag and drop wiring', () => {
  it('treats a press without movement as a click, not a drag', async () => {
    const { user, node, frame } = setup()

    await user.click(node('second'))

    expect(frame()).not.toBeNull()
    expect(screen.getByDisplayValue('Second')).toBeTruthy()
  })

  it('swallows the click that ends a real drag', async () => {
    const { user, node, frame, keys } = setup()

    const from = node('first')
    await user.pointer([
      { target: from, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } },
      { target: from, coords: { clientX: 90, clientY: 200 } },
      { target: from, keys: '[/MouseLeft]', coords: { clientX: 90, clientY: 200 } },
    ])

    // jsdom rectangles are zero, so no drop resolves and nothing moves.
    expect(frame()).toBeNull()
    expect(keys()).toEqual(['first', 'second', 'quiet'])
  })

  it('leaves the document alone when a drag lands nowhere', async () => {
    /*
     * jsdom rectangles are zero, so an unchanged document proves nothing alone;
     * this asserts the drag armed and was released. The off-canvas release
     * itself is checked in `e2e/authoring.spec.ts`.
     */
    const { user, view, keys } = setup()
    await user.click(screen.getByRole('tab', { name: 'Components' }))

    const paletteItem = screen.getByTitle('Add Field, or drag it onto the canvas')
    await user.pointer([
      { target: paletteItem, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } },
      { target: view.container, coords: { clientX: 500, clientY: 500 } },
    ])

    expect(
      view.container.querySelector('.fs-drag-label'),
      'the drag never armed, so the release below lands nowhere for the wrong reason',
    ).not.toBeNull()

    await user.pointer([
      { target: view.container, keys: '[/MouseLeft]', coords: { clientX: 500, clientY: 500 } },
    ])

    expect(view.container.querySelector('.fs-drag-label')).toBeNull()
    expect(keys()).toEqual(['first', 'second', 'quiet'])
  })

  it('still adds from the palette on a plain click', async () => {
    const { user, keys } = setup()

    await user.click(screen.getByRole('tab', { name: 'Components' }))
    await user.click(screen.getByTitle('Add Field, or drag it onto the canvas'))

    expect(keys()).toHaveLength(4)
  })

  it('shows a label that follows the pointer while dragging', async () => {
    const { user, view, node } = setup()

    expect(view.container.querySelector('.fs-drag-label')).toBeNull()

    const from = node('first')
    await user.pointer([
      { target: from, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } },
      { target: from, coords: { clientX: 90, clientY: 200 } },
    ])

    const label = view.container.querySelector<HTMLElement>('.fs-drag-label')
    expect(label?.textContent).toBe('first')
    expect(label?.style.left).toBe('90px')
    expect(label?.style.top).toBe('200px')

    await user.pointer([{ target: from, coords: { clientX: 140, clientY: 260 } }])
    const moved = view.container.querySelector<HTMLElement>('.fs-drag-label')
    expect(moved?.style.left).toBe('140px')
    expect(moved?.style.top).toBe('260px')

    await user.pointer([{ target: from, keys: '[/MouseLeft]' }])
    expect(view.container.querySelector('.fs-drag-label')).toBeNull()
  })

  it('abandons a drag on Escape', async () => {
    const { user, view, node, keys } = setup()

    const from = node('first')
    await user.pointer([
      { target: from, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } },
      { target: from, coords: { clientX: 90, clientY: 200 } },
    ])
    expect(view.container.querySelector('.fs-drag-label')).not.toBeNull()

    await user.keyboard('{Escape}')

    expect(view.container.querySelector('.fs-drag-label')).toBeNull()
    expect(keys()).toEqual(['first', 'second', 'quiet'])
  })
})

describe('release handling', () => {
  it('does not throw when a release arrives before any indicator is drawn', async () => {
    const { user, node, keys } = setup()

    const from = node('first')
    // Down, one move past the threshold, straight up. No frame in between.
    await user.pointer([
      { target: from, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } },
      { target: from, coords: { clientX: 40, clientY: 40 } },
      { target: from, keys: '[/MouseLeft]', coords: { clientX: 40, clientY: 40 } },
    ])

    expect(keys()).toEqual(['first', 'second', 'quiet'])
  })

  it('keeps working across consecutive drags', async () => {
    const { user, view, node } = setup()

    for (const key of ['first', 'second']) {
      const from = node(key)
      await user.pointer([
        { target: from, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } },
        { target: from, coords: { clientX: 60, clientY: 120 } },
      ])
      expect(view.container.querySelector('.fs-drag-label')?.textContent).toBe(key)
      await user.pointer([{ target: from, keys: '[/MouseLeft]' }])
      expect(view.container.querySelector('.fs-drag-label')).toBeNull()
    }
  })
})

describe('a component a condition hides', () => {
  const conditional = (): FormDocument => {
    const doc = makeDocument()
    doc.root.children![1]!.renderWhen = {
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'consent' } },
    }
    return doc
  }

  const open = (): ReturnType<typeof render> =>
    render(<Designer initialDocument={conditional()} kit={kit} rendererKit={rendererKit} />)

  it('is on the canvas while editing, so it can be seen and arranged', () => {
    const view = open()
    const element = view.container.querySelector('[data-fs-key="second"]')

    expect(element).not.toBeNull()
    expect(element?.getAttribute('data-fs-hidden')).toBe('true')
  })

  it('is selectable on the canvas, not only through the tree', async () => {
    const user = userEvent.setup()
    const view = open()
    const element = view.container.querySelector<HTMLElement>('[data-fs-key="second"]')

    await user.click(element!)

    expect(view.container.querySelector('.fs-selection--active')).not.toBeNull()
    // The properties panel is the observable proof that the store selection moved.
    expect(screen.getByDisplayValue('Second')).toBeTruthy()
  })

  it('leaves the canvas in preview, which is what a user would see', () => {
    const view = open()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    expect(view.container.querySelector('[data-fs-key="second"]')).toBeNull()
    expect(view.container.querySelector('[data-fs-key="first"]')).not.toBeNull()
  })

  describe('the preview data and error dumps', () => {
    /*
     * The dumps scroll (`designer.css`), so they need a tab stop. axe's
     * `scrollable-region-focusable` is off in `test/a11y.test.tsx` for want of
     * layout, so the attribute is asserted directly.
     */
    it('are focusable, so a keyboard can scroll them', () => {
      const view = open()
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
      fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }))

      const dumps = [...view.container.querySelectorAll('.fs-canvas__data pre')]
      expect(dumps.length, 'preview rendered no dumps, so this asserts nothing').toBe(2)

      for (const dump of dumps) {
        expect(dump.getAttribute('tabindex'), dump.getAttribute('aria-label') ?? '').toBe('0')
      }
    })

    it('say what they are when focus lands on them', () => {
      const view = open()
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
      fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }))

      const named = [...view.container.querySelectorAll('.fs-canvas__data pre')].map((dump) =>
        dump.getAttribute('aria-label'),
      )

      expect(named).toEqual(['Data', 'Errors'])
    })
  })

  it('marks only the component the condition hides', () => {
    const view = open()

    expect(
      view.container.querySelector('[data-fs-key="first"]')?.hasAttribute('data-fs-hidden'),
    ).toBe(false)
  })
})

describe('a document with steps', () => {
  const stepped = (): FormDocument => {
    const doc = makeDocument()
    const step = (name: string, child: ComponentNode): ComponentNode => ({
      key: 'step-' + name,
      type: 'Screen',
      props: {},
      renderWhen: {
        kind: 'condition',
        condition: {
          op: 'eq',
          left: { kind: 'context', path: 'step' },
          right: { kind: 'literal', value: name },
        },
      },
      children: [child],
    })
    doc.root.children = [
      step('one', {
        key: 'first',
        type: 'Field',
        props: { label: staticProp('First') },
        schema: { type: 'string', validations: [{ key: 'required' }] },
      }),
      step('two', { key: 'second', type: 'Field', props: { label: staticProp('Second') } }),
    ]
    return doc
  }

  const open = (): ReturnType<typeof render> =>
    render(<Designer initialDocument={stepped()} kit={kit} rendererKit={rendererKit} />)

  it('offers a switcher naming the steps the document declares', () => {
    open()
    const select = screen.getByLabelText('Step')

    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['one', 'two'])
  })

  it('shows no switcher for a form that declares no steps', () => {
    render(<Designer initialDocument={makeDocument()} kit={kit} rendererKit={rendererKit} />)

    expect(screen.queryByLabelText('Step')).toBeNull()
  })

  it('previews the chosen step, which needs the canvas to supply the context', async () => {
    const user = userEvent.setup()
    const view = open()

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(view.container.querySelector('[data-fs-key="step-one"]')).not.toBeNull()
    expect(view.container.querySelector('[data-fs-key="step-two"]')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Step'), JSON.stringify('two'))

    expect(view.container.querySelector('[data-fs-key="step-two"]')).not.toBeNull()
    expect(view.container.querySelector('[data-fs-key="step-one"]')).toBeNull()
  })

  it('validates the step preview is showing, rather than treating it as hidden', async () => {
    const user = userEvent.setup()
    const view = open()

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(view.container.querySelector('[data-fs-key="first"]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Validate' }))

    expect(view.container.querySelector('[data-testid="first-error"]')?.textContent).toBe(
      'This field is required.',
    )
  })

  it('shows every step while editing, so all of them can be arranged', () => {
    const view = open()

    expect(view.container.querySelector('[data-fs-key="step-two"]')).not.toBeNull()
    expect(
      view.container.querySelector('[data-fs-key="step-two"]')?.getAttribute('data-fs-hidden'),
    ).toBe('true')
  })
})

/**
 * The canvas re-renders on every pointer move of a drag; the form must not. The
 * boundary is element identity: the canvas reuses its `<FormRenderer>` element.
 */
describe('a drag over the canvas', () => {
  it('does not re-render the components under it', async () => {
    const { user, view, renders } = setup()

    const target = view.container.querySelector<HTMLElement>('[data-fs-key="first"]')
    if (!target) throw new Error('no component on the canvas')

    await user.pointer({ target, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } })
    const before = renders()

    // `pointerId: 1` is the mouse `user.pointer` pressed (`fireEvent` defaults to
    // 0), and `useDrag` ignores moves from any other pointer.
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 60, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 80, clientY: 80, pointerId: 1 })

    expect(
      view.container.querySelector('.fs-drag-label'),
      'no drag armed, so this counted the renders of a canvas doing nothing',
    ).not.toBeNull()

    expect(renders()).toBe(before)

    fireEvent.pointerUp(window, { clientX: 80, clientY: 80, pointerId: 1 })
  })

  it('still re-renders them when the document changes', async () => {
    const { user, renders } = setup()
    const before = renders()

    await user.click(screen.getByRole('button', { name: 'Remove quiet' }))

    expect(renders()).toBeGreaterThan(before)
  })

  it('still re-renders them when a canvas prop changes', async () => {
    // Preview flips `revealHidden`, which the renderer reads.
    const { user, renders } = setup()
    const before = renders()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(renders()).toBeGreaterThan(before)
  })
})

describe('typing into a kit component while arranging the form', () => {
  /*
   * Focused directly, as Tab would: a click never reaches `onKeyDownCapture`,
   * because `onMouseDownCapture` cancels the focus the click would give.
   */
  it('does not reach the kit input when focus is already inside it', async () => {
    const { user, node } = setup()

    const input = node('first').querySelector('input') as HTMLInputElement
    input.focus()

    expect(document.activeElement, 'focus never entered the input, so this proves nothing').toBe(
      input,
    )

    await user.keyboard('typed')

    expect(input.value).toBe('')
  })

  it('still lets Tab move focus out of the component', async () => {
    // Tab, not Escape: the shell ignores keys from a text field, so Escape could
    // not tell a passed key from a swallowed one.
    const { user, node } = setup()

    const input = node('first').querySelector('input') as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)

    await user.keyboard('{Tab}')

    expect(document.activeElement, 'Tab was swallowed by the canvas').not.toBe(input)
  })

  it('hands typing back in preview mode', async () => {
    const { user, node } = setup()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    const input = node('first').querySelector('input') as HTMLInputElement
    await user.click(input)
    await user.keyboard('typed')

    expect(input.value).toBe('typed')
  })
})

describe('a press that is not the primary button', () => {
  it('does not arm a drag on a right-press', () => {
    const { view, node } = setup()

    fireEvent.pointerDown(node('first'), { button: 2, clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 14, clientY: 60, pointerId: 1 })

    // Before the release, which removes the label whether or not a drag armed.
    expect(view.container.querySelector('.fs-drag-label'), 'a drag was armed').toBeNull()

    fireEvent.pointerUp(window, { clientX: 14, clientY: 60, pointerId: 1 })
  })

  it('still arms one on the primary button', () => {
    const { view, node } = setup()

    fireEvent.pointerDown(node('first'), { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 14, clientY: 60, pointerId: 1 })

    expect(view.container.querySelector('.fs-drag-label')).not.toBeNull()

    fireEvent.pointerUp(window, { clientX: 14, clientY: 60, pointerId: 1 })
  })
})

/**
 * `test/setup.ts` stubs `ResizeObserver` and counts its calls. The counters are
 * per process, so these assert deltas.
 */
describe('the selection layer and the elements it watches', () => {
  it('observes the shell, surface, form root, and resizable panes as soon as it mounts', () => {
    const before = observerCount()
    setup()
    const after = observerCount()

    expect(after.made - before.made, 'observers built on mount').toBe(4)
    expect(after.observing - before.observing, 'elements watched on mount').toBe(7)
  })

  it('does not rebuild the observer while the pointer sweeps across components', async () => {
    const { user, node } = setup()
    const before = observerCount()

    await user.hover(node('first'))
    await user.hover(node('second'))
    await user.hover(node('first'))
    await user.click(node('second'))

    expect(observerCount().made - before.made, 'observers rebuilt by hovering').toBe(0)
  })

  it('lets go of every element it watched when the canvas goes away', () => {
    const before = observerCount()
    const { view } = setup()
    view.unmount()
    const after = observerCount()

    expect(after.disconnects - before.disconnects, 'observers disconnected').toBe(4)
    expect(after.observing - before.observing, 'elements still watched after unmount').toBe(0)
  })
})

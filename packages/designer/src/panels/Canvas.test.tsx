/**
 * @vitest-environment jsdom
 */

/**
 * Canvas selection.
 *
 * The kit here is a deliberately minimal fake rather than @formsmith/kit-mui.
 * The designer must never depend on a component library, and a test that
 * reached for MUI would quietly make it do so. A fake also proves the point the
 * kit seam is meant to prove: selection works against any kit that honours the
 * contract, and its one obligation is spreading `nodeProps` onto a root element.
 *
 * Geometry is not asserted anywhere below. jsdom has no layout engine, so every
 * getBoundingClientRect returns zeros; the frame's position and size are a
 * browser check, not a unit-test one.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, PropValue } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'

const staticProp = (value: string): PropValue => ({ kind: 'static', value })

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

function Field({ nodeProps, props, value, error, onChange }: NodeRendererProps): ReactNode {
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
      {/*
       * Displaying the error is a kit obligation, so the fixture has to do it
       * too. It did not, which is why nothing here noticed the canvas computing
       * errors without the context it hands the renderer.
       */}
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
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
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
}

function setup(): Harness {
  const user = userEvent.setup()
  const view = render(
    <Designer initialDocument={makeDocument()} kit={kit} rendererKit={rendererKit} />,
  )

  // The structure tree is behind a tab in the left pane. Opened here so every
  // test starts where it used to, rather than repeating the click in each.
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
    return Array.from(view.container.querySelectorAll('[data-fs-row]'))
      .map((el) => (el as HTMLElement).dataset['fsRow'])
      .filter((key): key is string => Boolean(key) && key !== 'root')
  }
  return { user, view, node, frame, hoverFrame, keys }
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

    // Focus never moved into the canvas, so the keystrokes went nowhere.
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

    // The Silent renderer emits no data-fs-key, so the hit walks past it to the
    // root. It stays reachable from the tree; it just cannot be picked directly.
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
    // No overlay and no selection gesture while previewing.
    expect(frame()).toBeNull()
    expect(view.container.querySelector('.fs-selection')).toBeNull()
  })
})

/**
 * Drag and drop, as far as jsdom can go.
 *
 * The arithmetic that decides where a drop lands is covered in dnd.test.ts, on
 * measured rectangles jsdom cannot produce. What is worth checking here is the
 * wiring around it: that a press below the threshold is still a click, that one
 * above it is not, and that a drag which lands nowhere changes no document.
 */
describe('drag and drop wiring', () => {
  it('treats a press without movement as a click, not a drag', async () => {
    const { user, node, frame } = setup()

    await user.click(node('second'))

    // Selection happened, so the click was not swallowed by the drag controller.
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

    // Every rect is zero in jsdom, so no drop resolves and nothing moves. The
    // point is that the release did not fall through and select instead.
    expect(frame()).toBeNull()
    expect(keys()).toEqual(['first', 'second', 'quiet'])
  })

  it('leaves the document alone when a drag lands nowhere', async () => {
    const { user, view, keys } = setup()
    // Back to the palette: setup() opens the Tree tab, which most tests want.
    await user.click(screen.getByRole('tab', { name: 'Components' }))

    const paletteItem = screen.getByTitle('Add Field, or drag it onto the canvas')
    await user.pointer([
      { target: paletteItem, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } },
      { target: view.container, coords: { clientX: 500, clientY: 500 } },
      { target: view.container, keys: '[/MouseLeft]', coords: { clientX: 500, clientY: 500 } },
    ])

    expect(keys()).toEqual(['first', 'second', 'quiet'])
  })

  it('still adds from the palette on a plain click', async () => {
    const { user, keys } = setup()

    // Back to the palette: setup() opens the Tree tab, which most tests want.
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

    expect(view.container.querySelector('.fs-drag-label')?.textContent).toBe('first')

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

/**
 * The release path.
 *
 * jsdom has no layout, so no drop can actually resolve here and the assertions
 * are about the wiring rather than the geometry. The case worth pinning is a
 * release that arrives immediately after the drag starts: the drop indicator is
 * drawn from a snapshot taken by a React pointer handler, which always runs
 * before the window listener that records the drag and is therefore one event
 * behind. An earlier version published the target from an effect, so a quick
 * release saw nothing and silently dropped the component on the floor. The
 * controller now asks each zone to resolve the release itself, measuring afresh.
 */
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
  /*
   * Shipped broken. The canvas renders through the same FormRenderer as
   * preview, with `data` that starts empty, and edit mode swallows pointer
   * events so a click selects rather than types. Nothing on the canvas can ever
   * satisfy a condition, so a component with `renderWhen` set was absent from
   * the DOM entirely: not visible, not selectable there, and skipped by
   * `measureTree` so nothing could be dropped into it.
   *
   * The tests already knew half of this — `keys()` above reads the tree rather
   * than the canvas because "a node hidden by renderWhen is a row here and no
   * element there" — written as a caution about testing, without anyone noticing
   * it described an authoring hole.
   */
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

  it('marks only the component the condition hides', () => {
    const view = open()

    expect(
      view.container.querySelector('[data-fs-key="first"]')?.hasAttribute('data-fs-hidden'),
    ).toBe(false)
  })
})

describe('a document with steps', () => {
  /*
   * A step is a container shown when `context.step` equals its own name. The
   * canvas has to supply that context or preview shows an empty form and the
   * author cannot check their own wizard.
   */
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

    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual(['one', 'two'])
  })

  it('shows no switcher for a form that declares no steps', () => {
    // It reads the flow out of the document, so an ordinary form gets nothing.
    render(<Designer initialDocument={makeDocument()} kit={kit} rendererKit={rendererKit} />)

    expect(screen.queryByLabelText('Step')).toBeNull()
  })

  it('previews the chosen step, which needs the canvas to supply the context', async () => {
    const user = userEvent.setup()
    const view = open()

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(view.container.querySelector('[data-fs-key="step-one"]')).not.toBeNull()
    expect(view.container.querySelector('[data-fs-key="step-two"]')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Step'), 'two')

    expect(view.container.querySelector('[data-fs-key="step-two"]')).not.toBeNull()
    expect(view.container.querySelector('[data-fs-key="step-one"]')).toBeNull()
  })

  it('validates the step preview is showing, rather than treating it as hidden', async () => {
    /*
     * The canvas gives the renderer a context and has to give validateForm the
     * same one. Without it the renderer draws step one while validateForm calls
     * it hidden and reports nothing, so Validate on an empty required field
     * comes back clean. That is the disagreement isVisible exists to prevent,
     * arriving through an argument list rather than a second code path.
     */
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
    // Editing reveals what a condition hides, so a step the author is not
    // previewing is still there to drop into.
    const view = open()

    expect(view.container.querySelector('[data-fs-key="step-two"]')).not.toBeNull()
    expect(
      view.container.querySelector('[data-fs-key="step-two"]')?.getAttribute('data-fs-hidden'),
    ).toBe('true')
  })
})

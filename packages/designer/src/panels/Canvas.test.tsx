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
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, PropValue } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { observerCount } from '../../../../test/setup.js'
import { Designer } from '../Designer.js'

const staticProp = (value: string): PropValue => ({ kind: 'static', value })

/*
 * How many times the kit has been asked to draw a component.
 *
 * The only way to see a render that produces identical output. A drag moves the
 * pointer, not the document, so every one of these during a drag is work whose
 * result cannot have changed.
 */
let fieldRenders = 0

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

function Field({ nodeProps, props, value, error, onChange }: NodeRendererProps): ReactNode {
  // Counted on commit rather than during render, which is where a component is
  // allowed to have an effect. It measures the same thing: a subtree React
  // skips is one this function was never called for, so it never commits.
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
    /*
     * The root's own type, and it was missing.
     *
     * `measureNow` asks the palette index whether a candidate is a container,
     * so with no `Screen` entry `defs.get('Screen')?.container` was `undefined`
     * and the canvas had nowhere a drop could land -- under a real layout
     * engine as much as under jsdom. Every drop test here was therefore passing
     * for a second reason nobody had noticed, on top of the zero rectangles.
     *
     * `root: true` keeps it out of the palette, which is what the kit contract
     * asks of the component that is already on the canvas.
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
  node: (key: string) => HTMLElement
  frame: () => HTMLElement | null
  hoverFrame: () => HTMLElement | null
  /** Keys of the root's children, in document order. */
  keys: () => string[]
  /** How many times the kit has drawn a field since this harness was made. */
  renders: () => number
}

function setup(): Harness {
  const user = userEvent.setup()
  fieldRenders = 0
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
    /*
     * What this can and cannot say.
     *
     * jsdom gives every element a zero rectangle, so no point is inside
     * anything and no drop resolves -- which means an unchanged document is
     * also what a canvas with its whole release path deleted would produce.
     * The document assertion alone proves nothing, and used to be all there
     * was.
     *
     * So what is asserted here is the wiring jsdom can see: the drag armed (a
     * label appeared), and it was let go of afterwards. A palette drag released
     * off the canvas adding nothing is checked in `e2e/authoring.spec.ts`,
     * where rectangles are real.
     */
    const { user, view, keys } = setup()
    // Back to the palette: setup() opens the Tree tab, which most tests want.
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

    const label = view.container.querySelector<HTMLElement>('.fs-drag-label')
    expect(label?.textContent).toBe('first')
    /*
     * And where it is, which the test named "follows the pointer" never asked.
     * The position is an inline style, which jsdom can read perfectly well, so a
     * label pinned to the corner for the whole gesture passed a test about it
     * moving.
     */
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

  describe('the preview data and error dumps', () => {
    /*
     * `designer.css` caps `.fs-canvas__data pre` at 180px and scrolls it, and the
     * markup carried no `tabIndex`, so a keyboard user reached the first few
     * lines of a long form's data and had no way to reach the rest. A pointer
     * user could read all of it.
     *
     * axe's `scrollable-region-focusable` is the rule that names this, and
     * `test/a11y.test.tsx` disables it by name along with two others for want of
     * a layout engine -- so the enforced suite was configured such that it could
     * not report this. Asserted directly here instead, which needs no layout: the
     * attribute is either on the element or it is not.
     */
    it('are focusable, so a keyboard can scroll them', () => {
      const view = open()
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

      const dumps = [...view.container.querySelectorAll('.fs-canvas__data pre')]
      expect(dumps.length, 'preview rendered no dumps, so this asserts nothing').toBe(2)

      for (const dump of dumps) {
        expect(dump.getAttribute('tabindex'), dump.getAttribute('aria-label') ?? '').toBe('0')
      }
    })

    it('say what they are when focus lands on them', () => {
      // A tab stop that announces nothing is its own defect: the reader gets
      // "group" and has to guess which of the two they are in.
      const view = open()
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

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

/**
 * Dragging does not re-render the form under the pointer.
 *
 * The drag controller puts the pointer position in React state, and it has to:
 * the drop indicator follows the pointer, and both the canvas and the tree draw
 * one. So the canvas re-renders on every `pointermove`, at pointer-event
 * frequency, which is fine.
 *
 * What is not fine is what used to happen below it. Nothing stood between the
 * canvas and the form, so every one of those renders walked the whole document
 * — `isVisible` and `resolveProps` for every node, then every kit component —
 * to produce output that cannot have changed, because a pointer position is not
 * an input to any of it.
 *
 * The boundary is element identity: the canvas hands React the same
 * `<FormRenderer>` element it handed it last time, and React skips the subtree.
 */
describe('a drag over the canvas', () => {
  it('does not re-render the components under it', async () => {
    const { user, view, renders } = setup()

    const target = view.container.querySelector<HTMLElement>('[data-fs-key="first"]')
    if (!target) throw new Error('no component on the canvas')

    await user.pointer({ target, keys: '[MouseLeft>]', coords: { clientX: 10, clientY: 10 } })
    const before = renders()

    /*
     * Past the threshold, then a few moves, which is the shortest real drag.
     *
     * `pointerId: 1` on every one, because `user.pointer` above uses that for a
     * mouse and `fireEvent` defaults to 0 -- so without it this fixture is two
     * *different* pointers for one physical gesture, which is not a thing a
     * browser produces. `useDrag` now ignores a move from a pointer that did
     * not start the drag, which is what makes finger B unable to commit finger
     * A's drag, and this fixture had to start modelling the identity the
     * browser fills in.
     */
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 60, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 80, clientY: 80, pointerId: 1 })

    /*
     * A drag is actually in flight, which was assumed rather than asserted.
     *
     * The canvas re-renders during this test only because `useDrag` puts the
     * pointer position in state. If `begin` ever stopped arming -- the
     * pointerdown arrives through `onPointerDownCapture`, which has three early
     * returns -- the canvas would not re-render at all, `renders() === before`
     * would hold, and this would go green with the memo it exists to defend
     * deleted.
     */
    expect(
      view.container.querySelector('.fs-drag-label'),
      'no drag armed, so this counted the renders of a canvas doing nothing',
    ).not.toBeNull()

    expect(renders()).toBe(before)

    fireEvent.pointerUp(window, { clientX: 80, clientY: 80, pointerId: 1 })
  })

  it('still re-renders them when the document changes', async () => {
    /*
     * The control. A boundary that never lets anything through would pass the
     * test above and freeze the canvas, which is the whole product.
     */
    const { user, renders } = setup()
    const before = renders()

    await user.click(screen.getByRole('button', { name: 'Remove quiet' }))

    expect(renders()).toBeGreaterThan(before)
  })

  it('still re-renders them when a canvas prop changes', async () => {
    // The second control, on the other input. Preview flips `revealHidden`,
    // which the renderer reads, so a memo that ignored it would draw the wrong
    // thing rather than merely draw it late.
    const { user, renders } = setup()
    const before = renders()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(renders()).toBeGreaterThan(before)
  })
})

describe('typing into a kit component while arranging the form', () => {
  /*
   * `onKeyDownCapture` had no coverage in any suite, and the one test that
   * looks like it does proves something else.
   *
   * "does not let a design-mode click reach the kit component" clicks the input
   * and types -- but `onMouseDownCapture` has already cancelled the default, so
   * focus never enters the input and `document.activeElement` is the shell, an
   * *ancestor* of the surface. The keydown therefore never reaches the
   * surface's capture handler at all, and the empty `input.value` is explained
   * entirely by focus never arriving. `e2e/canvas.spec.ts` has the same
   * limitation and `e2e/keyboard.spec.ts` presses Tab without typing.
   *
   * Delete `onKeyDownCapture` from the props spread and both suites stay green,
   * restoring the defect the handler's comment describes: tabbing into the
   * canvas and typing reaches the kit's `onChange`, seeding preview data with
   * answers nobody entered.
   *
   * Driven by focusing the input directly, which is what Tab does and what a
   * click cannot.
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
    /*
     * The allowlist, which was untested too -- and it matters because the
     * handler's comment records that a broader version of it let Ctrl+V, Ctrl+A
     * and Ctrl+X through to the kit.
     *
     * Tab is the one that has to keep working, because it is how a keyboard
     * user leaves a component at all: swallow it and the canvas is a trap. My
     * first version asserted Escape instead and was wrong about a different
     * thing -- the *shell* ignores keys whose target is a text field, so
     * Escape from inside an input clears nothing whether or not the canvas
     * passes it on, and the test could not have told the two apart.
     */
    const { user, node } = setup()

    const input = node('first').querySelector('input') as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)

    await user.keyboard('{Tab}')

    expect(document.activeElement, 'Tab was swallowed by the canvas').not.toBe(input)
  })

  it('hands typing back in preview mode', async () => {
    // The control, and the reason the handler is conditional: preview is where
    // the form is meant to collect answers.
    const { user, node } = setup()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    const input = node('first').querySelector('input') as HTMLInputElement
    await user.click(input)
    await user.keyboard('typed')

    expect(input.value).toBe('typed')
  })
})

describe('a press that is not the primary button', () => {
  /*
   * These assert real behaviour and they do NOT yet isolate the guard, which is
   * said here rather than left for somebody to discover.
   *
   * `Canvas.tsx`'s primary-button check is untested while the identical guard in
   * the tree has a dedicated pair. Replacing it with a no-op leaves both rows
   * below green, so something else in this environment also stops a right-press
   * arming a drag and these cannot tell the two apart. What they do pin is the
   * outcome a user sees -- a right-press moves nothing -- which is worth having
   * and is not the same as covering the line.
   *
   * Recorded in `docs/build-out/found.md`. Isolating it needs the reason a
   * jsdom right-press does not reach `begin`, which is a question about the
   * environment rather than about this component.
   */
  const order = (view: ReturnType<typeof setup>['view']): (string | null)[] =>
    [...view.container.querySelectorAll('[data-fs-key]')].map((el) =>
      el.getAttribute('data-fs-key'),
    )

  it('does not relocate the component on a right-press', () => {
    const { view, node } = setup()
    const before = order(view)
    expect(before.length, 'nothing is on the canvas, so this proves nothing').toBeGreaterThan(1)

    fireEvent.pointerDown(node('first'), { button: 2, clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 14, clientY: 60, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 14, clientY: 60, pointerId: 1 })

    expect(view.container.querySelector('.fs-drag-label'), 'a drag was armed').toBeNull()
    expect(order(view)).toEqual(before)
  })

  it('still arms one on the primary button', () => {
    // The control. Refusing every press would pass the row above while making
    // the canvas undraggable.
    const { view, node } = setup()

    fireEvent.pointerDown(node('first'), { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 14, clientY: 60, pointerId: 1 })

    expect(view.container.querySelector('.fs-drag-label')).not.toBeNull()

    fireEvent.pointerUp(window, { clientX: 14, clientY: 60, pointerId: 1 })
  })
})

/**
 * The selection layer's `ResizeObserver`, which for a while was never built.
 *
 * `test/setup.ts` stubs the observer and counts what it is asked to do, and
 * until this block nothing read those counters -- an obligation written down
 * with nothing executing it. What it was hiding: the layer is rendered inside
 * the div carrying `surfaceRef`, React attaches host refs children-first, so
 * the layout effect that built the observer read a null ref and returned. Its
 * deps never changed, so it never ran again until the document was first
 * edited. No observer, no scroll listener, no resize listener, and a green
 * suite.
 *
 * Deltas rather than absolutes, because the counters are per process and every
 * jsdom test in this file adds to them.
 *
 * Geometry stays out of it. jsdom has no layout engine, so what the observer
 * would report is a browser question; what it observed is answerable here.
 */
describe('the selection layer and the elements it watches', () => {
  it('observes the surface and the form root as soon as it mounts', () => {
    const before = observerCount()
    setup()
    const after = observerCount()

    expect(after.made - before.made, 'observers built on mount').toBe(1)
    // The scrolling surface and the form root, which is the pair the effect
    // observes. Watching the frames it draws itself would loop.
    expect(after.observing - before.observing, 'elements watched on mount').toBe(2)
  })

  it('does not rebuild the observer while the pointer sweeps across components', async () => {
    const { user, node } = setup()
    const before = observerCount()

    // `quiet` is the fixture that drops `nodeProps`, so it carries no key and
    // cannot be hovered by one. Back and forth across the two that can.
    await user.hover(node('first'))
    await user.hover(node('second'))
    await user.hover(node('first'))
    await user.click(node('second'))

    /*
     * The comment above `remeasure` says a hover used to tear the observer down
     * and build it again, because `remeasure` closed over the hover and so was
     * a new function on every move. Nothing executed that claim until now.
     */
    expect(observerCount().made - before.made, 'observers rebuilt by hovering').toBe(0)
  })

  it('lets go of every element it watched when the canvas goes away', () => {
    const before = observerCount()
    const { view } = setup()
    view.unmount()
    const after = observerCount()

    expect(after.disconnects - before.disconnects, 'observers disconnected').toBe(1)
    // Back where it started. A residue here is an observer still holding an
    // element after the component that made it is gone, which is the leak these
    // counters exist to show.
    expect(after.observing - before.observing, 'elements still watched after unmount').toBe(0)
  })
})

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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { FormDocument, Kit, PropValue } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'

const staticProp = (value: string): PropValue => ({ kind: 'static', value })

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

function Field({ nodeProps, props, value, onChange }: NodeRendererProps): ReactNode {
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
}

function setup(): Harness {
  const user = userEvent.setup()
  const view = render(
    <Designer initialDocument={makeDocument()} kit={kit} rendererKit={rendererKit} />,
  )
  const node = (key: string): HTMLElement => {
    const el = view.container.querySelector<HTMLElement>(`[data-fs-key="${key}"]`)
    if (!el) throw new Error(`no rendered node for key ${key}`)
    return el
  }
  const frame = (): HTMLElement | null => view.container.querySelector('.fs-selection--active')
  const hoverFrame = (): HTMLElement | null => view.container.querySelector('.fs-selection--hover')
  return { user, view, node, frame, hoverFrame }
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

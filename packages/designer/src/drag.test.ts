/**
 * @vitest-environment jsdom
 */

/**
 * The drag controller's contract with its drop zones.
 *
 * The zones themselves need layout to say anything useful, which jsdom cannot
 * provide, so what is pinned here is the handshake between them: who is told
 * what is being dragged, and when.
 *
 * That handshake is where a real bug lived. Each zone used to read the dragged
 * component out of React state inside its own resolver, and a resolver
 * registered from an effect can close over state a render behind. A tree zone
 * that believed nothing was being dragged failed to exclude the dragged node
 * from its own sibling list, and every downward reorder landed one position too
 * far. The controller knows what it is dragging, so it passes it in.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { useDrag } from './drag.js'
import type { DragSource, DropCommit, DropResolver } from './drag.js'

const press = (x: number, y: number): ReactPointerEvent =>
  ({ clientX: x, clientY: y }) as ReactPointerEvent

function pointer(type: string, x: number, y: number): void {
  window.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
}

/** Down, past the threshold, and up, which is the shortest real drag. */
async function drag(begin: () => void, to: [number, number] = [200, 200]): Promise<void> {
  await act(async () => {
    begin()
    pointer('pointermove', 40, 40)
    pointer('pointermove', to[0], to[1])
    pointer('pointerup', to[0], to[1])
    await Promise.resolve()
  })
}

describe('the drop zone handshake', () => {
  it('tells the zone which component is being dragged', async () => {
    const onCommit = vi.fn()
    const resolve = vi.fn<DropResolver>(() => ({ parentKey: 'root', index: 0 }))
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('tree', resolve)
    })
    await drag(() => {
      result.current.begin({ kind: 'move', key: 'heading', label: 'heading' }, press(10, 10))
    })

    expect(resolve).toHaveBeenCalledWith(200, 200, 'heading')
  })

  it('tells the zone that a palette drag has no component yet', async () => {
    const resolve = vi.fn<DropResolver>(() => undefined)
    const { result } = renderHook(() => useDrag(vi.fn()))
    const def = { type: 'Field', label: 'Field' } as never

    act(() => {
      result.current.registerZone('canvas', resolve)
    })
    await drag(() => {
      result.current.begin({ kind: 'new', def }, press(10, 10))
    })

    expect(resolve).toHaveBeenCalledWith(200, 200, undefined)
  })

  it('commits what the first zone that claims the release returns', async () => {
    const onCommit = vi.fn()
    const empty = vi.fn<DropResolver>(() => undefined)
    const claiming = vi.fn<DropResolver>(() => ({ parentKey: 'stack', index: 2 }))
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', empty)
      result.current.registerZone('tree', claiming)
    })
    await drag(() => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
    })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0]?.[1]).toEqual<DropCommit>({ parentKey: 'stack', index: 2 })
  })

  it('commits nothing when no zone claims the release', async () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', () => undefined)
    })
    await drag(() => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
    })

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('asks no zone at all when the pointer never passed the threshold', async () => {
    const resolve = vi.fn<DropResolver>(() => ({ parentKey: 'root', index: 0 }))
    const { result } = renderHook(() => useDrag(vi.fn()))

    act(() => {
      result.current.registerZone('tree', resolve)
    })
    await act(async () => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      // Two pixels is a click, not a drag.
      pointer('pointermove', 12, 10)
      pointer('pointerup', 12, 10)
      await Promise.resolve()
    })

    expect(resolve).not.toHaveBeenCalled()
    expect(result.current.consumeClick()).toBe(false)
  })

  it('stops asking a zone once it unregisters', async () => {
    const resolve = vi.fn<DropResolver>(() => undefined)
    const { result } = renderHook(() => useDrag(vi.fn()))

    let unregister = (): void => undefined
    act(() => {
      unregister = result.current.registerZone('tree', resolve)
    })
    act(() => {
      unregister()
    })
    await drag(() => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
    })

    expect(resolve).not.toHaveBeenCalled()
  })

  it('reports a real position at the very edge of the viewport', async () => {
    const resolve = vi.fn<DropResolver>(() => undefined)
    const { result } = renderHook(() => useDrag(vi.fn()))

    act(() => {
      result.current.registerZone('canvas', resolve)
    })
    await drag(() => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
    }, [0, 0])

    // A clientX of 0 is the left edge, not a missing coordinate.
    expect(resolve).toHaveBeenCalledWith(0, 0, 'a')
  })
})

/**
 * Which `onCommit` a release reaches.
 *
 * The window listeners are attached once and never reattached, so the handler
 * they call has to be read through a ref rather than captured. That is the
 * whole reason the ref exists, and nothing pinned it — so the ref could be
 * written in the wrong place and every existing test would stay green, because
 * they all pass the same handler for the life of the hook.
 */
describe('a commit handler replaced between renders', () => {
  it('calls the current one, not the one the listeners were attached with', async () => {
    const first = vi.fn<(source: DragSource, target: DropCommit) => void>()
    const second = vi.fn<(source: DragSource, target: DropCommit) => void>()
    const resolve = vi.fn<DropResolver>(() => ({ parentKey: 'root', index: 0 }))

    const { result, rerender } = renderHook(({ onCommit }) => useDrag(onCommit), {
      initialProps: { onCommit: first },
    })

    act(() => {
      result.current.registerZone('tree', resolve)
    })

    // The handler a parent hands down changes on most renders: it closes over
    // the document, and the document changes on every edit.
    rerender({ onCommit: second })

    await drag(() => {
      result.current.begin({ kind: 'move', key: 'heading', label: 'heading' }, press(10, 10))
    })

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})

/**
 * The click a drag leaves behind.
 *
 * A release that moved must not also read as a click on whatever is under the
 * pointer, so the controller raises a flag and the canvas and the tree lower it
 * in their own click handlers. That works for a drag that starts and ends
 * inside one of those two.
 *
 * It is not most drags. A palette drag starts on a button in the left pane, and
 * the `click` the browser then dispatches goes to the nearest common ancestor —
 * above both readers. Nobody lowered the flag, so it stayed up and ate the next
 * unrelated click: after every drop from the palette, the first click on a
 * component silently failed to select it.
 *
 * So the controller lowers it itself, once the click it was raised for has been
 * and gone. On `window` and in the bubble phase, which is after every element
 * handler that might want to read it.
 */
describe('the click that follows a drag', () => {
  const source: DragSource = { kind: 'move', key: 'heading', label: 'heading' }

  it('is swallowed', async () => {
    const { result } = renderHook(() => useDrag(vi.fn()))
    await drag(() => {
      result.current.begin(source, press(10, 10))
    })

    expect(result.current.consumeClick()).toBe(true)
  })

  it('stops being swallowed once it has happened, even if nobody read the flag', async () => {
    const { result } = renderHook(() => useDrag(vi.fn()))
    await drag(() => {
      result.current.begin(source, press(10, 10))
    })

    // The click lands somewhere neither the canvas nor the tree is listening —
    // which is where a palette drag's click lands, every time.
    act(() => {
      window.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(result.current.consumeClick()).toBe(false)
  })

  it('starts fresh when a new gesture begins', async () => {
    // A belt for the click whose propagation something stopped, so it never
    // reached the window at all. A new press is a new interaction either way.
    const { result } = renderHook(() => useDrag(vi.fn()))
    await drag(() => {
      result.current.begin(source, press(10, 10))
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })

    expect(result.current.consumeClick()).toBe(false)
  })

  it('is not swallowed when the pointer never moved', async () => {
    // The control. A press that did not become a drag is a click, and
    // swallowing it would make the palette and the tree unclickable.
    const { result } = renderHook(() => useDrag(vi.fn()))

    await act(async () => {
      result.current.begin(source, press(10, 10))
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }))
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(false)
  })
})

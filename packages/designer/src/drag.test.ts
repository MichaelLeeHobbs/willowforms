/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { useDrag } from './drag.js'
import type { DragSource, DropCommit, DropResolver } from './drag.js'

// Both default to pointer 0 so one gesture keeps one id: `useDrag` ignores
// events from a pointer that did not start the drag.
const press = (x: number, y: number, pointerId = 0): ReactPointerEvent =>
  ({ clientX: x, clientY: y, pointerId }) as ReactPointerEvent

function pointer(type: string, x: number, y: number, pointerId = 0): void {
  window.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId, bubbles: true }))
}

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

  it('asks the zones in registration order, and stops at the first answer', async () => {
    /*
     * The test above has one zone answering and one declining, so it holds
     * whichever order the zones are asked in -- and order is the whole point.
     * `drag.ts` says registration order "is a decision rather than a detail":
     * in the product the canvas and the tree can both answer for a point, and
     * the tree is reachable only because it registers first.
     *
     * Two zones that both answer, so the commit names which one was asked
     * first, plus the call counts to show the other was not asked at all.
     */
    const commitWith = async (zones: [string, DropResolver][]): Promise<DropCommit | undefined> => {
      const onCommit = vi.fn()
      const { result } = renderHook(() => useDrag(onCommit))

      act(() => {
        for (const [id, resolve] of zones) result.current.registerZone(id, resolve)
      })
      await drag(() => {
        result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      })

      return onCommit.mock.calls[0]?.[1] as DropCommit | undefined
    }

    const tree = vi.fn<DropResolver>(() => ({ parentKey: 'tree', index: 1 }))
    const canvas = vi.fn<DropResolver>(() => ({ parentKey: 'canvas', index: 9 }))

    expect(
      await commitWith([
        ['tree', tree],
        ['canvas', canvas],
      ]),
    ).toEqual<DropCommit>({ parentKey: 'tree', index: 1 })
    expect(canvas).not.toHaveBeenCalled()

    tree.mockClear()
    canvas.mockClear()

    expect(
      await commitWith([
        ['canvas', canvas],
        ['tree', tree],
      ]),
    ).toEqual<DropCommit>({ parentKey: 'canvas', index: 9 })
    expect(tree).not.toHaveBeenCalled()
  })

  it('treats exactly the threshold as a drag', async () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
    })

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      pointer('pointermove', 14, 10)
      await Promise.resolve()
    })

    expect(result.current.state, 'four pixels is a drag').toBeDefined()

    await act(async () => {
      pointer('pointerup', 14, 10)
      await Promise.resolve()
    })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('treats one pixel short of it as a click', async () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
    })

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      pointer('pointermove', 13, 10)
      pointer('pointerup', 13, 10)
      await Promise.resolve()
    })

    expect(result.current.state).toBeUndefined()
    expect(onCommit).not.toHaveBeenCalled()
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
    const onCommit = vi.fn<(source: DragSource, target: DropCommit) => void>()
    const resolve = vi.fn<DropResolver>((x, y) => ({ parentKey: 'root', index: x + y }))
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', resolve)
    })

    // The last move is off the edge, so only the release can report (0, 0).
    await act(async () => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      pointer('pointermove', 40, 40)
      pointer('pointermove', 5, 5)
      pointer('pointerup', 0, 0)
      await Promise.resolve()
    })

    expect(resolve.mock.lastCall).toEqual([0, 0, 'a'])
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }), {
      parentKey: 'root',
      index: 0,
    })
  })
})

/**
 * After Escape the button is still down, and the browser sends a `click` when
 * it comes up, which on the canvas would select the component being dragged.
 */
describe('a drag abandoned with Escape', () => {
  it('commits nothing and swallows the click the release would produce', async () => {
    const onCommit = vi.fn<(source: DragSource, target: DropCommit) => void>()
    const resolve = vi.fn<DropResolver>(() => ({ parentKey: 'root', index: 0 }))
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', resolve)
    })

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      pointer('pointermove', 200, 200)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })

    expect(onCommit, 'Escape dropped the component anyway').not.toHaveBeenCalled()
    expect(result.current.consumeClick(), 'the abandoned drag read as a click').toBe(true)
  })

  it('keeps swallowing it until the button actually comes up', async () => {
    const onCommit = vi.fn<(source: DragSource, target: DropCommit) => void>()
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone(
        'canvas',
        vi.fn<DropResolver>(() => undefined),
      )
    })

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      pointer('pointermove', 200, 200)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      pointer('pointerup', 200, 200)
      await Promise.resolve()
    })

    expect(onCommit).not.toHaveBeenCalled()
    expect(result.current.consumeClick()).toBe(true)
  })

  it('leaves a press that never moved alone, because that is a click', async () => {
    const { result } = renderHook(() => useDrag(vi.fn()))

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(false)
  })
})

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

    rerender({ onCommit: second })

    await drag(() => {
      result.current.begin({ kind: 'move', key: 'heading', label: 'heading' }, press(10, 10))
    })

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})

/**
 * A palette drag's `click` goes to a common ancestor that neither the canvas nor
 * the tree reads, so the controller lowers the flag itself on `window` in the
 * bubble phase, after every element handler that might read it.
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

    act(() => {
      window.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(result.current.consumeClick()).toBe(false)
  })

  it('starts fresh when a new gesture begins', async () => {
    // For a click whose propagation was stopped before it reached the window.
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
    const { result } = renderHook(() => useDrag(vi.fn()))

    await act(async () => {
      result.current.begin(source, press(10, 10))
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }))
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(false)
  })
})

describe('a drag that does not finish normally', () => {
  const source: DragSource = { kind: 'move', key: 'heading', label: 'heading' }

  it('does not let the release after Escape read as a click', async () => {
    const { result } = renderHook(() => useDrag(vi.fn()))

    await act(async () => {
      result.current.begin(source, press(10, 10))
      pointer('pointermove', 40, 40)
      pointer('pointermove', 200, 200)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      pointer('pointerup', 200, 200)
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(true)
  })

  it('commits nothing when the drag was abandoned', async () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
    })
    await act(async () => {
      result.current.begin(source, press(10, 10))
      pointer('pointermove', 40, 40)
      pointer('pointermove', 200, 200)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      pointer('pointerup', 200, 200)
      await Promise.resolve()
    })

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('lets go when the window does', async () => {
    const { result } = renderHook(() => useDrag(vi.fn()))

    await act(async () => {
      result.current.begin(source, press(10, 10))
      pointer('pointermove', 40, 40)
      pointer('pointermove', 200, 200)
      await Promise.resolve()
    })
    expect(result.current.state).toBeDefined()

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
      await Promise.resolve()
    })

    expect(result.current.state).toBeUndefined()
  })

  it('still commits a drag that ends properly', async () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
    })
    await drag(() => {
      result.current.begin(source, press(10, 10))
    })

    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})

describe('a drag the browser takes away', () => {
  it('ends on pointercancel without committing anything', () => {
    const onCommit = vi.fn<(source: DragSource, target: DropCommit) => void>()
    const { result } = renderHook(() => useDrag(onCommit))

    act(() => {
      result.current.registerZone(
        'canvas',
        vi.fn<DropResolver>(() => ({ parentKey: 'r', index: 0 })),
      )
    })

    act(() => {
      result.current.begin({ kind: 'move', key: 'a', label: 'a' }, press(10, 10))
      pointer('pointermove', 200, 200)
      window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
    })

    expect(result.current.state, 'the drag label is still on screen').toBeUndefined()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('marks the gesture abandoned, so its trailing click is not a selection', async () => {
    const { result } = renderHook(() => useDrag(vi.fn()))

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0))
      pointer('pointermove', 80, 80)
      window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(true)
  })

  it('swallows nothing when the cancelled press never moved', async () => {
    const { result } = renderHook(() => useDrag(vi.fn()))

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0))
      window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(false)
  })

  it('carries the source through the state, so the label can name it', () => {
    const { result } = renderHook(() => useDrag(vi.fn()))
    const def = { type: 'Field', label: 'Field' } as never

    act(() => {
      result.current.begin({ kind: 'new', def }, press(10, 10))
      pointer('pointermove', 200, 200)
    })

    expect(result.current.state?.source).toEqual({ kind: 'new', def })
  })
})

describe('a drag abandoned by losing the window', () => {
  const setUp = (): { result: { current: ReturnType<typeof useDrag> } } =>
    renderHook(() => useDrag(() => undefined))

  it('swallows nothing on the next unrelated release', async () => {
    const { result } = setUp()

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0))
      pointer('pointermove', 80, 80)
      window.dispatchEvent(new Event('blur'))
      await Promise.resolve()
    })

    await act(async () => {
      pointer('pointerdown', 5, 5)
      pointer('pointerup', 5, 5)
      await Promise.resolve()
    })

    expect(
      result.current.consumeClick(),
      'the click after an abandoned drag was eaten by the drag before it',
    ).toBe(false)
  })

  it('still swallows the click belonging to the abandoned gesture itself', async () => {
    const { result } = setUp()

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0))
      pointer('pointermove', 80, 80)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      pointer('pointerup', 80, 80)
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(true)
  })

  it('swallows nothing when a gesture never moved', async () => {
    const { result } = setUp()

    await act(async () => {
      result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0))
      pointer('pointerup', 1, 1)
      await Promise.resolve()
    })

    expect(result.current.consumeClick()).toBe(false)
  })
})

// Zones are code the controller does not own, so a throw must not leave the
// drag stuck.
describe('a zone that throws on release', () => {
  it('ends the gesture rather than staying stuck', async () => {
    const { result } = renderHook(() => useDrag(() => undefined))

    act(() => {
      result.current.registerZone('hostile', () => {
        throw new Error('this zone blew up')
      })
    })

    await drag(() =>
      result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0)),
    )

    expect(result.current.state, 'the drag never ended').toBeUndefined()
  })

  it('asks the other zones, which is what a zone declining already means', async () => {
    const commits: DropCommit[] = []
    const { result } = renderHook(() =>
      useDrag((_source, target) => {
        commits.push(target)
      }),
    )

    act(() => {
      result.current.registerZone('hostile', () => {
        throw new Error('this zone blew up')
      })
      result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
    })

    await drag(() =>
      result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0)),
    )

    expect(commits).toEqual([{ parentKey: 'root', index: 0 }])
  })

  it('ends the gesture when the commit itself throws, and reports the throw', async () => {
    /*
     * React error boundaries never see a throw in a `window` listener, so the
     * controller re-throws on a later task to reach `window.onerror`. Fake
     * timers let this test assert that throw instead of leaking it.
     */
    vi.useFakeTimers()
    try {
      const boom = new Error('the host refused')
      const { result, unmount } = renderHook(() =>
        useDrag(() => {
          throw boom
        }),
      )

      act(() => {
        result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
      })

      await drag(() =>
        result.current.begin({ kind: 'move', key: 'email', label: 'email' }, press(0, 0)),
      )

      expect(result.current.state).toBeUndefined()
      expect(() => vi.runAllTimers()).toThrow(boom)

      // Taken down inside its own test: the listeners live on `window` until it
      // unmounts, and a release from the next test would re-enter this handler.
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('two pointers at once', () => {
  const def = { type: 'Field', label: 'Field' } as never
  const otherDef = { type: 'Other', label: 'Other' } as never

  it('ignores a cancellation from a pointer that did not start the drag', () => {
    // Browsers send this: a second touch that starts scrolling is cancelled
    // while the first is still down.
    const commit = vi.fn()
    const { result } = renderHook(() => useDrag(commit))

    act(() => {
      result.current.registerZone(
        'canvas',
        vi.fn(() => ({ parentKey: 'root', index: 0 })),
      )
      result.current.begin({ kind: 'new', def }, press(10, 10, 1))
    })
    act(() => {
      pointer('pointermove', 80, 80, 1)
    })

    expect(result.current.state, 'the drag never started').toBeDefined()

    act(() => {
      window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }))
    })

    expect(result.current.state, "another pointer's cancellation ended this drag").toBeDefined()

    act(() => {
      pointer('pointerup', 80, 80, 1)
    })

    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('still cancels for the pointer that did start it', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDrag(commit))

    act(() => {
      result.current.registerZone(
        'canvas',
        vi.fn(() => ({ parentKey: 'root', index: 0 })),
      )
      result.current.begin({ kind: 'new', def }, press(10, 10, 1))
    })
    act(() => {
      pointer('pointermove', 80, 80, 1)
      window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))
    })

    expect(result.current.state).toBeUndefined()
    expect(commit).not.toHaveBeenCalled()
  })

  it('ignores a release from a pointer that did not start the drag', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDrag(commit))
    const zone = vi.fn(() => ({ parentKey: 'root', index: 0 }))

    act(() => {
      result.current.registerZone('canvas', zone)
      result.current.begin({ kind: 'new', def }, press(10, 10, 1))
    })
    act(() => {
      pointer('pointermove', 80, 80, 1)
    })

    act(() => {
      pointer('pointerup', 300, 300, 2)
    })

    expect(commit, 'a second pointer committed the drag another one started').not.toHaveBeenCalled()
    expect(result.current.state, 'the drag ended on the wrong pointer').toBeDefined()
  })

  it('ignores a move from a pointer that did not start the drag', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDrag(commit))

    act(() => {
      result.current.begin({ kind: 'new', def }, press(10, 10, 1))
    })
    act(() => {
      pointer('pointermove', 80, 80, 1)
    })

    const before = result.current.state
    act(() => {
      pointer('pointermove', 300, 300, 2)
    })

    expect(result.current.state?.x, 'the label followed the wrong finger').toBe(before?.x)
  })

  it('still ends on the pointer that started it', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDrag(commit))

    act(() => {
      result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
      result.current.begin({ kind: 'new', def }, press(10, 10, 1))
    })
    act(() => {
      pointer('pointermove', 80, 80, 1)
    })
    act(() => {
      pointer('pointerup', 80, 80, 1)
    })

    expect(commit).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBeUndefined()
  })

  it('does not let a second press retarget a drag in flight', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDrag(commit))

    act(() => {
      result.current.registerZone('canvas', () => ({ parentKey: 'root', index: 0 }))
      result.current.begin({ kind: 'new', def }, press(10, 10, 1))
    })
    act(() => {
      pointer('pointermove', 80, 80, 1)
    })
    act(() => {
      result.current.begin({ kind: 'new', def: otherDef }, press(200, 200, 2))
    })
    act(() => {
      pointer('pointerup', 80, 80, 1)
    })

    const source = commit.mock.calls[0]?.[0] as { def?: { type?: string } } | undefined
    expect(source?.def?.type, 'the second press retargeted the drag').toBe('Field')
  })
})

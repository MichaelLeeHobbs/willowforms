import { describe, expect, it } from 'vitest'

import { createDocument } from '@formsmith/core'
import type { FormDocument } from '@formsmith/core'

import { history, MAX_HISTORY } from './store.js'

function doc(name: string): FormDocument {
  return createDocument(name, 'id-' + name)
}

function seed(): { past: FormDocument[]; present: FormDocument; future: FormDocument[] } {
  return { past: [], present: doc('a'), future: [] }
}

describe('history.commit', () => {
  it('pushes the previous present onto the past', () => {
    const next = history.commit(seed(), doc('b'))
    expect(next.past).toHaveLength(1)
    expect(next.present.name).toBe('b')
  })

  it('is a no-op when the document is referentially unchanged', () => {
    const start = seed()
    expect(history.commit(start, start.present)).toBe(start)
  })

  it('clears the redo future on a fresh edit', () => {
    const withFuture = { past: [doc('a')], present: doc('b'), future: [doc('c')] }
    expect(history.commit(withFuture, doc('d')).future).toEqual([])
  })

  it('caps the stack, dropping the oldest entries', () => {
    let h = seed()
    for (let i = 0; i < MAX_HISTORY + 25; i += 1) h = history.commit(h, doc('v' + i))
    expect(h.past).toHaveLength(MAX_HISTORY)
    // The oldest surviving entry is not the original document.
    expect(h.past[0]?.name).not.toBe('a')
  })
})

describe('history.undo and redo', () => {
  it('round-trips an edit', () => {
    const start = seed()
    const edited = history.commit(start, doc('b'))
    const undone = history.undo(edited)
    expect(undone.present.name).toBe('a')
    expect(history.redo(undone).present.name).toBe('b')
  })

  it('is a no-op at the ends of the stack', () => {
    const start = seed()
    expect(history.undo(start)).toBe(start)
    expect(history.redo(start)).toBe(start)
  })

  it('survives several steps in both directions', () => {
    let h = seed()
    for (const name of ['b', 'c', 'd']) h = history.commit(h, doc(name))
    h = history.undo(history.undo(h))
    expect(h.present.name).toBe('b')
    h = history.redo(h)
    expect(h.present.name).toBe('c')
  })
})

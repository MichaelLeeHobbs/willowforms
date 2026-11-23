import { describe, expect, it } from 'vitest'

import { createDocument } from '@willowforms/core'
import type { FormDocument } from '@willowforms/core'

import { historyOps, MAX_HISTORY } from './store.js'

function doc(name: string): FormDocument {
  return createDocument(name, 'id-' + name)
}

function seed(): { past: FormDocument[]; present: FormDocument; future: FormDocument[] } {
  return { past: [], present: doc('a'), future: [] }
}

describe('historyOps.commit', () => {
  it('pushes the previous present onto the past', () => {
    const next = historyOps.commit(seed(), doc('b'))
    expect(next.past).toHaveLength(1)
    expect(next.present.name).toBe('b')
  })

  it('leaves the history it was handed alone', () => {
    /*
     * Invariant 4. The other tests thread the returned history forward, so only
     * this one catches a `commit` that pushes onto `history.past` in place.
     */
    const start = seed()
    const past = start.past
    const future = start.future

    const next = historyOps.commit(start, doc('b'))

    expect(next).not.toBe(start)
    expect(start.past).toBe(past)
    expect(start.past).toHaveLength(0)
    expect(start.future).toBe(future)
    expect(start.present.name).toBe('a')
  })

  it('is a no-op when the document is referentially unchanged', () => {
    const start = seed()
    expect(historyOps.commit(start, start.present)).toBe(start)
  })

  it('clears the redo future on a fresh edit', () => {
    const withFuture = { past: [doc('a')], present: doc('b'), future: [doc('c')] }
    expect(historyOps.commit(withFuture, doc('d')).future).toEqual([])
  })

  it('folds a run of edits carrying the same label into one entry', () => {
    let h = historyOps.commit(seed(), doc('b'), 'label:email')
    h = historyOps.commit(h, doc('be'), 'label:email')
    h = historyOps.commit(h, doc('bee'), 'label:email')

    expect(h.past, 'a run of keystrokes became a run of undo steps').toHaveLength(1)
    expect(h.present.name).toBe('bee')
    expect(historyOps.undo(h).present.name).toBe('a')
  })

  it('breaks the run when the label changes', () => {
    let h = historyOps.commit(seed(), doc('b'), 'label:email')
    h = historyOps.commit(h, doc('c'), 'label:message')

    expect(h.past).toHaveLength(2)
    expect(historyOps.undo(h).present.name).toBe('b')
  })

  it('starts a new entry after an undo, rather than overwriting the restored one', () => {
    let h = historyOps.commit(seed(), doc('b'), 'label:message')
    h = historyOps.commit(h, doc('c'), 'label:email')
    h = historyOps.commit(h, doc('ce'), 'label:email')
    h = historyOps.undo(h)
    h = historyOps.commit(h, doc('cx'), 'label:email')

    expect(h.past, 'the restored version was overwritten instead of kept').toHaveLength(2)
    expect(historyOps.undo(h).present.name).toBe('b')
  })

  it('stacks an unlabelled edit even on an identical one', () => {
    let h = historyOps.commit(seed(), doc('b'))
    h = historyOps.commit(h, doc('c'))
    expect(h.past).toHaveLength(2)
  })

  it('caps the stack, dropping the oldest entries', () => {
    let h = seed()
    for (let i = 0; i < MAX_HISTORY + 25; i += 1) h = historyOps.commit(h, doc('v' + i))
    expect(h.past).toHaveLength(MAX_HISTORY)
    expect(h.past[0]?.name).not.toBe('a')
  })
})

describe('historyOps.undo and redo', () => {
  it('round-trips an edit', () => {
    const start = seed()
    const edited = historyOps.commit(start, doc('b'))
    const undone = historyOps.undo(edited)
    expect(undone.present.name).toBe('a')
    expect(historyOps.redo(undone).present.name).toBe('b')
  })

  it('is a no-op at the ends of the stack', () => {
    const start = seed()
    expect(historyOps.undo(start)).toBe(start)
    expect(historyOps.redo(start)).toBe(start)
  })

  it('survives several steps in both directions', () => {
    let h = seed()
    for (const name of ['b', 'c', 'd']) h = historyOps.commit(h, doc(name))
    h = historyOps.undo(historyOps.undo(h))
    expect(h.present.name).toBe('b')
    h = historyOps.redo(h)
    expect(h.present.name).toBe('c')
  })
})

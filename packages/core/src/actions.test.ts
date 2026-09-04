import { describe, expect, it, vi } from 'vitest'

import { runActions } from './actions.js'
import type { ActionRef, CodeAction } from './types.js'

const invocation = { event: 'onClick' as const, nodeKey: 'submit', address: 'items[2].submit' }

describe('runActions', () => {
  it('turns built-in references into a validated effect batch', () => {
    const refs: ActionRef[] = [
      { type: 'builtin', name: 'setValue', params: { address: 'status', value: 'ready' } },
      { type: 'builtin', name: 'announce', params: { message: 'Ready' } },
    ]

    expect(runActions(refs, {}, {}, invocation)).toEqual({
      ok: true,
      effects: [
        { kind: 'setValue', address: 'status', value: 'ready' },
        { kind: 'announce', message: 'Ready' },
      ],
    })
  })

  it('runs code only through the injected action evaluator', () => {
    const actions: Record<string, CodeAction> = {
      prepare: { name: 'prepare', body: 'return effects', params: { target: 'status' } },
    }
    const evaluate = vi.fn(() => [{ kind: 'setValue', address: 'status', value: 'prepared' }])
    const result = runActions(
      [{ type: 'code', name: 'prepare', params: { source: 'button' } }],
      actions,
      { name: 'Ada' },
      invocation,
      { context: { role: 'editor' }, evaluate },
    )

    expect(result).toEqual({
      ok: true,
      effects: [{ kind: 'setValue', address: 'status', value: 'prepared' }],
    })
    expect(evaluate).toHaveBeenCalledWith(
      'return effects',
      { name: 'Ada' },
      { role: 'editor' },
      { target: 'status', source: 'button' },
      invocation,
    )
  })

  it('skips code actions when no evaluator is supplied', () => {
    const actions = { prepare: { name: 'prepare', body: 'return []', params: {} } }
    expect(runActions([{ type: 'code', name: 'prepare' }], actions, {}, invocation)).toEqual({
      ok: true,
      effects: [],
    })
  })

  it('rejects the whole batch when any effect is unreadable', () => {
    const actions = { broken: { name: 'broken', body: 'return value', params: {} } }
    const result = runActions(
      [
        { type: 'builtin', name: 'announce', params: { message: 'Starting' } },
        { type: 'code', name: 'broken' },
      ],
      actions,
      {},
      invocation,
      { evaluate: () => [{ kind: 'unknown' }] },
    )

    expect(result).toEqual({
      ok: false,
      error: 'Code action returned an invalid effect.',
      action: 'broken',
    })
  })

  it('stops after a halt effect', () => {
    const refs: ActionRef[] = [
      { type: 'builtin', name: 'announce', params: { message: 'First' } },
      { type: 'builtin', name: 'halt', params: { reason: 'Done' } },
      { type: 'builtin', name: 'announce', params: { message: 'Never' } },
    ]
    expect(runActions(refs, {}, {}, invocation)).toEqual({
      ok: true,
      effects: [
        { kind: 'announce', message: 'First' },
        { kind: 'halt', reason: 'Done' },
      ],
    })
  })

  it('rejects cyclic or non-JSON effect values', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const actions = { broken: { name: 'broken', body: 'return value', params: {} } }
    const result = runActions([{ type: 'code', name: 'broken' }], actions, {}, invocation, {
      evaluate: () => [{ kind: 'setValue', address: 'x', value: cyclic }] as never,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects non-JSON parameters before calling the evaluator', () => {
    const evaluate = vi.fn(() => [])
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    const result = runActions(
      [{ type: 'code', name: 'broken', params: cyclic as never }],
      { broken: { name: 'broken', body: 'return []', params: {} } },
      {},
      invocation,
      { evaluate },
    )

    expect(result.ok).toBe(false)
    expect(evaluate).not.toHaveBeenCalled()
  })
})

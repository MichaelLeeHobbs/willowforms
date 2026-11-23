import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@willowforms/core'
// Through the public entry: these are exported for third-party kits.
import { bool, changed, num, requiredProps, str } from './index.js'
import type { NodeEventHandlers } from './index.js'

describe('str', () => {
  it('returns a non-empty string as itself', () => {
    expect(str('Email', 'Field')).toBe('Email')
  })

  it('falls back on the empty string', () => {
    expect(str('', 'Field')).toBe('Field')
  })

  it('renders a number as its text, including zero', () => {
    expect(str(2024, 'Field')).toBe('2024')
    expect(str(0, 'Field')).toBe('0')
  })

  it('renders a boolean as its text, as jsonToString does', () => {
    expect(str(false, 'Field')).toBe('false')
  })

  it('falls back on values jsonToString reads as empty', () => {
    expect(str(null, 'Field')).toBe('Field')
    expect(str(undefined, 'Field')).toBe('Field')
    expect(str({ label: 'x' }, 'Field')).toBe('Field')
    expect(str(['x'], 'Field')).toBe('Field')
  })

  it('defaults the fallback to the empty string', () => {
    expect(str(null)).toBe('')
  })
})

describe('num', () => {
  it('returns a finite number as itself, including zero and negatives', () => {
    expect(num(42, 7)).toBe(42)
    expect(num(0, 7)).toBe(0)
    expect(num(-3.5, 7)).toBe(-3.5)
  })

  it('falls back on NaN and both infinities', () => {
    expect(num(Number.NaN, 7)).toBe(7)
    expect(num(Number.POSITIVE_INFINITY, 7)).toBe(7)
    expect(num(Number.NEGATIVE_INFINITY, 7)).toBe(7)
  })

  it('falls back on a non-number, even a numeric string', () => {
    expect(num('42', 7)).toBe(7)
    expect(num(null, 7)).toBe(7)
    expect(num(undefined, 7)).toBe(7)
  })
})

describe('bool', () => {
  it('is on only for true', () => {
    expect(bool(true)).toBe(true)
  })

  it('is off for truthy non-booleans and for false', () => {
    expect(bool(false)).toBe(false)
    expect(bool('true')).toBe(false)
    expect(bool(1)).toBe(false)
    expect(bool({})).toBe(false)
    expect(bool(undefined)).toBe(false)
  })
})

describe('requiredProps', () => {
  it('sets aria-required for a required field', () => {
    expect(requiredProps(true)).toEqual({ 'aria-required': true })
  })

  it('sets no attribute at all for an optional field', () => {
    expect(Object.keys(requiredProps(false))).toEqual([])
  })
})

describe('changed', () => {
  it('reports the value to onChange, then to the onChange event', () => {
    const calls: Array<[string, JsonValue | undefined]> = []
    const events: NodeEventHandlers = {
      onChange: (value) => calls.push(['event', value]),
    }

    changed((value) => calls.push(['form', value]), events, 'picked')

    expect(calls).toEqual([
      ['form', 'picked'],
      ['event', 'picked'],
    ])
  })

  it('reports to onChange when the node has no events', () => {
    const calls: JsonValue[] = []

    changed((value) => calls.push(value), undefined, 3)

    expect(calls).toEqual([3])
  })

  it('reports to onChange when the node has events but no onChange handler', () => {
    const calls: JsonValue[] = []
    const events: NodeEventHandlers = {}

    changed((value) => calls.push(value), events, 'x')

    expect(calls).toEqual(['x'])
  })
})

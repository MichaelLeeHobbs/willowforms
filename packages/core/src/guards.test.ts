import { describe, expect, it } from 'vitest'

import { isRecord } from './guards.js'

describe('isRecord', () => {
  it('accepts plain objects, empty or not', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ version: '1' })).toBe(true)
  })

  it('accepts an object with no prototype', () => {
    const bare: unknown = Object.create(null)
    expect(isRecord(bare)).toBe(true)
  })

  it('rejects null', () => {
    expect(isRecord(null)).toBe(false)
  })

  it('rejects arrays, including empty ones', () => {
    expect(isRecord([])).toBe(false)
    expect(isRecord([{ version: '1' }])).toBe(false)
  })

  it('rejects primitives and undefined', () => {
    for (const value of [undefined, 0, 1, '', 'text', true, false, 1n, Symbol('s')]) {
      expect(isRecord(value)).toBe(false)
    }
  })

  it('rejects functions, which are not of type object', () => {
    expect(isRecord(() => ({}))).toBe(false)
    expect(isRecord(Date.now)).toBe(false)
  })
})

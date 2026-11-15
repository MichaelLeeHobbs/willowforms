import { describe, expect, it } from 'vitest'

import { paramsText } from './text.js'

describe('paramsText', () => {
  it('pretty-prints parameters with two-space indentation', () => {
    expect(paramsText({ address: 'email', value: [true, null] })).toBe(
      '{\n  "address": "email",\n  "value": [\n    true,\n    null\n  ]\n}',
    )
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('reads %s parameters as an empty object', (_name, value) => {
    expect(paramsText(value)).toBe('{}')
  })

  it('keeps a falsy value that is not nullish rather than replacing it', () => {
    expect(paramsText(0)).toBe('0')
    expect(paramsText('')).toBe('""')
    expect(paramsText(false)).toBe('false')
  })

  it('answers an empty object for a cyclic value instead of throwing', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic

    expect(() => JSON.stringify(cyclic)).toThrow()
    expect(paramsText(cyclic)).toBe('{}')
  })

  it('answers an empty object for a value JSON.stringify throws on', () => {
    expect(() => JSON.stringify({ n: 1n })).toThrow()
    expect(paramsText({ n: 1n })).toBe('{}')
  })

  it('answers an empty object for a value JSON.stringify writes as undefined', () => {
    const fn = (): number => 1

    expect(JSON.stringify(fn)).toBeUndefined()
    expect(paramsText(fn)).toBe('{}')
  })
})

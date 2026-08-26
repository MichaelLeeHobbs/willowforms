import { describe, expect, it } from 'vitest'

import { jsonToString, optionValue } from './json.js'

describe('jsonToString', () => {
  it('passes strings through and renders primitives', () => {
    expect(jsonToString('hello')).toBe('hello')
    expect(jsonToString(2)).toBe('2')
    expect(jsonToString(true)).toBe('true')
  })

  it('renders nothing for a value that carries no text', () => {
    expect(jsonToString(undefined)).toBe('')
    expect(jsonToString(null)).toBe('')
    expect(jsonToString({ a: 1 })).toBe('')
    expect(jsonToString([1, 2])).toBe('')
  })
})

describe('optionValue', () => {
  /*
   * A <select> hands back a string whatever the author declared. The kits used
   * to submit that string directly, so a numeric option submitted "2" while
   * the spec claimed it submitted 2.
   */
  const options = [
    { label: 'One', value: 1 },
    { label: 'Two', value: 2 },
    { label: 'Yes', value: true },
    { label: 'Name', value: 'name' },
  ]

  it('gives back the declared number, not its spelling', () => {
    expect(optionValue(options, '2')).toBe(2)
    expect(optionValue(options, '1')).toBe(1)
  })

  it('gives back a declared boolean', () => {
    expect(optionValue(options, 'true')).toBe(true)
  })

  it('leaves a declared string alone', () => {
    expect(optionValue(options, 'name')).toBe('name')
  })

  it('round-trips every option through the spelling the kit rendered', () => {
    for (const option of options) {
      expect(optionValue(options, jsonToString(option.value))).toBe(option.value)
    }
  })

  it('falls back to position for an option that declares no value', () => {
    // Matches what the kits render for such an option, which is its index.
    expect(optionValue([{ label: 'First' }, { label: 'Second' }], '1')).toBe('1')
  })

  it('returns the empty placeholder unchanged', () => {
    // The "Choose…" entry. Inventing a value for it would be worse than
    // reporting that nothing is selected.
    expect(optionValue(options, '')).toBe('')
  })

  it('returns an unrecognised string unchanged rather than guessing', () => {
    expect(optionValue(options, 'nope')).toBe('nope')
  })

  it('is unbothered by junk in the options array', () => {
    expect(optionValue([null, 'plain', { label: 'Two', value: 2 }], '2')).toBe(2)
  })
})

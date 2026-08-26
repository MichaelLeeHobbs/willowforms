import { describe, expect, it } from 'vitest'

import { jsonToString, optionValue, safeHref } from './json.js'

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

describe('safeHref', () => {
  /*
   * A document is data, and the person authoring a form is not always the
   * person deploying it. `javascript:` in an href runs on click with the page's
   * privileges, which is the boundary this project refuses to cross anywhere
   * else.
   */
  it('allows the schemes a form legitimately links with', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com')
    expect(safeHref('tel:+15550100')).toBe('tel:+15550100')
  })

  it('allows relative addresses, which cannot name a scheme', () => {
    expect(safeHref('/help')).toBe('/help')
    expect(safeHref('help/index.html')).toBe('help/index.html')
    expect(safeHref('#section')).toBe('#section')
  })

  it('refuses javascript', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('JavaScript:alert(1)')).toBeUndefined()
    expect(safeHref('  javascript:alert(1)  ')).toBeUndefined()
  })

  it('refuses a scheme hidden behind control characters', () => {
    // Browsers and the URL parser strip these, so "java\tscript:" becomes
    // javascript: after any naive check has already passed it.
    expect(safeHref('java\tscript:alert(1)')).toBeUndefined()
    expect(safeHref('java\nscript:alert(1)')).toBeUndefined()
    expect(safeHref('\u0000javascript:alert(1)')).toBeUndefined()
  })

  it('refuses other schemes that execute or embed', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeHref('file:///etc/passwd')).toBeUndefined()
  })

  it('treats an empty or non-text value as no link at all', () => {
    expect(safeHref('')).toBeUndefined()
    expect(safeHref('   ')).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref({ href: 'https://example.com' })).toBeUndefined()
  })
})

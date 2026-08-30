import { describe, expect, it } from 'vitest'

import { isEmpty, jsonToString, optionValue, readPath, safeHref } from './json.js'

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

  it('refuses a network-path reference, which is not relative at all', () => {
    /*
     * `//evil.com` names no scheme, so a scheme check waves it through and the
     * browser borrows the page's own scheme to navigate off-origin. Backslash
     * forms count because browsers normalise them to forward slashes.
     */
    expect(safeHref('//evil.com')).toBeUndefined()
    expect(safeHref('//evil.com/path?a=1')).toBeUndefined()
    expect(safeHref('\\\\evil.com')).toBeUndefined()
    expect(safeHref('/\\evil.com')).toBeUndefined()
    expect(safeHref('\\/evil.com')).toBeUndefined()
    expect(safeHref('  //evil.com  ')).toBeUndefined()
  })

  it('still allows a single leading slash, which stays on this origin', () => {
    expect(safeHref('/help')).toBe('/help')
    expect(safeHref('/a//b')).toBe('/a//b')
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

describe('readPath', () => {
  const context = {
    user: { role: 'admin', seats: 0, active: false },
    flags: { beta: true },
    plain: 'text',
    list: [1, 2],
  }

  it('reads a nested value', () => {
    expect(readPath(context, 'user.role')).toBe('admin')
    expect(readPath(context, 'flags')).toEqual({ beta: true })
  })

  it('reads a falsy leaf as the value it is', () => {
    // The same rule isEmpty follows: 0 and false are answers, and a condition
    // asking `is the seat count zero` has to be able to see one.
    expect(readPath(context, 'user.seats')).toBe(0)
    expect(readPath(context, 'user.active')).toBe(false)
  })

  it('is nothing for a step that is not there', () => {
    expect(readPath(context, 'user.email')).toBeUndefined()
    expect(readPath(context, 'nobody')).toBeUndefined()
    expect(readPath(context, 'user.role.deeper')).toBeUndefined()
  })

  it('does not walk the prototype', () => {
    /*
     * A path is authored in a picker and stored in a document, so these are
     * strings somebody can type. A plain lookup returns a function, which is
     * present and truthy and would make a condition true for a path the context
     * does not hold.
     */
    for (const path of ['constructor', 'toString', 'user.constructor', '__proto__']) {
      expect(readPath(context, path), path).toBeUndefined()
    }
  })

  it('does not walk into a string or an array', () => {
    expect(readPath(context, 'plain.length')).toBeUndefined()
    expect(readPath(context, 'list.0')).toBeUndefined()
    expect(readPath(context, 'list.length')).toBeUndefined()
  })

  it('is nothing for a path that is not one', () => {
    expect(readPath(context, '')).toBeUndefined()
    expect(readPath(context, '.')).toBeUndefined()
    expect(readPath(context, 'user.')).toBeUndefined()
    expect(readPath(undefined, 'user.role')).toBeUndefined()
    expect(readPath(context, 42 as unknown as string)).toBeUndefined()
  })
})

/**
 * An object with nothing in it is no answer.
 *
 * `isEmpty` fell through to `false` for anything that was not a string or an
 * array, so `{}` counted as an answer and `required` was satisfied by it. A
 * client posting `{"consent": {}}` had its required consent accepted — the same
 * class of failure as the unticked-checkbox bug that Trap 2 in this repository's
 * test skill was written about, arriving by a different value.
 *
 * "Empty" has to mean one thing, because validation uses it for the rule that
 * every rule but `required` passes on an empty value, and conditions use it for
 * `empty` and `notEmpty`. Two definitions let a field be empty enough to skip a
 * `minLength` and full enough to satisfy a visibility condition.
 */
describe('isEmpty and objects', () => {
  it('reads an object with no keys as no answer', () => {
    expect(isEmpty({})).toBe(true)
  })

  it('reads an object that holds something as an answer', () => {
    expect(isEmpty({ a: 1 })).toBe(false)
    expect(isEmpty({ a: null })).toBe(false)
  })

  it('still reads false and 0 as answers', () => {
    // The control, and the policy this file already had: an unticked checkbox
    // is a `false` somebody chose, and `0` is a number somebody typed.
    expect(isEmpty(false)).toBe(false)
    expect(isEmpty(0)).toBe(false)
  })
})

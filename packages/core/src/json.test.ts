import { describe, expect, it } from 'vitest'

import {
  isEmpty,
  jsonToString,
  optionEntry,
  optionValue,
  readPath,
  safeHref,
  valueOf,
} from './json.js'

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

describe('optionValue, where a declared value and a position collide', () => {
  it('prefers a declared value to a position that spells the same string', () => {
    /*
     * A list mixing declared values with bare ones: `'Yes'` has no value of its
     * own so it falls back to its index, `0`, and the second option declares the
     * string `'0'`. One submitted `"0"`, two options that answer to it, and a
     * single pass returned whichever came first in the list.
     *
     * An author who wrote a value meant that value; a position is what an option
     * falls back to when nobody wrote one.
     */
    const options = ['Yes', { label: 'No', value: '0' }]
    expect(optionValue(options, '0')).toBe('0')
  })

  it('still falls back to the position for an option with no declared value', () => {
    expect(optionValue(['Yes', 'No'], '1')).toBe('1')
  })

  it('takes the first of two options declaring one value', () => {
    // Two options cannot be told apart by a submitted string, so the first wins
    // and it is stated rather than left to iteration order.
    const options = [
      { label: 'One', value: 'x' },
      { label: 'Two', value: 'x' },
    ]
    expect(optionValue(options, 'x')).toBe('x')
  })

  it('returns a string matching nothing as itself', () => {
    // The empty placeholder, and anything a stale document offers: inventing a
    // value for it would be worse than handing back what was submitted.
    expect(optionValue([{ label: 'One', value: 1 }], '')).toBe('')
    expect(optionValue([{ label: 'One', value: 1 }], 'nope')).toBe('nope')
  })

  it('gives back the declared type, not the submitted string', () => {
    expect(optionValue([{ label: 'Two', value: 2 }], '2')).toBe(2)
    expect(optionValue([{ label: 'Yes', value: true }], 'true')).toBe(true)
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

  it('refuses a hostile scheme that the URL parser cannot read either', () => {
    /*
     * The other half of the decision, and the half no fixture reached.
     *
     * Every hostile string above parses, so `URL.parse` answers and the scheme
     * check on the parsed protocol refuses it. The fallback below that -- the
     * scheme read off the raw text -- runs only when the parse fails, and it is
     * the branch a runtime without `URL.parse` takes for everything. Replace it
     * with `return raw` and this file stays green while an unparseable
     * `javascript:` URL is handed straight to an `href`.
     *
     * These strings were measured rather than assumed: an unterminated IPv6
     * host is what the WHATWG parser actually rejects, while the more obvious
     * `javascript:alert(1)#[` parses without complaint.
     */
    expect(URL.parse('javascript://[')).toBeNull()

    expect(safeHref('javascript://[')).toBeUndefined()
    expect(safeHref('vbscript://[')).toBeUndefined()
    expect(safeHref('data://[')).toBeUndefined()
  })

  it('still allows a safe scheme the parser cannot read', () => {
    // The control. The fallback refuses by scheme, not by parseability, or a
    // link a browser would follow would vanish from the form.
    expect(URL.parse('https://[')).toBeNull()
    expect(safeHref('https://[')).toBe('https://[')
  })

  it('decides by scheme on a runtime with no URL.parse', () => {
    /*
     * Node before 22.1 and Safari before 18. The whole function then runs
     * through the fallback, so this is the one arrangement where the allowlist
     * below is the only thing standing between a document and an href.
     */
    const parse = URL.parse
    try {
      // @ts-expect-error -- deleting an optional static is the point of the test
      delete URL.parse

      expect(safeHref('https://example.com/a')).toBe('https://example.com/a')
      expect(safeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com')
      expect(safeHref('javascript:alert(1)')).toBeUndefined()
      expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    } finally {
      URL.parse = parse
    }
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

/**
 * The rest of "empty", and the read that decides whether there is an answer at
 * all.
 *
 * The describe above covers objects, which is where the defect was. These cover
 * the other branches, none of which had a test of their own, and `valueOf`,
 * which had none anywhere: it is the own-property read that stands between a
 * request body and every rule in the library.
 */
describe('isEmpty over the rest of the shapes', () => {
  it.each([
    ['nothing at all', undefined],
    ['a null', null],
    ['empty text', ''],
    ['text that is only whitespace', ' ' + String.fromCharCode(9, 10)],
    ['an empty list', []],
  ])('reads %s as no answer', (_label, value) => {
    expect(isEmpty(value as never)).toBe(true)
  })

  it.each([
    ['text', 'a'],
    ['text that is only punctuation', '.'],
    ['a list with something in it', ['a']],
    ['a list holding a null', [null]],
    ['zero', 0],
    ['false', false],
  ])('reads %s as an answer', (_label, value) => {
    expect(isEmpty(value as never)).toBe(false)
  })

  it('counts own keys only', () => {
    // An inherited key is not an answer anybody gave, and a request body can
    // carry one. `Object.keys` is the reason this holds; a `for...in` would not.
    const inherited = Object.create({ role: 'admin' }) as Record<string, never>
    expect(isEmpty(inherited)).toBe(true)
  })
})

describe('valueOf', () => {
  it('reads what a field holds, including the falsy answers', () => {
    expect(valueOf({ a: 'x' }, 'a')).toBe('x')
    expect(valueOf({ a: false }, 'a')).toBe(false)
    expect(valueOf({ a: 0 }, 'a')).toBe(0)
    expect(valueOf({ a: null }, 'a')).toBe(null)
  })

  it('is nothing for a field the data does not have', () => {
    expect(valueOf({}, 'missing')).toBeUndefined()
  })

  it.each(['toString', 'constructor', 'hasOwnProperty', 'valueOf'])(
    'is nothing for %s, which every object inherits',
    (dataKey) => {
      /*
       * A plain lookup finds the prototype, so a field whose data key is
       * `toString` came back holding a function: present, truthy, and not an
       * answer anyone gave. `required` would have been satisfied by it.
       */
      expect(valueOf({}, dataKey)).toBeUndefined()
    },
  )

  it('reads an own key that shadows an inherited one', () => {
    expect(valueOf({ toString: 'typed by a person' }, 'toString')).toBe('typed by a person')
  })

  it('does not walk into a polluted prototype from a request body', () => {
    // JSON.parse gives `__proto__` as an own key rather than assigning through
    // it, which is why this is data and not an attack -- but `role` must still
    // be nothing, because no field was answered.
    const body = JSON.parse('{"__proto__":{"role":"admin"}}') as Record<string, never>
    expect(valueOf(body, 'role')).toBeUndefined()
  })
})

/**
 * A bare string option is its own value.
 *
 * `options: ['Yes', 'No']` is the shortest list an author writes and the shape
 * every JSON Schema `enum` has. `optionEntry` used the *position* whenever no
 * `value` was declared, and a plain string declares one by being one -- so both
 * kits drew a select reading `0`, `1`, `2`, and the answer stored was the index.
 */
describe('an option that is a plain string', () => {
  it('uses itself as its value and its label', () => {
    expect(optionEntry('Yes', 0)).toEqual({ value: 'Yes', label: 'Yes' })
    expect(optionEntry('No', 1)).toEqual({ value: 'No', label: 'No' })
  })

  it('uses itself when it is a number or a boolean too', () => {
    expect(optionEntry(18, 0)).toEqual({ value: '18', label: '18' })
    expect(optionEntry(true, 3)).toEqual({ value: 'true', label: 'true' })
  })

  it('still reads a declared value and label off an object', () => {
    // The control for the shape that always worked.
    expect(optionEntry({ label: 'Two', value: 2 }, 0)).toEqual({ value: '2', label: 'Two' })
    expect(optionEntry({ label: 'Two' }, 5)).toEqual({ value: '5', label: 'Two' })
  })

  it('still falls back to the position for an option that names nothing', () => {
    /*
     * The other control. An option carrying neither a value nor anything a value
     * could be read from has only its position to be named by, and inventing a
     * name for it would be worse.
     */
    expect(optionEntry({}, 4)).toEqual({ value: '4', label: '4' })
    expect(optionEntry(null, 2)).toEqual({ value: '2', label: '2' })
    expect(optionEntry(undefined, 7)).toEqual({ value: '7', label: '7' })
  })
})

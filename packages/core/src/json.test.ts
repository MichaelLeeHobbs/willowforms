import { describe, expect, it } from 'vitest'

import { findLanguage, languageTag } from './language.js'

import {
  isEmpty,
  jsonToString,
  optionEntry,
  optionValue,
  optionValues,
  readPath,
  safeHref,
  valueOf,
} from './json.js'
import type { JsonValue, Language } from './types.js'

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
    // Put back exactly what was there; it is never called detached.
    // eslint-disable-next-line @typescript-eslint/unbound-method
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

/**
 * A label that is not a string.
 *
 * `optionEntry` kept a label only when it was already a string, so
 * `{ label: 2024, value: 'y2024' }` -- what an author writing years in the JSON
 * options editor produces -- drew the value instead of the label. This file has
 * `jsonToString`, and every other read here uses it.
 */
describe('an option whose label is not a string', () => {
  it('renders a number or a boolean rather than dropping it', () => {
    expect(optionEntry({ label: 2024, value: 'y2024' }, 0)).toEqual({
      value: 'y2024',
      label: '2024',
    })
    expect(optionEntry({ label: false, value: 'no' }, 0)).toEqual({ value: 'no', label: 'false' })
  })

  it('falls back to the value for a label nobody could have written', () => {
    // The control. `null`, an object or a list is not a label a person typed,
    // and `[object Object]` under a control is worse than the value.
    expect(optionEntry({ label: null, value: 'a' }, 0)).toEqual({ value: 'a', label: 'a' })
    expect(optionEntry({ label: { deep: 1 }, value: 'b' }, 0)).toEqual({ value: 'b', label: 'b' })
    expect(optionEntry({ label: ['x'], value: 'c' }, 0)).toEqual({ value: 'c', label: 'c' })
  })
})

describe('the two option functions as actual inverses', () => {
  /*
   * The round-trip test in this file never called the function that produces
   * the spelling a control puts in the DOM.
   *
   * It computed the submitted string as `jsonToString(option.value)` -- the
   * same expression `optionValue` compares against internally -- so the
   * round-trip was symmetrical by construction and could not fail. The spelling
   * a control actually renders comes from `optionEntry`, which is what both
   * kits use.
   *
   * Driven through `optionEntry` here, so the two are tested as the inverses
   * their docblocks claim they are.
   */
  const roundTrip = (options: JsonValue[]): { rendered: string[]; resolved: JsonValue[] } => {
    const rendered = options.map((option, index) => optionEntry(option, index, options).value)
    return { rendered, resolved: rendered.map((value) => optionValue(options, value)) }
  }

  it('never renders two options with the same value', () => {
    /*
     * The defect, exactly. `[{label:'A'}, {label:'B', value:0}]` rendered two
     * `<option value="0">`: A took position 0 and B declared the number 0.
     */
    const options: JsonValue[] = [{ label: 'A' }, { label: 'B', value: 0 }]

    const { rendered } = roundTrip(options)

    expect(
      new Set(rendered).size,
      'two options render the same value: ' + rendered.join(', '),
    ).toBe(rendered.length)
  })

  it('resolves the option a user picked, not the one that shares its spelling', () => {
    /*
     * The consequence. Picking A submitted B's answer -- silently, and only
     * through the JSON options editor or a JSON Schema `enum` import rather
     * than through the normal picker, which is why nothing found it.
     */
    const options: JsonValue[] = [{ label: 'A' }, { label: 'B', value: 0 }]

    const { rendered, resolved } = roundTrip(options)

    expect(resolved[1], "B's declared value did not survive").toBe(0)
    expect(resolved[0], "picking A resolved to B's answer").not.toBe(0)
    expect(optionValue(options, rendered[0] ?? '')).toBe(rendered[0])
  })

  it.each([
    ['a mixed list', [{ label: 'A' }, { label: 'B', value: 0 }] as JsonValue[]],
    ['positions colliding both ways', [{ label: 'B', value: 1 }, { label: 'A' }] as JsonValue[]],
    [
      'a declared value matching a later position',
      [{ label: 'A', value: 2 }, {}, {}] as JsonValue[],
    ],
    ['bare strings, which declare themselves', ['Yes', 'No'] as JsonValue[]],
    ['a JSON Schema enum shape', ['a', 'b', 'c'] as JsonValue[]],
    ['options carrying neither label nor value', [{}, null, []] as JsonValue[]],
    ['a declared null, which is declared', [{ label: 'None', value: null }, {}] as JsonValue[]],
    ['numeric labels', [{ label: 2024, value: 'y2024' }, { label: 2025 }] as JsonValue[]],
  ])('round-trips %s through the spelling the kit rendered', (_what, options) => {
    const { rendered, resolved } = roundTrip(options)

    expect(new Set(rendered).size, 'duplicate rendered values: ' + rendered.join(', ')).toBe(
      rendered.length,
    )

    // Every option resolves back to something distinct, which is what "a
    // control's submitted value is the inverse of what it rendered" means.
    expect(new Set(resolved.map((value) => jsonToString(value))).size).toBe(options.length)
  })

  it('still hands back a value nobody rendered, unchanged', () => {
    // The control for the fallthrough: a submitted string matching no option is
    // what a control put in the DOM, and inventing a value would be worse.
    expect(optionValue([{ label: 'A' }], 'not-an-option')).toBe('not-an-option')
  })
})

describe('option fields read as own properties', () => {
  /*
   * `optionValue` and `optionEntry` read option fields with plain lookups where
   * the rest of the package reads own properties -- `valueOf`, `readPath` and
   * `schema.ts`, whose comment names "an application that has polluted
   * `Object.prototype.label`" as the case being defended against.
   *
   * With `Object.prototype.value` polluted, a valueless option resolved to the
   * inherited value and the control's submitted value stopped being the inverse
   * of what it rendered.
   */
  it('ignores a value inherited from Object.prototype', () => {
    const proto = Object.prototype as unknown as Record<string, unknown>
    proto['value'] = 'polluted'
    try {
      const options: JsonValue[] = [{ label: 'A' }, { label: 'B' }]
      const rendered = options.map((option, index) => optionEntry(option, index, options).value)

      expect(rendered).toEqual(['0', '1'])
      expect(optionValue(options, '0')).toBe('0')
    } finally {
      delete proto['value']
    }
  })
})

describe('a dialect the gate would not call one', () => {
  /*
   * `languageTag` used truthiness on `dialect` while the gate's deliberate copy
   * requires a string -- and `validateDocument` never reports a non-string
   * dialect. So `{"code":"en","dialect":5}` validated clean while this built
   * `en-5`, which `findLanguage` matched against nothing: the document named a
   * language it did not have, and every translation rendered as its raw key.
   */
  it.each([
    ['a number', 5],
    ['true', true],
    ['an object', {}],
  ])('falls back to the bare code when the dialect is %s', (_what, dialect) => {
    const language = { code: 'en', dialect, name: 'English', bidi: 'ltr' } as unknown as Language

    expect(languageTag(language)).toBe('en')
  })

  it('still builds the tag from a real dialect', () => {
    // The control. Always returning the bare code would pass every row above
    // while breaking en-US, which is what createDocument ships.
    expect(languageTag({ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' })).toBe('en-US')
  })

  it('finds the language a well-formed document names', () => {
    const languages: Language[] = [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }]

    expect(findLanguage(languages, 'en-US')?.code).toBe('en')
  })
})

describe('an option list that is not quite an option list', () => {
  /*
   * Three edge cases a reviewer found in the list-scoped option rule, none of
   * which had a test. They are grouped because they are one question asked
   * three ways: what counts as a value the author declared.
   */
  it('reads an own value of undefined as absent', () => {
    /*
     * `Object.hasOwn` said this option declared a value, so it rendered as the
     * empty string rather than falling back to its position -- and `undefined`
     * is not a `JsonValue`: `JSON.parse` never produces the key and
     * `JSON.stringify` drops it. It comes from an object literal a caller
     * built, which is where a key spelled out and left unset comes from.
     */
    const options = [
      { label: 'None', value: undefined },
      { label: 'One', value: 'one' },
    ]

    expect(optionEntry(options[0] as JsonValue, 0, options).value).toBe('0')
    expect(optionEntry(options[1] as JsonValue, 1, options).value).toBe('one')
  })

  it('still reads an own value of null as declared', () => {
    // The distinction the whole function exists for, and the control that stops
    // the fix above from swallowing it.
    const options = [{ label: 'None', value: null }]

    // `jsonToString(null)` is the empty string, and the point is that it is
    // that rather than the position: declared, not absent.
    expect(optionEntry(options[0] as JsonValue, 0, options).value).toBe('')
  })

  it('does not read a value off the prototype', () => {
    /*
     * The compatibility branch -- no list passed -- used a plain lookup, so an
     * option inheriting a `value` took one nobody wrote. A polluted
     * `Object.prototype` gives that to every object literal in the process, and
     * a caller that has not been updated is the last one that should be reading
     * through the chain.
     *
     * Built with an explicit prototype rather than by writing to
     * `Object.prototype`, so this test cannot leak into any other.
     */
    const inherited = Object.create({ value: 'from the prototype' }) as Record<string, JsonValue>
    inherited['label'] = 'Mine'

    expect(optionEntry(inherited as JsonValue, 3).value).toBe('3')
    expect(optionEntry(inherited as JsonValue, 3, [inherited]).value).toBe('3')
  })

  it('computes the value table once for a list, not once per option', () => {
    /*
     * `optionEntry` is called from inside `options.map(...)` in both kits and
     * called `optionValues(all)` on each of those calls, so a list of N options
     * was walked N times and a long select rendered in quadratic time.
     *
     * Counted through a proxy on the list rather than timed: a duration
     * assertion on a machine under load is a flake, and reads are the thing
     * that grew.
     */
    const options = Array.from({ length: 40 }, (_, i) => ({ label: 'L' + String(i) }))
    let reads = 0
    const watched = new Proxy(options, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1
        return Reflect.get(target, key, receiver) as unknown
      },
    })

    options.forEach((option, i) => optionEntry(option, i, watched))

    /*
     * One walk of the list, plus one indexed read per option for its own entry.
     * Quadratic would be 40 walks: over 1600. The bound is deliberately loose
     * -- what is being pinned is the shape, not an exact count.
     */
    expect(reads).toBeLessThan(options.length * 4)
  })

  it('still answers correctly for two different lists', () => {
    // The cache is keyed by list identity, so two lists must not share a table.
    const first = ['Yes', 'No']
    const second = ['No', 'Yes']

    expect(optionEntry(first[0] as JsonValue, 0, first).value).toBe('Yes')
    expect(optionEntry(second[0] as JsonValue, 0, second).value).toBe('No')
  })

  it('keeps index alignment through a hole in the list', () => {
    /*
     * `optionValues` built its output with `push` inside `forEach`, and
     * `forEach` skips the holes in a sparse array -- so `['a', , 'b']` produced
     * two entries for three options and everything after the hole was off by
     * one. `optionValue` resolves a submitted string by finding it in this list
     * and reading `options[at]`, so it answered with the wrong option: the
     * inverse relationship this pair exists to guarantee, broken.
     *
     * A hole cannot come from `JSON.parse`, so no document produces this. Both
     * functions are public exports, and `new Array(3)` is one line.
     */
    // Built by assignment rather than as `['first', , 'third']`, which
    // `no-sparse-arrays` refuses -- and rightly, since a hole in a literal is
    // almost always a typo. Here the hole is the subject.
    const sparse: unknown[] = new Array<unknown>(3)
    sparse[0] = 'first'
    sparse[2] = 'third'

    const values = optionValues(sparse)
    expect(values, 'the hole collapsed the list').toHaveLength(3)
    expect(values[0]).toBe('first')
    expect(values[2]).toBe('third')

    // The round trip, which is the thing that actually broke.
    expect(optionValue(sparse, 'third')).toBe('third')
  })

  it('gives a bare list the same answer with and without the list', () => {
    /*
     * Found while writing the test above, and it is the defect the list-scoped
     * rule was supposed to fix rather than cause. `declaredOf` returned nothing
     * for a bare scalar, so with the list passed `['Yes', 'No']` rendered as
     * `0` and `1` while the same list without one rendered `Yes` and `No` --
     * and both kits pass the list, so every caller that adopted the new rule
     * got the old bug back.
     *
     * The two branches have to agree, whatever they agree on. That is the whole
     * claim `optionEntry` and `optionValue` make about being inverses.
     */
    const bare = ['Yes', 'No', 7, true]

    bare.forEach((option, index) => {
      const withList = optionEntry(option, index, bare).value
      const without = optionEntry(option, index).value
      expect(withList, 'index ' + String(index)).toBe(without)
    })

    expect(bare.map((o, i) => optionEntry(o as JsonValue, i, bare).value)).toEqual([
      'Yes',
      'No',
      '7',
      'true',
    ])
  })
})

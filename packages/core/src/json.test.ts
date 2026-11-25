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
    expect(optionValue([{ label: 'First' }, { label: 'Second' }], '1')).toBe('1')
  })

  it('returns the empty placeholder unchanged', () => {
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
    const options = ['Yes', { label: 'No', value: '0' }]
    expect(optionValue(options, '0')).toBe('0')
  })

  it('still falls back to the position for an option with no declared value', () => {
    expect(optionValue(['Yes', 'No'], '1')).toBe('1')
  })

  it('takes the first of two options declaring one value', () => {
    const options = [
      { label: 'One', value: 'x' },
      { label: 'Two', value: 'x' },
    ]
    expect(optionValue(options, 'x')).toBe('x')
  })

  it('returns a string matching nothing as itself', () => {
    expect(optionValue([{ label: 'One', value: 1 }], '')).toBe('')
    expect(optionValue([{ label: 'One', value: 1 }], 'nope')).toBe('nope')
  })

  it('gives back the declared type, not the submitted string', () => {
    expect(optionValue([{ label: 'Two', value: 2 }], '2')).toBe(2)
    expect(optionValue([{ label: 'Yes', value: true }], 'true')).toBe(true)
  })
})

describe('safeHref', () => {
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
    // Backslash forms count because browsers normalise them to forward slashes.
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
    // An unterminated IPv6 host is what the WHATWG parser rejects, so these
    // reach the fallback that reads the scheme off the raw text.
    // `javascript:alert(1)#[` parses and would not.
    expect(URL.parse('javascript://[')).toBeNull()

    expect(safeHref('javascript://[')).toBeUndefined()
    expect(safeHref('vbscript://[')).toBeUndefined()
    expect(safeHref('data://[')).toBeUndefined()
  })

  it('still allows a safe scheme the parser cannot read', () => {
    expect(URL.parse('https://[')).toBeNull()
    expect(safeHref('https://[')).toBe('https://[')
  })

  it('decides by scheme on a runtime with no URL.parse', () => {
    // `URL.parse` is missing before Safari 18.
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
    expect(readPath(context, 'user.seats')).toBe(0)
    expect(readPath(context, 'user.active')).toBe(false)
  })

  it('is nothing for a step that is not there', () => {
    expect(readPath(context, 'user.email')).toBeUndefined()
    expect(readPath(context, 'nobody')).toBeUndefined()
    expect(readPath(context, 'user.role.deeper')).toBeUndefined()
  })

  it('does not walk the prototype', () => {
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

describe('isEmpty and objects', () => {
  it('reads an object with no keys as no answer', () => {
    expect(isEmpty({})).toBe(true)
  })

  it('reads an object that holds something as an answer', () => {
    expect(isEmpty({ a: 1 })).toBe(false)
    expect(isEmpty({ a: null })).toBe(false)
  })

  it('still reads false and 0 as answers', () => {
    expect(isEmpty(false)).toBe(false)
    expect(isEmpty(0)).toBe(false)
  })
})

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
      expect(valueOf({}, dataKey)).toBeUndefined()
    },
  )

  it('reads an own key that shadows an inherited one', () => {
    expect(valueOf({ toString: 'typed by a person' }, 'toString')).toBe('typed by a person')
  })

  it('does not walk into a polluted prototype from a request body', () => {
    // JSON.parse makes `__proto__` an own key rather than assigning through it,
    // so this is data, not an attack.
    const body = JSON.parse('{"__proto__":{"role":"admin"}}') as Record<string, never>
    expect(valueOf(body, 'role')).toBeUndefined()
  })
})

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
    expect(optionEntry({ label: 'Two', value: 2 }, 0)).toEqual({ value: '2', label: 'Two' })
    expect(optionEntry({ label: 'Two' }, 5)).toEqual({ value: '5', label: 'Two' })
  })

  it('still falls back to the position for an option that names nothing', () => {
    expect(optionEntry({}, 4)).toEqual({ value: '4', label: '4' })
    expect(optionEntry(null, 2)).toEqual({ value: '2', label: '2' })
    expect(optionEntry(undefined, 7)).toEqual({ value: '7', label: '7' })
  })
})

describe('an option whose label is not a string', () => {
  it('renders a number or a boolean rather than dropping it', () => {
    expect(optionEntry({ label: 2024, value: 'y2024' }, 0)).toEqual({
      value: 'y2024',
      label: '2024',
    })
    expect(optionEntry({ label: false, value: 'no' }, 0)).toEqual({ value: 'no', label: 'false' })
  })

  it('falls back to the value for a label nobody could have written', () => {
    expect(optionEntry({ label: null, value: 'a' }, 0)).toEqual({ value: 'a', label: 'a' })
    expect(optionEntry({ label: { deep: 1 }, value: 'b' }, 0)).toEqual({ value: 'b', label: 'b' })
    expect(optionEntry({ label: ['x'], value: 'c' }, 0)).toEqual({ value: 'c', label: 'c' })
  })
})

describe('the two option functions as actual inverses', () => {
  // Rendered through `optionEntry`, as the kits do. `jsonToString` is what
  // `optionValue` compares against, so a round trip through it passes by
  // construction.
  const roundTrip = (options: JsonValue[]): { rendered: string[]; resolved: JsonValue[] } => {
    const rendered = options.map((option, index) => optionEntry(option, index, options).value)
    return { rendered, resolved: rendered.map((value) => optionValue(options, value)) }
  }

  it('never renders two options with the same value', () => {
    const options: JsonValue[] = [{ label: 'A' }, { label: 'B', value: 0 }]

    const { rendered } = roundTrip(options)

    expect(
      new Set(rendered).size,
      'two options render the same value: ' + rendered.join(', '),
    ).toBe(rendered.length)
  })

  it('resolves the option a user picked, not the one that shares its spelling', () => {
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

    expect(new Set(resolved.map((value) => jsonToString(value))).size).toBe(options.length)
  })

  it('still hands back a value nobody rendered, unchanged', () => {
    expect(optionValue([{ label: 'A' }], 'not-an-option')).toBe('not-an-option')
  })
})

describe('option fields read as own properties', () => {
  it('ignores a value inherited from an option prototype', () => {
    const polluted = { value: 'polluted' }
    const option = (label: string): JsonValue =>
      Object.assign(Object.create(polluted) as Record<string, JsonValue>, { label })
    const options = [option('A'), option('B')]
    const rendered = options.map((entry, index) => optionEntry(entry, index, options).value)

    expect(rendered).toEqual(['0', '1'])
    expect(optionValue(options, '0')).toBe('0')
  })
})

describe('a dialect the gate would not call one', () => {
  it.each([
    ['a number', 5],
    ['true', true],
    ['an object', {}],
  ])('falls back to the bare code when the dialect is %s', (_what, dialect) => {
    const language = { code: 'en', dialect, name: 'English', bidi: 'ltr' } as unknown as Language

    expect(languageTag(language)).toBe('en')
  })

  it('still builds the tag from a real dialect', () => {
    expect(languageTag({ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' })).toBe('en-US')
  })

  it('finds the language a well-formed document names', () => {
    const languages: Language[] = [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }]

    expect(findLanguage(languages, 'en-US')?.code).toBe('en')
  })
})

describe('an option list that is not quite an option list', () => {
  it('reads an own value of undefined as absent', () => {
    const options = [
      { label: 'None', value: undefined },
      { label: 'One', value: 'one' },
    ]

    expect(optionEntry(options[0] as JsonValue, 0, options).value).toBe('0')
    expect(optionEntry(options[1] as JsonValue, 1, options).value).toBe('one')
  })

  it('still reads an own value of null as declared', () => {
    const options = [{ label: 'None', value: null }]

    // `jsonToString(null)` is the empty string: declared, not the position.
    expect(optionEntry(options[0] as JsonValue, 0, options).value).toBe('')
  })

  it('does not read a value off the prototype', () => {
    // An explicit prototype rather than a write to `Object.prototype`, so this
    // test cannot leak into any other.
    const inherited = Object.create({ value: 'from the prototype' }) as Record<string, JsonValue>
    inherited['label'] = 'Mine'

    expect(optionEntry(inherited as JsonValue, 3).value).toBe('3')
    expect(optionEntry(inherited as JsonValue, 3, [inherited]).value).toBe('3')
  })

  it('computes the value table once for a list, not once per option', () => {
    // Reads counted through a proxy rather than timed: a duration assertion on a
    // machine under load is a flake.
    const options = Array.from({ length: 40 }, (_, i) => ({ label: 'L' + String(i) }))
    let reads = 0
    const watched = new Proxy(options, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1
        return Reflect.get(target, key, receiver) as unknown
      },
    })

    options.forEach((option, i) => optionEntry(option, i, watched))

    // Linear is about 2N reads and quadratic over N squared. The bound is loose
    // on purpose: it pins the shape, not a count.
    expect(reads).toBeLessThan(options.length * 4)
  })

  it('still answers correctly for two different lists', () => {
    const first = ['Yes', 'No']
    const second = ['No', 'Yes']

    expect(optionEntry(first[0] as JsonValue, 0, first).value).toBe('Yes')
    expect(optionEntry(second[0] as JsonValue, 0, second).value).toBe('No')
  })

  it('keeps index alignment through a hole in the list', () => {
    // No document produces a hole, but both functions are public exports.
    // Assigned, because `no-sparse-arrays` refuses a literal with a hole.
    const sparse: unknown[] = new Array<unknown>(3)
    sparse[0] = 'first'
    sparse[2] = 'third'

    const values = optionValues(sparse)
    expect(values, 'the hole collapsed the list').toHaveLength(3)
    expect(values[0]).toBe('first')
    expect(values[2]).toBe('third')

    expect(optionValue(sparse, 'third')).toBe('third')
  })

  it('gives a bare list the same answer with and without the list', () => {
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

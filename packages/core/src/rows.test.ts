import { describe, expect, it } from 'vitest'

import {
  NO_ROWS,
  addressOf,
  applyChange,
  decodeAddress,
  decodeRow,
  encodeRow,
  pushRow,
  rowContext,
  rowsOf,
} from './rows.js'
import { DEFAULT_MESSAGES, isRowScope, validateForm } from './validation.js'
import { createDocument } from './factory.js'
import { validateDocument } from './tree.js'
import type { ComponentNode, FormData, FormDocument } from './types.js'

describe('the row coordinate', () => {
  const path = pushRow(pushRow(NO_ROWS, { key: 'addresses', index: 1 }), {
    key: 'contacts',
    index: 0,
  })

  it('reads outermost first', () => {
    expect(encodeRow(path)).toBe('addresses[1].contacts[0]')
  })

  it('is empty outside a repeater, so nothing else changes', () => {
    // Every existing error key and every existing selector stays byte-identical
    // for a document with no repeater. That is the whole migration story.
    expect(encodeRow(NO_ROWS)).toBe('')
    expect(addressOf(NO_ROWS, 'street')).toBe('street')
  })

  it('addresses a node under its rows', () => {
    expect(addressOf(path, 'street')).toBe('addresses[1].contacts[0].street')
  })

  it('round-trips', () => {
    expect(decodeRow(encodeRow(path))).toEqual(path)
    expect(decodeRow('')).toEqual(NO_ROWS)
  })

  it('refuses anything that is not a coordinate', () => {
    /*
     * Strict on purpose: no sign, no leading zero, no bare name. The grammar
     * parses unambiguously only because the key grammar excludes the dot and
     * the brackets, so it must not start accepting what that grammar refuses.
     */
    const bad = [
      'addresses',
      'addresses[]',
      'addresses[-1]',
      'addresses[01]',
      'addresses[1.5]',
      'add-resses[1]',
      '__proto__[0]',
      'addresses[1].',
      'addresses[1]contacts[0]',
    ]
    for (const text of bad) {
      expect(decodeRow(text), text).toBeUndefined()
    }
  })

  it('treats a value that is not a list as no rows', () => {
    for (const value of [undefined, null, 'text', 7, {}]) {
      expect(rowsOf(value as never), JSON.stringify(value)).toEqual([])
    }
    expect(rowsOf([{ a: 1 }])).toHaveLength(1)
  })

  it('treats a row that is not an object as an empty one', () => {
    // Rows arrive from a request body, so a ragged one is reachable. Reading it
    // as empty keeps every consumer total rather than throwing at the user.
    expect(rowContext(NO_ROWS, 'nonsense').values).toEqual({})
    expect(rowContext(NO_ROWS, ['a']).values).toEqual({})
    expect(rowContext(NO_ROWS, { street: 'x' }).values).toEqual({ street: 'x' })
  })
})

describe('validating a repeater', () => {
  const field = (key: string): ComponentNode => ({
    key,
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }] },
  })

  const form: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      field('email'),
      {
        key: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [field('line1'), field('postcode')],
      },
    ],
  }

  const twoRows: FormData = {
    email: 'a@b.co',
    addresses: [{ line1: '1 High Street', postcode: 'SW1A 1AA' }, { line1: '2 Low Street' }],
  }

  it('recognises a repeater from its shape, not from a type string', () => {
    // Component types are kit-scoped, so core must not learn the word Repeater.
    expect(isRowScope(form.children?.[1] as ComponentNode)).toBe(true)
    expect(isRowScope(form.children?.[0] as ComponentNode)).toBe(false)
    expect(isRowScope({ key: 'x', type: 'Stack', props: {}, children: [] })).toBe(false)
  })

  it('reports a missing answer against the row it is missing from', () => {
    expect(validateForm(form, twoRows)).toEqual({
      'addresses[1].postcode': DEFAULT_MESSAGES.required,
    })
  })

  it('is quiet when every row is answered', () => {
    const complete: FormData = { email: 'a@b.co', addresses: [{ line1: 'a', postcode: 'b' }] }
    expect(validateForm(form, complete)).toEqual({})
  })

  it('takes the row count from the data, never from a caller', () => {
    // A count from the request would let a client submit one row and have the
    // rest go unchecked, the discipline validateAcross already follows.
    expect(Object.keys(validateForm(form, { email: 'a@b.co', addresses: [] }))).toEqual([])
    expect(Object.keys(validateForm(form, { email: 'a@b.co', addresses: [{}, {}] }))).toEqual([
      'addresses[0].line1',
      'addresses[0].postcode',
      'addresses[1].line1',
      'addresses[1].postcode',
    ])
  })

  it('reports a field outside the repeater under its bare key', () => {
    expect(validateForm(form, { addresses: [] })).toEqual({ email: DEFAULT_MESSAGES.required })
  })
})

describe('a condition scoped to its row', () => {
  const form = (scope: 'form' | 'row' | undefined): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'orders',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          {
            key: 'vat',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [{ key: 'required' }] },
            renderWhen: {
              kind: 'condition',
              condition: {
                op: 'truthy',
                value: { kind: 'ref', dataKey: 'business', ...(scope ? { scope } : {}) },
              },
            },
          },
        ],
      },
    ],
  })

  const data: FormData = { business: true, orders: [{ business: false }, { business: true }] }

  it('reads the enclosing row when the scope says row', () => {
    // Row 0 says no, so its vat field is hidden and not required. Row 1 says so.
    expect(validateForm(form('row'), data)).toEqual({
      'orders[1].vat': DEFAULT_MESSAGES.required,
    })
  })

  it('reads the top level when the scope is absent, as every older document means', () => {
    expect(validateForm(form(undefined), data)).toEqual({
      'orders[0].vat': DEFAULT_MESSAGES.required,
      'orders[1].vat': DEFAULT_MESSAGES.required,
    })
  })

  it('does not fall back to the form when the row has no such field', () => {
    /*
     * The whole reason the scope is a discriminant rather than a fallback. Once
     * a name can mean either, no caller can tell which one it got, and the fix
     * is always another flavour of path.
     */
    expect(validateForm(form('row'), { business: true, orders: [{}] })).toEqual({})
  })
})

describe('the quiet failure, caught before anyone submits', () => {
  /*
   * A condition authored inside a repeater, naming a field that only exists in
   * a row, left at the default form scope. The read is undefined, the condition
   * is false, the component is hidden, and validateForm skips it: a required
   * answer becomes advisory, on the server, where nobody is looking. Nothing at
   * evaluation time can tell it apart from a form-scoped ref to a key the form
   * genuinely does not hold, so it takes a boot-time answer.
   */
  const doc = (scope: 'form' | 'row' | undefined): FormDocument => ({
    ...createDocument('Rows', 'rows'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'orders',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [] },
          children: [
            {
              key: 'business',
              type: 'Checkbox',
              props: {},
              schema: { type: 'boolean', validations: [] },
            },
            {
              key: 'vat',
              type: 'TextField',
              props: {},
              schema: { type: 'string', validations: [] },
              renderWhen: {
                kind: 'condition',
                condition: {
                  op: 'truthy',
                  value: { kind: 'ref', dataKey: 'business', ...(scope ? { scope } : {}) },
                },
              },
            },
          ],
        },
      ],
    },
  })

  it('reports a row field tested at form scope', () => {
    const errors = validateDocument(doc(undefined))
    expect(errors.map((e) => e.code)).toEqual(['row-scope'])
    expect(errors[0]?.key).toBe('vat')
    expect(errors[0]?.message).toContain('only exists inside a row')
  })

  it('says nothing once the test is scoped to the row', () => {
    expect(validateDocument(doc('row'))).toEqual([])
  })

  it('says nothing when the form really does hold that key too', () => {
    // Then form scope is a real choice rather than an oversight, and refusing
    // it would take away the one case the discriminant exists to allow.
    const withRoot = doc(undefined)
    // A distinct node key carrying the same data key: keys are unique, answers
    // may repeat, which is exactly the split the document model draws.
    withRoot.root.children?.unshift({
      key: 'accountType',
      dataKey: 'business',
      type: 'Checkbox',
      props: {},
      schema: { type: 'boolean', validations: [] },
    })
    expect(validateDocument(withRoot).map((e) => e.code)).toEqual([])
  })
})

describe('writing an answer at an address', () => {
  const data: FormData = {
    email: 'a@b.co',
    addresses: [{ line1: 'one' }, { line1: 'two', postcode: 'X' }],
  }

  it('is an ordinary write outside a repeater', () => {
    // A host that never adds a repeater sees no difference at all.
    expect(applyChange({ a: 1 }, 'a', 2)).toEqual({ a: 2 })
    expect(applyChange({ a: 1 }, 'b', 2)).toEqual({ a: 1, b: 2 })
  })

  it('places an answer in the row it names', () => {
    const next = applyChange(data, 'addresses[1].postcode', 'SW1A 1AA')
    expect(next['addresses']).toEqual([{ line1: 'one' }, { line1: 'two', postcode: 'SW1A 1AA' }])
  })

  it('leaves the rows it did not touch identical, not merely equal', () => {
    // Referential identity, so a kit comparing props by identity still skips
    // them. Equality would be true of a full copy and prove nothing.
    const next = applyChange(data, 'addresses[1].postcode', 'Y')
    const before = data['addresses'] as { line1: string }[]
    const after = next['addresses'] as { line1: string }[]
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(next).not.toBe(data)
  })

  it('changes nothing when the address cannot be placed', () => {
    /*
     * A row that is not there, a list that is not a list, a name the key
     * grammar refuses. Returning the input is what stops a hostile index
     * minting a sparse array with ten thousand holes.
     */
    for (const address of [
      'addresses[9].postcode',
      'email[0].postcode',
      'nothing[0].postcode',
      'addresses[1].__proto__',
      'addresses[1].bad-name',
      'addresses[-1].postcode',
    ]) {
      expect(applyChange(data, address, 'x'), address).toBe(data)
    }
  })

  it('reads an address back', () => {
    expect(decodeAddress('postcode')).toEqual({ path: NO_ROWS, name: 'postcode' })
    expect(decodeAddress('addresses[1].postcode')?.name).toBe('postcode')
    expect(encodeRow(decodeAddress('addresses[1].postcode')?.path ?? NO_ROWS)).toBe('addresses[1]')
    expect(decodeAddress('addresses[1]')).toBeUndefined()
  })
})

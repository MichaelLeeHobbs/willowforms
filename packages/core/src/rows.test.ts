import { describe, expect, it } from 'vitest'

import {
  NO_ROWS,
  addressOf,
  innermost,
  applyChange,
  decodeAddress,
  decodeRow,
  encodeRow,
  keyScopesFor,
  pushRow,
  rowContext,
  rowScopeProblems,
  rowsOf,
} from './rows.js'
import {
  DEFAULT_MESSAGES,
  NOT_A_LIST,
  isRequired,
  isRowScope,
  submittedData,
  validateForm,
} from './validation.js'
import { createDocument } from './factory.js'
import { MAX_TREE_DEPTH, findNode, findParent, moveNode, validateDocument } from './tree.js'
import type { ComponentNode, FormData, FormDocument, JsonValue } from './types.js'
import type { Evaluator } from './validation.js'

describe('the row coordinate', () => {
  const path = pushRow(pushRow(NO_ROWS, { key: 'addresses', index: 1 }), {
    key: 'contacts',
    index: 0,
  })

  it('reads outermost first', () => {
    expect(encodeRow(path)).toBe('addresses[1].contacts[0]')
  })

  it('names the innermost repeater, or nothing at the top level', () => {
    expect(innermost(path)).toEqual({ key: 'contacts', index: 0 })
    expect(innermost(NO_ROWS)).toBeUndefined()
  })

  it('is empty outside a repeater, so nothing else changes', () => {
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

  it('bounds the index at the digits a double still counts one by one', () => {
    // Fifteen digits is the last width where `String(Number(text))` gives back
    // the text, so a longer index would not round-trip.
    const fifteen = '999999999999999'
    const path = decodeRow('addresses[' + fifteen + ']')

    expect(path).toEqual([{ key: 'addresses', index: 999999999999999 }])
    expect(encodeRow(path ?? NO_ROWS)).toBe('addresses[' + fifteen + ']')

    expect(decodeRow('addresses[' + fifteen + '9]')).toBeUndefined()
    expect(decodeRow('addresses[1000000000000000000000]')).toBeUndefined()
  })

  it('treats a value that is not a list as no rows', () => {
    for (const value of [undefined, null, 'text', 7, {}]) {
      expect(rowsOf(value as never), JSON.stringify(value)).toEqual([])
    }
    expect(rowsOf([{ a: 1 }])).toHaveLength(1)
  })

  it('treats a row that is not an object as an empty one', () => {
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

  /** A field whose two names differ, so which one is used is visible. */
  const named = (key: string, dataKey: string): ComponentNode => ({
    ...field(key),
    dataKey,
  })

  /*
   * The row is addressed by the repeater's data key and the field by its node
   * key, which is only observable when they differ. `postcode` keeps one name
   * deliberately: a real document mixes the two.
   */
  const form: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      field('email'),
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [named('street', 'line1'), field('postcode')],
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
    // rest go unchecked.
    expect(Object.keys(validateForm(form, { email: 'a@b.co', addresses: [] }))).toEqual([])
    expect(Object.keys(validateForm(form, { email: 'a@b.co', addresses: [{}, {}] }))).toEqual([
      'addresses[0].street',
      'addresses[0].postcode',
      'addresses[1].street',
      'addresses[1].postcode',
    ])
  })

  it.each([
    ['a string', 'nope'],
    ['a number', 7],
    ['an object', { line1: 'a' }],
  ])('reports %s in a repeater rather than reading it as no rows', (_label, stored) => {
    // `rowsOf` reads a non-list as no rows, which suits `submittedData`.
    // Validation is the side that has to refuse.
    let errors: Record<string, string> = {}
    expect(() => {
      errors = validateForm(form, { addresses: stored })
    }).not.toThrow()

    // The keys first: `toEqual` treats a property whose value is `undefined` as
    // missing, so an undefined message constant would still pass.
    expect(Object.keys(errors).sort()).toEqual(['addressList', 'email'])
    expect(errors['addressList']).toBe('This list was not sent as a list.')
    expect(errors['addressList']).toBe(NOT_A_LIST)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
  ] as [string, JsonValue | undefined][])(
    'reads %s in a repeater as a list nobody has filled in',
    (_label, stored) => {
      expect(validateForm(form, { addresses: stored } as FormData)).toEqual({
        email: DEFAULT_MESSAGES.required,
      })
    },
  )

  it('still checks the rows of a list that is one', () => {
    expect(validateForm(form, { addresses: [{}] })).toEqual({
      'addresses[0].street': DEFAULT_MESSAGES.required,
      'addresses[0].postcode': DEFAULT_MESSAGES.required,
      email: DEFAULT_MESSAGES.required,
    })
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
    expect(validateForm(form('row'), { business: true, orders: [{}] })).toEqual({})
  })

  it('and says so at boot rather than leaving it quiet', () => {
    // The form must hold `business` for this to fire: a ref is reported only
    // when it belongs to the other scope, not when nothing writes its key.
    const document = { ...createDocument('Rows', 'rows'), root: form('row') }
    document.root.children?.unshift({
      key: 'business',
      type: 'Checkbox',
      props: {},
      schema: { type: 'boolean', validations: [] },
    })

    const errors = validateDocument(document)
    expect(errors.map((error) => error.code)).toEqual(['row-scope'])
    expect(errors[0]?.key).toBe('vat')
    expect(errors[0]?.message).toContain('only the form has that answer')
  })
})

describe('the quiet failure, caught before anyone submits', () => {
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
    const withRoot = doc(undefined)
    // Node keys are unique; data keys may repeat.
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
    expect(applyChange({ a: 1 }, 'a', 2)).toEqual({ a: 2 })
    expect(applyChange({ a: 1 }, 'b', 2)).toEqual({ a: 1, b: 2 })
  })

  it('places an answer in the row it names', () => {
    const next = applyChange(data, 'addresses[1].postcode', 'SW1A 1AA')
    expect(next['addresses']).toEqual([{ line1: 'one' }, { line1: 'two', postcode: 'SW1A 1AA' }])
  })

  it('leaves the rows it did not touch identical, not merely equal', () => {
    const next = applyChange(data, 'addresses[1].postcode', 'Y')
    const before = data['addresses'] as { line1: string }[]
    const after = next['addresses'] as { line1: string }[]
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(next).not.toBe(data)
  })

  it('changes nothing when the address cannot be placed', () => {
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

  it('changes nothing when the row is not an object', () => {
    for (const row of ['text', 7, null, ['a']]) {
      const ragged = { addresses: [row] }
      expect(applyChange(ragged, 'addresses[0].postcode', 'x'), JSON.stringify(row)).toBe(ragged)
    }
  })

  it('reads an address back', () => {
    expect(decodeAddress('postcode')).toEqual({ path: NO_ROWS, name: 'postcode' })
    expect(decodeAddress('addresses[1].postcode')?.name).toBe('postcode')
    expect(encodeRow(decodeAddress('addresses[1].postcode')?.path ?? NO_ROWS)).toBe('addresses[1]')
    expect(decodeAddress('addresses[1]')).toBeUndefined()
  })
})

describe('keyScopesFor', () => {
  /*
   * Every name differs from every other name on purpose. The repeater's node
   * key is not its data key, and no field's key is its data key, so a lookup
   * that confuses the two cannot pass by coincidence.
   */
  const tree = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'nameField',
        type: 'Field',
        props: {},
        dataKey: 'fullName',
        schema: { type: 'string', validations: [] },
      },
      {
        key: 'contactList',
        type: 'Repeater',
        props: {},
        dataKey: 'contacts',
        schema: { type: 'array', validations: [] },
        children: [
          {
            key: 'rowEmail',
            type: 'Field',
            props: {},
            dataKey: 'email',
            schema: { type: 'string', validations: [] },
          },
          {
            key: 'rowKind',
            type: 'Field',
            props: {},
            dataKey: 'kind',
            schema: { type: 'string', validations: [] },
          },
        ],
      },
    ],
  })

  it('offers only the top level to a node outside every row', () => {
    const scopes = keyScopesFor(tree(), 'nameField')

    expect(scopes.form).toEqual(['fullName', 'contacts'])
    expect(scopes.row).toBeUndefined()
  })

  it('offers the enclosing row as well, to a node inside one', () => {
    const scopes = keyScopesFor(tree(), 'rowEmail')

    expect(scopes.row).toEqual(['email', 'kind'])
    expect(scopes.form).toEqual(['fullName', 'contacts'])
  })

  it('names the row by the repeater data key rather than its node key', () => {
    expect(keyScopesFor(tree(), 'rowEmail').form).toContain('contacts')
    expect(keyScopesFor(tree(), 'rowEmail').form).not.toContain('contactList')
  })

  it('reads the innermost row, and stops at a nested repeater', () => {
    const root = tree()
    const list = root.children?.[1]
    list?.children?.push({
      key: 'noteList',
      type: 'Repeater',
      props: {},
      dataKey: 'notes',
      schema: { type: 'array', validations: [] },
      children: [
        {
          key: 'noteBody',
          type: 'Field',
          props: {},
          dataKey: 'body',
          schema: { type: 'string', validations: [] },
        },
      ],
    })

    expect(keyScopesFor(root, 'rowEmail').row).toEqual(['email', 'kind', 'notes'])
    expect(keyScopesFor(root, 'noteBody').row).toEqual(['body'])
  })

  it('says nothing about a key that is not in the tree', () => {
    expect(keyScopesFor(tree(), 'nowhere').row).toBeUndefined()
  })
})

/**
 * Every name in this fixture differs from every other, so a node key used where
 * a data key belongs shows in the output.
 */
describe('a repeater whose two names differ', () => {
  const rowField = (key: string, dataKey: string, required = false): ComponentNode => ({
    key,
    dataKey,
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: required ? [{ key: 'required' }] : [] },
  })

  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [rowField('street', 'line1', true), rowField('postal', 'postcode')],
      },
    ],
  }

  const data: FormData = {
    addresses: [{ line1: '1 High Street', postcode: 'SW1A 1AA' }, { postcode: 'X' }],
  }

  it('addresses a row by the answer name, not by the component name', () => {
    const errors = validateForm(root, data)

    expect(Object.keys(errors)).toEqual(['addresses[1].street'])
    expect(Object.keys(errors).some((key) => key.startsWith('addressList'))).toBe(false)
  })

  it('keeps the node key at the leaf, because that is identity', () => {
    expect(validateForm(root, data)['addresses[1].street']).toBe(DEFAULT_MESSAGES.required)
  })

  it('lands a keystroke in the row it was typed in', () => {
    const address = 'addresses[1].line1'
    const next = applyChange(data, address, '2 Low Street')

    expect(next).not.toBe(data)
    expect((next['addresses'] as FormData[])[1]).toEqual({
      postcode: 'X',
      line1: '2 Low Street',
    })
    expect((next['addresses'] as FormData[])[0]).toEqual({
      line1: '1 High Street',
      postcode: 'SW1A 1AA',
    })
  })

  it('collects the answer under the answer name', () => {
    expect(submittedData(root, data)).toEqual({
      addresses: [{ line1: '1 High Street', postcode: 'SW1A 1AA' }, { postcode: 'X' }],
    })
  })
})

describe('a repeater inside a repeater', () => {
  // Every name differs from every other, so which of the two names each
  // position uses is visible in every assertion.
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'orderList',
        type: 'Repeater',
        props: {},
        dataKey: 'orders',
        schema: { type: 'array', validations: [] },
        children: [
          {
            key: 'reference',
            dataKey: 'ref',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [{ key: 'required' }] },
          },
          {
            key: 'lineList',
            type: 'Repeater',
            props: {},
            dataKey: 'lines',
            schema: { type: 'array', validations: [] },
            children: [
              {
                key: 'sku',
                dataKey: 'code',
                type: 'TextField',
                props: {},
                schema: { type: 'string', validations: [{ key: 'required' }] },
              },
            ],
          },
        ],
      },
    ],
  }

  const data: FormData = {
    orders: [{ ref: 'A1', lines: [{ code: 'x' }, {}] }, { lines: [{}] }],
  }

  it('reports each missing answer at its full address', () => {
    expect(validateForm(root, data)).toEqual({
      'orders[0].lines[1].sku': DEFAULT_MESSAGES.required,
      'orders[1].reference': DEFAULT_MESSAGES.required,
      'orders[1].lines[0].sku': DEFAULT_MESSAGES.required,
    })
  })

  it('writes a keystroke into the inner row it was typed in', () => {
    // The leaf is the answer name here, not the node name: a write is addressed
    // as data all the way down, while an error is reported at the node.
    const next = applyChange(data, 'orders[0].lines[1].code', 'y')
    const orders = next['orders'] as FormData[]

    expect((orders[0]?.['lines'] as FormData[])[1]).toEqual({ code: 'y' })
    expect((orders[0]?.['lines'] as FormData[])[0]).toBe(
      ((data['orders'] as FormData[])[0]?.['lines'] as FormData[])[0],
    )
    expect(orders[1]).toBe((data['orders'] as FormData[])[1])
  })

  it('collects both levels under their answer names', () => {
    expect(submittedData(root, data)).toEqual({
      orders: [{ ref: 'A1', lines: [{ code: 'x' }, {}] }, { lines: [{}] }],
    })
  })

  it('keeps a row coordinate readable in both directions', () => {
    const address = 'orders[1].lines[0].sku'
    // Data keys in the prefixes, a node key at the leaf.
    const decoded = decodeAddress(address)
    expect(decoded?.name).toBe('sku')
    expect(encodeRow(decoded?.path ?? NO_ROWS)).toBe('orders[1].lines[0]')
    expect(addressOf(decoded?.path ?? NO_ROWS, 'sku')).toBe(address)
  })
})

describe('a rule guard inside a repeater', () => {
  const doc = (scope: 'form' | 'row' | undefined): FormDocument => ({
    ...createDocument('Rows', 'rows'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'orderList',
          dataKey: 'orders',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [] },
          children: [
            {
              key: 'businessBox',
              dataKey: 'business',
              type: 'Checkbox',
              props: {},
              schema: { type: 'boolean', validations: [] },
            },
            {
              key: 'vatField',
              dataKey: 'vat',
              type: 'TextField',
              props: {},
              schema: {
                type: 'string',
                validations: [
                  {
                    key: 'required',
                    when: {
                      kind: 'condition',
                      condition: {
                        op: 'truthy',
                        value: { kind: 'ref', dataKey: 'business', ...(scope ? { scope } : {}) },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  })

  it('reports a guard that reads a row field at form scope', () => {
    const errors = validateDocument(doc(undefined))

    expect(errors.map((e) => e.code)).toEqual(['row-scope'])
    expect(errors[0]?.key).toBe('vatField')
  })

  it('says nothing once the guard is scoped to the row', () => {
    expect(validateDocument(doc('row'))).toEqual([])
  })

  it('reports a guard on a property binding too', () => {
    const withProp = doc('row')
    const vat = withProp.root.children?.[0]?.children?.[1]
    if (!vat) throw new Error('fixture lost its field')
    vat.props = {
      disabled: {
        kind: 'condition',
        condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'business' } },
      },
    }

    expect(validateDocument(withProp).map((e) => e.code)).toEqual(['row-scope'])
  })
})

describe('a computed rule guard inside a repeater', () => {
  const vat: ComponentNode = {
    key: 'vatField',
    dataKey: 'vat',
    type: 'TextField',
    props: {},
    schema: {
      type: 'string',
      validations: [{ key: 'required', when: { kind: 'computed', expression: 'business' } }],
    },
  }

  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'orderList',
        dataKey: 'orders',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [vat],
      },
    ],
  }

  // Reads the answer the expression names: a constant would answer the same for
  // every row whether or not the row reached it.
  const evaluate: Evaluator = (expression, data) => data[expression] === true

  it('reads the row it guards', () => {
    const data = { orders: [{ business: true }, { business: false }] }

    expect(validateForm(root, data, { evaluate })).toEqual({
      'orders[0].vatField': DEFAULT_MESSAGES.required,
    })
  })

  it('still reads a form answer the row does not shadow', () => {
    expect(validateForm(root, { business: true, orders: [{}] }, { evaluate })).toEqual({
      'orders[0].vatField': DEFAULT_MESSAGES.required,
    })
  })

  it('lets the row shadow a form answer of the same name', () => {
    const data = { business: true, orders: [{ business: false }] }

    expect(validateForm(root, data, { evaluate })).toEqual({})
  })

  it('marks the field required in the rows where the rule applies', () => {
    const inRow = (values: FormData): boolean =>
      isRequired(vat, {}, { evaluate, row: rowContext(NO_ROWS, values) })

    expect(inRow({ business: true })).toBe(true)
    expect(inRow({ business: false })).toBe(false)
  })
})

describe('a cross-field rule and repeated scope', () => {
  const doc = (scope: 'form' | 'row' | undefined): FormDocument => ({
    ...createDocument('Rows', 'rows'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'accountList',
          dataKey: 'accounts',
          type: 'Repeater',
          props: {},
          schema: { type: 'array' },
          children: [
            {
              key: 'password',
              type: 'TextField',
              props: {},
              schema: { type: 'string' },
            },
            {
              key: 'confirmation',
              type: 'TextField',
              props: {},
              schema: {
                type: 'string',
                validations: [{ key: 'matches', field: 'password', ...(scope ? { scope } : {}) }],
              },
            },
          ],
        },
      ],
    },
  })

  it('reports a row field read at form scope', () => {
    expect(validateDocument(doc(undefined)).map((error) => error.code)).toEqual(['row-scope'])
  })

  it('accepts the comparison when it reads the enclosing row', () => {
    expect(validateDocument(doc('row'))).toEqual([])
  })

  it('reports a row-scoped comparison outside a repeater', () => {
    const top = createDocument('Top', 'top')
    top.root.children = [
      {
        key: 'confirmation',
        type: 'TextField',
        props: {},
        schema: {
          type: 'string',
          validations: [{ key: 'matches', field: 'password', scope: 'row' }],
        },
      },
    ]

    expect(validateDocument(top).map((error) => error.code)).toEqual(['row-scope'])
  })
})

describe('a row-scoped ref outside every row', () => {
  const doc = (scope: 'form' | 'row'): FormDocument => ({
    ...createDocument('Rows', 'rows'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
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
            condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'business', scope } },
          },
        },
      ],
    },
  })

  it('is reported', () => {
    const errors = validateDocument(doc('row'))

    expect(errors.map((e) => e.code)).toEqual(['row-scope'])
    expect(errors[0]?.key).toBe('vat')
  })

  it('says nothing about the same ref at form scope', () => {
    expect(validateDocument(doc('form'))).toEqual([])
  })
})

describe('validateForm and a body with too many rows', () => {
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          {
            key: 'street',
            dataKey: 'line1',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [{ key: 'required' }] },
          },
        ],
      },
    ],
  }

  it('validates a plausible number of rows', () => {
    const data: FormData = { addresses: Array.from({ length: 200 }, () => ({})) }

    expect(Object.keys(validateForm(root, data))).toHaveLength(200)
  })

  it('stops before a body can turn into unbounded work', () => {
    const data: FormData = { addresses: Array.from({ length: 100_000 }, () => ({})) }
    const errors = validateForm(root, data)

    expect(Object.keys(errors).length).toBeLessThan(100_000)
    expect(Object.values(errors).join(' ')).toContain('rows')
  })
})

describe('keyScopesFor on a document nobody gated', () => {
  const twice = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'firstList',
        dataKey: 'first',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          { key: 'shared', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
        ],
      },
      {
        key: 'secondList',
        dataKey: 'second',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          { key: 'shared', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
          { key: 'extra', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
        ],
      },
    ],
  })

  it('answers for the first node with that key, like every other lookup', () => {
    expect(keyScopesFor(twice(), 'shared').row).toEqual(['shared'])
  })

  it('answers rather than overflowing on a tree nested past the bound', () => {
    // A `RangeError` thrown from a React render unmounts the whole designer, not
    // one panel.
    let deep: ComponentNode = { key: 'leaf', type: 'Field', props: {} }
    for (let i = 0; i < 5000; i += 1) {
      deep = { key: 'stack' + String(i), type: 'Stack', props: {}, children: [deep] }
    }

    expect(() => keyScopesFor(deep, 'leaf')).not.toThrow()
  })
})

describe('the picker and validation agree on what a row holds at the depth bound', () => {
  /*
   * A nested repeater's own data key is a row answer only within
   * `MAX_TREE_DEPTH` levels of the outer repeater. The form also holds `inner`,
   * so a `scope: 'row'` ref to it is reported exactly when the row does not.
   */
  const doc = (levels: number): FormDocument => {
    let below: ComponentNode = {
      key: 'innerList',
      dataKey: 'inner',
      type: 'Repeater',
      props: {},
      schema: { type: 'array', validations: [] },
      children: [
        {
          key: 'innerField',
          type: 'Field',
          props: {},
          schema: { type: 'string', validations: [] },
        },
      ],
    }
    // `levels` containers between the outer repeater and the nested one, so the
    // nested repeater sits `levels + 1` below the outer repeater.
    for (let i = 0; i < levels; i += 1) {
      below = { key: 'stack' + String(i), type: 'Stack', props: {}, children: [below] }
    }
    return {
      ...createDocument('Deep rows', 'deep-rows'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'innerMirror',
            dataKey: 'inner',
            type: 'Field',
            props: {},
            schema: { type: 'string', validations: [] },
          },
          {
            key: 'outerList',
            dataKey: 'outer',
            type: 'Repeater',
            props: {},
            schema: { type: 'array', validations: [] },
            children: [
              {
                key: 'probe',
                type: 'Field',
                props: {},
                schema: { type: 'string', validations: [] },
                renderWhen: {
                  kind: 'condition',
                  condition: {
                    op: 'truthy',
                    value: { kind: 'ref', dataKey: 'inner', scope: 'row' },
                  },
                },
              },
              below,
            ],
          },
        ],
      },
    }
  }

  const reportedForProbe = (document: FormDocument): boolean =>
    validateDocument(document).some((e) => e.code === 'row-scope' && e.key === 'probe')

  it('offers and accepts the nested list one level inside the bound', () => {
    const inside = doc(MAX_TREE_DEPTH - 1)

    expect(keyScopesFor(inside.root, 'probe').row).toContain('inner')
    expect(reportedForProbe(inside)).toBe(false)
  })

  it('neither offers nor accepts the nested list one level past the bound', () => {
    const past = doc(MAX_TREE_DEPTH)

    expect(keyScopesFor(past.root, 'probe').row).not.toContain('inner')
    expect(reportedForProbe(past)).toBe(true)
  })
})

describe('the picker and validation agree that a top-level repeater is a form answer', () => {
  const field = (key: string, dataKey: string): ComponentNode => ({
    key,
    dataKey,
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  type Target = Pick<ComponentNode, 'renderWhen' | 'schema'>

  const doc = (sibling: ComponentNode, target: Target): FormDocument => ({
    ...createDocument('Own key', 'own-key'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'itemList',
          dataKey: 'items',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [] },
          children: [sibling, { ...field('targetField', 'target'), ...target }],
        },
      ],
    },
  })

  const sameName = field('rowItems', 'items')
  const otherName = field('streetField', 'street')

  const tested = (scope: 'form' | 'row'): Target => ({
    renderWhen: {
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'items', scope } },
    },
  })

  const compared = (scope: 'form' | 'row'): Target => ({
    schema: { type: 'string', validations: [{ key: 'matches', field: 'items', scope }] },
  })

  describe.each([
    ['a condition', tested],
    ['a cross-field rule', compared],
  ])('%s', (_what, target) => {
    it('is accepted at the form scope the picker offers, though the row shares the name', () => {
      const document = doc(sameName, target('form'))

      expect(keyScopesFor(document.root, 'targetField').form).toEqual(['items'])
      expect(validateDocument(document)).toEqual([])
    })

    it('is reported at the row scope the picker does not offer', () => {
      const document = doc(otherName, target('row'))
      const errors = validateDocument(document)

      expect(keyScopesFor(document.root, 'targetField').row).toEqual(['street', 'target'])
      expect(errors.map((error) => [error.code, error.key])).toEqual([['row-scope', 'targetField']])
    })
  })

  it('evaluates the form scope against the list, so the accepted condition shows the field', () => {
    const document = doc(sameName, {
      ...tested('form'),
      schema: { type: 'string', validations: [{ key: 'required' }] },
    })

    // The row's own `items` is empty, so only the list can make this true.
    expect(validateForm(document.root, { items: [{ items: '' }] })).toEqual({
      'items[0].targetField': DEFAULT_MESSAGES.required,
    })
  })
})

describe('a ref from a nested row to an answer only an outer row holds', () => {
  type Scope = 'form' | 'row'
  type Target = Pick<ComponentNode, 'props' | 'renderWhen' | 'schema'>

  const field = (key: string, dataKey: string, target: Partial<Target> = {}): ComponentNode => ({
    key,
    dataKey,
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
    ...target,
  })

  const repeater = (key: string, dataKey: string, children: ComponentNode[]): ComponentNode => ({
    key,
    dataKey,
    type: 'Repeater',
    props: {},
    schema: { type: 'array', validations: [] },
    children,
  })

  const doc = (children: ComponentNode[]): FormDocument => ({
    ...createDocument('Orders', 'orders-form'),
    root: { key: 'root', type: 'Screen', props: {}, children },
  })

  const nested = (target: Partial<Target>, inLines: ComponentNode[] = []): ComponentNode =>
    repeater('orderList', 'orders', [
      field('referenceField', 'reference'),
      repeater('lineList', 'lines', [...inLines, field('targetField', 'target', target)]),
    ])

  const truthy = (dataKey: string, scope: Scope) =>
    ({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey, scope } },
    }) as const

  const shown = (dataKey: string, scope: Scope): Partial<Target> => ({
    renderWhen: truthy(dataKey, scope),
  })

  const carriers: [string, (dataKey: string, scope: Scope) => Partial<Target>][] = [
    ['renderWhen', shown],
    ['a property', (dataKey, scope) => ({ props: { disabled: truthy(dataKey, scope) } })],
    [
      'a rule guard',
      (dataKey, scope) => ({
        schema: {
          type: 'string',
          validations: [{ key: 'required', when: truthy(dataKey, scope) }],
        },
      }),
    ],
    [
      'a matches rule',
      (dataKey, scope) => ({
        schema: { type: 'string', validations: [{ key: 'matches', field: dataKey, scope }] },
      }),
    ],
    [
      'an after rule',
      (dataKey, scope) => ({
        schema: { type: 'string', validations: [{ key: 'after', field: dataKey, scope }] },
      }),
    ],
  ]

  const scopes: Scope[] = ['form', 'row']

  const reported = (document: FormDocument): [string, string | undefined][] =>
    validateDocument(document).map((error) => [error.code, error.key])

  describe.each(carriers)('in %s', (_what, target) => {
    describe.each(scopes)('at %s scope', (scope) => {
      it.each([
        ['a field of the outer row', 'reference'],
        ["the nested repeater's own list", 'lines'],
      ])('is reported when it names %s', (_name, dataKey) => {
        const document = doc([nested(target(dataKey, scope))])
        const errors = validateDocument(document)

        expect(errors.map((error) => [error.code, error.key])).toEqual([
          ['row-scope', 'targetField'],
        ])
        expect(errors[0]?.message).toContain(dataKey + ', which only an outer row holds')
        expect(errors[0]?.message).not.toMatch(/scope|read this row/)

        const offered = keyScopesFor(document.root, 'targetField')
        expect(offered).toEqual({ form: ['orders'], row: ['target'] })
      })

      it('is accepted when the scope it names holds the key too', () => {
        const copy = field('referenceCopy', 'reference')
        const document =
          scope === 'row'
            ? doc([nested(target('reference', scope), [copy])])
            : doc([copy, nested(target('reference', scope))])

        expect(validateDocument(document)).toEqual([])
      })

      it('says nothing about a key no outer row holds', () => {
        const cousin = repeater('noteList', 'notes', [field('bodyField', 'body')])
        const order = nested(target('body', scope))

        expect(
          validateDocument(doc([{ ...order, children: [...(order.children ?? []), cousin] }])),
        ).toEqual([])
      })

      it('reaches past more than one outer row', () => {
        const three = (dataKey: string): FormDocument =>
          doc([
            repeater('orderList', 'orders', [
              field('referenceField', 'reference'),
              repeater('lineList', 'lines', [
                field('skuField', 'sku'),
                repeater('partList', 'parts', [
                  field('targetField', 'target', target(dataKey, scope)),
                ]),
              ]),
            ]),
          ])

        for (const dataKey of ['reference', 'lines', 'sku', 'parts']) {
          expect(reported(three(dataKey)), dataKey).toEqual([['row-scope', 'targetField']])
        }
      })
    })

    it('still suggests the row when this row holds the key as well as an outer one', () => {
      const errors = validateDocument(
        doc([nested(target('reference', 'form'), [field('referenceCopy', 'reference')])]),
      )

      expect(errors.map((error) => [error.code, error.key])).toEqual([['row-scope', 'targetField']])
      expect(errors[0]?.message).toMatch(/exists inside (a|this) row/)
    })

    it('still names the form when the form holds the key as well as an outer row', () => {
      const errors = validateDocument(
        doc([field('referenceCopy', 'reference'), nested(target('reference', 'row'))]),
      )

      expect(errors.map((error) => [error.code, error.key])).toEqual([['row-scope', 'targetField']])
      expect(errors[0]?.message).toContain('only the form has that answer')
    })
  })

  it('lets the nested repeater itself, and what follows it, read the outer row', () => {
    const inLines = repeater('lineList', 'lines', [field('targetField', 'target')])
    const document = doc([
      repeater('orderList', 'orders', [
        field('referenceField', 'reference'),
        { ...inLines, ...shown('reference', 'row') },
        field('afterField', 'after', shown('reference', 'row')),
      ]),
    ])

    expect(validateDocument(document)).toEqual([])
  })

  it('reports a field whose working condition moved into the nested repeater', () => {
    const before = doc([
      repeater('orderList', 'orders', [
        field('referenceField', 'reference'),
        field('movedField', 'moved', {
          ...shown('reference', 'row'),
          schema: { type: 'string', validations: [{ key: 'required' }] },
        }),
        repeater('lineList', 'lines', [field('skuField', 'sku')]),
      ]),
    ])
    const data: FormData = { orders: [{ reference: 'R1', lines: [{ sku: 'S1' }] }] }

    expect(validateDocument(before)).toEqual([])
    expect(validateForm(before.root, data)).toEqual({
      'orders[0].movedField': DEFAULT_MESSAGES.required,
    })

    const after = { ...before, root: moveNode(before.root, 'movedField', 'lineList') }

    expect(findParent(after.root, 'movedField')?.key).toBe('lineList')
    expect(validateForm(after.root, data)).toEqual({})
    expect(reported(after)).toEqual([['row-scope', 'movedField']])
  })

  // `validateDocument` catches a throw, so these two ask the check itself.
  it('walks past a malformed component in a nested row', () => {
    const broken = (part: Record<string, unknown>): ComponentNode => ({
      ...field('brokenField', 'broken'),
      ...part,
    })

    for (const part of [
      { renderWhen: 5 },
      { renderWhen: { kind: 'condition' } },
      { renderWhen: { kind: 'condition', condition: { op: 'eq', left: null, right: 7 } } },
      { props: 'disabled' },
      { schema: { type: 'string', validations: [null, 3, { key: 'matches', field: 4 }] } },
      { schema: { type: 'string', validations: [{ key: 'after', scope: 'row' }] } },
      { children: [null, 'text', 4] },
    ]) {
      const { root } = doc([nested(shown('reference', 'row'), [broken(part)])])

      const keys = rowScopeProblems(root).map((found) => found.key)
      expect(keys, JSON.stringify(part)).toEqual(['targetField'])
    }
  })

  it('walks repeaters nested to the depth bound, and no further', () => {
    // The innermost field sits `levels + 1` below the root.
    const chain = (levels: number): FormDocument => {
      let inner = field('targetField', 'target', shown('reference', 'row'))
      for (let i = levels; i > 0; i -= 1) {
        const held = i === 1 ? [field('referenceField', 'reference'), inner] : [inner]
        inner = repeater('list' + String(i), 'rows' + String(i), held)
      }
      return doc([inner])
    }

    const keys = (levels: number): string[] =>
      rowScopeProblems(chain(levels).root).map((found) => found.key)

    expect(keys(MAX_TREE_DEPTH - 1)).toEqual(['targetField'])
    expect(keys(MAX_TREE_DEPTH)).toEqual([])
    expect(keys(5000)).toEqual([])
  })
})

describe('the shape that told the two repeater predicates apart', () => {
  const odd = (children: unknown): ComponentNode =>
    ({
      key: 'addressList',
      dataKey: 'addresses',
      type: 'Repeater',
      props: {},
      schema: { type: 'array', validations: [] },
      children,
    }) as unknown as ComponentNode

  it.each([
    ['a number', 5],
    ['an object map', { '0': {} }],
    ['a string', 'ab'],
  ])('answers the same about children that are %s', (_what, children) => {
    expect(isRowScope(odd(children))).toBe(false)
  })

  it('still recognises a real repeater', () => {
    expect(isRowScope(odd([]))).toBe(true)
  })

  it('does not walk a malformed repeater as though it held rows', () => {
    const root: ComponentNode = { key: 'root', type: 'Screen', props: {}, children: [odd(5)] }

    expect(() => validateForm(root, { addresses: [{}] })).not.toThrow()
  })
})

describe('which node a duplicate key resolves to', () => {
  const twoNamed = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      { key: 'x', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          { key: 'x', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
        ],
      },
    ],
  })

  it('offers no row scope when the first match is not in a repeater', () => {
    expect(keyScopesFor(twoNamed(), 'x').row).toBeUndefined()
  })

  it('agrees with findNode about which node that is', () => {
    const root = twoNamed()
    const resolved = findNode(root, 'x')
    const atFormLevel = root.children?.[0]
    const insideRepeater = root.children?.[1]?.children?.[0]

    expect(atFormLevel, 'the fixture has no form-level x').toBeDefined()
    expect(resolved, 'findNode did not resolve x at all').toBe(atFormLevel)
    expect(resolved).not.toBe(insideRepeater)
    expect(keyScopesFor(root, 'x').row).toBeUndefined()
  })

  it('still offers a row scope when the first match really is in one', () => {
    const root = twoNamed()
    const onlyInside: ComponentNode = {
      ...root,
      children: [root.children?.[1] as ComponentNode],
    }

    expect(keyScopesFor(onlyInside, 'x').row).toBeDefined()
  })
})

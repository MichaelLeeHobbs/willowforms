import { describe, expect, it } from 'vitest'

import {
  NO_ROWS,
  addressOf,
  applyChange,
  decodeAddress,
  decodeRow,
  encodeRow,
  keyScopesFor,
  pushRow,
  rowContext,
  rowsOf,
} from './rows.js'
import { DEFAULT_MESSAGES, isRowScope, submittedData, validateForm } from './validation.js'
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

/**
 * Which keys a condition authored on a given node can name.
 *
 * The picker asks this. A ref inside a row that is left at the default scope
 * reads the top level, finds nothing, hides its component, and `validateForm`
 * then skips the rule — a required answer becoming advisory on the server. So
 * the panel has to be able to tell the two sets apart before it draws them.
 */
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
    // Not an empty list: there is no enclosing row to read at all.
    expect(scopes.row).toBeUndefined()
  })

  it('offers the enclosing row as well, to a node inside one', () => {
    const scopes = keyScopesFor(tree(), 'rowEmail')

    expect(scopes.row).toEqual(['email', 'kind'])
    // The row's keys are not top-level keys, which is the whole distinction.
    expect(scopes.form).toEqual(['fullName', 'contacts'])
  })

  it('names the row by the repeater data key rather than its node key', () => {
    // `contactList` is the node key and `contacts` is the answer's name. A
    // scope list built from identity rather than from storage would say the
    // former, and every fixture in this repository used to hide the difference.
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

    // The nested repeater's own key is an answer in the outer row; what it
    // holds is not, because that lives one row deeper.
    expect(keyScopesFor(root, 'rowEmail').row).toEqual(['email', 'kind', 'notes'])
    expect(keyScopesFor(root, 'noteBody').row).toEqual(['body'])
  })

  it('says nothing about a key that is not in the tree', () => {
    expect(keyScopesFor(tree(), 'nowhere').row).toBeUndefined()
  })
})

/**
 * A repeater whose node key is not its data key.
 *
 * Trap 11 in this repository's own test skill: every repeater fixture here set
 * `key` and `dataKey` to the same string, so the row-addressing design and its
 * opposite produced byte-identical output across the entire suite. The suite
 * could not see the defect it was written to prevent.
 *
 * So every name in this fixture differs from every other. `addressList` is
 * identity; `addresses` is what the payload calls the answer; `street` is a
 * node key and `line1` is its answer's name.
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
    /*
     * The coordinate is dereferenced in exactly one place, `applyChange`, and it
     * is dereferenced as data. Built from the node key it names a list the data
     * does not have — or worse, an unrelated list that happens to share the
     * name.
     */
    const errors = validateForm(root, data)

    expect(Object.keys(errors)).toEqual(['addresses[1].street'])
    expect(Object.keys(errors).some((key) => key.startsWith('addressList'))).toBe(false)
  })

  it('keeps the node key at the leaf, because that is identity', () => {
    // The prefix disambiguates rows; the leaf carries identity. Two components
    // may share a data key and still fail for different reasons.
    expect(validateForm(root, data)['addresses[1].street']).toBe(DEFAULT_MESSAGES.required)
  })

  it('lands a keystroke in the row it was typed in', () => {
    // The whole point. Under the node key this returned the input unchanged and
    // every edit inside a row was silently discarded.
    const address = 'addresses[1].line1'
    const next = applyChange(data, address, '2 Low Street')

    expect(next).not.toBe(data)
    expect((next['addresses'] as FormData[])[1]).toEqual({
      postcode: 'X',
      line1: '2 Low Street',
    })
    // The row it was not typed in is untouched.
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

/**
 * The third place a condition lives.
 *
 * A document holds conditions in three places: `renderWhen`, a `PropValue` on a
 * property, and a validation rule's `when` guard. `contextKeys` sweeps all
 * three. `rowScopeProblems` swept the first two, so a rule guard authored
 * inside a repeater and left at form scope was never reported — and that is the
 * worst of the three to miss, because the failure is the rule silently never
 * applying, on the server, which is the exact thing this check exists for.
 */
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
    // The second of the three sites, which was already swept. Kept as a control
    // so a change that narrows the sweep shows up here rather than nowhere.
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

/**
 * The mirror of the quiet failure, which was skipped by design.
 *
 * A form-scoped ref to a key that only exists in a row is reported. The reverse
 * — a `scope: 'row'` ref on a node that is not inside any repeater — was not,
 * and it always reads nothing: `operand` answers `undefined` when there is no
 * row, so the condition is false and the component is hidden forever.
 *
 * It is not a hypothetical. Dragging a conditional field out of a repeater
 * produces exactly this, and nothing about the document looks wrong afterwards.
 */
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
    // The control: at the top level, form scope is simply correct.
    expect(validateDocument(doc('form'))).toEqual([])
  })
})

/**
 * How many rows a submitted body can ask to be validated.
 *
 * The row count comes out of the data, which is right — asking the browser
 * would let a client submit one row and have the rest go unchecked. But it is
 * the *request body* that decides how much work happens, with no cap, and rows
 * nest multiplicatively.
 */
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
    // And says so, rather than quietly validating a prefix: a row nobody
    // checked is the permissive failure this project is organised against.
    expect(Object.values(errors).join(' ')).toContain('rows')
  })
})

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
  rowsOf,
} from './rows.js'
import {
  DEFAULT_MESSAGES,
  NOT_A_LIST,
  isRowScope,
  submittedData,
  validateForm,
} from './validation.js'
import { createDocument } from './factory.js'
import { validateDocument } from './tree.js'
import type { ComponentNode, FormData, FormDocument, JsonValue } from './types.js'

describe('the row coordinate', () => {
  const path = pushRow(pushRow(NO_ROWS, { key: 'addresses', index: 1 }), {
    key: 'contacts',
    index: 0,
  })

  it('reads outermost first', () => {
    expect(encodeRow(path)).toBe('addresses[1].contacts[0]')
  })

  it('names the innermost repeater, or nothing at the top level', () => {
    /*
     * Exported and untested. It is what `scope: 'row'` means -- the row you are
     * standing in, not the outermost one -- so a version that answered `path[0]`
     * would read the wrong row's answers in every nested repeater and nothing
     * would have said so.
     */
    expect(innermost(path)).toEqual({ key: 'contacts', index: 0 })
    expect(innermost(NO_ROWS)).toBeUndefined()
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

  it('bounds the index at the digits a double still counts one by one', () => {
    /*
     * The one part of the grammar carrying a stated invariant, and the one part
     * the rejection list never reached: its longest index was `addresses[1]`.
     *
     * Fifteen digits is the last width where `String(Number(text))` gives back
     * the text it was given. Relax the quantifier to `[0-9]*` and
     * `addresses[1000000000000000000000]` decodes to `1e21`, which `encodeRow`
     * writes as `addresses[1e+21]` -- a coordinate that no longer round-trips,
     * so an error is reported at an address no input can be found at.
     */
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

  /** A field whose two names differ, so which one is used is visible. */
  const named = (key: string, dataKey: string): ComponentNode => ({
    ...field(key),
    dataKey,
  })

  /*
   * `addressList` holding `addresses`, and `street` holding `line1`.
   *
   * Trap 11: this fixture set `key` and `dataKey` to the same string on the
   * repeater and on both of its fields, so the row addressing design and its
   * opposite produced identical output and nothing here could tell them apart.
   * The skill names this file as one of three that were fixed on 2026-08-30;
   * this describe was missed, which is exactly how a collapsed fixture survives.
   *
   * The row is addressed by the repeater's *data* key and the field by its
   * *node* key, which is only observable when they differ. `postcode` keeps one
   * name deliberately: a real document mixes the two, and a fixture where every
   * field is renamed tests a form nobody builds.
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
    // rest go unchecked, the discipline validateAcross already follows.
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
    /*
     * A repeater's value arrives from a request body, so it can be anything.
     *
     * This used to assert the opposite, and the opposite was the defect: no rows
     * means the rules inside the repeater do not run, so a body sending
     * `"addresses": "nope"` turned every required field inside that repeater
     * optional -- on the server, with nothing to see. The test called that "the
     * permissive answer this codebase takes deliberately", which is exactly the
     * silent permissive failure this project is organised against, defended in a
     * comment.
     *
     * `rowsOf` still reads a non-list as no rows, and that is still right for
     * `submittedData`: a projection submits what was asked and given. Validation
     * is the side that has to refuse.
     */
    let errors: Record<string, string> = {}
    expect(() => {
      errors = validateForm(form, { addresses: stored })
    }).not.toThrow()

    /*
     * The keys first, then the message. `toEqual` treats a property whose value
     * is `undefined` as a missing one, so asserting the whole object against a
     * constant that had been deleted passed -- measured, by stashing the fix and
     * watching this stay green.
     */
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
      /*
       * The other half, and the reason this is not simply "refuse anything that is
       * not an array". An absent repeater is a form nobody has got to yet, and
       * there is nothing inside it to check. Only an answer of the wrong *shape*
       * is a problem.
       */
      expect(validateForm(form, { addresses: stored } as FormData)).toEqual({
        email: DEFAULT_MESSAGES.required,
      })
    },
  )

  it('still checks the rows of a list that is one', () => {
    // The control. A repeater that refused every value would pass every row
    // above and validate nothing.
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

  it('and says so at boot rather than leaving it quiet', () => {
    /*
     * The other half, which this file used to leave out: the assertion above is
     * a required answer going unchecked because a condition read nothing, and a
     * test that certifies that as correct and stops there is a test that blesses
     * the silent-permissive ending. It is only acceptable because the document
     * carrying it is refused before anyone submits.
     *
     * The fixture has to say which form key it means for that to fire, since
     * `rowScopeProblems` reports a ref that demonstrably belongs to the other
     * scope and not one naming a key nothing in the document writes.
     */
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

  it('changes nothing when the row is not an object', () => {
    /*
     * The third branch of the same guard, and the one the list above cannot
     * reach: a missing row and a list that is not a list were both covered, and
     * a list whose *entry* is a string or a number was not. A row is read as a
     * record to write into, and writing into `'text'` produces an object with
     * one key and nothing of the row left.
     */
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
 * Two repeaters deep, which is where an address stops being decoration.
 *
 * Every repeater fixture in this file had one level, so `addresses[1].postcode`
 * and a single-frame row context produced the same answer as any number of
 * simpler schemes would have. The design says a row coordinate is a path, not a
 * pair, and nothing drove a nested one through the three functions that have to
 * agree about it: `validateForm` reports at an address, `applyChange` writes at
 * one, and `submittedData` reads the tree back out.
 */
describe('a repeater inside a repeater', () => {
  /*
   * Every name differs from every other name, on purpose.
   *
   * Trap 11, the same collapse the single-level describe above was rescued from
   * and this one was not: both repeaters set `key` and `dataKey` to the same
   * string and neither inner field carried a `dataKey` at all, so a frame built
   * from `dataKeyOf(node)` and a frame built from `node.key` produced identical
   * output at every level. This describe added nesting and no coverage of the
   * thing nesting was supposed to prove. `orderList` holds `orders`, `lineList`
   * holds `lines`, `reference` holds `ref` and `sku` holds `code`, so which of
   * the two names each position uses is now visible in every assertion.
   */
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
    // The sibling row and the sibling order are untouched, and identically so.
    expect((orders[0]?.['lines'] as FormData[])[0]).toBe(
      ((data['orders'] as FormData[])[0]?.['lines'] as FormData[])[0],
    )
    expect(orders[1]).toBe((data['orders'] as FormData[])[1])
  })

  it('collects both levels under their answer names', () => {
    // Not one node key anywhere in the payload: no `orderList`, no `lineList`,
    // no `reference`, no `sku`.
    expect(submittedData(root, data)).toEqual({
      orders: [{ ref: 'A1', lines: [{ code: 'x' }, {}] }, { lines: [{}] }],
    })
  })

  it('keeps a row coordinate readable in both directions', () => {
    const address = 'orders[1].lines[0].sku'
    // Both prefixes are data keys and the leaf is a node key, which is the whole
    // rule in one string.
    const decoded = decodeAddress(address)
    expect(decoded?.name).toBe('sku')
    expect(encodeRow(decoded?.path ?? NO_ROWS)).toBe('orders[1].lines[0]')
    expect(addressOf(decoded?.path ?? NO_ROWS, 'sku')).toBe(address)
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

/**
 * Which node the scopes are computed for, and how deep the walk goes.
 *
 * `keyScopesFor` runs during render -- the Properties panel and the Style tab
 * both call it in their component bodies -- so both of these are about what
 * happens on screen rather than about a walk in the abstract.
 */
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
    /*
     * Duplicate keys are a state `validateDocument` reports and cannot prevent,
     * and `findNode`, `findParent` and `pathTo` all take the first match and
     * say why. This took the last -- an unconditional assignment inside a walk
     * that keeps going -- so the panel offered one node's row keys while every
     * other lookup in the session resolved to another.
     */
    expect(keyScopesFor(twice(), 'shared').row).toEqual(['shared'])
  })

  it('answers rather than overflowing on a tree nested past the bound', () => {
    /*
     * The bound `rowScopeProblems` already carries. A `RangeError` thrown from
     * a React render unmounts the whole designer in React 19, not one panel.
     */
    let deep: ComponentNode = { key: 'leaf', type: 'Field', props: {} }
    for (let i = 0; i < 5000; i += 1) {
      deep = { key: 'stack' + String(i), type: 'Stack', props: {}, children: [deep] }
    }

    expect(() => keyScopesFor(deep, 'leaf')).not.toThrow()
  })
})

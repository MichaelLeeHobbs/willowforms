import { describe, expect, it } from 'vitest'

import { createDocument, emptyRoot, instantiate, prop } from './factory.js'
import { toJsonSchema, unexportableRules } from './schema.js'
import { MAX_KEY_LENGTH, keyProblem } from './keys.js'
import { validateForm } from './validation.js'
import type { ComponentDef } from './kit.js'
import type { ComponentNode, FormDocument } from './types.js'
import {
  collectKeys,
  dataKeyOf,
  duplicateNode,
  findNode,
  findParent,
  flatten,
  generateKey,
  insertNode,
  moveNode,
  pathTo,
  removeNode,
  updateNode,
  validateDocument,
  walk,
} from './tree.js'
import type { StructuralError } from './tree.js'

function leaf(key: string): ComponentNode {
  return { key, type: 'TextField', props: {} }
}

function container(key: string, children: ComponentNode[]): ComponentNode {
  return { key, type: 'Stack', props: {}, children }
}

function fixture(): ComponentNode {
  return container('root', [container('stack', [leaf('a'), leaf('b')]), leaf('c')])
}

const made = (def: ComponentDef, root: ComponentNode): ComponentNode => {
  const node = instantiate(def, root)
  if (!node) throw new Error('instantiate refused a definition this test expects it to accept')
  return node
}

describe('traversal', () => {
  it('collects keys parents-first, depth-first', () => {
    expect(collectKeys(fixture())).toEqual(['root', 'stack', 'a', 'b', 'c'])
  })

  it('finds a nested node and its parent', () => {
    const root = fixture()
    expect(findNode(root, 'b')?.key).toBe('b')
    expect(findParent(root, 'b')?.key).toBe('stack')
  })

  it('reports the root as having no parent', () => {
    expect(findParent(fixture(), 'root')).toBeUndefined()
  })

  it('returns the full path to a node, and an empty path for a miss', () => {
    expect(pathTo(fixture(), 'b')).toEqual(['root', 'stack', 'b'])
    expect(pathTo(fixture(), 'nope')).toEqual([])
  })
})

describe('generateKey', () => {
  it('uses the bare camelCase type when free', () => {
    expect(generateKey(emptyRoot(), 'TextField')).toBe('textField')
  })

  it('suffixes from 2 upward, skipping taken keys', () => {
    const root = container('root', [leaf('textField'), leaf('textField2')])
    expect(generateKey(root, 'TextField')).toBe('textField3')
  })

  it.each([
    ['Date-Picker', 'datePicker', 'a hyphen, which an expression would read as a subtraction'],
    ['2FA', 'field', 'a leading digit, which no key may start with'],
    ['Field Set', 'fieldSet', 'a space'],
    ['!!!', 'field', 'nothing usable at all'],
    ['__proto__', 'field', 'a name that is reserved rather than merely malformed'],
  ])('mints a legal key from %s', (type, expected) => {
    const key = generateKey(emptyRoot(), type)

    expect(key).toBe(expected)
    expect(keyProblem(key)).toBeUndefined()
  })

  it.each<[string, number, number[]]>([
    ['a 128-character base', MAX_KEY_LENGTH, []],
    ['a 127-character base needing two digits', MAX_KEY_LENGTH - 1, [2, 3, 4, 5, 6, 7, 8, 9]],
  ])('numbers %s within MAX_KEY_LENGTH', (_label, length, suffixes) => {
    const base = 'a'.repeat(length)
    const root = container('root', [leaf(base), ...suffixes.map((n) => leaf(base + String(n)))])
    const type = 'A' + 'a'.repeat(length - 1)

    const key = generateKey(root, type)

    expect(key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH)
    expect(keyProblem(key)).toBeUndefined()
    expect(collectKeys(root)).not.toContain(key)
    expect(key.startsWith('a')).toBe(true)
  })
})

describe('mutations: what they return, and what they leave alone', () => {
  it('insertNode leaves the original tree untouched', () => {
    const before = fixture()
    const after = insertNode(before, 'stack', leaf('d'))
    expect(collectKeys(before)).toEqual(['root', 'stack', 'a', 'b', 'c'])
    expect(collectKeys(after)).toEqual(['root', 'stack', 'a', 'b', 'd', 'c'])
  })

  it('inserts at an explicit index', () => {
    const after = insertNode(fixture(), 'stack', leaf('d'), 0)
    expect(findNode(after, 'stack')?.children?.map((c) => c.key)).toEqual(['d', 'a', 'b'])
  })

  it('clamps an out-of-range index instead of producing holes', () => {
    const after = insertNode(fixture(), 'stack', leaf('d'), 99)
    expect(findNode(after, 'stack')?.children?.map((c) => c.key)).toEqual(['a', 'b', 'd'])
  })

  it('clamps a negative index to the front', () => {
    /*
     * `splice` already clamps a start below `-length` to 0, so only an index like
     * `-1` on three children shows whether `Math.max` clamps.
     */
    const wide = container('root', [container('stack', [leaf('a'), leaf('b'), leaf('c')])])

    const after = insertNode(wide, 'stack', leaf('d'), -1)
    expect(findNode(after, 'stack')?.children?.map((c) => c.key)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('appends for an index that is not a position at all', () => {
    for (const index of [NaN, Infinity, -Infinity]) {
      expect(
        findNode(insertNode(fixture(), 'stack', leaf('d'), index), 'stack')?.children?.map(
          (c) => c.key,
        ),
        String(index),
      ).toEqual(['a', 'b', 'd'])
    }
  })

  it('removes a nested node', () => {
    expect(collectKeys(removeNode(fixture(), 'a'))).toEqual(['root', 'stack', 'b', 'c'])
  })

  it('removeNode leaves the original tree untouched', () => {
    const before = fixture()
    const keysBefore = collectKeys(before)
    const stackBefore = findNode(before, 'stack')

    removeNode(before, 'a')

    expect(collectKeys(before)).toEqual(keysBefore)
    expect(findNode(before, 'a')).toBeDefined()
    expect(findNode(before, 'stack')).toBe(stackBefore)
    expect(stackBefore?.children?.map((child) => child.key)).toEqual(['a', 'b'])
  })

  it('refuses to remove the root', () => {
    expect(collectKeys(removeNode(fixture(), 'root'))).toEqual(['root', 'stack', 'a', 'b', 'c'])
  })

  it('updates one node and rebuilds only its ancestors', () => {
    const before = fixture()
    const after = updateNode(before, 'a', (n) => ({ ...n, props: { label: prop('Hi') } }))
    expect(findNode(after, 'a')?.props['label']).toEqual({ kind: 'static', value: 'Hi' })
    // Untouched subtrees keep referential identity, which is what memoisation needs.
    expect(findNode(after, 'c')).toBe(findNode(before, 'c'))
    expect(findNode(after, 'b')).toBe(findNode(before, 'b'))
    expect(findNode(after, 'stack')).not.toBe(findNode(before, 'stack'))
  })
})

describe('moveNode', () => {
  it('reparents a node', () => {
    const after = moveNode(fixture(), 'c', 'stack', 0)
    expect(findNode(after, 'stack')?.children?.map((n) => n.key)).toEqual(['c', 'a', 'b'])
    expect(after.children?.map((n) => n.key)).toEqual(['stack'])
  })

  it('refuses to drop a container into its own descendant', () => {
    const after = moveNode(fixture(), 'stack', 'a')
    expect(collectKeys(after)).toEqual(['root', 'stack', 'a', 'b', 'c'])
  })

  it('refuses to move the root', () => {
    expect(collectKeys(moveNode(fixture(), 'root', 'stack'))).toEqual([
      'root',
      'stack',
      'a',
      'b',
      'c',
    ])
  })

  it('ignores unknown source or target keys', () => {
    expect(collectKeys(moveNode(fixture(), 'ghost', 'stack'))).toEqual(collectKeys(fixture()))
    expect(collectKeys(moveNode(fixture(), 'a', 'ghost'))).toEqual(collectKeys(fixture()))
  })

  /*
   * The index counts from the list without the node, because `moveNode` composes
   * `insertNode(removeNode(...))`. The designer's `dnd.ts` adjusts its indexes
   * for this, so it is a contract, not an accident.
   */
  const order = (root: ComponentNode, parent: string): string[] | undefined =>
    findNode(root, parent)?.children?.map((child) => child.key)

  const three = (): ComponentNode =>
    container('root', [container('stack', [leaf('a'), leaf('b'), leaf('c')])])

  it('reorders within one parent, counting from the list without the node', () => {
    expect(order(moveNode(three(), 'a', 'stack', 2), 'stack')).toEqual(['b', 'c', 'a'])
    expect(order(moveNode(three(), 'a', 'stack', 1), 'stack')).toEqual(['b', 'a', 'c'])
  })

  it('reorders upwards by the same rule', () => {
    expect(order(moveNode(three(), 'c', 'stack', 0), 'stack')).toEqual(['c', 'a', 'b'])
    expect(order(moveNode(three(), 'c', 'stack', 1), 'stack')).toEqual(['a', 'c', 'b'])
  })

  it('keeps the node exactly once, wherever it lands', () => {
    for (const index of [0, 1, 2, 3, 99]) {
      expect(order(moveNode(three(), 'b', 'stack', index), 'stack')?.sort()).toEqual([
        'a',
        'b',
        'c',
      ])
    }
  })

  it('moves to the end when no index is given', () => {
    expect(order(moveNode(three(), 'a', 'stack'), 'stack')).toEqual(['b', 'c', 'a'])
  })
})

describe('validateDocument', () => {
  it('reports an unreadable object instead of throwing', () => {
    const unreadable = new Proxy(
      {},
      {
        get: () => {
          throw new Error('unreadable')
        },
      },
    )

    expect(validateDocument(unreadable)).toEqual([
      { code: 'malformed', message: 'The form document could not be read safely.' },
    ])
  })
  it('accepts a well-formed document', () => {
    const doc = createDocument('Test', 'id-1')
    doc.root = fixture()
    expect(validateDocument(doc)).toEqual([])
  })

  it('reports duplicate keys', () => {
    const doc = createDocument('Test', 'id-1')
    doc.root = container('root', [leaf('dupe'), leaf('dupe')])
    const errors = validateDocument(doc)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('duplicate-key')
    expect(errors[0]?.key).toBe('dupe')
  })

  it('reports an empty key', () => {
    const doc = createDocument('Test', 'id-1')
    doc.root = container('root', [leaf('   ')])
    expect(validateDocument(doc).map((e) => e.code)).toContain('empty-key')
  })

  it('reports an event referencing an undefined action', () => {
    const doc = createDocument('Test', 'id-1')
    doc.root = container('root', [
      {
        key: 'a',
        type: 'Button',
        props: {},
        events: { onClick: [{ name: 'ghost', type: 'code' }] },
      },
    ])
    expect(validateDocument(doc).map((e) => e.code)).toContain('unknown-action')
  })

  it('accepts an event referencing a defined action', () => {
    const doc = createDocument('Test', 'id-1')
    doc.actions['submit'] = { name: 'submit', body: '', params: {} }
    doc.root = container('root', [
      {
        key: 'a',
        type: 'Button',
        props: {},
        events: { onClick: [{ name: 'submit', type: 'code' }] },
      },
    ])
    expect(validateDocument(doc)).toEqual([])
  })

  it('reports a defaultLanguage that is not in the language list', () => {
    const doc = createDocument('Test', 'id-1')
    doc.defaultLanguage = 'fr-FR'
    expect(validateDocument(doc).map((e) => e.code)).toContain('unknown-language')
  })
})

/*
 * The gate for untrusted documents (pasted JSON, demo-server request bodies): it
 * must judge anything without throwing.
 */
describe('validateDocument against malformed input', () => {
  const wellFormed = (): FormDocument => ({
    version: '1',
    id: 'doc',
    name: 'Doc',
    root: { key: 'root', type: 'Screen', props: {} },
    actions: {},
    // `en-US`, as `createDocument` produces: with no dialect, tag and code are
    // the same string and the language checks prove nothing.
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  })

  const judge = (mutate: (doc: Record<string, unknown>) => void): StructuralError[] => {
    const doc = wellFormed() as unknown as Record<string, unknown>
    mutate(doc)
    return validateDocument(doc)
  }

  it('accepts the fixture the table mutates', () => {
    expect(judge(() => undefined)).toEqual([])
  })

  it.each([
    [
      'a number for children',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['children'] = 5),
      'root.children must be an array.',
    ],
    [
      'a string for children',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['children'] = 'abc'),
      'root.children must be an array.',
    ],
    [
      'a null root',
      (d: Record<string, unknown>) => (d['root'] = null),
      'root is not a component node.',
    ],
    [
      'a missing root',
      (d: Record<string, unknown>) => delete d['root'],
      'root is not a component node.',
    ],
    [
      'a number for a key',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['key'] = 7),
      'root needs a string key.',
    ],
    [
      'a missing type',
      (d: Record<string, unknown>) => delete (d['root'] as Record<string, unknown>)['type'],
      'root needs a string type.',
    ],
    [
      'a string for events',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['events'] = 'go'),
      'root.events must be an object.',
    ],
    [
      'a non-array event list',
      (d: Record<string, unknown>) =>
        ((d['root'] as Record<string, unknown>)['events'] = { onClick: 1 }),
      'root.events must map each event to an array.',
    ],
    [
      'a null in an event list',
      (d: Record<string, unknown>) =>
        ((d['root'] as Record<string, unknown>)['events'] = { onClick: [null] }),
      'root.events contains an entry that is not an action reference.',
    ],
    [
      'a number for languages',
      (d: Record<string, unknown>) => (d['languages'] = 3),
      'languages must be an array.',
    ],
    [
      'a language with no code',
      (d: Record<string, unknown>) => (d['languages'] = [{ name: 'X' }]),
      'every language needs a string code.',
    ],
    [
      'a null for actions',
      (d: Record<string, unknown>) => (d['actions'] = null),
      'actions must be an object.',
    ],
    [
      'a nested non-node child',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['children'] = [42]),
      'root.children[0] is not a component node.',
    ],
  ])('reports rather than throws on %s', (_label, mutate, expected) => {
    let errors: StructuralError[] = []
    expect(() => {
      errors = judge(mutate)
    }).not.toThrow()
    expect(errors.length, 'malformed input was accepted silently').toBeGreaterThan(0)
    expect(
      errors.map((error) => error.message),
      'reported, but not for the reason this row is about',
    ).toContain(expected)
  })

  it('survives values that are not objects at all', () => {
    for (const value of [null, undefined, 42, 'text', [], true]) {
      expect(() => validateDocument(value)).not.toThrow()
      expect(validateDocument(value).length).toBeGreaterThan(0)
    }
  })

  it('still accepts a well-formed document', () => {
    expect(validateDocument(wellFormed())).toEqual([])
  })

  it('still catches the ordinary structural mistakes', () => {
    const duplicates = wellFormed()
    duplicates.root.children = [
      { key: 'same', type: 'Field', props: {} },
      { key: 'same', type: 'Field', props: {} },
    ]
    expect(validateDocument(duplicates).map((e) => e.code)).toContain('duplicate-key')

    const badLanguage = wellFormed()
    badLanguage.defaultLanguage = 'fr'
    expect(validateDocument(badLanguage).map((e) => e.code)).toContain('unknown-language')
  })
})

describe('structural sharing', () => {
  const tree = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'left',
        type: 'Stack',
        props: {},
        children: [leaf('a'), leaf('b')],
      },
      {
        key: 'right',
        type: 'Stack',
        props: {},
        children: [leaf('c')],
      },
    ],
  })

  it('keeps untouched subtrees identical after an update', () => {
    const before = tree()
    const after = updateNode(before, 'a', (n) => ({ ...n, type: 'Changed' }))

    expect(after).not.toBe(before)
    expect(after.children?.[0]).not.toBe(before.children?.[0])
    expect(after.children?.[1]).toBe(before.children?.[1])
    expect(after.children?.[0]?.children?.[1]).toBe(before.children?.[0]?.children?.[1])
  })

  it('updates the root itself', () => {
    const before = tree()
    const after = updateNode(before, 'root', (node) => ({ ...node, type: 'Wizard' }))

    expect(after.type).toBe('Wizard')
    expect(after.children).toBe(before.children)
  })

  it('returns the same tree when an update matches nothing', () => {
    const before = tree()
    expect(updateNode(before, 'missing', (n) => n)).toBe(before)
  })

  it('keeps untouched subtrees identical after a removal', () => {
    const before = tree()
    const after = removeNode(before, 'a')

    expect(after.children?.[0]?.children?.map((c) => c.key)).toEqual(['b'])
    expect(after.children?.[1]).toBe(before.children?.[1])
  })

  it('returns the same tree when a removal matches nothing', () => {
    const before = tree()
    expect(removeNode(before, 'missing')).toBe(before)
  })

  it('refuses to move a node into a leaf', () => {
    // No renderer draws a subtree under a leaf, but `validateForm` and `toJsonSchema`
    // walk it: a required field nobody can fill in.
    const before = tree()
    expect(moveNode(before, 'b', 'a'), 'a leaf is not a parent').toBe(before)
  })

  it('returns the same tree for an illegal move', () => {
    const before = tree()
    expect(moveNode(before, 'left', 'a'), 'a container moved into its own child').toBe(before)
    expect(moveNode(before, 'missing', 'root')).toBe(before)
    expect(moveNode(before, 'root', 'left'), 'the root cannot move').toBe(before)
  })
})

describe('duplicateNode', () => {
  const tree = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'stack',
        type: 'Stack',
        props: { direction: { kind: 'static', value: 'row' } },
        children: [
          { key: 'textField', type: 'TextField', props: {} },
          { key: 'textField2', type: 'TextField', props: {} },
        ],
      },
    ],
  })

  it('re-keys the copied node', () => {
    const copy = duplicateNode(tree(), 'stack')
    expect(copy?.key).toBe('stack2')
    expect(copy?.type).toBe('Stack')
  })

  it('re-keys every descendant, reserving each key as it goes', () => {
    const copy = duplicateNode(tree(), 'stack')
    const keys = copy?.children?.map((child) => child.key)
    expect(keys).toEqual(['textField3', 'textField4'])
    expect(new Set(keys).size).toBe(2)
  })

  it('produces a subtree whose keys are all free in the original', () => {
    const original = tree()
    const copy = duplicateNode(original, 'stack')
    const taken = new Set(collectKeys(original))

    expect(copy).toBeDefined()
    for (const key of collectKeys(copy as ComponentNode)) {
      expect(taken.has(key), key + ' collides with a key already in the document').toBe(false)
    }
  })

  it('validates once inserted', () => {
    const original = tree()
    const copy = duplicateNode(original, 'stack')
    const next = insertNode(original, 'root', copy as ComponentNode, 1)
    const document = { ...createDocument('Duplicated', 'doc'), root: next }

    expect(validateDocument(document)).toEqual([])
  })

  it('re-points a condition that named the copied node at the copy', () => {
    const original: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'step',
          type: 'Step',
          props: {},
          renderWhen: {
            kind: 'condition',
            condition: {
              op: 'eq',
              left: { kind: 'context', path: 'step' },
              right: { kind: 'literal', value: 'step' },
            },
          },
        },
      ],
    }

    const copy = duplicateNode(original, 'step')
    expect(copy?.key).toBe('step2')
    expect(copy?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: 'step2' },
      },
    })
  })

  it('leaves a literal that merely matches the copied key alone', () => {
    const original: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'panel',
          type: 'Stack',
          props: {},
          renderWhen: {
            kind: 'condition',
            condition: {
              op: 'eq',
              left: { kind: 'ref', dataKey: 'chosen' },
              right: { kind: 'literal', value: 'panel' },
            },
          },
        },
      ],
    }

    const copy = duplicateNode(original, 'panel')
    expect(copy?.key).toBe('panel2')
    expect(copy?.renderWhen).toEqual(original.children?.[0]?.renderWhen)
  })

  it('copies css and events without sharing the records that hold them', () => {
    const original: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'card',
          type: 'Box',
          props: {},
          css: { any: 'padding: 8px' },
          events: { onClick: [{ name: 'save', type: 'code' }] },
        },
      ],
    }

    const source = original.children?.[0]
    const copy = duplicateNode(original, 'card')

    expect(copy?.css).toEqual({ any: 'padding: 8px' })
    expect(copy?.css).not.toBe(source?.css)
    expect(copy?.events).toEqual({ onClick: [{ name: 'save', type: 'code' }] })
    expect(copy?.events).not.toBe(source?.events)
    expect(copy?.events?.['onClick']).not.toBe(source?.events?.['onClick'])
  })

  it('copies props and rules without sharing the records that hold them', () => {
    const original = tree()
    const withRules: ComponentNode = {
      ...original,
      children: [
        {
          key: 'email',
          type: 'TextField',
          props: { label: { kind: 'static', value: 'Email' } },
          schema: { type: 'string', validations: [{ key: 'required' }] },
        },
      ],
    }

    const copy = duplicateNode(withRules, 'email')
    expect(copy?.props['label']).toEqual({ kind: 'static', value: 'Email' })
    expect(copy?.schema?.validations).toEqual([{ key: 'required' }])
    expect(copy?.schema?.validations).not.toBe(withRules.children?.[0]?.schema?.validations)
    expect(copy?.props).not.toBe(withRules.children?.[0]?.props)
  })

  it('copies a leaf with no children as a leaf', () => {
    const copy = duplicateNode(tree(), 'textField')
    expect(copy?.key).toBe('textField3')
    expect(copy?.children).toBeUndefined()
  })

  it('names a copy after the original rather than after its type', () => {
    const named: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: 'emailAddress', type: 'TextField', props: {} }],
    }

    expect(duplicateNode(named, 'emailAddress')?.key).toBe('emailAddress2')
  })

  it('does not stack digits when a copy is copied', () => {
    const named: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'website', type: 'TextField', props: {} },
        { key: 'website2', type: 'TextField', props: {} },
      ],
    }

    expect(duplicateNode(named, 'website2')?.key).toBe('website3')
  })

  it('returns undefined for a key the tree does not hold', () => {
    expect(duplicateNode(tree(), 'nope')).toBeUndefined()
  })

  it('leaves the original untouched', () => {
    const original = tree()
    const before = JSON.stringify(original)
    duplicateNode(original, 'stack')
    expect(JSON.stringify(original)).toBe(before)
  })

  const step = (renderWhen: ComponentNode['renderWhen']): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [{ key: 'step', type: 'Step', props: {}, ...(renderWhen ? { renderWhen } : {}) }],
  })

  it('re-points a key nested inside a boolean condition', () => {
    const copy = duplicateNode(
      step({
        kind: 'condition',
        condition: {
          op: 'and',
          conditions: [
            {
              op: 'or',
              conditions: [
                {
                  op: 'eq',
                  left: { kind: 'context', path: 'step' },
                  right: { kind: 'literal', value: 'step' },
                },
              ],
            },
          ],
        },
      }),
      'step',
    )

    expect(copy?.key).toBe('step2')
    expect(copy?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'and',
        conditions: [
          {
            op: 'or',
            conditions: [
              {
                op: 'eq',
                left: { kind: 'context', path: 'step' },
                right: { kind: 'literal', value: 'step2' },
              },
            ],
          },
        ],
      },
    })
  })

  it('re-points a key nested inside a not', () => {
    const copy = duplicateNode(
      step({
        kind: 'condition',
        condition: {
          op: 'not',
          condition: {
            op: 'eq',
            left: { kind: 'context', path: 'step' },
            right: { kind: 'literal', value: 'step' },
          },
        },
      }),
      'step',
    )

    expect(copy?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'not',
        condition: {
          op: 'eq',
          left: { kind: 'context', path: 'step' },
          right: { kind: 'literal', value: 'step2' },
        },
      },
    })
  })

  it('re-points the copied key inside an in list, and leaves its neighbours', () => {
    const copy = duplicateNode(
      step({
        kind: 'condition',
        condition: {
          op: 'in',
          value: { kind: 'context', path: 'step' },
          options: ['welcome', 'step', 'done'],
        },
      }),
      'step',
    )

    expect(copy?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'in',
        value: { kind: 'context', path: 'step' },
        options: ['welcome', 'step2', 'done'],
      },
    })
  })

  it('leaves an in list alone when nothing in the comparison reads the context', () => {
    const condition = {
      kind: 'condition' as const,
      condition: {
        op: 'in' as const,
        value: { kind: 'ref' as const, dataKey: 'chosen' },
        options: ['welcome', 'step', 'done'],
      },
    }

    expect(duplicateNode(step(condition), 'step')?.renderWhen).toEqual(condition)
  })
})

describe('dataKeyOf', () => {
  it('is the component key when nothing overrides it', () => {
    expect(dataKeyOf({ key: 'email', type: 'TextField', props: {} })).toBe('email')
  })

  it('is the override when there is one', () => {
    expect(dataKeyOf({ key: 'emailField', dataKey: 'email', type: 'TextField', props: {} })).toBe(
      'email',
    )
  })
})

describe('validateDocument and data keys', () => {
  const withDataKey = (dataKey: unknown): FormDocument =>
    ({
      ...createDocument('Contact', 'doc'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [{ key: 'email', dataKey, type: 'TextField', props: {} }],
      },
    }) as unknown as FormDocument

  it('accepts a data key shared by two components', () => {
    const document = {
      ...createDocument('Contact', 'doc'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          { key: 'personal', dataKey: 'email', type: 'TextField', props: {} },
          { key: 'work', dataKey: 'email', type: 'TextField', props: {} },
        ],
      },
    }

    // Deliberately legal. Uniqueness is a property of keys, not of answers.
    expect(validateDocument(document)).toEqual([])
  })

  it('rejects a data key that is present but blank', () => {
    const errors = validateDocument(withDataKey('   '))
    expect(errors.map((e) => e.code)).toEqual(['empty-data-key'])
  })

  it('rejects a data key that is not a string, and says that is what is wrong', () => {
    const errors = validateDocument(withDataKey(7))
    expect(errors.map((e) => e.code)).toEqual(['invalid-data-key'])
    expect(errors[0]?.message).toContain('not text')
  })

  it('still calls an all-whitespace data key empty', () => {
    expect(validateDocument(withDataKey('   ')).map((e) => e.code)).toEqual(['empty-data-key'])
  })

  it('accepts an absent data key', () => {
    expect(validateDocument(withDataKey(undefined))).toEqual([])
  })

  it('rejects a data key the grammar does not allow', () => {
    expect(validateDocument(withDataKey('first-name')).map((e) => e.code)).toEqual([
      'invalid-data-key',
    ])
    expect(validateDocument(withDataKey('__proto__')).map((e) => e.code)).toEqual([
      'invalid-data-key',
    ])
  })

  it('rejects a component key the grammar does not allow', () => {
    const document: FormDocument = {
      ...createDocument('Keys', 'keys'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [{ key: 'first-name', type: 'TextField', props: {} }],
      },
    }

    const errors = validateDocument(document)
    expect(errors.map((e) => e.code)).toEqual(['invalid-key'])
    expect(errors[0]?.key).toBe('first-name')
  })
})

describe('a component that arrives with a visibility rule', () => {
  const stepDef: ComponentDef = {
    type: 'Step',
    label: 'Step',
    icon: 'box',
    group: 'layout',
    container: true,
    defaultRenderWhen: (key) => ({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: key },
      },
    }),
    defaultProps: {},
    props: [],
    events: [],
  }

  const root: ComponentNode = { key: 'root', type: 'Screen', props: {}, children: [] }

  it('names the node the rule is on, not the type', () => {
    const node = made(stepDef, root)

    expect(node.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: node.key },
      },
    })
  })

  it('gives two steps different rules, so they are different steps', () => {
    const first = made(stepDef, root)
    const withFirst: ComponentNode = { ...root, children: [first] }
    const second = made(stepDef, withFirst)

    expect(second.key).not.toBe(first.key)
    expect(second.renderWhen).not.toEqual(first.renderWhen)
  })

  it('leaves a component that declares none without one', () => {
    const plain: ComponentDef = { ...stepDef, type: 'Box' }
    delete (plain as { defaultRenderWhen?: unknown }).defaultRenderWhen

    expect(made(plain, root).renderWhen).toBeUndefined()
  })
})

describe('two lookups for one key', () => {
  /*
   * A host can render a document it never validated, so duplicate keys reach
   * these. Every lookup takes the first match, so they agree on which node a
   * key means.
   */
  const twins: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      { key: 'group', type: 'Stack', props: {}, children: [{ key: 'twin', type: 'A', props: {} }] },
      { key: 'other', type: 'Stack', props: {}, children: [{ key: 'twin', type: 'B', props: {} }] },
    ],
  }

  it('agrees with pathTo about which node a repeated key means', () => {
    expect(findNode(twins, 'twin')?.type).toBe('A')
    expect(pathTo(twins, 'twin')).toEqual(['root', 'group', 'twin'])
    expect(findParent(twins, 'twin')?.key).toBe('group')
  })

  it('still finds the root and a unique node', () => {
    expect(findNode(twins, 'root')?.key).toBe('root')
    expect(findNode(twins, 'other')?.type).toBe('Stack')
    expect(findNode(twins, 'nobody')).toBeUndefined()
    expect(findParent(twins, 'root')).toBeUndefined()
  })
})

describe('a key that only looks unique', () => {
  it('refuses a pasted key wearing whitespace, which its twin would not have', () => {
    /*
     * `email` and ` email ` pass the duplicate check, but the panel stores the
     * trimmed form, so downstream they are one name.
     */
    const document: FormDocument = {
      ...createDocument('Keys', 'keys'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          { key: 'email', type: 'TextField', props: {} },
          { key: ' email ', type: 'TextField', props: {} },
        ],
      },
    }

    expect(validateDocument(document).map((e) => e.code)).toContain('invalid-key')
  })
})

// The renderer reads `translations[tag]` unguarded, so the gate checks its shape.
describe('validateDocument and translations', () => {
  const withTranslations = (translations: unknown): FormDocument =>
    ({ ...createDocument('Contact', 'doc'), translations }) as unknown as FormDocument

  const codes = (translations: unknown): string[] =>
    validateDocument(withTranslations(translations)).map((e) => e.code)

  it('accepts the shape the factory produces', () => {
    expect(validateDocument(createDocument('Contact', 'doc'))).toEqual([])
    expect(codes({ 'en-US': { greeting: 'Hello' } })).toEqual([])
    // An empty bundle for a language is a language nobody has translated yet.
    expect(codes({ 'en-US': {} })).toEqual([])
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an array', []],
    ['a number', 7],
  ])('rejects translations that are %s', (_what, translations) => {
    expect(codes(translations)).toContain('malformed')
  })

  it.each([
    ['a string', { 'en-US': 'nope' }],
    ['null', { 'en-US': null }],
    ['an array', { 'en-US': [] }],
  ])('rejects a language bundle that is %s', (_what, translations) => {
    expect(codes(translations)).toContain('malformed')
  })

  it('rejects a translation that is not text', () => {
    // `resolveProp` returns this straight to a kit as a label. A number renders;
    // an object renders as [object Object], and a React element would throw.
    expect(codes({ 'en-US': { greeting: 7 } })).toContain('malformed')
    expect(codes({ 'en-US': { greeting: { nested: 'x' } } })).toContain('malformed')
  })

  it('does not care which languages the bundle names', () => {
    // Deleting a language must not make the document invalid.
    expect(codes({ fr: { greeting: 'Bonjour' } })).toEqual([])
  })
})

describe('validateDocument and unrecognised tags', () => {
  const documentWith = (node: Partial<ComponentNode>): FormDocument => ({
    ...createDocument('Contact', 'doc'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: 'field', type: 'TextField', props: {}, ...node }],
    },
  })

  const codes = (node: Partial<ComponentNode>): string[] =>
    validateDocument(documentWith(node)).map((e) => e.code)

  it('accepts every kind the union actually has', () => {
    expect(codes({ renderWhen: { kind: 'static', value: true } })).toEqual([])
    expect(codes({ renderWhen: { kind: 'computed', expression: 'x' } })).toEqual([])
    expect(codes({ renderWhen: { kind: 'i18n', key: 'x' } })).toEqual([])
    expect(
      codes({
        renderWhen: {
          kind: 'condition',
          condition: { op: 'truthy', value: { kind: 'literal', value: 1 } },
        },
      }),
    ).toEqual([])
  })

  it('rejects a renderWhen whose kind is not one of them', () => {
    expect(
      codes({ renderWhen: { kind: 'conditon' } } as unknown as Partial<ComponentNode>),
    ).toContain('malformed')
  })

  it('rejects a rule guard whose kind is not one of them', () => {
    expect(
      codes({
        schema: {
          type: 'string',
          validations: [{ key: 'required', when: { kind: 'conditon' } }],
        },
      } as unknown as Partial<ComponentNode>),
    ).toContain('malformed')
  })

  it('rejects a validation whose key is not a rule', () => {
    expect(
      codes({
        schema: { type: 'string', validations: [{ key: 'requird' }] },
      } as unknown as Partial<ComponentNode>),
    ).toContain('malformed')
  })

  it('accepts the rules that do exist', () => {
    expect(
      codes({
        schema: {
          type: 'string',
          validations: [{ key: 'required' }, { key: 'minLength', value: 2 }, { key: 'email' }],
        },
      } as unknown as Partial<ComponentNode>),
    ).toEqual([])
  })
})

/*
 * The gate refuses what is malformed (a shape no version of this library wrote),
 * not what is merely unusual: refusing a document somebody holds is worse than
 * the render it protects.
 */
describe('validateDocument over the whole document', () => {
  const docWith = (patch: Record<string, unknown>): FormDocument => ({
    ...createDocument('Contact', 'doc'),
    ...patch,
  })

  const nodeWith = (patch: Record<string, unknown>): FormDocument =>
    docWith({
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [{ key: 'field', type: 'TextField', props: {}, ...patch }],
      },
    })

  const codes = (doc: FormDocument): string[] => validateDocument(doc).map((e) => e.code)

  it('accepts what the factory builds, which is the floor for all of this', () => {
    expect(validateDocument(createDocument('Contact', 'doc'))).toEqual([])
  })

  describe('the document envelope', () => {
    it('rejects a version this library did not write', () => {
      expect(codes(docWith({ version: '2' }))).toContain('malformed')
      expect(codes(docWith({ version: undefined }))).toContain('malformed')
    })

    it('rejects an id or a name that is not text', () => {
      expect(codes(docWith({ id: 7 }))).toContain('malformed')
      expect(codes(docWith({ name: null }))).toContain('malformed')
    })

    it('accepts an empty name, which is a form nobody has titled yet', () => {
      expect(codes(docWith({ name: '' }))).toEqual([])
    })

    it('rejects settings that are not an object or are not defined by version 1', () => {
      expect(codes(docWith({ settings: 'nope' }))).toContain('malformed')
      expect(codes(docWith({ settings: { errorType: 'Alert' } }))).toContain('malformed')
    })

    it('accepts the reserved empty settings object', () => {
      expect(codes(docWith({ settings: {} }))).toEqual([])
    })

    it('rejects a language entry missing the parts the renderer reads', () => {
      const languages = [{ code: 'en', name: 'English', bidi: 'sideways' }]
      expect(codes(docWith({ languages, defaultLanguage: 'en' }))).toContain('malformed')
      expect(
        codes(docWith({ languages: [{ code: 'en', bidi: 'ltr' }], defaultLanguage: 'en' })),
      ).toContain('malformed')
    })

    it('rejects an action that is not one', () => {
      expect(codes(docWith({ actions: { go: 'nope' } }))).toContain('malformed')
      expect(codes(docWith({ actions: { go: { name: 'go' } } }))).toContain('malformed')
    })

    it('accepts a well-formed action', () => {
      expect(
        codes(docWith({ actions: { go: { name: 'go', body: 'return 1', params: {} } } })),
      ).toEqual([])
    })
  })

  describe('a component property', () => {
    it('rejects props that are not an object', () => {
      expect(codes(nodeWith({ props: 'nope' }))).toContain('malformed')
      expect(codes(nodeWith({ props: [] }))).toContain('malformed')
    })

    it('rejects a binding whose payload does not match its kind', () => {
      // Each kind promises exactly one field. `resolveProp` reads it without
      // asking, so `{ kind: 'i18n' }` with no key returns undefined as a label.
      expect(codes(nodeWith({ props: { label: { kind: 'i18n' } } }))).toContain('malformed')
      expect(codes(nodeWith({ props: { label: { kind: 'computed' } } }))).toContain('malformed')
      expect(codes(nodeWith({ props: { label: { kind: 'computed', expression: 7 } } }))).toContain(
        'malformed',
      )
      expect(codes(nodeWith({ props: { label: { kind: 'condition' } } }))).toContain('malformed')
    })

    it('accepts a static binding holding any JSON at all', () => {
      for (const value of ['x', 7, true, null, [1, 2], { a: { b: 'c' } }]) {
        expect(codes(nodeWith({ props: { label: { kind: 'static', value } } }))).toEqual([])
      }
    })

    it('rejects a static binding with no value field at all', () => {
      // Distinct from `value: undefined`, which JSON cannot express anyway.
      expect(codes(nodeWith({ props: { label: { kind: 'static' } } }))).toContain('malformed')
    })
  })

  describe('a condition', () => {
    const renderWhen = (condition: unknown): FormDocument =>
      nodeWith({ renderWhen: { kind: 'condition', condition } })

    it('accepts the operators it has', () => {
      expect(codes(renderWhen({ op: 'truthy', value: { kind: 'literal', value: 1 } }))).toEqual([])
      expect(
        codes(
          renderWhen({
            op: 'eq',
            left: { kind: 'ref', dataKey: 'a' },
            right: { kind: 'context', path: 'user.role' },
          }),
        ),
      ).toEqual([])
      expect(codes(renderWhen({ op: 'and', conditions: [] }))).toEqual([])
    })

    it('rejects an operator it does not have', () => {
      expect(codes(renderWhen({ op: 'equals', left: {}, right: {} }))).toContain('malformed')
    })

    it('rejects an operand that is not one', () => {
      expect(codes(renderWhen({ op: 'truthy', value: { kind: 'field', dataKey: 'a' } }))).toContain(
        'malformed',
      )
      expect(codes(renderWhen({ op: 'truthy', value: { kind: 'ref' } }))).toContain('malformed')
      expect(codes(renderWhen({ op: 'truthy', value: 'a' }))).toContain('malformed')
    })

    it('rejects a scope that is not a scope', () => {
      expect(
        codes(
          renderWhen({ op: 'truthy', value: { kind: 'ref', dataKey: 'a', scope: 'sideways' } }),
        ),
      ).toContain('malformed')
    })

    it('rejects a membership test whose options are not a list', () => {
      expect(
        codes(renderWhen({ op: 'in', value: { kind: 'ref', dataKey: 'a' }, options: 'ab' })),
      ).toContain('malformed')
    })

    it('reaches a condition nested inside a group', () => {
      expect(
        codes(
          renderWhen({
            op: 'and',
            conditions: [{ op: 'not', condition: { op: 'equals', left: {}, right: {} } }],
          }),
        ),
      ).toContain('malformed')
    })
  })

  describe('a field schema', () => {
    it('rejects a data type this library does not have', () => {
      expect(codes(nodeWith({ schema: { type: 'integer', validations: [] } }))).toContain(
        'malformed',
      )
    })

    it('accepts every data type it does have', () => {
      for (const type of ['string', 'number', 'boolean', 'date', 'array', 'object', 'file']) {
        expect(codes(nodeWith({ schema: { type, validations: [] } })), type).toEqual([])
      }
    })

    it('rejects a rule whose parameter is the wrong kind of thing', () => {
      const rule = (r: unknown): FormDocument =>
        nodeWith({ schema: { type: 'string', validations: [r] } })

      expect(codes(rule({ key: 'minLength' }))).toContain('malformed')
      expect(codes(rule({ key: 'minLength', value: '3' }))).toContain('malformed')
      expect(codes(rule({ key: 'pattern', value: 3 }))).toContain('malformed')
      expect(codes(rule({ key: 'custom' }))).toContain('malformed')
      expect(codes(rule({ key: 'required', message: 7 }))).toContain('malformed')
    })

    it('accepts the rules as they are actually written', () => {
      expect(
        codes(
          nodeWith({
            schema: {
              type: 'string',
              autoValidate: true,
              validations: [
                { key: 'required', message: 'Needed.' },
                { key: 'minLength', value: 3 },
                { key: 'pattern', value: '^a' },
                { key: 'custom', expression: 'value.length > 0' },
              ],
            },
          }),
        ),
      ).toEqual([])
    })

    it('rejects an autoValidate that is not a yes or a no', () => {
      expect(
        codes(nodeWith({ schema: { type: 'string', validations: [], autoValidate: 'yes' } })),
      ).toContain('malformed')
    })
  })

  describe('per-component CSS', () => {
    it('rejects css that is not an object of text', () => {
      expect(codes(nodeWith({ css: 'color: red' }))).toContain('malformed')
      expect(codes(nodeWith({ css: { any: 7 } }))).toContain('malformed')
    })

    it('rejects a breakpoint this library does not have', () => {
      expect(codes(nodeWith({ css: { widescreen: 'color: red' } }))).toContain('malformed')
    })

    it('accepts the breakpoints it does have', () => {
      expect(
        codes(nodeWith({ css: { any: 'color: red', mobile: '', tablet: 'x', desktop: 'y' } })),
      ).toEqual([])
    })

    it('does not refuse CSS that `safeDeclarations` will drop', () => {
      expect(codes(nodeWith({ css: { any: 'color: red}html{display:none}' } }))).toEqual([])
    })
  })

  describe('events', () => {
    it('rejects an action reference whose type is neither kind', () => {
      expect(codes(nodeWith({ events: { onChange: [{ name: 'go', type: 'magic' }] } }))).toContain(
        'malformed',
      )
    })

    it('rejects an event this library does not raise', () => {
      expect(
        codes(nodeWith({ events: { onTelepathy: [{ name: 'go', type: 'builtin' }] } })),
      ).toContain('malformed')
    })

    it('accepts a known builtin reference', () => {
      expect(
        codes(nodeWith({ events: { onChange: [{ name: 'announce', type: 'builtin' }] } })),
      ).toEqual([])
    })

    it('rejects an unknown builtin reference', () => {
      expect(
        codes(nodeWith({ events: { onChange: [{ name: 'submit', type: 'builtin' }] } })),
      ).toContain('malformed')
    })
  })
})

describe('the tree and keys that repeat or are quoted', () => {
  const node = (key: string, children?: ComponentNode[]): ComponentNode => ({
    key,
    type: 'Field',
    props: {},
    ...(children ? { children } : {}),
  })

  const twice = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [node('same'), node('other'), node('same')],
  })

  it('updates the first match only, like every read path', () => {
    const next = updateNode(twice(), 'same', (n) => ({ ...n, type: 'Changed' }))
    const kinds = (next.children ?? []).map((c) => c.type)

    expect(kinds).toEqual(['Changed', 'Field', 'Field'])
  })

  it('stops at the first match even when that update changes nothing', () => {
    /*
     * What `updateNode`'s `found` flag is for: a no-op update (a controlled
     * editor rewriting the same value) must still stop at the first match.
     * Observed through identity, since a no-op leaves no value to compare.
     */
    const before = twice()
    const seen: ComponentNode[] = []
    const next = updateNode(before, 'same', (n) => {
      seen.push(n)
      return n
    })

    expect(seen, 'the update ran on more than the first match').toHaveLength(1)
    expect(next, 'a no-op update rebuilt the tree').toBe(before)
  })

  it('removes the first match only', () => {
    const next = removeNode(twice(), 'same')

    expect((next.children ?? []).map((c) => c.key)).toEqual(['other', 'same'])
  })

  it('inserts into the first match only', () => {
    const holder: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [node('box', []), node('box', [])],
    }

    const next = insertNode(holder, 'box', node('added'))

    expect((next.children ?? []).map((c) => c.children?.length ?? 0)).toEqual([1, 0])
  })

  it('still edits a unique key wherever it is', () => {
    const deep: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [node('a'), node('wrapper', [node('target')])],
    }

    const next = updateNode(deep, 'target', (n) => ({ ...n, type: 'Changed' }))
    expect(next.children?.[1]?.children?.[0]?.type).toBe('Changed')
  })

  it('re-points a duplicated node at its own key', () => {
    const stepped: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'step1',
          type: 'Step',
          props: {},
          children: [],
          renderWhen: {
            kind: 'condition',
            condition: {
              op: 'eq',
              left: { kind: 'context', path: 'step' },
              right: { kind: 'literal', value: 'step1' },
            },
          },
        },
      ],
    }

    const copy = duplicateNode(stepped, 'step1')
    expect(copy?.key).toBe('step2')

    const when = copy?.renderWhen
    const right =
      when?.kind === 'condition' && 'right' in when.condition ? when.condition.right : undefined
    expect(right).toEqual({ kind: 'literal', value: copy?.key })
  })

  it('leaves a condition that names something else alone', () => {
    const guarded: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'spouse',
          type: 'Field',
          props: {},
          renderWhen: {
            kind: 'condition',
            condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'married' } },
          },
        },
      ],
    }

    const copy = duplicateNode(guarded, 'spouse')
    expect(copy?.renderWhen).toEqual(guarded.children?.[0]?.renderWhen)
  })
})

describe('validateDocument and inherited properties', () => {
  it('reports an action reference naming something only Object has', () => {
    const doc = {
      ...createDocument('Contact', 'doc'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'field',
            type: 'TextField',
            props: {},
            events: { onChange: [{ name: 'toString', type: 'code' }] },
          },
        ],
      },
    } as unknown as FormDocument

    expect(validateDocument(doc).map((e) => e.code)).toContain('unknown-action')
  })

  it('still accepts a reference to an action that is there', () => {
    const doc = {
      ...createDocument('Contact', 'doc'),
      actions: { go: { name: 'go', body: 'return 1', params: {} } },
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'field',
            type: 'TextField',
            props: {},
            events: { onChange: [{ name: 'go', type: 'code' }] },
          },
        ],
      },
    } as unknown as FormDocument

    expect(validateDocument(doc)).toEqual([])
  })

  it('reads an empty dialect the way languageTag does', () => {
    const doc = {
      ...createDocument('Contact', 'doc'),
      languages: [{ code: 'en', dialect: '', name: 'English', bidi: 'ltr' }],
      defaultLanguage: 'en',
    } as unknown as FormDocument

    expect(validateDocument(doc)).toEqual([])
  })
})

describe('validateDocument and an unusable context path', () => {
  const reading = (path: unknown): FormDocument =>
    ({
      ...createDocument('Contact', 'doc'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'secret',
            type: 'TextField',
            props: {},
            renderWhen: {
              kind: 'condition',
              condition: { op: 'truthy', value: { kind: 'context', path } },
            },
          },
        ],
      },
    }) as unknown as FormDocument

  it('refuses an empty path', () => {
    expect(validateDocument(reading('')).map((e) => e.code)).toContain('malformed')
  })

  it('names the component, because an empty path names nothing', () => {
    expect(
      validateDocument(reading(''))
        .map((e) => e.message)
        .join(' '),
    ).toContain('secret')
  })

  it('accepts a path the host may or may not supply', () => {
    // Whether the host holds the path is `missingContext`'s question, not the gate's.
    expect(validateDocument(reading('user.role'))).toEqual([])
  })
})

describe('validateDocument and a document nested too deep', () => {
  const deep = (n: number): FormDocument => {
    let node: ComponentNode = { key: 'leaf', type: 'TextField', props: {} }
    for (let i = 0; i < n; i += 1) {
      node = { key: 'wrap' + String(i), type: 'Screen', props: {}, children: [node] }
    }
    return { ...createDocument('Deep', 'deep'), root: node }
  }

  it('reports rather than throwing', () => {
    expect(() => validateDocument(deep(20_000))).not.toThrow()
  })

  it('says what it refused', () => {
    expect(validateDocument(deep(20_000)).map((e) => e.code)).toContain('malformed')
  })

  it('still walks a document anybody would build', () => {
    expect(validateDocument(deep(30))).toEqual([])
  })
})

describe('toJsonSchema and a shared data key', () => {
  const shared = (): FormDocument =>
    ({
      ...createDocument('Contact', 'doc'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'personal',
            dataKey: 'email',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [{ key: 'email' }] },
          },
          {
            key: 'work',
            dataKey: 'email',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [{ key: 'minLength', value: 5 }] },
          },
        ],
      },
    }) as unknown as FormDocument

  it('reports the collapse rather than performing it silently', () => {
    expect(unexportableRules(shared()).map((entry) => entry.key)).toContain('work')
  })
})

/*
 * The gate accepts a schema with no `validations` (a field with no rules is
 * ordinary), so every reader must guard the array.
 */
describe('a field whose schema has no validations', () => {
  // Built as JSON and cast: that is how a document arrives.
  const document_ = (): FormDocument =>
    JSON.parse(
      JSON.stringify({
        ...createDocument('No rules', 'no-rules'),
        root: {
          key: 'root',
          type: 'Screen',
          props: {},
          children: [{ key: 'email', type: 'TextField', props: {}, schema: { type: 'string' } }],
        },
      }),
    ) as FormDocument

  it('is a document the gate accepts', () => {
    // The premise. If this ever starts reporting, the three tests below are
    // about a document nothing can produce and should be re-read rather than
    // deleted.
    expect(validateDocument(document_())).toEqual([])
  })

  it('can be duplicated', () => {
    const root = document_().root
    expect(() => duplicateNode(root, 'email')).not.toThrow()
    expect(duplicateNode(root, 'email')?.key).toBe('email2')
  })

  it('can be validated', () => {
    const root = document_().root
    expect(() => validateForm(root, {})).not.toThrow()
    expect(validateForm(root, {})).toEqual({})
  })

  it('can be exported as JSON Schema', () => {
    const doc = document_()
    expect(() => toJsonSchema(doc)).not.toThrow()
    expect(toJsonSchema(doc).properties).toHaveProperty('email')
  })

  it('is still read as having no rules when the field holds something that is not a list', () => {
    // A string `validations` would pass `?? []`, so readers check `Array.isArray`.
    const doc = JSON.parse(
      JSON.stringify({
        ...createDocument('Not a list', 'not-a-list'),
        root: {
          key: 'root',
          type: 'Screen',
          props: {},
          children: [
            {
              key: 'email',
              type: 'TextField',
              props: {},
              schema: { type: 'string', validations: 'required' },
            },
          ],
        },
      }),
    ) as FormDocument

    expect(() => validateForm(doc.root, {})).not.toThrow()
    expect(() => toJsonSchema(doc)).not.toThrow()
    expect(() => duplicateNode(doc.root, 'email')).not.toThrow()
  })
})

describe('naming a copy of a copy', () => {
  const withKeys = (...keys: string[]): ComponentNode =>
    container(
      'root',
      keys.map((key) => leaf(key)),
    )

  it('never names a copy below its source', () => {
    expect(duplicateNode(withKeys('website2'), 'website2')?.key).toBe('website3')
    expect(duplicateNode(withKeys('step1'), 'step1')?.key).toBe('step2')
  })

  it('skips the numbers already taken', () => {
    expect(duplicateNode(withKeys('website2', 'website3'), 'website2')?.key).toBe('website4')
  })

  it('still numbers a copy of an unnumbered key from two', () => {
    expect(duplicateNode(withKeys('website'), 'website')?.key).toBe('website2')
    expect(duplicateNode(withKeys('website', 'website2'), 'website')?.key).toBe('website3')
  })
})

// A node with an unusable key still has its shape checked, so one pass reports everything.
describe('validateDocument and a node with no usable key', () => {
  const broken = (key: unknown): FormDocument => ({
    ...createDocument('Broken', 'broken'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key, type: 'Field', props: { label: { kind: 'conditon' } } } as never],
    },
  })

  it.each([
    ['an empty key', ''],
    ['a key that is not text', 42],
  ])('reports the misspelled binding as well as %s', (_what, key) => {
    const codes = validateDocument(broken(key)).map((problem) => problem.code)

    expect(codes.length).toBeGreaterThan(1)
    expect(codes.some((code) => code === 'malformed')).toBe(true)
  })

  it('still reports nothing for a node that is fine', () => {
    const fine: FormDocument = {
      ...createDocument('Fine', 'fine'),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [{ key: 'email', type: 'Field', props: { label: prop('Email') } }],
      },
    }

    expect(validateDocument(fine)).toEqual([])
  })
})

describe('flatten', () => {
  it('reports every node with its parent, index and depth, in document order', () => {
    expect(flatten(fixture())).toEqual([
      { node: expect.objectContaining({ key: 'root' }), parentKey: undefined, index: 0, depth: 0 },
      { node: expect.objectContaining({ key: 'stack' }), parentKey: 'root', index: 0, depth: 1 },
      { node: expect.objectContaining({ key: 'a' }), parentKey: 'stack', index: 0, depth: 2 },
      { node: expect.objectContaining({ key: 'b' }), parentKey: 'stack', index: 1, depth: 2 },
      { node: expect.objectContaining({ key: 'c' }), parentKey: 'root', index: 1, depth: 1 },
    ])
  })

  it('gives the nodes themselves, not copies of them', () => {
    // Callers compare identity: the tree panel keys rows on the node, and a
    // fresh object per call would make every row new on every render.
    const tree = fixture()
    expect(flatten(tree)[0]?.node).toBe(tree)
  })
})

describe('walk', () => {
  it('visits parents before children, with the parent it came from', () => {
    const seen: string[] = []
    walk(fixture(), (node, parent) => seen.push(node.key + '<' + (parent?.key ?? '-')))

    expect(seen).toEqual(['root<-', 'stack<root', 'a<stack', 'b<stack', 'c<root'])
  })

  it('visits a leaf it is handed directly', () => {
    const seen: string[] = []
    walk(leaf('only'), (node) => seen.push(node.key))

    expect(seen).toEqual(['only'])
  })
})

describe('the lookup and mutation family on a document nothing gated', () => {
  /*
   * `store.ts` only warns on an invalid `initialDocument`, so these run on
   * ungated documents, some during render, where a throw unmounts the designer.
   */
  const broken = (children: unknown): ComponentNode =>
    ({ key: 'root', type: 'Screen', props: {}, children }) as unknown as ComponentNode

  const SHAPES: [string, unknown][] = [
    ['an object map', { '0': { key: 'a', type: 'Field', props: {} } }],
    ['a number', 5],
    ['a string', 'ab'],
    ['a list holding null', [null]],
    ['a list holding a number', [7]],
  ]

  const CALLS: [string, (root: ComponentNode) => unknown][] = [
    ['flatten', (root) => flatten(root)],
    ['findNode', (root) => findNode(root, 'x')],
    ['findParent', (root) => findParent(root, 'x')],
    ['pathTo', (root) => pathTo(root, 'x')],
    ['updateNode', (root) => updateNode(root, 'x', (n) => n)],
    ['removeNode', (root) => removeNode(root, 'x')],
    ['duplicateNode', (root) => duplicateNode(root, 'root')],
  ]

  it.each(
    CALLS.flatMap(([name, call]) =>
      SHAPES.map((shape) => [name, shape[0], call, shape[1]] as const),
    ),
  )('%s survives children that are %s', (_name, _shape, call, children) => {
    expect(() => call(broken(children))).not.toThrow()
  })

  it('and none of them is bounded only by the stack', () => {
    // Built with a loop: building it recursively would overflow first.
    let deep: ComponentNode = { key: 'leaf', type: 'Field', props: {} }
    for (let i = 0; i < 50_000; i += 1) {
      deep = { key: 'box' + String(i), type: 'Screen', props: {}, children: [deep] }
    }

    for (const [name, call] of CALLS) {
      expect(() => call(deep), name + ' overflowed').not.toThrow()
    }
  })

  it('duplicates a malformed children value without changing its shape', () => {
    /*
     * A copy differs from its source only in its keys, so a malformed `children`
     * is carried over as is, the way `updateNode` and `removeNode` leave it.
     */
    for (const children of [{}, 'ab', 5]) {
      const source = { key: 'odd', type: 'Field', props: {}, children } as unknown as ComponentNode
      const root: ComponentNode = {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [source],
      }

      const copy = duplicateNode(root, 'odd')

      expect(copy?.children, JSON.stringify(children)).toEqual(children)
    }
  })

  it('trims a copied key that would exceed the length bound', () => {
    const long = 'a'.repeat(MAX_KEY_LENGTH)
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: long, type: 'Field', props: {} }],
    }

    const copy = duplicateNode(root, long)
    if (!copy) throw new Error('nothing was duplicated')

    expect(copy.key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH)
    expect(copy.key, 'the copy kept its source key').not.toBe(long)
    expect(keyProblem(copy.key), 'the copy is a key the gate refuses').toBeUndefined()
  })

  it('keeps trimming until it finds a free one', () => {
    const long = 'b'.repeat(MAX_KEY_LENGTH)
    let root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: long, type: 'Field', props: {} }],
    }

    const keys = new Set<string>([long])
    for (let i = 0; i < 3; i += 1) {
      const copy = duplicateNode(root, long)
      if (!copy) throw new Error('nothing was duplicated')
      expect(copy.key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH)
      expect(keys.has(copy.key), 'minted a key already taken: ' + copy.key).toBe(false)
      keys.add(copy.key)
      root = { ...root, children: [...(root.children ?? []), copy] }
    }

    expect(keys.size).toBe(4)
  })

  it('still copies a real list of children', () => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'box',
          type: 'Stack',
          props: {},
          children: [{ key: 'in', type: 'Field', props: {} }],
        },
      ],
    }

    const copy = duplicateNode(root, 'box')

    expect(copy?.children).toHaveLength(1)
    expect(copy?.children?.[0]?.key, 'the copy shares its source key').not.toBe('in')
  })

  it('still walks a document that is fine', () => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: 'x', type: 'Field', props: {} }],
    }

    expect(flatten(root).map((row) => row.node.key)).toEqual(['root', 'x'])
    expect(findNode(root, 'x')?.key).toBe('x')
    expect(findParent(root, 'x')?.key).toBe('root')
    expect(pathTo(root, 'x')).toEqual(['root', 'x'])
    expect(removeNode(root, 'x').children).toEqual([])
  })
})

describe('the gate branches nothing ever drove', () => {
  /*
   * Asserted on the message: all four share the code `malformed`, which any
   * other problem in the fixture would also satisfy.
   */
  const doc = (root: unknown): FormDocument =>
    ({ ...createDocument('Gate', 'gate'), root }) as unknown as FormDocument

  const node = (extra: Record<string, unknown>): unknown => ({
    key: 'root',
    type: 'Screen',
    props: {},
    ...extra,
  })

  const CASES: [string, unknown, RegExp][] = [
    ['children that are not an array', node({ children: 5 }), /children must be an array/],
    ['a schema that is not an object', node({ schema: 'string' }), /schema must be an object/],
    [
      'validations that are not an array',
      node({ schema: { type: 'string', validations: 'required' } }),
      /validations must be an array/,
    ],
    [
      'a validations entry that is not a rule',
      node({ schema: { type: 'string', validations: [null] } }),
      /validations holds an entry that is not a rule/,
    ],
  ]

  it.each(CASES)('reports %s', (_what, root, says) => {
    const messages = validateDocument(doc(root)).map((error) => error.message)

    expect(messages.join(' | ')).toMatch(says)
  })

  it('reports params that are not an object on an action', () => {
    const document = {
      ...createDocument('Gate', 'gate'),
      actions: { save: { kind: 'submit', params: 5 } },
    } as unknown as FormDocument

    expect(
      validateDocument(document)
        .map((error) => error.message)
        .join(' | '),
    ).toMatch(/has params that are not an object/)
  })

  it('says nothing about a document that is fine', () => {
    expect(validateDocument(doc(node({ children: [] })))).toEqual([])
  })
})

describe('invariant 4 on the operations that had no assertion for it', () => {
  const tree = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      { key: 'box', type: 'Screen', props: {}, children: [{ key: 'x', type: 'Field', props: {} }] },
      { key: 'y', type: 'Field', props: {} },
    ],
  })

  it('moveNode leaves its input alone on a move that succeeds', () => {
    const before = tree()
    const snapshot = JSON.stringify(before)

    const after = moveNode(before, 'y', 'box')

    expect(after, 'the move was refused, so this proves nothing').not.toBe(before)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('duplicateNode does not alias the records it copies', () => {
    const source: ComponentNode = {
      key: 'rich',
      type: 'Field',
      props: {},
      css: { any: 'color:red' },
      events: { onChange: [{ name: 'save', type: 'code' }] },
      schema: { type: 'string', validations: [{ key: 'required' }] },
    }
    const root: ComponentNode = { key: 'root', type: 'Screen', props: {}, children: [source] }

    const copy = duplicateNode(root, 'rich')
    if (!copy) throw new Error('nothing was duplicated')
    expect(copy.key, 'the copy kept its source key').not.toBe('rich')

    const events = copy.events?.onChange
    const validations = copy.schema?.validations
    const css = copy.css

    expect(events, 'events were not copied at all').toBeDefined()
    expect(validations, 'the schema was not copied at all').toBeDefined()
    expect(css, 'css was not copied at all').toBeDefined()
    expect(events).toEqual([{ name: 'save', type: 'code' }])
    expect(validations).toEqual([{ key: 'required' }])
    expect(css?.['any']).toBe('color:red')

    // Now mutate them, with no optional chaining to swallow a missing record.
    ;(events as { name: string; type: string }[]).push({ name: 'other', type: 'code' })
    ;(validations as { key: string }[]).push({ key: 'email' })
    ;(css as Record<string, string>)['any'] = 'color:blue'

    expect(source.events?.onChange).toEqual([{ name: 'save', type: 'code' }])
    expect(source.schema?.validations).toEqual([{ key: 'required' }])
    expect(source.css?.['any']).toBe('color:red')
  })
})

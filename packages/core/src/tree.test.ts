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

/** root > [ stack > [ a, b ], c ] */
function fixture(): ComponentNode {
  return container('root', [container('stack', [leaf('a'), leaf('b')]), leaf('c')])
}

/**
 * `instantiate`, narrowed. It answers `undefined` for a definition with no
 * usable `type`, which no fixture here supplies.
 */
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

  /*
   * The sanitising branch, which exists because of a named incident and had no
   * test at all: only `TextField` was ever passed, and `TextField` needs no
   * sanitising. A kit is free to type a component `Date-Picker` or `2FA`, and
   * the key minted from it went straight into a document `validateDocument`
   * then refused -- a component the palette adds and the JSON dialog will not
   * accept back.
   */
  it.each([
    ['Date-Picker', 'datePicker', 'a hyphen, which an expression would read as a subtraction'],
    ['2FA', 'field', 'a leading digit, which no key may start with'],
    ['Field Set', 'fieldSet', 'a space'],
    ['!!!', 'field', 'nothing usable at all'],
    ['__proto__', 'field', 'a name that is reserved rather than merely malformed'],
  ])('mints a legal key from %s', (type, expected) => {
    const key = generateKey(emptyRoot(), type)

    expect(key).toBe(expected)
    // The claim underneath: whatever it mints, the gate accepts it.
    expect(keyProblem(key)).toBeUndefined()
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
     * The other half of the same clamp, and it has to be an index the array is
     * long enough to feel: `splice` clamps a start below `-length` to zero by
     * itself, so `-3` on two children lands at the front either way. `-1` on
     * three children lands *before the last one* without `Math.max`, which is
     * the difference the clamp exists for.
     */
    const wide = container('root', [container('stack', [leaf('a'), leaf('b'), leaf('c')])])

    const after = insertNode(wide, 'stack', leaf('d'), -1)
    expect(findNode(after, 'stack')?.children?.map((c) => c.key)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('appends for an index that is not a position at all', () => {
    /*
     * `Math.max(0, Math.min(NaN, len))` is `NaN`, and `splice(NaN, ...)`
     * coerces to 0 -- so a caller handing over a computed-but-broken index
     * silently *prepended*, while the two `Math` calls read as though every
     * non-number was covered. An index nobody can place is the end of the
     * list, which is what an absent index already means.
     */
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
    /*
     * Invariant 4, for the one operation that deletes. `insertNode` and
     * `updateNode` are both pinned here and `removeNode` was not, so the
     * operation with the most to destroy was the one nothing watched -- and undo
     * holds references to prior documents, so a mutation here is a previous
     * version of the form silently losing a component.
     */
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
    // Ancestors of the edited node are new objects.
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
   * Reordering inside one parent, which is the commonest gesture in the
   * designer and the only one this describe never made.
   *
   * The index is read after the node has been taken out, because `moveNode`
   * composes `insertNode(removeNode(...))`. That is not an accident to be tidied
   * away later: `dnd.ts:253` and `:411` both subtract one from an index measured
   * against the children as they are drawn, precisely because of it, and
   * `dnd.test.ts:463` pins that arithmetic from the other side. What was missing
   * was anything saying which of the two conventions this function holds, so a
   * reader had to derive it from the composition and a caller could reasonably
   * guess wrong.
   */
  const order = (root: ComponentNode, parent: string): string[] | undefined =>
    findNode(root, parent)?.children?.map((child) => child.key)

  const three = (): ComponentNode =>
    container('root', [container('stack', [leaf('a'), leaf('b'), leaf('c')])])

  it('reorders within one parent, counting from the list without the node', () => {
    // `a` out first leaves [b, c], so index 2 is the end and index 1 is between
    // them. Counting in the list as drawn, index 2 would mean before `c`.
    expect(order(moveNode(three(), 'a', 'stack', 2), 'stack')).toEqual(['b', 'c', 'a'])
    expect(order(moveNode(three(), 'a', 'stack', 1), 'stack')).toEqual(['b', 'a', 'c'])
  })

  it('reorders upwards by the same rule', () => {
    expect(order(moveNode(three(), 'c', 'stack', 0), 'stack')).toEqual(['c', 'a', 'b'])
    expect(order(moveNode(three(), 'c', 'stack', 1), 'stack')).toEqual(['a', 'c', 'b'])
  })

  it('keeps the node exactly once, wherever it lands', () => {
    /*
     * The control. An off-by-one is a wrong position; a remove that missed, or
     * an insert that ran twice, is a duplicated key, and the two read alike in
     * an assertion that only looks at one slot.
     */
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

/**
 * validateDocument is the gate untrusted documents pass through: the designer's
 * JSON editor runs pasted text through it, and apps/demo-server runs request
 * bodies through it. It must judge anything without throwing, because a throw
 * here took the builder down and reached the server as an unhandled 500.
 */
describe('validateDocument against malformed input', () => {
  const wellFormed = (): FormDocument => ({
    version: '1',
    id: 'doc',
    name: 'Doc',
    root: { key: 'root', type: 'Screen', props: {} },
    actions: {},
    // `en-US`, the tag `createDocument` produces. A dialect-free fixture makes a
    // bundle keyed by tag and one keyed by bare code the same string, which is
    // the distinction half this file's language checks are about.
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  })

  /** Anything at all, as a document. */
  const judge = (mutate: (doc: Record<string, unknown>) => void): StructuralError[] => {
    const doc = wellFormed() as unknown as Record<string, unknown>
    mutate(doc)
    return validateDocument(doc)
  }

  /*
   * The control. Every row below mutates this fixture and asserts an error, so
   * a fixture that was already invalid would make the whole table pass without
   * the mutations doing anything. That is not hypothetical: the language row
   * did exactly this on its own, reported below.
   */
  it('accepts the fixture the table mutates', () => {
    expect(judge(() => undefined)).toEqual([])
  })

  /*
   * Each row names the message it expects, not just that something was
   * reported.
   *
   * "A language with no code" already produced two errors: the missing code and
   * `defaultLanguage en is not in languages`, which follows from it. Deleting
   * the code check left the row green on the consequence — a check with no test
   * behind it, in the function that stands between a pasted document and the
   * builder. The other twelve rows were sound and are pinned so they stay that
   * way.
   */
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

/**
 * ARCHITECTURE.md claims that an edit allocates only the edited node's ancestors
 * and that untouched subtrees keep referential identity. That was not true: both
 * updateNode and removeNode rebuilt every node on every call, so React.memo
 * could never skip a subtree and a no-op edit produced a whole new tree that the
 * undo stack recorded as a version.
 */
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
    // The branch that contains the edit is rebuilt.
    expect(after.children?.[0]).not.toBe(before.children?.[0])
    // The branch that does not is the very same object.
    expect(after.children?.[1]).toBe(before.children?.[1])
    // And so is the untouched sibling inside the edited branch.
    expect(after.children?.[0]?.children?.[1]).toBe(before.children?.[0]?.children?.[1])
  })

  it('updates the root itself', () => {
    // The one node with no parent to rewrite through, and the branch every
    // other case in this describe walks past.
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
    // A remove that finds nothing must not read as an edit, or the undo stack
    // grows with a version identical to the one before it.
    expect(removeNode(before, 'missing')).toBe(before)
  })

  it('refuses to move a node into a leaf', () => {
    /*
     * `insertNode` will give a leaf a `children` array, which produces a subtree
     * no renderer draws while `validateForm` and `toJsonSchema` keep walking it
     * -- a required field nobody can fill in. The designer's drop paths refused
     * this and the API did not, which is the worse of the two places to leave a
     * hole.
     */
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
    /*
     * Both children are TextFields and textField/textField2 are taken, so a
     * generator reading only the original tree would name both copies
     * textField3 and produce a document that fails its own validation.
     */
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

    // Duplicate keys are the failure this whole function exists to avoid, and
    // validateDocument is what would report them.
    expect(validateDocument(document)).toEqual([])
  })

  it('re-points a condition that named the copied node at the copy', () => {
    /*
     * A Step is a Step because its `renderWhen` compares `context.step` against
     * its own key. Copied by reference, the duplicate was shown by the
     * original's name: both steps render at once, and the copy can never be
     * reached by asking for it. Nothing tested this, and the run that found it
     * confirmed it by execution.
     */
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
    /*
     * The other half of the rule, and the reason this is not a blanket rewrite:
     * a condition on an answer whose value happens to equal the copied key is
     * about that answer, not about the node. Rewriting it would change what the
     * copy is asking.
     */
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
    /*
     * The other two records a panel writes into. They were shared by reference,
     * so styling the duplicate restyled the original and an event wired on one
     * appeared on the other -- invisible today because every writer replaces
     * rather than mutates, which is what makes it cheap to close now.
     */
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

    // Keying off the type would call this textField, throwing away the only
    // part of the name a form author chose.
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

  /*
   * The same rewrite, in the shapes a condition actually takes.
   *
   * Every fixture above is one flat `eq`, so the rewrite was only ever proven
   * against a condition one level deep with two operands. `repointBinding`
   * (tree.ts:233-246) also walks `conditions` and `condition` for the boolean
   * operators and rewrites the `options` array for `in` and `notIn` -- three
   * branches nothing reached. Delete the recursion and a Step wrapped in a
   * one-element `and` duplicates still carrying the original's key: both steps
   * render at once and the copy can never be asked for, which is exactly the
   * defect the flat case was written for.
   */
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
    // `not` carries a single `condition`, not a `conditions` list, so it is a
    // separate line in the walk and a separate way to miss the subtree.
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
    /*
     * The control for the options rewrite, and the same rule the flat case
     * holds: a list of answers that happens to contain the copied key is about
     * the answers. `readsContext` gates the whole rewrite, so a `ref` on the
     * left has to leave the list byte-identical.
     */
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
    // It used to be reported as `empty-data-key`, "has an empty data key",
    // which is not what is wrong with `dataKey: 7` and sends the reader looking
    // for a blank field. The message is the whole product of this function.
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
    /*
     * It matters more here than for a node key: a data key is a property name
     * in the exported JSON Schema and a key in the submitted payload, so it
     * leaves the document in a way a node key never does.
     */
    expect(validateDocument(withDataKey('first-name')).map((e) => e.code)).toEqual([
      'invalid-data-key',
    ])
    expect(validateDocument(withDataKey('__proto__')).map((e) => e.code)).toEqual([
      'invalid-data-key',
    ])
  })

  it('rejects a component key the grammar does not allow', () => {
    // The same rule a rename is judged by, so a pasted document cannot hold a
    // key the panel would have refused.
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
  /*
   * A Step is a container shown when `context.step` equals its own key. That
   * condition is the whole difference between a step and a box, so a kit states
   * it rather than asking every author to write it by hand and get the path
   * right. It has to be applied after the key is generated, because the rule
   * names the node.
   */
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
    // Generated from the key, so a second one cannot silently share the first's
    // condition and show at the same time.
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
   * Keys are unique: validateDocument reports a duplicate and the panel refuses
   * a rename that would make one. But reporting is not preventing, and a host
   * can render a document it never validated — so what these do when a document
   * is wrong is worth pinning, because they used to do different things.
   *
   * findNode and findParent assigned on every match with no early exit, so they
   * answered with the last match while pathTo answered with the first. Two
   * functions in one file disagreeing about which node a key means is a bug
   * whichever answer is correct.
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
     * `email` and ` email ` are two components as far as the duplicate check is
     * concerned, and one name everywhere downstream: the panel would store the
     * trimmed form for either, so a rename of one silently becomes the other.
     * The stored key is judged as stored.
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

/**
 * The gate's opinion about `translations`.
 *
 * `validateDocument` checked the tree, the actions and the languages, and said
 * nothing about the bundle those languages are looked up in. So a document could
 * pass the gate and still take the React root down on the first render, because
 * the renderer reads `document.translations[tag]` with nothing in front of it.
 *
 * A document is data — hand-edited JSON, a paste, a row out of a database — so
 * "the type says it is a record" is not a check.
 */
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
    /*
     * A bundle for a language the document does not declare is dead weight, not
     * a fault: it is what a half-finished translation looks like, and deleting
     * a language should not make the document invalid.
     */
    expect(codes({ fr: { greeting: 'Bonjour' } })).toEqual([])
  })
})

/**
 * The gate rejects a tag nothing can read.
 *
 * The runtime readings are the second answer, not the first. A document holding
 * `kind: 'conditon'` is malformed, and the point of a boot-time check is that
 * nobody has to reason about what a malformed document does at render time.
 */
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

/**
 * The gate looks at the whole document, not at the parts that were easy.
 *
 * `validateDocument` checked keys, actions and languages, and said nothing about
 * `props`, `renderWhen`'s payload, `schema.validations`' payloads, `version`,
 * `settings` or `css`. Every one of those is read at render time without a
 * guard in front of it, and a document is data: it is authored by one person,
 * stored by another, and hand-editable in between.
 *
 * The rule these tests hold the gate to is narrow and worth stating. It refuses
 * what is **malformed**, meaning a shape no version of this library ever wrote.
 * It does not refuse what is merely unusual, because a gate that rejects a
 * document somebody is holding is worse than the render it was protecting.
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
      // `static` is the one kind whose payload is unconstrained, deliberately: a
      // prop can be a list of options or a nested object, and the kit decides.
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
      // The recursion is the point. A malformed condition three levels down is
      // exactly as reachable at render time as one at the top.
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
      // `minLength` compares with `<`, so a string bound silently compares
      // lexicographically; `pattern` is handed to RegExp.
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
      /*
       * A separate judgement on purpose. Text holding a brace is refused at
       * render time and reported in the Style tab, and a document carrying it
       * still opens and can be fixed. Refusing it here would make the panel that
       * exists to repair such a document the one place you cannot load it.
       */
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

/**
 * Four ways the tree treated a duplicate key, or a key literal, as somebody
 * else's problem.
 */
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
    /*
     * `findNode`, `findParent` and `pathTo` all deliberately take the first
     * match, with a comment saying why: two functions disagreeing about which
     * node a key means is a bug whichever answer is right. The three mutators
     * acted on *every* match, so with duplicate keys an edit landed twice —
     * and `moveNode` composes remove and insert, so one node ended up at two
     * places in the tree.
     */
    const next = updateNode(twice(), 'same', (n) => ({ ...n, type: 'Changed' }))
    const kinds = (next.children ?? []).map((c) => c.type)

    expect(kinds).toEqual(['Changed', 'Field', 'Field'])
  })

  it('stops at the first match even when that update changes nothing', () => {
    /*
     * The case the test above cannot see, and the one the `found` flag exists
     * for.
     *
     * `updateNode` documents the distinction itself: it stopped at the first
     * child whose subtree came back a *different object*, so an update that
     * returns its input unchanged left the flag down and the walk carried on
     * into the next sibling. Every `updateNode` call in this repository's tests
     * either mutates the node or targets a missing key -- so restoring the
     * pre-fix `changed`-only implementation left all six of them green.
     *
     * A controlled property editor writing the value the node already holds is
     * exactly this: a no-op update, on every keystroke that does not change
     * anything. With a duplicate key -- which `validateDocument` reports and
     * cannot prevent -- the second node was silently edited instead.
     *
     * Observed through identity rather than through a value, because a no-op
     * update by definition leaves no value to look at.
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
    // The control. Stopping at the first match must not mean stopping at the
    // first child: the node may be anywhere in the tree.
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
    /*
     * `Step` ships with a `renderWhen` naming its own key, which is what makes
     * it a step. Duplicating one copied the condition by reference, so the copy
     * was shown by the *original's* name: two steps render at once and the copy
     * can never be reached. `factory.ts` applies `defaultRenderWhen(node.key)`
     * after the key for exactly this reason.
     */
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
    /*
     * `step2`, not `step`. The name is taken from the source's own number
     * upwards, so a copy is never named below the thing it was copied from --
     * duplicating `step1` used to produce `step` whenever `step` happened to be
     * free, which reads as the original coming back rather than as a copy.
     */
    expect(copy?.key).toBe('step2')

    const when = copy?.renderWhen
    const right =
      when?.kind === 'condition' && 'right' in when.condition ? when.condition.right : undefined
    expect(right).toEqual({ kind: 'literal', value: copy?.key })
  })

  it('leaves a condition that names something else alone', () => {
    // The control. Rewriting every literal that happens to match would corrupt
    // a condition testing an unrelated field whose value is the copied key.
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

/**
 * Two lookups in `validateDocument` that read through the prototype.
 */
describe('validateDocument and inherited properties', () => {
  it('reports an action reference naming something only Object has', () => {
    /*
     * `actions[name] === undefined` finds `Object.prototype.toString`, so an
     * event referencing `toString` passed the unknown-action check and named an
     * action the document does not have.
     */
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
    /*
     * The gate spelled the rule out as `typeof dialect === 'string'`, which is
     * true for `''`, so it computed `en-` and compared that against
     * `defaultLanguage`. `languageTag` uses truthiness and answers `en`. A
     * document with an empty dialect validated clean and then had no resolvable
     * default language at runtime.
     */
    const doc = {
      ...createDocument('Contact', 'doc'),
      languages: [{ code: 'en', dialect: '', name: 'English', bidi: 'ltr' }],
      defaultLanguage: 'en',
    } as unknown as FormDocument

    expect(validateDocument(doc)).toEqual([])
  })
})

/**
 * A context path that can never resolve.
 *
 * `contextKeys` skips an empty path, deliberately — it is not a path, and
 * `missingContext` returns a list of paths, so an empty entry in it would be a
 * host's problem rather than an answer. But skipping it meant nothing reported
 * it at all, and a `context` operand with an empty path reads `undefined`
 * forever: its condition is permanently false and its component permanently
 * unvalidated.
 *
 * So the gate refuses it, which is where a document that cannot work belongs.
 */
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
    /*
     * The control, and the line this draws. Whether the *host* holds
     * `user.role` is `missingContext`'s question, asked at that host's startup
     * against its own context. Whether the document said anything at all is
     * this one.
     */
    expect(validateDocument(reading('user.role'))).toEqual([])
  })
})

/**
 * A document nested deeper than the stack.
 *
 * `validateDocument`'s own walk and `rowScopeProblems` both recurse over
 * `children` with no bound, in the function whose entire job is to be the thing
 * that never throws on a document. A `RangeError` here is the gate failing in
 * the one way it exists to prevent.
 */
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
    // The control. A bound low enough to catch real nesting would refuse
    // documents that work, which is worse than the crash.
    expect(validateDocument(deep(30))).toEqual([])
  })
})

/**
 * Two components that submit the same answer, in the exported schema.
 *
 * Sharing a `dataKey` is deliberate and documented: two fields behind opposite
 * guards write one answer. The export visited them in order and let the last
 * win, so the first component's type, format and constraints were discarded
 * with nothing reported — and `unexportableRules`, which exists to say what the
 * export could not carry, said nothing.
 */
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

/**
 * A schema with no `validations` at all.
 *
 * `validateDocument` accepts one -- `validations === undefined` returns early
 * from its schema check, deliberately, because a field with no rules is an
 * ordinary field and demanding `validations: []` would refuse hand-written
 * documents for nothing. The type said `ValidationRule[]`, required, so every
 * reader was written as though the array were always there.
 *
 * Three of them were not guarded. `duplicateNode` spread it, which is the
 * finding the review made; `validateField` and `toJsonSchema` iterated it, which
 * are the two twins, and the first of those is the validation path itself. So a
 * document the gate calls valid threw a `TypeError` out of the duplicate action,
 * out of `validateForm`, and out of the schema export.
 *
 * Ten other readers already guarded with `Array.isArray`, which is what made
 * this look handled.
 */
describe('a field whose schema has no validations', () => {
  /*
   * Built as JSON and cast, because that is how it arrives: from a file, a
   * paste into the JSON dialog, or a request body. A fixture that could only be
   * built by defeating the type checker is still a fixture the product receives.
   */
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
    // The worst of the three. A document the gate called valid took the whole
    // submit down, on the server, with a TypeError.
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
    /*
     * The other half, and the reason the fix reads the value rather than merely
     * defaulting it. A document is data, so `validations` can be a string, and
     * `?? []` would let that through to a `for...of` that throws on it.
     */
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

/**
 * What a copy is called when the source already carries a number.
 *
 * `baseOf` strips the trailing digits and `freeKey` returned the bare base
 * whenever nothing had taken it -- so in a document where `website` was renamed
 * away and `website2` remains, duplicating `website2` produced `website`. A
 * copy named below its source contradicts the rule `duplicateNode`'s own
 * docstring states, and reads as the original having been restored.
 */
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
    // The ordinary case, unchanged: `website` copies to `website2`.
    expect(duplicateNode(withKeys('website'), 'website')?.key).toBe('website2')
    expect(duplicateNode(withKeys('website', 'website2'), 'website')?.key).toBe('website3')
  })
})

/**
 * A node whose key is unusable is still a node worth reading.
 *
 * `visitShape` and `visitEvents` sat inside the final `else` of the key chain,
 * so a component with an empty or non-string key had its props, conditions,
 * css and rules go unchecked. Fixing the key then produced a second round of
 * errors about a document the first report had already called broken -- and a
 * host gating on `validateDocument` sees one problem at a time.
 */
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

    // Both, in one pass. The key problem was the only one reported.
    expect(codes.length).toBeGreaterThan(1)
    expect(codes.some((code) => code === 'malformed')).toBe(true)
  })

  it('still reports nothing for a node that is fine', () => {
    // The control: reading the shape of every node must not invent problems.
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

/**
 * `flatten` and `walk`, in the package that owns them.
 *
 * Both are exported from `tree.ts` and neither was imported by this file:
 * `flatten`'s `parentKey`/`index`/`depth` contract was pinned only in
 * `packages/designer/src/keyboard.test.ts`, so core's own traversal was
 * described by a test in another package that could be deleted with core's
 * suite staying green -- and `walk` is what `styleSheetFor`,
 * `unexportableRules` and `collectKeys` all traverse with.
 */
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
   * The malformed-shape rows `walk` has had for a while and its six neighbours
   * never borrowed.
   *
   * `store.ts` deliberately only `console.warn`s an invalid `initialDocument`,
   * arguing that a library which will not open a host's own saved document is
   * worse than one that opens it and says what is wrong. That is a good
   * decision and it makes every function here load-bearing: `flatten` runs in
   * `Tree.tsx`'s render body, and a throw during render unmounts the whole
   * designer in React 19 -- including the JSON dialog that was the repair
   * route. `flatten` is not designer-only either: `autoValidateKeys` walks the
   * public tree with it.
   *
   * No source change was needed for any of these to throw. `children: {}` and
   * `children: "ab"` are not nullish, so `?? []` and `?.forEach` let them
   * through.
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
    /*
     * `walk` is depth-bounded and its comment calls it "the walk every other
     * module borrows". These six were not, so a document nested past the stack
     * was a RangeError out of a render body or an event handler. Built with a
     * loop; building it recursively would overflow before the assertion could.
     */
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
     * `if (node.children)` is truthy for a non-array, so `children: {}` was
     * silently coerced into `children: []` on the copy -- a *different*
     * malformed document rather than the same one, and unlike `updateNode` and
     * `removeNode`, which leave a non-array `children` exactly as they found
     * it. Raised in review on PR #42.
     *
     * A copy differs from its source in its keys and in nothing else, and a
     * document this shape is one somebody is about to repair -- where a copy
     * that quietly differs from what they are looking at is the worst thing to
     * hand them.
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
    /*
     * The over-length path had no test. `generateKey` is bounded by
     * `MAX_KEY_LENGTH` through `keyProblem`, and `copyKey` minted whatever it
     * liked -- so duplicating a component with a 128-character key produced a
     * 129-character key, which this same package's `validateDocument` then
     * reports as `invalid-key`. A mint that produces a document the gate
     * refuses is not a mint. Raised in review on PR #43.
     */
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
    /*
     * The loop, not only the first trim. Two long keys whose trimmed forms
     * would collide have to end up distinct, or duplicating twice mints a
     * document with a duplicate key -- which `updateNode` then resolves to the
     * first match forever after.
     */
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
    // The control. Carrying every `children` through untouched would pass the
    // row above while leaving the copy's descendants sharing the source's keys.
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
    /*
     * The control. Guarding by returning nothing would pass every row above
     * while breaking the panel, so each call is checked against a real answer.
     */
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
   * Four `malformed(...)` calls in `validateDocument` that no test in this
   * repository reaches.
   *
   * The nearest thing was a test building the exact document one of them has a
   * branch for -- `schema.validations: 'required'` -- and asserting only that
   * three consumers do not throw, never that the gate reports it. A repo-wide
   * grep for the message string found nothing. Delete any one of these four
   * calls and the whole suite stays green, which makes the gate's report a
   * claim nothing checks.
   *
   * Asserted on the message, not only on the code: `malformed` is the code all
   * four share, so a `codes.some(c => c === 'malformed')` assertion is
   * satisfied by whichever other problem the fixture happens to have. That is
   * the shape of the `key: 42` row elsewhere in this file, where the key error
   * is itself coded `malformed` and only the length check does any work.
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
    // The control. A gate that reported on everything would pass every row
    // above while refusing every real document.
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
    /*
     * `insertNode`, `removeNode` and `updateNode` each pin invariant 4 and
     * `moveNode` had no immutability assertion at all -- the operation that
     * composes remove-then-insert, and the one drag-and-drop calls. Undo holds
     * references to prior documents, so a mutation here is an undo that
     * silently does nothing.
     *
     * On a *successful* move specifically: a refused move returns the same root
     * and would satisfy any comparison trivially.
     */
    const before = tree()
    const snapshot = JSON.stringify(before)

    const after = moveNode(before, 'y', 'box')

    expect(after, 'the move was refused, so this proves nothing').not.toBe(before)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('duplicateNode does not alias the records it copies', () => {
    /*
     * The existing assertion compares JSON before and after on a fixture whose
     * nodes carry no `css`, `events`, `schema` or nested props -- none of the
     * records `duplicateNode` actually copies -- so it is the one invariant-4
     * check for this function and it cannot observe aliasing. This fixture
     * carries all four and mutates the copy.
     */
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

    /*
     * Every record is asserted present *before* it is mutated, and mutated
     * without optional chaining.
     *
     * The first version used `copy?.events?.onChange?.push(...)`, so if a
     * record had not been copied at all the mutation was a silent no-op and the
     * source was unchanged for the wrong reason -- the test passed while
     * proving nothing about aliasing. Raised in review on PR #43, and it is the
     * exact shape this run keeps finding: an assertion that cannot fail because
     * the thing it acts on is not there.
     */
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

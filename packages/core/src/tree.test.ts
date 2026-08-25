import { describe, expect, it } from 'vitest'

import { createDocument, emptyRoot, prop } from './factory.js'
import type { ComponentNode, FormDocument } from './types.js'
import {
  collectKeys,
  findNode,
  findParent,
  generateKey,
  insertNode,
  moveNode,
  pathTo,
  removeNode,
  updateNode,
  validateDocument,
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
})

describe('mutations are immutable', () => {
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

  it('removes a nested node', () => {
    expect(collectKeys(removeNode(fixture(), 'a'))).toEqual(['root', 'stack', 'b', 'c'])
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
})

describe('validateDocument', () => {
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
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  })

  /** Anything at all, as a document. */
  const judge = (mutate: (doc: Record<string, unknown>) => void): StructuralError[] => {
    const doc = wellFormed() as unknown as Record<string, unknown>
    mutate(doc)
    return validateDocument(doc as unknown as FormDocument)
  }

  it.each([
    [
      'a number for children',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['children'] = 5),
    ],
    [
      'a string for children',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['children'] = 'abc'),
    ],
    ['a null root', (d: Record<string, unknown>) => (d['root'] = null)],
    ['a missing root', (d: Record<string, unknown>) => delete d['root']],
    [
      'a number for a key',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['key'] = 7),
    ],
    [
      'a missing type',
      (d: Record<string, unknown>) => delete (d['root'] as Record<string, unknown>)['type'],
    ],
    [
      'a string for events',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['events'] = 'go'),
    ],
    [
      'a non-array event list',
      (d: Record<string, unknown>) =>
        ((d['root'] as Record<string, unknown>)['events'] = { onClick: 1 }),
    ],
    [
      'a null in an event list',
      (d: Record<string, unknown>) =>
        ((d['root'] as Record<string, unknown>)['events'] = { onClick: [null] }),
    ],
    ['a number for languages', (d: Record<string, unknown>) => (d['languages'] = 3)],
    ['a language with no code', (d: Record<string, unknown>) => (d['languages'] = [{ name: 'X' }])],
    ['a null for actions', (d: Record<string, unknown>) => (d['actions'] = null)],
    [
      'a nested non-node child',
      (d: Record<string, unknown>) => ((d['root'] as Record<string, unknown>)['children'] = [42]),
    ],
  ])('reports rather than throws on %s', (_label, mutate) => {
    let errors: StructuralError[] = []
    expect(() => {
      errors = judge(mutate)
    }).not.toThrow()
    expect(errors.length, 'malformed input was accepted silently').toBeGreaterThan(0)
  })

  it('survives values that are not objects at all', () => {
    for (const value of [null, undefined, 42, 'text', [], true]) {
      expect(() => validateDocument(value as unknown as FormDocument)).not.toThrow()
      expect(validateDocument(value as unknown as FormDocument).length).toBeGreaterThan(0)
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

  it('returns the same tree for an illegal move', () => {
    const before = tree()
    expect(moveNode(before, 'left', 'a'), 'a container moved into its own child').toBe(before)
    expect(moveNode(before, 'missing', 'root')).toBe(before)
    expect(moveNode(before, 'root', 'left'), 'the root cannot move').toBe(before)
  })
})

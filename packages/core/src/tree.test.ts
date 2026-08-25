import { describe, expect, it } from 'vitest'

import { createDocument, emptyRoot, prop } from './factory.js'
import type { ComponentNode } from './types.js'
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
      { key: 'a', type: 'Button', props: {}, events: { onClick: [{ name: 'ghost', type: 'code' }] } },
    ])
    expect(validateDocument(doc).map((e) => e.code)).toContain('unknown-action')
  })

  it('accepts an event referencing a defined action', () => {
    const doc = createDocument('Test', 'id-1')
    doc.actions['submit'] = { name: 'submit', body: '', params: {} }
    doc.root = container('root', [
      { key: 'a', type: 'Button', props: {}, events: { onClick: [{ name: 'submit', type: 'code' }] } },
    ])
    expect(validateDocument(doc)).toEqual([])
  })

  it('reports a defaultLanguage that is not in the language list', () => {
    const doc = createDocument('Test', 'id-1')
    doc.defaultLanguage = 'fr-FR'
    expect(validateDocument(doc).map((e) => e.code)).toContain('unknown-language')
  })
})

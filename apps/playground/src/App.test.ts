/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadChoice } from './App.js'

const KEY = 'willowforms.test.choice'
const REGISTRY = { first: 'First', second: 'Second' }

// Node's own `localStorage` global can shadow jsdom's and be undefined, so tests install one.
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    },
  }
}

let storage: Pick<Storage, 'getItem' | 'setItem'>

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadChoice', () => {
  it('returns a saved choice that names a registry entry', () => {
    storage.setItem(KEY, 'second')
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('second')
  })

  it('reads only its own key', () => {
    storage.setItem(KEY + '.other', 'second')
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('first')
  })

  it.each([
    ['nothing saved', null],
    ['an unknown value', 'third'],
    ['an empty value', ''],
    ['an inherited property name', 'toString'],
  ])('falls back for %s', (_label, saved) => {
    if (saved !== null) storage.setItem(KEY, saved)
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('first')
  })

  it('falls back when storage throws on read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Storage disabled', 'SecurityError')
      },
      setItem: () => undefined,
    })
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('first')
  })
})

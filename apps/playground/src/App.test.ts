/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadChoice } from './App.js'

const KEY = 'willowforms.test.choice'
const REGISTRY = { first: 'First', second: 'Second' }

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('loadChoice', () => {
  it('returns a saved choice that names a registry entry', () => {
    localStorage.setItem(KEY, 'second')
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('second')
  })

  it('reads only its own key', () => {
    localStorage.setItem(KEY + '.other', 'second')
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('first')
  })

  it.each([
    ['nothing saved', null],
    ['an unknown value', 'third'],
    ['an empty value', ''],
    ['an inherited property name', 'toString'],
  ])('falls back for %s', (_label, saved) => {
    if (saved !== null) localStorage.setItem(KEY, saved)
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('first')
  })

  it('falls back when storage throws on read', () => {
    localStorage.setItem(KEY, 'second')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError')
    })
    expect(loadChoice(KEY, REGISTRY, 'first')).toBe('first')
  })
})

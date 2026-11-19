import { describe, expect, it } from 'vitest'

import { loadDocument } from './document.js'
import { createDocument } from './factory.js'

describe('loadDocument', () => {
  it('loads a current valid document without mutating it', () => {
    const input = createDocument('Contact', 'contact')
    const before = JSON.stringify(input)

    const result = loadDocument(input)

    expect(result).toEqual({ ok: true, document: input })
    expect(JSON.stringify(input)).toBe(before)
  })

  it('normalizes compatibility defaults accepted by version 1', () => {
    const input = createDocument('Contact', 'contact') as unknown as Record<string, unknown>
    delete input['actions']
    delete input['settings']

    const result = loadDocument(input)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.actions).toEqual({})
    expect(result.document.settings).toEqual({})
    expect(input).not.toHaveProperty('actions')
    expect(input).not.toHaveProperty('settings')
  })

  it.each([null, [], 'document'])('rejects a non-document value (%s)', (input) => {
    const result = loadDocument(input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.message)).toContain(
      'A form document must be an object.',
    )
  })

  it('rejects a version for which no migration exists', () => {
    const input = { ...createDocument('Contact', 'contact'), version: '2' }

    const result = loadDocument(input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toContain('this library writes version "1"')
  })

  it.each(['toString', 'valueOf', 'hasOwnProperty', 'constructor', '__proto__'])(
    'rejects version "%s" as an unknown version, not a migration',
    (version) => {
      const input = { ...createDocument('Contact', 'contact'), version }

      const result = loadDocument(input)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors.map((error) => error.message)).toEqual([
        `version is ${JSON.stringify(version)}, and this library writes version "1".`,
      ])
    },
  )

  it('refuses a document over the value limit and says why', () => {
    const input = {
      ...createDocument('Contact', 'contact'),
      settings: { padding: new Array<number>(1_000_000).fill(0) },
    }

    const result = loadDocument(input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.message)).toEqual([
      'A form document cannot contain more than 1,000,000 JSON values.',
    ])
  })

  it('rejects values that cannot cross a JSON boundary', () => {
    const document = createDocument('Contact', 'contact')
    const cyclic: Record<string, unknown> = { ...document }
    cyclic['self'] = cyclic

    expect(loadDocument(cyclic).ok).toBe(false)
    expect(
      loadDocument({
        ...document,
        actions: { go: { name: 'go', body: '', params: { fn: () => 1 } } },
      }).ok,
    ).toBe(false)
    expect(loadDocument({ ...document, settings: { score: Number.NaN } }).ok).toBe(false)
    expect(
      loadDocument(
        new Proxy(
          {},
          {
            get: () => {
              throw new Error('unreadable')
            },
          },
        ),
      ).ok,
    ).toBe(false)
  })
})

// Calls the real routes through `app.request`; never re-implement a route here.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentNode, FormDocument } from '@willowforms/core'

import { expectConsoleError } from '../../../test/console-errors.js'

/*
 * Set before a dynamic import: `index.ts` reads it at module scope, and a static import would be
 * hoisted above this.
 */
const directory = await mkdtemp(join(tmpdir(), 'willowforms-demo-'))
const store = join(directory, 'forms.json')
process.env['WILLOWFORMS_DEMO_STORE'] = store

const FORM: FormDocument = {
  version: '1',
  id: 'deep',
  name: 'Deep',
  root: {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'answers',
        type: 'TextField',
        props: {},
        schema: { type: 'array', validations: [] },
      },
      {
        key: 'name',
        type: 'TextField',
        props: {},
        schema: { type: 'string', validations: [{ key: 'required' }] },
      },
    ],
  },
  actions: {},
  languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
  defaultLanguage: 'en-US',
  translations: {},
  settings: {},
}

await writeFile(store, JSON.stringify({ deep: FORM }), 'utf8')

const { app, stopper } = await import('./index.js')

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

const restore = async (): Promise<void> => {
  await writeFile(store, JSON.stringify({ deep: FORM }), 'utf8')
}

/** For a describe whose tests change the store or read all of it. */
const restoreAroundEach = (): void => {
  beforeEach(restore)
  afterEach(restore)
}

const send = async (path: string, method: string, body: string): Promise<Response> =>
  await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })

const put = async (id: string, document: unknown): Promise<Response> =>
  await send('/api/forms/' + id, 'PUT', JSON.stringify(document))

const submit = async (body: string): Promise<Response> =>
  await send('/api/forms/deep/submit', 'POST', body)

const deepBody = (n: number): string =>
  '{"answers":' + '['.repeat(n) + '1' + ']'.repeat(n) + ',"name":"Ada"}'

describe('a body nested deeper than anything will walk', () => {
  it('answers rather than throwing, at 200 KB', async () => {
    // V8's `JSON.parse` accepts this depth; a recursive walk or `JSON.stringify` would throw.
    const response = await submit(deepBody(100_000))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'JSON is nested deeper than this server will read',
    })
  })

  it('refuses at the depth the library stops reading, not at the depth V8 stops writing', async () => {
    // 12 KB, far under the size cap, yet deep enough that `JSON.stringify` throws.
    expect((await submit(deepBody(6_000))).status).toBe(400)
  })

  it('still takes a body a form would actually send', async () => {
    const response = await submit('{"answers":[[1,2],[3]],"name":"Ada"}')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      received: { answers: [[1, 2], [3]], name: 'Ada' },
    })
  })

  it('still reports a missing required answer', async () => {
    const response = await submit('{"answers":[]}')

    expect(response.status).toBe(422)
  })
})

describe('localized validation messages', () => {
  it('uses the document default-language bundle on submit', async () => {
    const localized: FormDocument = {
      ...FORM,
      id: 'localized',
      root: {
        ...FORM.root,
        children: [
          {
            key: 'name',
            type: 'TextField',
            props: {},
            schema: {
              type: 'string',
              validations: [{ key: 'required', message: { kind: 'i18n', key: 'name_required' } }],
            },
          },
        ],
      },
      translations: { 'en-US': { name_required: 'Please enter your name.' } },
    }
    const saved = await app.request('/api/forms/localized', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(localized),
    })
    expect(saved.status).toBe(200)

    const response = await app.request('/api/forms/localized/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      ok: false,
      errors: { name: 'Please enter your name.' },
    })
  })
})

describe('two documents stored at once', () => {
  const formNamed = (id: string): FormDocument => ({ ...FORM, id, name: id })

  const save = (id: string): Promise<Response> => put(id, formNamed(id))

  it('keeps both', async () => {
    const [first, second] = await Promise.all([save('one'), save('two')])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const listed = (await (await app.request('/api/forms')).json()) as { id: string }[]
    const held = new Set(listed.map((row) => row.id))
    expect(
      ['one', 'two'].filter((id) => !held.has(id)),
      'one write replaced the other',
    ).toEqual([])
  })

  it('keeps all of a larger burst', async () => {
    // Ten, because two requests can pass by luck when their reads happen to be ordered.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    await Promise.all(ids.map(save))

    const listed = (await (await app.request('/api/forms')).json()) as { id: string }[]
    const held = new Set(listed.map((row) => row.id))
    expect(
      ids.filter((id) => !held.has(id)),
      'writes were lost',
    ).toEqual([])
  }, 15_000)

  it('still refuses to delete an id nobody holds', async () => {
    const response = await app.request('/api/forms/nothing-here', { method: 'DELETE' })
    expect(response.status).toBe(404)
  })
})

describe('a body larger than the limit', () => {
  const oversized = (): string => '{"answers":"' + 'x'.repeat(1_100_000) + '","name":"Ada"}'

  it('is refused on the declared length, before it is read', async () => {
    const body = oversized()
    const response = await app.request('/api/forms/deep/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
      body,
    })

    expect(response.status).toBe(413)
  })

  it('stops reading the stream rather than buffering it and then declining', async () => {
    // Counts pulled chunks: the status alone cannot tell a capped read from a buffered one.
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024))
    const total = 64
    let pulled = 0

    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= total) {
          controller.close()
          return
        }
        pulled += 1
        controller.enqueue(chunk)
      },
    })

    const response = await app.request(
      new Request('http://localhost/api/forms/deep/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // Required by undici for a streaming request body.
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
    )

    expect(response.status).toBe(413)
    expect(pulled, 'the whole body was read before it was declined').toBeLessThan(total)
  })

  it('still takes a body of an ordinary size', async () => {
    const response = await submit('{"answers":[],"name":"Ada"}')
    expect(response.status).toBe(200)
  })
})

describe('a form with two steps', () => {
  const step = (name: string, children: ComponentNode[]): ComponentNode => ({
    key: 'step' + name.charAt(0).toUpperCase() + name.slice(1),
    type: 'Box',
    props: {},
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: name },
      },
    },
    children,
  })

  const wizard: FormDocument = {
    ...FORM,
    id: 'wizard',
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        step('who', [
          {
            key: 'name',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [] },
          },
        ]),
        step('where', [
          {
            key: 'city',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [] },
          },
        ]),
      ],
    },
  }

  it('echoes the answers from every step, not only the first', async () => {
    await app.request('/api/forms/wizard', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(wizard),
    })

    const response = await app.request('/api/forms/wizard/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', city: 'Ely' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, received: { name: 'Ada', city: 'Ely' } })
  })

  it('still leaves out an answer to a question the form is not asking', async () => {
    const response = await app.request('/api/forms/wizard/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', city: 'Ely', leftover: 'x' }),
    })

    expect(await response.json()).toEqual({ ok: true, received: { name: 'Ada', city: 'Ely' } })
  })
})

describe('a form id borrowed from Object.prototype', () => {
  for (const id of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
    it('is not a form: ' + id, async () => {
      const response = await app.request('/api/forms/' + id + '/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":"Ada"}',
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'Not found' })
    })
  }

  it('is not a form even when a real one is stored beside it', async () => {
    expect((await submit('{"answers":[],"name":"Ada"}')).status).toBe(200)
  })
})

describe('a signal arriving mid-write', () => {
  it('exits once the server reports its connections closed', () => {
    let closed: (() => void) | undefined
    const exit = vi.fn()

    stopper({ close: (done) => (closed = done) }, exit)('SIGTERM')

    expect(exit).not.toHaveBeenCalled()

    closed?.()
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('exits anyway when a connection never closes', () => {
    vi.useFakeTimers()
    try {
      const exit = vi.fn()

      stopper({ close: () => {} }, exit)('SIGINT')

      vi.advanceTimersByTime(4_999)
      expect(exit).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(exit).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a store holding something that is not a document', () => {
  const JUNK: Record<string, unknown> = {
    aNumber: 5,
    aString: 'not a document',
    aList: [1, 2, 3],
    noId: { root: { key: 'root', type: 'Screen', props: {} } },
    noRoot: { id: 'noRoot', name: 'No root' },
    aNull: null,
    scalarRoot: { id: 'scalarRoot', root: 5 },
    listRoot: { id: 'listRoot', root: [] },
    emptyRoot: { id: 'emptyRoot', root: {} },
    rootWithoutType: { id: 'rootWithoutType', root: { key: 'root', props: {} } },
    noSettings: {
      version: '1',
      id: 'noSettings',
      name: 'No settings',
      root: { key: 'root', type: 'Screen', props: {} },
      actions: {},
      languages: [],
      defaultLanguage: 'en',
      translations: {},
    },
    scalarLanguage: {
      version: '1',
      id: 'scalarLanguage',
      name: 'Scalar language',
      root: { key: 'root', type: 'Screen', props: {} },
      actions: {},
      languages: [5],
      defaultLanguage: 'en',
      translations: {},
      settings: {},
    },
    languageWithoutBidi: {
      version: '1',
      id: 'languageWithoutBidi',
      name: 'No bidi',
      root: { key: 'root', type: 'Screen', props: {} },
      actions: {},
      languages: [{ code: 'en', name: 'English' }],
      defaultLanguage: 'en',
      translations: {},
      settings: {},
    },
    wrongVersion: {
      version: '2',
      id: 'wrongVersion',
      name: 'From the future',
      root: { key: 'root', type: 'Screen', props: {} },
      actions: {},
      languages: [],
      defaultLanguage: 'en',
      translations: {},
      settings: {},
    },
  }

  const withJunk = async (extra: Record<string, unknown> = {}): Promise<void> => {
    await writeFile(store, JSON.stringify({ ...JUNK, ...extra }), 'utf8')
  }

  it.each(Object.keys(JUNK))('refuses a submit against %s', async (id) => {
    await withJunk()
    try {
      const response = await app.request('/api/forms/' + id + '/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"anything":"at all"}',
      })

      expect(response.status, id + ' was answered as though it were a form').toBe(404)
    } finally {
      await restore()
    }
  })

  it.each(Object.keys(JUNK))('refuses to read %s as a document', async (id) => {
    await withJunk()
    try {
      expect((await app.request('/api/forms/' + id)).status).toBe(404)
    } finally {
      await restore()
    }
  })

  it('leaves every one of them out of the listing, as it always did', async () => {
    await withJunk()
    try {
      const rows = (await (await app.request('/api/forms')).json()) as { id: string }[]
      expect(rows).toEqual([])
    } finally {
      await restore()
    }
  })

  it('still answers for a real document beside them', async () => {
    await withJunk({ deep: FORM })
    try {
      expect((await app.request('/api/forms/deep')).status).toBe(200)
      expect((await submit('{"name":"Ada"}')).status).toBe(200)
    } finally {
      await restore()
    }
  })
})

describe('a document PUT that the read guard would refuse', () => {
  /*
   * Passes `validateDocument`, which checks `actions` and `settings` only when present, but not
   * the storage guard, which requires both.
   */
  const thin = {
    version: '1',
    id: 'thin',
    name: 'Thin',
    root: { key: 'root', type: 'Screen', props: {} },
    translations: {},
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
  }

  it('is refused rather than stored', async () => {
    try {
      expect((await put('thin', thin)).status, 'the thin document was accepted').toBe(422)
    } finally {
      await restore()
    }
  })

  it('names the fields it is missing, rather than answering "invalid"', async () => {
    try {
      const body = (await (await put('thin', thin)).json()) as {
        errors?: { message: string }[]
      }
      const said = (body.errors ?? []).map((e) => e.message).join(' ')

      for (const field of ['actions', 'settings']) {
        expect(said, field + ' was not named').toContain(field)
      }
    } finally {
      await restore()
    }
  })

  it('leaves nothing behind in the store', async () => {
    try {
      await put('thin', thin)

      // Checks the file: every read refuses this document anyway, so a 404 proves nothing.
      const held = JSON.parse(await readFile(store, 'utf8')) as Record<string, unknown>
      expect(Object.keys(held), 'the refused document was written anyway').not.toContain('thin')
    } finally {
      await restore()
    }
  })

  it('still stores a whole document, which is what stops this being "refuse everything"', async () => {
    try {
      expect((await put('deep', { ...FORM, name: 'Renamed' })).status).toBe(200)

      const read = (await (await app.request('/api/forms/deep')).json()) as { name: string }
      expect(read.name).toBe('Renamed')
    } finally {
      await restore()
    }
  })
})

describe('the origins another page may call from', () => {
  const allowed = async (origin: string): Promise<string | null> =>
    (await app.request('/api/forms', { headers: { origin } })).headers.get(
      'access-control-allow-origin',
    )

  it.each(['http://localhost:5180', 'http://127.0.0.1:5180'])('include %s', async (origin) => {
    expect(await allowed(origin)).toBe(origin)
  })

  // `51800` would pass a prefix match.
  it.each(['http://evil.example', 'http://localhost:5181', 'http://localhost:51800', 'null'])(
    'do not include %s',
    async (origin) => {
      expect(await allowed(origin)).toBeNull()
    },
  )

  it.each([
    ['http://localhost:5180', 'http://localhost:5180'],
    ['http://evil.example', null],
  ])('answer a preflight for DELETE from %s with %s', async (origin, expected) => {
    const response = await app.request('/api/forms/deep', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'DELETE' },
    })

    expect(response.headers.get('access-control-allow-origin')).toBe(expected)
    expect(response.headers.get('access-control-allow-methods')).toContain('DELETE')
  })
})

describe('an id borrowed from Object.prototype, on the routes that read and write the store', () => {
  const BORROWED = ['__proto__', 'constructor', 'toString', 'hasOwnProperty']

  restoreAroundEach()

  it.each(BORROWED)('holds nothing under %s until something is written there', async (id) => {
    expect((await app.request('/api/forms/' + id)).status).toBe(404)
    expect((await app.request('/api/forms/' + id, { method: 'DELETE' })).status).toBe(404)
  })

  it('does not hold a whole document that the store only inherits', async () => {
    Object.defineProperty(Object.prototype, 'inherited', {
      configurable: true,
      value: { ...FORM, id: 'inherited' },
    })
    try {
      expect((await app.request('/api/forms/inherited')).status).toBe(404)
      expect((await send('/api/forms/inherited/submit', 'POST', '{"name":"Ada"}')).status).toBe(404)
    } finally {
      Reflect.deleteProperty(Object.prototype, 'inherited')
    }
  })

  it.each(BORROWED)('stores a document under %s, lists it, and deletes it', async (id) => {
    expect((await put(id, { ...FORM, id })).status).toBe(200)

    // Through the routes: a write that only set a prototype answers 200 and stores nothing.
    const read = await app.request('/api/forms/' + id)
    expect(read.status, id + ' was written and cannot be read back').toBe(200)
    expect(((await read.json()) as FormDocument).id).toBe(id)
    const rows = (await (await app.request('/api/forms')).json()) as { id: string }[]
    expect(rows.map((row) => row.id).sort()).toEqual(['deep', id].sort())

    expect((await app.request('/api/forms/' + id, { method: 'DELETE' })).status).toBe(200)
    expect((await app.request('/api/forms/' + id)).status).toBe(404)
    expect((await app.request('/api/forms/deep')).status).toBe(200)
  })
})

describe('a body that is not JSON', () => {
  const BAD = ['not json at all', '{"unclosed":', '', '{"trailing":1,}', 'undefined']

  it.each(BAD)('is a 400 on submit: %j', async (body) => {
    const response = await submit(body)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Body is not valid JSON' })
  })

  it.each(BAD)('is a 400 on PUT: %j', async (body) => {
    const response = await send('/api/forms/deep', 'PUT', body)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Body is not valid JSON' })
  })
})

describe('a form this server cannot validate in full', () => {
  const gated = (renderWhen: NonNullable<ComponentNode['renderWhen']>): FormDocument => ({
    ...FORM,
    id: 'gated',
    root: {
      ...FORM.root,
      children: [
        ...(FORM.root.children ?? []),
        {
          key: 'extra',
          type: 'TextField',
          props: {},
          schema: { type: 'string', validations: [] },
          renderWhen,
        },
      ],
    },
  })

  const readsContext = (path: string): FormDocument =>
    gated({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path },
        right: { kind: 'literal', value: 'guest' },
      },
    })

  const submitTo = async (document: FormDocument): Promise<Response> => {
    expect((await put('gated', document)).status, 'the form was not stored').toBe(200)
    return await send('/api/forms/gated/submit', 'POST', '{"name":"Ada"}')
  }

  restoreAroundEach()

  it('is refused when it needs an evaluator', async () => {
    const response = await submitTo(gated({ kind: 'computed', expression: 'name === "Ada"' }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'This form needs an expression evaluator and this server has none',
      components: ['extra'],
    })
  })

  it('is refused when it reads context the server does not supply', async () => {
    const response = await submitTo(readsContext('tenant.plan'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'This form reads context this server does not supply',
      missing: ['tenant.plan'],
    })
  })

  it('is accepted when it reads only context the server supplies', async () => {
    expect((await submitTo(readsContext('user.role'))).status).toBe(200)
  })
})

describe('a PUT whose document id is not the one in the URL', () => {
  restoreAroundEach()

  it('is refused and stores nothing under either id', async () => {
    const response = await put('inTheUrl', { ...FORM, id: 'inTheDocument' })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      error: 'The document id must match the one in the URL',
    })
    const held = JSON.parse(await readFile(store, 'utf8')) as Record<string, unknown>
    expect(Object.keys(held)).toEqual(['deep'])
  })
})

describe('a store file that holds no store', () => {
  restoreAroundEach()

  it.each([
    ['truncated JSON', '{"deep":'],
    ['not JSON', 'this is not json'],
    ['a list', '[1,2,3]'],
    ['a string', '"a string"'],
    ['empty', ''],
  ])(
    'is refused rather than served as empty, or written over, when it is %s',
    async (_what, text) => {
      // Hono logs the error it answers 500 for.
      expectConsoleError(/Refusing to read/)
      await writeFile(store, text, 'utf8')

      expect((await app.request('/api/forms')).status).toBe(500)
      expect((await put('deep', FORM)).status).toBe(500)
      expect(await readFile(store, 'utf8'), 'the write replaced the corrupt store').toBe(text)
    },
  )

  it('does not stop the next write once it is repaired', async () => {
    expectConsoleError(/Refusing to read/)
    await writeFile(store, 'this is not json', 'utf8')
    expect((await put('deep', FORM)).status).toBe(500)

    await restore()
    expect((await put('deep', { ...FORM, name: 'Renamed' })).status).toBe(200)
  })

  it('starts empty, and takes a write, when there is no file', async () => {
    await rm(store)

    const listed = await app.request('/api/forms')
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([])

    expect((await put('deep', FORM)).status).toBe(200)
    expect((await app.request('/api/forms/deep')).status).toBe(200)
  })
})

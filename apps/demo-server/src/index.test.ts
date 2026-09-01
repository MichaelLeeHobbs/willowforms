/**
 * The submit endpoint, called for real.
 *
 * `app.request(...)` runs the route Hono registered, through the same handler a
 * socket would reach. A test that rebuilt the sequence -- read the store, call
 * `validateAcross`, project with `submittedData` -- would be checking a copy of
 * the endpoint written in this file, which is the defect item 4 of the queue is
 * about: a guard whose only call site is itself.
 *
 * Nothing here binds a port. `index.ts` serves only when it is the file that was
 * run, so importing it registers routes and starts nothing.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { ComponentNode, FormDocument } from '@formsmith/core'

/*
 * Before the import, and by dynamic import for that reason: `index.ts` reads
 * this at module scope, and a static import would be hoisted above the
 * assignment and write into the checkout.
 */
const directory = await mkdtemp(join(tmpdir(), 'formsmith-demo-'))
const store = join(directory, 'forms.json')
process.env['FORMSMITH_DEMO_STORE'] = store

/*
 * One required field and one the body answers, both at the top level. No
 * `computed` binding anywhere, or the route refuses the document before it
 * reaches a body: this server injects no evaluator, deliberately.
 */
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
        schema: { type: 'string', validations: [] },
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

// `app.request` is typed as possibly synchronous, so this awaits it rather than
// returning it: every call site is `await`ing anyway.
const submit = async (body: string): Promise<Response> =>
  await app.request('/api/forms/deep/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })

/** `{"answers":[[[…1…]]],"name":"Ada"}`, nested n deep. Two bytes a level. */
const deepBody = (n: number): string =>
  '{"answers":' + '['.repeat(n) + '1' + ']'.repeat(n) + ',"name":"Ada"}'

describe('a body nested deeper than anything will walk', () => {
  it('answers rather than throwing, at 200 KB', async () => {
    /*
     * 100 000 levels is 200 001 bytes of brackets, which is the figure the queue
     * names. Every part of the path had to be checked to get here and only one
     * of them was the obvious one.
     *
     * `JSON.parse` takes it. V8 parses iteratively, so the body arrives intact
     * and nothing has failed yet. `validateAcross` then walks it through `same`,
     * which recursed without a bound through arrays. And past that, on a body
     * that validates clean, `submittedData` copies the value into the echo and
     * `c.json` calls `JSON.stringify` -- which is *not* iterative and throws
     * past roughly five thousand levels, uncaught, inside the response.
     */
    const response = await submit(deepBody(100_000))

    /*
     * 400, and a message about nesting.
     *
     * All four ways a body can be refused used to answer 400 with "Send a JSON
     * document under 1 MB", a sentence a caller cannot act on: it does not tell
     * a body that was too large from one that was not JSON from one that was
     * nested too deep, and the first of those earns 413 rather than 400.
     */
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'JSON is nested deeper than this server will read',
    })
  })

  it('refuses at the depth the library stops reading, not at the depth V8 stops writing', async () => {
    /*
     * 6 000 levels is 12 KB. Nowhere near any size limit, parses fine, and
     * `JSON.stringify` throws on it -- so a size cap is not the thing that
     * protects this route, and neither is anything about 200 KB. The bound is
     * `MAX_CONDITION_DEPTH`, because an answer nested deeper than the evaluator
     * walks is one no rule can read.
     */
    expect((await submit(deepBody(6_000))).status).toBe(400)
  })

  it('still takes a body a form would actually send', async () => {
    /*
     * The control, and the one that would catch a guard that simply refuses
     * everything. Two levels of nesting, a required answer given, and the echo
     * comes back holding it.
     */
    const response = await submit('{"answers":[[1,2],[3]],"name":"Ada"}')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      received: { answers: [[1, 2], [3]], name: 'Ada' },
    })
  })

  it('still reports a missing required answer', async () => {
    // The other control: refusing deep bodies must not have made the gate
    // answer before it validated.
    const response = await submit('{"answers":"x"}')

    expect(response.status).toBe(422)
  })
})

/**
 * Two writes that overlap.
 *
 * The comment on the store says every route "read the file, changed one entry
 * and wrote it back -- across an `await`, with no lock -- so two `PUT`s that
 * overlapped lost one of them entirely, with both answering `{ok: true}`". Only
 * the write was chained. Every route still called `readStore()` on its own,
 * outside the chain, so both requests read the same version, each added its own
 * entry, and the second write replaced the first.
 *
 * Serializing a write serializes nothing about the read that decided what to
 * write. Theme 2 of the review, in the reference implementation a reader copies.
 */
describe('two documents stored at once', () => {
  const formNamed = (id: string): FormDocument => ({ ...FORM, id, name: id })

  const put = async (id: string): Promise<Response> =>
    await app.request('/api/forms/' + id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(formNamed(id)),
    })

  it('keeps both', async () => {
    const [first, second] = await Promise.all([put('one'), put('two')])

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
    /*
     * Ten at once rather than two. The two-request case can pass by luck when
     * the reads happen to be ordered; ten is not luck.
     */
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    await Promise.all(ids.map(put))

    /*
     * Containment, not equality: the store is one file shared by every test in
     * this describe, so an exact list would be asserting the order the other
     * tests ran in. What this row is about is that none of the ten was lost.
     */
    const listed = (await (await app.request('/api/forms')).json()) as { id: string }[]
    const held = new Set(listed.map((row) => row.id))
    expect(
      ids.filter((id) => !held.has(id)),
      'writes were lost',
    ).toEqual([])
  })

  it('still refuses to delete an id nobody holds', async () => {
    // The control for moving that decision inside the chain: it must still be
    // made, and still answer 404.
    const response = await app.request('/api/forms/nothing-here', { method: 'DELETE' })
    expect(response.status).toBe(404)
  })
})

/**
 * A body larger than the cap.
 *
 * `MAX_BODY` was compared against `text.length` after `await c.req.text()` had
 * already buffered the whole stream, so it was a report on something in memory
 * rather than a limit on what arrives. A declared `content-length` is refused
 * before a byte is read; a client that omits it or lies is read a chunk at a
 * time and abandoned the moment the total passes the cap.
 */
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
    /*
     * The mechanism, because the outcome cannot tell the two apart: a body that
     * is buffered whole and then measured also answers 400. That is the finding.
     * `MAX_BODY` compared `text.length` *after* `await c.req.text()`, so a
     * gigabyte arrived, was held in memory, and was then declined -- a report on
     * a body rather than a limit on one.
     *
     * So the body is a stream that counts what is pulled out of it. A server
     * that buffers first drains all of it; one that stops at the cap pulls a
     * little over `MAX_BODY` and cancels.
     */
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024))
    const total = 64 // 4 MB, four times the cap
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
    // The control. A limit that refused everything would pass both rows above.
    const response = await submit('{"answers":"x","name":"Ada"}')
    expect(response.status).toBe(200)
  })
})

/**
 * A two-step form, submitted.
 *
 * The route validates across every step, deliberately, because the steps come
 * out of the document rather than out of the request. Then it projected the
 * payload under `scopes[0]` alone -- so every answer given on step two onwards
 * was dropped from the echo. A form that checked a required field and then
 * submitted without it.
 *
 * `validateAcross` exists because one environment is not enough; the projection
 * had the same problem and no answer of its own until `submittedAcross`.
 */
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
    /*
     * The control, and the whole point of projecting at all. A key no component
     * collects is not in the payload, however many scopes are merged.
     */
    const response = await app.request('/api/forms/wizard/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', city: 'Ely', leftover: 'x' }),
    })

    expect(await response.json()).toEqual({ ok: true, received: { name: 'Ada', city: 'Ely' } })
  })
})

/*
 * A form id that every object answers to.
 *
 * The store is a plain object parsed from JSON, so `store['toString']` is a
 * function and `store['__proto__']` is a prototype, and both are truthy. Every
 * route guarded that with `held()`, which checks own keys -- except the submit
 * route, which indexed the store directly and then walked whatever came back as
 * if it were a form. The route that takes a body was the one without the guard.
 */
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
    // The control. `deep` is in the store and answers, so a blanket 404 from a
    // broken route would not be what the cases above are measuring.
    expect((await submit('{"answers":"x","name":"Ada"}')).status).toBe(200)
  })
})

/*
 * Shutting down.
 *
 * `stopper` is exported for this: the handler used to live inside the
 * entry-point guard, where a test can never reach it, and that is why nobody
 * noticed there was no handler at all.
 */
describe('a signal arriving mid-write', () => {
  it('exits once the server reports its connections closed', () => {
    let closed: (() => void) | undefined
    const exit = vi.fn()

    stopper({ close: (done) => (closed = done) }, exit)('SIGTERM')

    // Not yet: an in-flight PUT is between `writeFile` and `rename`, and exiting
    // here is the corruption this handler exists to avoid.
    expect(exit).not.toHaveBeenCalled()

    closed?.()
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('exits anyway when a connection never closes', () => {
    vi.useFakeTimers()
    try {
      const exit = vi.fn()

      // A `close` that never calls back: a held-open keep-alive socket, or a
      // request stuck on a disk that is not answering.
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
  /*
   * `forms.json` is a file on disk that a person edits, which is the whole
   * point of a demo server -- and `held` returned whatever was under the key
   * with only an own-property check. So `{"x": 5}` came back as a
   * `FormDocument` and went to `validateForm`, which found no fields, found no
   * problems, and the route answered `200 {ok:true}`.
   *
   * That is the worst of the three possible answers. A 404 says the form is not
   * there and a 500 says something broke; a 200 tells a client its data was
   * accepted by a form that does not exist.
   *
   * `GET /api/forms` guarded this exact hazard when building the listing, with
   * a comment calling it "reading a shape as a document because it is truthy".
   * The guard now lives in `held`, so the listing and the two routes that read
   * one by id cannot come apart again.
   */
  const JUNK: Record<string, unknown> = {
    aNumber: 5,
    aString: 'not a document',
    aList: [1, 2, 3],
    noId: { root: { key: 'root', type: 'Screen', props: {} } },
    noRoot: { id: 'noRoot', name: 'No root' },
    aNull: null,
  }

  const withJunk = async (extra: Record<string, unknown> = {}): Promise<void> => {
    await writeFile(store, JSON.stringify({ ...JUNK, ...extra }), 'utf8')
  }

  // Every case restores the store, because the rest of this file reads `deep`.
  const restore = async (): Promise<void> => {
    await writeFile(store, JSON.stringify({ deep: FORM }), 'utf8')
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
    /*
     * The control, and it is what stops the guard being "refuse everything".
     * The junk and a real form share one store, which is also the realistic
     * shape: somebody hand-edits one entry in a file that has others.
     */
    await withJunk({ deep: FORM })
    try {
      expect((await app.request('/api/forms/deep')).status).toBe(200)
      expect((await submit('{"name":"Ada"}')).status).toBe(200)
    } finally {
      await restore()
    }
  })
})

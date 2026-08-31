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
import { afterAll, describe, expect, it } from 'vitest'
import type { FormDocument } from '@formsmith/core'

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

const { app } = await import('./index.js')

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

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Send a JSON object of answers, under 1 MB' })
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

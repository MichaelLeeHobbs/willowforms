/**
 * Demo persistence.
 *
 * Formsmith is a frontend library; this exists to show that the same document and
 * the same validation rules work on a server -- `validateDocument` on a request
 * body, `validateAcross` over a wizard's steps, `submittedData` before anything
 * is stored, and a host context the browser cannot forge.
 *
 * The playground does not call it. It persists to `localStorage`, deliberately:
 * a demo that needs a server running is a demo most people never see. This one
 * is read, and run by anyone who wants to watch the server half work.
 *
 * Storage is a JSON file. There is no auth, no database, and no multi-user story,
 * and none of that is an oversight: shipping a real backend would invite people
 * to deploy this, and it is not built for that.
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { FormContext, FormData, FormDocument } from '@formsmith/core'
import {
  contextValues,
  evaluatorKeys,
  missingContext,
  submittedData,
  validateAcross,
  validateDocument,
} from '@formsmith/core'

const STORE = new URL('../forms.json', import.meta.url)
/*
 * A port, or a refusal to start.
 *
 * `Number('http://…')` is `NaN`, and `listen(NaN)` binds an ephemeral port: the
 * server comes up on a number nobody knows, the playground's requests fail, and
 * the log line says it is listening. Typing the variable wrong should stop the
 * process, not relocate it.
 */
const PORT = (() => {
  const raw = process.env['PORT']
  if (raw === undefined) return 5181
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT is ' + JSON.stringify(raw) + ', which is not a port number.')
  }
  return port
})()

type Store = Record<string, FormDocument>

/**
 * The stored forms, or nothing at all if there is no file yet.
 *
 * The distinction is the point. A bare `catch { return {} }` cannot tell "no
 * file yet" from "corrupt, or half-written by a process that was killed" — and
 * the empty object it returns becomes the base of the next write, so one
 * interrupted `writeFile` costs every stored form, answered with `200 {ok:true}`
 * and no line in the log.
 *
 * Only "no such file" is an empty store. Anything else is a store this cannot
 * read, and refusing to serve is the only answer that does not destroy it.
 */
async function readStore(): Promise<Store> {
  let text: string
  try {
    text = await readFile(STORE, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }

  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('the store is not an object')
    }
    return parsed as Store
  } catch (error) {
    // Loud, because the alternative is a silent overwrite of everything.
    throw new Error(
      'Refusing to read ' +
        STORE.pathname +
        ': ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Move it aside to start fresh.',
    )
  }
}

/**
 * The store, written whole, one write at a time.
 *
 * Every route read the file, changed one entry and wrote it back — across an
 * `await`, with no lock — so two `PUT`s that overlapped lost one of them
 * entirely, with both answering `{ok: true}`. A promise chain is enough here
 * because this process is the only writer; a real one would want a database.
 *
 * Written to a temporary file and renamed, because `writeFile` truncates first:
 * a process killed mid-write left an empty or half-written store, which is the
 * failure `readStore` above now refuses to serve rather than silently rebuild.
 */
let writing: Promise<void> = Promise.resolve()

async function writeStore(store: Store): Promise<void> {
  const next = writing.then(async () => {
    const temporary = new URL('../forms.json.tmp', import.meta.url)
    await writeFile(temporary, JSON.stringify(store, null, 2), 'utf8')
    await rename(temporary, STORE)
  })
  // Chained whether it settles or throws, so one failure does not stall the rest.
  writing = next.catch(() => undefined)
  return next
}

/**
 * One document out of the store, read as an own property.
 *
 * `store[id]` is a prototype-chain lookup, so `GET /api/forms/constructor`
 * passed the not-found guard and answered 200 with a function's worth of
 * nothing — and the submit route then reached `flatten(undefined)` and 500ed.
 */
function held(store: Store, id: string): FormDocument | undefined {
  return Object.hasOwn(store, id) ? store[id] : undefined
}

const app = new Hono()

/*
 * Same-origin only.
 *
 * `cors()` with no options is `origin: '*'` with `PUT` and `DELETE` allowed and
 * request headers reflected — on routes with no authentication of any kind. Any
 * page a developer visited while this was running could delete their forms.
 *
 * The playground is served from a different port, so it is named rather than
 * blanket-allowed. A demo is a thing people copy.
 */
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5180', 'http://127.0.0.1:5180'],
    allowMethods: ['GET', 'PUT', 'DELETE', 'POST', 'OPTIONS'],
  }),
)

/** The largest document this will accept. A form is text, not a payload. */
const MAX_BODY = 1_000_000

/**
 * The request body as JSON, or nothing.
 *
 * Neither parse-guarded nor size-limited: malformed JSON was a 500 rather than
 * a 400 — the failure `validateDocument` was made total to fix, reachable one
 * layer earlier — and a route that writes what it receives to disk had no cap
 * on what it would write.
 */
async function bodyOf(c: { req: { text: () => Promise<string> } }): Promise<unknown> {
  const text = await c.req.text()
  if (text.length > MAX_BODY) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

app.get('/api/forms', async (c) => {
  const store = await readStore()

  /*
   * Guarded, because the file is on disk and a person can edit it. Destructuring
   * every value made `{"a": null}` a 500 on the one route the playground calls
   * first -- so a single bad entry took the whole listing down instead of
   * appearing as one missing row.
   */
  const rows = Object.values(store)
    .filter((doc): doc is FormDocument => Boolean(doc) && typeof doc === 'object')
    .map((doc) => ({ id: String(doc.id ?? ''), name: String(doc.name ?? '') }))

  return c.json(rows)
})

app.get('/api/forms/:id', async (c) => {
  const doc = held(await readStore(), c.req.param('id'))
  return doc ? c.json(doc) : c.json({ error: 'Not found' }, 404)
})

app.put('/api/forms/:id', async (c) => {
  const body = await bodyOf(c)
  if (body === undefined) return c.json({ error: 'Send a JSON document under 1 MB' }, 400)

  const doc = body as FormDocument
  const errors = validateDocument(doc)
  if (errors.length > 0) return c.json({ error: 'Invalid document', errors }, 422)

  /*
   * The id the URL names has to be the id the document claims, or the listing
   * advertises one and every fetch of it 404s: the list reports `doc.id` while
   * the store is keyed by the parameter.
   */
  if (doc.id !== c.req.param('id')) {
    return c.json({ error: 'The document id must match the one in the URL' }, 422)
  }

  const store = await readStore()
  /*
   * A null-prototype record, so an attacker-chosen key is a key. `store['__proto__'] = doc`
   * answered `{ok: true}` and stored nothing at all. Core's own `submittedData`
   * documents this exact hazard and builds on a null prototype; the reference
   * server was doing the thing core warns against.
   */
  const next: Store = Object.assign(Object.create(null) as Store, store)
  next[c.req.param('id')] = doc
  await writeStore(next)
  return c.json({ ok: true })
})

app.delete('/api/forms/:id', async (c) => {
  const store = await readStore()
  const id = c.req.param('id')

  /*
   * 404 for an id the store does not hold, rather than `{ok: true}` and a
   * rewritten file. A client deleting the wrong id -- a typo, a stale list, a
   * double submit against a document somebody else removed -- was told it had
   * worked, and the only way to find out otherwise was to look.
   */
  if (!held(store, id)) return c.json({ error: 'Not found' }, 404)

  const next: Store = Object.assign(Object.create(null) as Store, store)
  delete next[id]
  await writeStore(next)
  return c.json({ ok: true })
})

/**
 * What this server would know that the form did not ask.
 *
 * Hard-coded because it is a demo; a real one reads it off the session. It is
 * here at all to make the point that the context is the server's, not the
 * request's: a browser that sends `{ user: { role: 'admin' } }` in the payload
 * must not be believed, and the only way it cannot be is if the server never
 * looks at what the browser sent.
 */
const contextFor = (): FormContext => ({ user: { role: 'guest' } })

/**
 * Re-runs the form's own rules against submitted data. The point of this route is
 * that it imports the same validateForm the browser used: one rule set, no drift.
 *
 * A visibility rule reading context is where that claim gets tested, because the
 * browser had a context and this has to reach the same answer. When it cannot,
 * the failure is silent and permissive: the field is not hidden, it is simply
 * unvalidated. `missingContext` is the check that turns that into a 500 here
 * rather than a missing answer in the database later.
 */
app.post('/api/forms/:id/submit', async (c) => {
  const doc = (await readStore())[c.req.param('id')]
  if (!doc) return c.json({ error: 'Not found' }, 404)

  const context = contextFor()

  /*
   * Every step, not the one the browser happens to be on.
   *
   * The steps come out of the document, never out of the request. Asking the
   * browser which steps exist would let a client name one and have the rest go
   * unchecked, and that failure is silent: the submit succeeds with required
   * answers missing. A form with no steps yields no scopes, so it validates
   * once, which is the ordinary case.
   */
  /*
   * Strings only. A step is a name, and a document comparing the path against a
   * number or an object is not naming one — running a scope per value would be
   * work with nothing to find, and a hand-edited document could ask for a lot
   * of it.
   */
  const steps = contextValues(doc.root, 'step').filter(
    (step): step is string => typeof step === 'string',
  )
  const scopes = steps.length
    ? steps.map((step) => ({ context: { ...context, step } }))
    : [{ context }]

  /*
   * Checked against the contexts this will actually evaluate in, not against
   * the bare session context.
   *
   * `step` is a path the server fills in itself, once per scope, so against the
   * base context it reads as missing and every wizard is refused. The question
   * the check is really asking is whether every path a document reads can be
   * read under the environments it will be evaluated in, and that is what a
   * scope is.
   */
  const missing = [...new Set(scopes.flatMap((scope) => missingContext(doc.root, scope.context)))]
  if (missing.length > 0) {
    return c.json({ error: 'This form reads context this server does not supply', missing }, 500)
  }

  /*
   * The same question about expressions, and this server is the case that makes
   * it worth asking: it injects no evaluator, deliberately, because there is no
   * `eval` default anywhere in this project and a sandbox is the host's to
   * choose.
   *
   * Without the check the failure is silent and permissive in the direction
   * that matters. `isVisible` reads a `computed` visibility rule as *hidden*
   * when there is nothing to evaluate it with, so the node and its whole
   * subtree leave validation here — while the browser, which may well have an
   * evaluator, showed those fields and checked them. The submit then succeeds
   * with required answers missing.
   */
  const needsEvaluator = evaluatorKeys(doc.root)
  if (needsEvaluator.length > 0) {
    return c.json(
      {
        error: 'This form needs an expression evaluator and this server has none',
        components: needsEvaluator,
      },
      500,
    )
  }

  const body = await bodyOf(c)
  if (body === undefined || typeof body !== 'object' || body === null || Array.isArray(body)) {
    return c.json({ error: 'Send a JSON object of answers, under 1 MB' }, 400)
  }

  const data = body as FormData
  const errors = validateAcross(doc.root, data, scopes)
  if (Object.keys(errors).length > 0) return c.json({ ok: false, errors }, 422)

  /*
   * What the form is actually asking for, not what arrived.
   *
   * A value stays in `data` after the field that collected it is hidden — tick
   * "married", name a spouse, untick it — and `validateForm` correctly stops
   * checking it while the answer is still in the payload. `submittedData` is the
   * projection a host applies, and this route, which is the implementation a
   * reader copies, echoed the raw body instead.
   */
  const submitted = submittedData(doc.root, data, scopes[0])
  return c.json({ ok: true, received: submitted })
})

/*
 * Localhost only, which is what the line below already claimed.
 *
 * With no `hostname` the server binds every interface, so an unauthenticated
 * store of somebody's form documents was reachable from the network the laptop
 * happened to be on — a coffee shop, a conference, a client's office.
 */
serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' })
console.log('Formsmith demo server on http://localhost:' + String(PORT))

/**
 * Demo persistence.
 *
 * WillowForms is a frontend library; this exists to show that the same document and
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
import { pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { FormContext, FormData, FormDocument, StructuralError } from '@willowforms/core'
import {
  MAX_CONDITION_DEPTH,
  contextValues,
  evaluatorKeys,
  missingContext,
  submittedAcross,
  validateAcross,
  validateDocument,
} from '@willowforms/core'

/*
 * Where the forms live, overridable so this file can be exercised.
 *
 * A demo with one hard-coded path is a demo no test can touch without writing
 * into the checkout, and the alternative -- a test that re-implements the route
 * it is checking -- is the shape this whole remediation run exists to remove.
 * `WILLOWFORMS_DEMO_STORE` takes a filesystem path; nothing sets it in normal use.
 */
const storePath = process.env['WILLOWFORMS_DEMO_STORE']
const STORE = storePath ? pathToFileURL(storePath) : new URL('../forms.json', import.meta.url)
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

/*
 * What the file holds, which is whatever somebody put in it.
 *
 * This said `Record<string, FormDocument>` about JSON parsed off disk, so
 * `readStore` cast to it and every indexing expression downstream looked safe
 * to the compiler. The type was the reason a guard could be forgotten rather
 * than the thing reminding anyone to write one.
 */
type Store = Record<string, unknown>

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
let working: Promise<unknown> = Promise.resolve()

/** Write the store whole, assuming the caller has already serialized itself. */
async function writeStoreNow(store: Store): Promise<void> {
  /*
   * Beside the store, not beside this module. `rename` is only atomic within one
   * filesystem, and the store's location is configurable, so a temporary file
   * pinned to the source directory would be a cross-device rename the day
   * anybody moved it.
   */
  const temporary = new URL(STORE.href + '.tmp')
  await writeFile(temporary, JSON.stringify(store, null, 2), 'utf8')
  await rename(temporary, STORE)
}

/**
 * Read, change and write the store with nothing interleaving.
 *
 * The comment above described this and the code did half of it. Only the *write*
 * was chained: every route still called `readStore()` on its own, outside the
 * chain, so two overlapping `PUT`s both read the same version, each added its
 * own entry to it, and the second write replaced the first -- with both
 * answering `{ok: true}`. That is the exact failure the comment says was fixed,
 * still live, because serializing the write serializes nothing about the read
 * that decided what to write.
 *
 * The change runs inside the chain and returns what the route should answer, so
 * a decision that depends on the store -- a 404 for an id nobody holds -- is
 * made against the same version that is about to be written.
 */
async function withStore<T>(
  change: (store: Store) => { next?: Store; result: T } | Promise<{ next?: Store; result: T }>,
): Promise<T> {
  const run = working.then(async () => {
    const store = await readStore()
    const { next, result } = await change(store)
    if (next) await writeStoreNow(next)
    return result
  })
  // Chained whether it settles or throws, so one failure does not stall the rest.
  working = run.catch(() => undefined)
  return run
}

/**
 * One entry of `languages`, checked against what `Language` declares.
 *
 * `dialect` is optional and the other three are not. `bidi` is a union of two
 * strings rather than any string, because it becomes the `dir` attribute.
 */
function isLanguageShape(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const language = value as Record<string, unknown>
  return (
    typeof language['code'] === 'string' &&
    typeof language['name'] === 'string' &&
    (language['bidi'] === 'ltr' || language['bidi'] === 'rtl') &&
    (language['dialect'] === undefined || typeof language['dialect'] === 'string')
  )
}

/**
 * Whether a value out of the store is a document this server will act on.
 *
 * One predicate, because "what counts as a stored document" is one question and
 * two answers to it is how these came apart. The listing had a version of this
 * -- with a comment calling the mistake "reading a shape as a document because
 * it is truthy" -- and the two routes that read one by id had none, so a
 * hand-edited `forms.json` holding `{"x": 5}` was handed to `validateForm` as a
 * document. The submit route then answered `200 {ok:true}` for a form that does
 * not exist, which is the worst of the three possible answers: a client is told
 * its data was accepted.
 *
 * `root` as well as `id`, because the listing only ever needed the name and the
 * other two routes walk the tree. A row in a listing for a document nothing can
 * open is a row that 404s when it is clicked.
 *
 * The root has to be a node, not merely present. `Boolean(shape.root)` was the
 * first version and it let `{"id":"x","root":5}` through -- a truthy value that
 * every walker then finds no fields on, so the tree is empty, nothing fails,
 * and `/submit` answers `200 {ok:true}` again. That is the finding this guard
 * exists for, reproduced one level down, and a hand-edited file is exactly
 * where a scalar in that slot comes from.
 *
 * Every field `FormDocument` declares, because the signature says
 * `doc is FormDocument` and that is a promise to the compiler. Checking two of
 * nine and asserting all nine is the shape this repository has already fixed
 * once in `isLanguage`: after the assertion nothing downstream questions
 * anything, so a missing field is a `TypeError` in whichever caller reaches it
 * first rather than a 404 here. The listing three hundred lines below was
 * already writing `typeof doc.name === 'string' ? doc.name : ''` -- the file
 * did not believe its own guard, which is the clearest evidence the promise was
 * not being kept.
 *
 * Shallow within each field, deliberately. The root has to be a node for a walk
 * to mean anything; whether that node's children are well formed is
 * `validateDocument`'s question, and every write goes through it. This is the
 * guard for a file somebody edited behind the server's back.
 */
function storageFaults(doc: unknown): StructuralError[] {
  const faults: StructuralError[] = []
  const fault = (message: string): void => {
    faults.push({ code: 'malformed', message })
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    fault('A form document must be an object.')
    return faults
  }

  // The demo server only reaches core through its public API, which does not export this guard.
  const object = (value: unknown): boolean =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

  const shape = doc as Record<string, unknown>
  if (shape['version'] !== '1') fault('version must be "1".')
  if (typeof shape['id'] !== 'string' || shape['id'] === '')
    fault('id must be text, and not empty.')
  if (typeof shape['name'] !== 'string') fault('name must be text.')
  if (typeof shape['defaultLanguage'] !== 'string') fault('defaultLanguage must be text.')
  /*
   * The elements too, not just the array.
   *
   * `Language` declares `code`, `name` and `bidi`, and this checked only that
   * the list was a list -- so `languages: [5]` satisfied a predicate that then
   * announced `doc is FormDocument`, and the first thing to read
   * `language.code` got the `TypeError` this guard exists to prevent. The
   * docblock above argues that checking some fields and asserting all of them
   * is the mistake `isLanguage` already cost this project once, and then this
   * line did it one level down.
   */
  const languages = shape['languages']
  if (!Array.isArray(languages)) {
    fault('languages must be an array.')
  } else if (!languages.every(isLanguageShape)) {
    fault('every language needs a string code, a string name, and bidi of "ltr" or "rtl".')
  }
  if (!object(shape['actions'])) fault('actions must be an object.')
  if (!object(shape['translations'])) fault('translations must be an object.')
  if (!object(shape['settings'])) fault('settings must be an object.')

  if (!object(shape['root'])) {
    fault('root must be a component node.')
    return faults
  }
  const node = shape['root'] as Record<string, unknown>
  if (typeof node['key'] !== 'string') fault('root.key must be text.')
  if (typeof node['type'] !== 'string') fault('root.type must be text.')
  if (!object(node['props'])) fault('root.props must be an object.')

  return faults
}

function isStoredDocument(doc: unknown): doc is FormDocument {
  return storageFaults(doc).length === 0
}

/**
 * One document out of the store, read as an own property.
 *
 * `store[id]` is a prototype-chain lookup, so an id such as `constructor` would
 * find an inherited function rather than miss.
 */
function held(store: Store, id: string): FormDocument | undefined {
  if (!Object.hasOwn(store, id)) return undefined

  const doc: unknown = store[id]
  return isStoredDocument(doc) ? doc : undefined
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
 * Why a body was refused, so the answer can say which of four things happened.
 *
 * All four were one 400 reading "Send a JSON document under 1 MB", which is a
 * sentence a caller cannot act on: it does not distinguish a body that was too
 * large from one that was not JSON, and the first of those has a status of its
 * own that tells a client to stop rather than to fix its syntax.
 */
export type BodyRefusal = 'too-large' | 'not-json' | 'too-deep'

/**
 * A parsed body or a refusal, and never a value that might be both or neither.
 *
 * Two independent optional fields let a caller read `value` without asking
 * about `refused` first, and the compiler had nothing to say about it: on a
 * refusal `value` is `undefined`, so the route that skipped the check would
 * have handed `undefined` to `validateDocument` and answered 422 for a body it
 * never looked at. Both routes below happen to check, which is exactly the kind
 * of "happens to be right" the types should be carrying instead.
 *
 * `?: never` on each side rather than two bare members, so `body.refused` stays
 * readable without an `in` narrowing and the check reads the way it did.
 */
export type BodyResult =
  { refused: BodyRefusal; value?: never } | { refused?: never; value: unknown }

/**
 * The request body as JSON, or why not.
 *
 * Neither parse-guarded nor size-limited once: malformed JSON was a 500 rather
 * than a 400 — the failure `validateDocument` was made total to fix, reachable
 * one layer earlier — and a route that writes what it receives to disk had no
 * cap on what it would write.
 */
async function bodyOf(c: {
  req: { text: () => Promise<string>; header: (name: string) => string | undefined; raw: Request }
}): Promise<BodyResult> {
  const text = await textOf(c)
  if (text === undefined) return { refused: 'too-large' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { refused: 'not-json' }
  }
  /*
   * And refused if it is nested deeper than anything downstream will walk.
   *
   * `JSON.parse` is happy with a hundred thousand levels -- V8 parses
   * iteratively -- so the crash lands later and somewhere less obvious.
   * `JSON.stringify` is *not* iterative and throws past roughly five thousand,
   * which is what the echo on a successful submit calls: a 200 KB body of
   * `[[[[…]]]]` under a key the form collects validated clean, was projected by
   * `submittedData`, and then took the process down inside `c.json`. Uncaught,
   * so a 500 with a stack trace rather than an answer.
   *
   * `MAX_CONDITION_DEPTH` because that is where core stops reading: an answer
   * nested deeper than the evaluator walks cannot be compared against anything
   * anyway, so accepting it would only be agreeing to do work whose result is
   * already known to be unreadable. Refusing at the door is what the rest of
   * this project does with input it cannot honour.
   */
  if (deeperThan(parsed, MAX_CONDITION_DEPTH)) return { refused: 'too-deep' }
  return { value: parsed }
}

/**
 * The answer for a refused body, with the status the refusal earns.
 *
 * 413 for a body over the cap, because that is the code that tells a client the
 * request itself was too big rather than that it was written wrongly -- a
 * client retrying a 400 with corrected syntax retries forever.
 */
function refusalOf(refused: BodyRefusal): { message: string; status: 400 | 413 } {
  if (refused === 'too-large') {
    return { message: 'Body is larger than 1 MB', status: 413 }
  }
  if (refused === 'too-deep') {
    return { message: 'JSON is nested deeper than this server will read', status: 400 }
  }
  return { message: 'Body is not valid JSON', status: 400 }
}

/**
 * The body as text, or nothing if it is larger than `MAX_BODY`.
 *
 * `await c.req.text()` buffers the whole stream and only then compares
 * `text.length`, so `MAX_BODY` was a check on something already in memory: a
 * gigabyte arrived, was held, and was then declined. That is not a body limit,
 * it is a report on one.
 *
 * `content-length` first, which refuses the honest case before a byte is read.
 * A client that omits it or lies is read a chunk at a time and abandoned the
 * moment the total passes the cap, so nothing beyond it is ever held.
 *
 * Bytes, not characters. `text.length` counts UTF-16 units, which is neither
 * what a client sent nor what the header declares, and the two disagree by up to
 * four times on non-Latin text.
 */
async function textOf(c: {
  req: { text: () => Promise<string>; header: (name: string) => string | undefined; raw: Request }
}): Promise<string | undefined> {
  const declared = c.req.header('content-length')
  if (declared !== undefined && Number(declared) > MAX_BODY) return undefined

  const stream = c.req.raw.body
  // No stream at all is an empty body, which `JSON.parse` will refuse below.
  if (!stream) return await c.req.text()

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      size += value.byteLength
      if (size > MAX_BODY) {
        // Nothing beyond the cap is kept, and the sender is told to stop.
        await reader.cancel()
        return undefined
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const joined = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    joined.set(chunk, at)
    at += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

/** Whether an external body exceeds the nesting limit, measured iteratively. */
function deeperThan(value: unknown, limit: number): boolean {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }]

  while (stack.length > 0) {
    const top = stack.pop()
    if (!top) break
    if (top.depth > limit) return true

    const held = top.value
    if (Array.isArray(held)) {
      for (const item of held) stack.push({ value: item, depth: top.depth + 1 })
    } else if (held !== null && typeof held === 'object') {
      for (const item of Object.values(held)) stack.push({ value: item, depth: top.depth + 1 })
    }
  }

  return false
}

app.get('/api/forms', async (c) => {
  const store = await readStore()

  /*
   * Guarded, because the file is on disk and a person can edit it. Destructuring
   * every value made `{"a": null}` a 500 on the one route the playground calls
   * first -- so a single bad entry took the whole listing down instead of
   * appearing as one missing row.
   */
  /*
   * `isStoredDocument`, the same question the two by-id routes ask.
   *
   * This had its own copy of the check -- not an array, named by text -- which
   * is how it came to accept an entry with no `root` that `GET /api/forms/:id`
   * refuses. A row in a listing for a document nothing can open is a row that
   * 404s when it is clicked.
   */
  const rows = Object.values(store)
    .filter(isStoredDocument)
    // `name` is a string, because `isStoredDocument` says so and now checks it.
    // This read `typeof doc.name === 'string' ? doc.name : ''`, which was the
    // file hedging against its own type guard.
    .map((doc) => ({ id: doc.id, name: doc.name }))

  return c.json(rows)
})

app.get('/api/forms/:id', async (c) => {
  const doc = held(await readStore(), c.req.param('id'))
  return doc ? c.json(doc) : c.json({ error: 'Not found' }, 404)
})

app.put('/api/forms/:id', async (c) => {
  const body = await bodyOf(c)
  if (body.refused) {
    const { message, status } = refusalOf(body.refused)
    return c.json({ error: message }, status)
  }

  const doc = body.value as FormDocument
  const errors = validateDocument(doc)
  if (errors.length > 0) return c.json({ error: 'Invalid document', errors }, 422)

  /*
   * The same question the reads ask, because a write this server cannot read
   * back is worse than a refused one.
   *
   * `validateDocument` treats the envelope as optional -- `settings`, `actions`
   * and `translations` are checked only when they are present -- while
   * `isStoredDocument` requires all three. So a body carrying nothing but
   * `version`, `id`, `name` and a root passed the gate above, was written, and
   * then disappeared: `held()` refuses it, `GET /api/forms/:id` 404s, and the
   * listing drops the row. A 200 followed by a 404 for the same id is the
   * worst of the available answers, because the client has been told the write
   * succeeded.
   *
   * Reconciled towards the stricter side deliberately. The other direction is
   * to relax the read guard, and that guard is the one keeping a hand-edited
   * file from reaching the walkers -- which is the finding this whole item
   * exists for.
   */
  const faults = storageFaults(doc)
  if (faults.length > 0) return c.json({ error: 'Invalid document', errors: faults }, 422)

  /*
   * The id the URL names has to be the id the document claims, or the listing
   * advertises one and every fetch of it 404s: the list reports `doc.id` while
   * the store is keyed by the parameter.
   */
  if (doc.id !== c.req.param('id')) {
    return c.json({ error: 'The document id must match the one in the URL' }, 422)
  }

  await withStore((store) => {
    // External document ids are stored as data keys, never as prototype operations.
    const next: Store = Object.assign(Object.create(null) as Store, store)
    next[c.req.param('id')] = doc
    return { next, result: undefined }
  })
  return c.json({ ok: true })
})

app.delete('/api/forms/:id', async (c) => {
  const id = c.req.param('id')

  const found = await withStore((store) => {
    /*
     * 404 for an id the store does not hold, rather than `{ok: true}` and a
     * rewritten file. A client deleting the wrong id -- a typo, a stale list, a
     * double submit against a document somebody else removed -- was told it had
     * worked, and the only way to find out otherwise was to look.
     *
     * Decided inside the chain, against the version about to be written, so it
     * cannot be answered from a store some other request has already replaced.
     */
    if (!held(store, id)) return { result: false }

    const next: Store = Object.assign(Object.create(null) as Store, store)
    delete next[id]
    return { next, result: true }
  })

  if (!found) return c.json({ error: 'Not found' }, 404)
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
 * that it runs the form's own rules, from the same package the browser used: one
 * rule set, no drift.
 *
 * It does not import `validateForm`, and this comment said it did. That was the
 * whole basis for `docs/spec/08-validation.md`'s parity snippet, which was built
 * on `validateForm` and would return `{}` for a wizard submission missing every
 * required answer -- every `Step` is hidden by a context the snippet never
 * builds. What this route actually calls is `validateAcross` and
 * `submittedAcross`, once per step scope, and the spec now says so.
 *
 * A visibility rule reading context is where that claim gets tested, because the
 * browser had a context and this has to reach the same answer. When it cannot,
 * the failure is silent and permissive: the field is not hidden, it is simply
 * unvalidated. `missingContext` is the check that turns that into a 500 here
 * rather than a missing answer in the database later.
 */
app.post('/api/forms/:id/submit', async (c) => {
  /*
   * `held`, not a bare index. The helper exists because a store read from disk
   * is a plain object, so `store['__proto__']` and `store['toString']` answer
   * with something inherited -- and this route then treated that as a document
   * and walked it. Every other route uses it; the submit route, which is the one
   * that takes a body, did not.
   */
  const doc = held(await readStore(), c.req.param('id'))
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
  const messages = doc.translations[doc.defaultLanguage]
  const scopes = steps.length
    ? steps.map((step) => ({ context: { ...context, step }, messages }))
    : [{ context, messages }]

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
  if (body.refused) {
    const { message, status } = refusalOf(body.refused)
    return c.json({ error: message }, status)
  }
  // A fourth refusal, and it is not about the body being unreadable: it is
  // readable and is not a set of answers.
  if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) {
    return c.json({ error: 'Send a JSON object of answers' }, 400)
  }

  const data = body.value as FormData
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
  const submitted = submittedAcross(doc.root, data, scopes)
  return c.json({ ok: true, received: submitted })
})

/**
 * The routes, for a test that wants to call one.
 *
 * Hono apps answer `app.request(...)` directly, with no socket, so exporting
 * this is the difference between checking the submit endpoint and checking a
 * copy of it written in the test file.
 */
export { app }

/*
 * How long a shutdown waits for the requests already in flight.
 *
 * Long enough for a `PUT` to finish its write and rename, short enough that
 * `docker stop` (10 seconds by default) still gets a clean exit rather than a
 * `SIGKILL` -- which is the case this whole thing exists to avoid.
 */
const SHUTDOWN_GRACE = 5000

/**
 * The signal handler, as a value, so a test can drive it.
 *
 * The block below runs only when this file is the process entry point, which a
 * test never is, so anything defined inside it is unreachable from a test. The
 * bug being fixed here lived exactly there: `serve()`'s return was discarded,
 * so there was no `close()` and no handler, and `docker stop` or a Ctrl+C during
 * a `PUT` killed the process between `writeFile` and `rename`. That leaves the
 * half-written temporary file `readStore` refuses to serve. The write-and-rename
 * dance makes that recoverable; handling the signal makes it rare.
 *
 * `exit` is a parameter for the same reason: a test cannot call `process.exit`.
 */
export const stopper =
  (server: { close: (done: () => void) => void }, exit: () => void) =>
  (signal: string): void => {
    console.log('WillowForms demo server stopping on ' + signal)
    server.close(exit)

    // Unrefed, so a connection that will not close cannot itself hang the exit,
    // and so this timer never holds the process open on its own.
    setTimeout(exit, SHUTDOWN_GRACE).unref()
  }

/*
 * Only when this file is the thing that was run.
 *
 * Importing it used to bind a port as a side effect, which is why nothing ever
 * tested it: a suite that starts a server on 5181 fights the dev server and
 * leaks a handle. `node src/index.ts` still serves; `import` does not.
 */
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  /*
   * Localhost only, which is what the line below already claimed.
   *
   * With no `hostname` the server binds every interface, so an unauthenticated
   * store of somebody's form documents was reachable from the network the laptop
   * happened to be on — a coffee shop, a conference, a client's office.
   */
  const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' })
  console.log('WillowForms demo server on http://localhost:' + String(PORT))

  const stop = stopper(server, () => process.exit(0))

  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}

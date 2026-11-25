/**
 * Demonstration server, not built to deploy: no auth and a JSON file for storage, deliberately.
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

// A filesystem path, set by tests so they do not write into the checkout.
const storePath = process.env['WILLOWFORMS_DEMO_STORE']
const STORE = storePath ? pathToFileURL(storePath) : new URL('../forms.json', import.meta.url)
// Refuses a malformed PORT: `listen(NaN)` would bind an ephemeral port instead.
const PORT = (() => {
  const raw = process.env['PORT']
  if (raw === undefined) return 5181
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT is ' + JSON.stringify(raw) + ', which is not a port number.')
  }
  return port
})()

// `unknown` values: the file is hand-editable, so every value needs the storage guard.
type Store = Record<string, unknown>

/**
 * Only a missing file is an empty store. A corrupt store is refused, because an empty one would
 * become the base of the next write and erase every form.
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
    throw new Error(
      'Refusing to read ' +
        STORE.pathname +
        ': ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Move it aside to start fresh.',
    )
  }
}

// Serializes store access. A promise chain is enough because this process is the only writer.
let working: Promise<unknown> = Promise.resolve()

/** Callers must already be inside `withStore`. */
async function writeStoreNow(store: Store): Promise<void> {
  /*
   * Temporary file and rename, because `writeFile` truncates first. Beside the store, because
   * `rename` is only atomic within one filesystem.
   */
  const temporary = new URL(STORE.href + '.tmp')
  await writeFile(temporary, JSON.stringify(store, null, 2), 'utf8')
  await rename(temporary, STORE)
}

/**
 * The read runs inside the chain too: chaining only the write lets overlapping requests read the
 * same version and lose one write. Decisions that depend on the store, such as a 404, belong in
 * `change` so they see the version about to be written.
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

// `bidi` must be one of the two values, because it becomes the `dir` attribute.
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
 * The one storage guard every route uses, for a file someone may have hand-edited. It checks every
 * field `FormDocument` declares, because `isStoredDocument` asserts the whole type, and requires a
 * node root: a scalar root gives walkers no fields, so a submit would pass. Shallow within each
 * field, because `validateDocument` gates every write.
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

  const object = (value: unknown): boolean =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

  const shape = doc as Record<string, unknown>
  if (shape['version'] !== '1') fault('version must be "1".')
  if (typeof shape['id'] !== 'string' || shape['id'] === '')
    fault('id must be text, and not empty.')
  if (typeof shape['name'] !== 'string') fault('name must be text.')
  if (typeof shape['defaultLanguage'] !== 'string') fault('defaultLanguage must be text.')
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

// Own properties only: `store[id]` would find inherited members such as `constructor`.
function held(store: Store, id: string): FormDocument | undefined {
  if (!Object.hasOwn(store, id)) return undefined

  const doc: unknown = store[id]
  return isStoredDocument(doc) ? doc : undefined
}

const app = new Hono()

/*
 * Named origins only. These routes have no authentication, and `cors()` defaults to `origin: '*'`,
 * which would let any page a developer visits change or delete their forms.
 */
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5180', 'http://127.0.0.1:5180'],
    allowMethods: ['GET', 'PUT', 'DELETE', 'POST', 'OPTIONS'],
  }),
)

const MAX_BODY = 1_000_000

export type BodyRefusal = 'too-large' | 'not-json' | 'too-deep'

export type BodyResult =
  { refused: BodyRefusal; value?: never } | { refused?: never; value: unknown }

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
   * Refused past `MAX_CONDITION_DEPTH`, where core stops reading. V8's `JSON.parse` accepts far
   * deeper input, but `JSON.stringify` in the response echo throws past roughly 5000 levels.
   */
  if (deeperThan(parsed, MAX_CONDITION_DEPTH)) return { refused: 'too-deep' }
  return { value: parsed }
}

// 413 for size, so a client does not retry it as a syntax error.
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
 * Undefined when larger than `MAX_BODY`, counted in bytes as the stream arrives so nothing past
 * the cap is held. `c.req.text()` would buffer the whole body before any check.
 */
async function textOf(c: {
  req: { text: () => Promise<string>; header: (name: string) => string | undefined; raw: Request }
}): Promise<string | undefined> {
  const declared = c.req.header('content-length')
  if (declared !== undefined && Number(declared) > MAX_BODY) return undefined

  const stream = c.req.raw.body
  // No stream means an empty body, so this cannot exceed the cap.
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

// Iterative, because the input may be nested deeper than a recursive walk can go.
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

  const rows = Object.values(store)
    .filter(isStoredDocument)
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
   * The read guard too: `validateDocument` accepts what it refuses, such as a document without
   * `settings` or `actions`, and a write the reads then refuse would answer 200 and then 404. Do
   * not relax the read guard instead; it keeps hand-edited files from the walkers.
   */
  const faults = storageFaults(doc)
  if (faults.length > 0) return c.json({ error: 'Invalid document', errors: faults }, 422)

  // The listing reports `doc.id` while the store is keyed by the URL id, so they must match.
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
    // Decided inside the chain, against the version about to be written.
    if (!held(store, id)) return { result: false }

    const next: Store = Object.assign(Object.create(null) as Store, store)
    delete next[id]
    return { next, result: true }
  })

  if (!found) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

/**
 * Host context comes from the server, never from the request. Hard-coded for the demo; a real host
 * reads its session.
 */
const contextFor = (): FormContext => ({ user: { role: 'guest' } })

/**
 * Re-runs the form's own rules with the same core functions the browser used, once per step scope
 * (see `docs/spec/08-validation.md`). Context or an evaluator this server cannot supply is a 500,
 * because otherwise the affected fields would go silently unvalidated.
 */
app.post('/api/forms/:id/submit', async (c) => {
  const doc = held(await readStore(), c.req.param('id'))
  if (!doc) return c.json({ error: 'Not found' }, 404)

  const context = contextFor()

  /*
   * Every step, taken from the document and never from the request, so a client cannot skip one.
   * Strings only, so a hand-edited document cannot ask for a scope per arbitrary value.
   */
  const steps = contextValues(doc.root, 'step').filter(
    (step): step is string => typeof step === 'string',
  )
  const messages = doc.translations[doc.defaultLanguage]
  const scopes = steps.length
    ? steps.map((step) => ({ context: { ...context, step }, messages }))
    : [{ context, messages }]

  // Per scope: the server fills in `step`, so the base context alone would refuse every wizard.
  const missing = [...new Set(scopes.flatMap((scope) => missingContext(doc.root, scope.context)))]
  if (missing.length > 0) {
    return c.json({ error: 'This form reads context this server does not supply', missing }, 500)
  }

  /*
   * No evaluator here, deliberately: a sandbox is the host's choice. Without one `isVisible` treats
   * a `computed` rule as hidden, which would skip fields the browser validated.
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
  if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) {
    return c.json({ error: 'Send a JSON object of answers' }, 400)
  }

  const data = body.value as FormData
  const errors = validateAcross(doc.root, data, scopes)
  if (Object.keys(errors).length > 0) return c.json({ ok: false, errors }, 422)

  // The projection, not the raw body: answers to fields that are now hidden stay in `data`.
  const submitted = submittedAcross(doc.root, data, scopes)
  return c.json({ ok: true, received: submitted })
})

export { app }

// Under `docker stop`'s default 10 seconds, so shutdown is clean rather than a SIGKILL.
const SHUTDOWN_GRACE = 5000

export const stopper =
  (server: { close: (done: () => void) => void }, exit: () => void) =>
  (signal: string): void => {
    console.log('WillowForms demo server stopping on ' + signal)
    server.close(exit)

    // Unrefed, so the timer alone never keeps the process alive.
    setTimeout(exit, SHUTDOWN_GRACE).unref()
  }

// Serve only when run directly, so importing this binds no port.
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  // Loopback only: the store has no authentication.
  const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' })
  console.log('WillowForms demo server on http://localhost:' + String(PORT))

  const stop = stopper(server, () => process.exit(0))

  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}

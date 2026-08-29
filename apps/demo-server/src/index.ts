/**
 * Demo persistence.
 *
 * Formsmith is a frontend library; this exists so the playground can show that a
 * document survives a reload and that the same validation rules run server-side.
 * Storage is a JSON file. There is no auth, no database, and no multi-user story,
 * and none of that is an oversight: shipping a real backend would invite people
 * to deploy this, and it is not built for that.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { FormContext, FormData, FormDocument } from '@formsmith/core'
import { contextValues, missingContext, validateAcross, validateDocument } from '@formsmith/core'

const STORE = new URL('../forms.json', import.meta.url)
const PORT = Number(process.env['PORT'] ?? 5181)

type Store = Record<string, FormDocument>

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(STORE, 'utf8')) as Store
  } catch {
    return {}
  }
}

async function writeStore(store: Store): Promise<void> {
  await writeFile(STORE, JSON.stringify(store, null, 2), 'utf8')
}

const app = new Hono()

app.use('/api/*', cors())

app.get('/api/forms', async (c) => {
  const store = await readStore()
  return c.json(Object.values(store).map(({ id, name }) => ({ id, name })))
})

app.get('/api/forms/:id', async (c) => {
  const doc = (await readStore())[c.req.param('id')]
  return doc ? c.json(doc) : c.json({ error: 'Not found' }, 404)
})

app.put('/api/forms/:id', async (c) => {
  const doc = await c.req.json<FormDocument>()
  const errors = validateDocument(doc)
  if (errors.length > 0) return c.json({ error: 'Invalid document', errors }, 422)

  const store = await readStore()
  store[c.req.param('id')] = doc
  await writeStore(store)
  return c.json({ ok: true })
})

app.delete('/api/forms/:id', async (c) => {
  const store = await readStore()
  delete store[c.req.param('id')]
  await writeStore(store)
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

  const data = await c.req.json<FormData>()
  const errors = validateAcross(doc.root, data, scopes)
  if (Object.keys(errors).length > 0) return c.json({ ok: false, errors }, 422)

  return c.json({ ok: true, received: data })
})

serve({ fetch: app.fetch, port: PORT })
console.log('Formsmith demo server on http://localhost:' + String(PORT))

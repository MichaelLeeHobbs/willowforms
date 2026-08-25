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
import type { FormData, FormDocument } from '@formsmith/core'
import { validateDocument, validateForm } from '@formsmith/core'

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
 * Re-runs the form's own rules against submitted data. The point of this route is
 * that it imports the same validateForm the browser used: one rule set, no drift.
 */
app.post('/api/forms/:id/submit', async (c) => {
  const doc = (await readStore())[c.req.param('id')]
  if (!doc) return c.json({ error: 'Not found' }, 404)

  const data = await c.req.json<FormData>()
  const errors = validateForm(doc.root, data)
  if (Object.keys(errors).length > 0) return c.json({ ok: false, errors }, 422)

  return c.json({ ok: true, received: data })
})

serve({ fetch: app.fetch, port: PORT })
console.log('Formsmith demo server on http://localhost:' + String(PORT))

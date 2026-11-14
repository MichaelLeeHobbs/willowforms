import type { FormDocument } from './types.js'
import { jsonShape } from './actions.js'
import { validateDocument } from './tree.js'
import type { StructuralError } from './tree.js'

export const CURRENT_DOCUMENT_VERSION: FormDocument['version'] = '1'

/*
 * Bounds the work loading an in-memory value can cause. A default text field is
 * about 19 values, so this admits tens of thousands of components.
 */
const DOCUMENT_VALUE_LIMIT = 1_000_000

export type DocumentLoadResult =
  { ok: true; document: FormDocument } | { ok: false; errors: StructuralError[] }

type DocumentRecord = Record<string, unknown>
type Migration = (document: DocumentRecord) => DocumentRecord

/*
 * Add version N -> N+1 migrations here when a second document version is
 * introduced. Migrations are pure and total; structural validation runs after
 * the chain reaches the current version.
 */
const MIGRATIONS: Readonly<Record<string, Migration>> = {}

function record(value: unknown): value is DocumentRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function migrate(value: unknown): unknown {
  if (!record(value)) return value

  let current = value
  const visited = new Set<string>()
  while (current['version'] !== CURRENT_DOCUMENT_VERSION) {
    const version = current['version']
    if (typeof version !== 'string' || visited.has(version)) return current
    const migration = MIGRATIONS[version]
    if (!migration) return current
    visited.add(version)
    current = migration(current)
  }
  return current
}

function normalize(value: unknown): unknown {
  if (!record(value) || value['version'] !== CURRENT_DOCUMENT_VERSION) return value

  return {
    ...value,
    actions: value['actions'] ?? {},
    settings: value['settings'] ?? {},
  }
}

/**
 * Load arbitrary JSON into the current canonical document shape.
 *
 * Loading migrates first, fills compatibility defaults, and then performs the
 * complete structural validation gate. The input is never mutated.
 */
export function loadDocument(value: unknown): DocumentLoadResult {
  try {
    const candidate = normalize(migrate(value))
    const shape = jsonShape(candidate, DOCUMENT_VALUE_LIMIT)
    if (shape === 'too-large') {
      return {
        ok: false,
        errors: [
          {
            code: 'malformed',
            message: `A form document cannot contain more than ${DOCUMENT_VALUE_LIMIT.toLocaleString('en-US')} JSON values.`,
          },
        ],
      }
    }
    if (shape !== 'json') {
      return {
        ok: false,
        errors: [{ code: 'malformed', message: 'A form document must contain only JSON values.' }],
      }
    }
    const errors = validateDocument(candidate)
    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, document: candidate as FormDocument }
  } catch {
    return {
      ok: false,
      errors: [{ code: 'malformed', message: 'The form document could not be read safely.' }],
    }
  }
}

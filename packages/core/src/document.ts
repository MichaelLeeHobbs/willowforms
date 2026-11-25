import type { FormDocument } from './types.js'
import { jsonShape } from './actions.js'
import { isRecord } from './guards.js'
import { validateDocument } from './tree.js'
import type { StructuralError } from './tree.js'

export const CURRENT_DOCUMENT_VERSION: FormDocument['version'] = '1'

/* Bounds the work loading an in-memory value can cause. */
const DOCUMENT_VALUE_LIMIT = 1_000_000

export type DocumentLoadResult =
  { ok: true; document: FormDocument } | { ok: false; errors: StructuralError[] }

type DocumentRecord = Record<string, unknown>
type Migration = (document: DocumentRecord) => DocumentRecord

/*
 * Each takes version N to N+1. Total, because it runs before structural validation;
 * pure, because `loadDocument` never mutates its input.
 */
const MIGRATIONS: Readonly<Record<string, Migration>> = {}

function migrate(value: unknown): unknown {
  if (!isRecord(value)) return value

  let current = value
  const visited = new Set<string>()
  while (current['version'] !== CURRENT_DOCUMENT_VERSION) {
    const version = current['version']
    if (typeof version !== 'string' || visited.has(version)) return current
    // Own keys only: the version is untrusted input, and an inherited name such
    // as "toString" or "__proto__" must read as an unknown version.
    const migration = Object.hasOwn(MIGRATIONS, version) ? MIGRATIONS[version] : undefined
    if (!migration) return current
    visited.add(version)
    current = migration(current)
  }
  return current
}

function normalize(value: unknown): unknown {
  if (!isRecord(value) || value['version'] !== CURRENT_DOCUMENT_VERSION) return value

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

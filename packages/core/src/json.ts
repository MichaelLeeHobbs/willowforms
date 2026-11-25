import type { FormData, JsonValue } from './types.js'

export function jsonToString(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/**
 * Own properties only, so a polluted `Object.prototype.value` cannot supply a
 * value. A declared `null` is declared, distinct from absent.
 */
const declaredOf = (option: unknown): { declared: JsonValue } | undefined => {
  if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') {
    return { declared: option }
  }
  if (option === null || typeof option !== 'object' || Array.isArray(option)) return undefined
  if (!Object.hasOwn(option, 'value')) return undefined

  // An own `value: undefined` is absent: `undefined` is not a `JsonValue`.
  const declared = (option as Record<string, JsonValue | undefined>)['value']
  return declared === undefined ? undefined : { declared }
}

export function optionValues(options: readonly unknown[]): string[] {
  // `Array.from`, so a hole becomes `undefined` rather than staying a hole:
  // `map` preserves holes and every read below is by index.
  const declared = Array.from(options, declaredOf)

  // Every declared spelling, so a position can be seen to collide with one that
  // appears later in the list as well as earlier.
  const spoken = new Set<string>()
  for (const entry of declared) if (entry) spoken.add(jsonToString(entry.declared))

  const out: string[] = []
  const used = new Set<string>()

  for (let index = 0; index < options.length; index += 1) {
    const entry = declared[index]
    if (entry) {
      const value = jsonToString(entry.declared)
      out[index] = value
      used.add(value)
      continue
    }

    /*
     * `.` because it cannot end a number's rendering, so `1.` never collides
     * with a position, and the loop covers the case where an author declared
     * the literal string `'0.'` as well.
     */
    let candidate = String(index)
    while (spoken.has(candidate) || used.has(candidate)) candidate += '.'
    out[index] = candidate
    used.add(candidate)
  }

  return out
}

/**
 * `submitted` is `event.target.value`, always a string. One that matches nothing is the
 * empty placeholder, returned as it is.
 */
export function optionValue(options: readonly unknown[], submitted: string): JsonValue {
  const values = optionValues(options)
  const at = values.indexOf(submitted)

  if (at !== -1) {
    const entry = declaredOf(options[at])
    return entry ? entry.declared : submitted
  }

  return submitted
}

const tables = new WeakMap<readonly unknown[], string[]>()

function valuesFor(all: readonly unknown[]): string[] {
  const held = tables.get(all)
  if (held) return held

  const computed = optionValues(all)
  tables.set(all, computed)
  return computed
}

export function optionEntry(
  option: JsonValue | undefined,
  index: number,
  /** Without it, two options can render the same value. See `optionValues`. */
  all?: readonly unknown[],
): { value: string; label: string } {
  const record =
    option !== null && typeof option === 'object' && !Array.isArray(option) ? option : undefined

  const value = all
    ? (valuesFor(all)[index] ?? String(index))
    : (() => {
        // `declaredOf`, not `record['value']`, which reads through the prototype.
        const found = record ? declaredOf(record) : undefined
        const declared = record ? found?.declared : option
        return declared === undefined || declared === null ? String(index) : jsonToString(declared)
      })()

  const written = record?.['label']
  const label =
    written === undefined || written === null || typeof written === 'object'
      ? value
      : jsonToString(written)

  return { value, label }
}

/**
 * A form author is not always the person deploying the form, and `javascript:` in an `href`
 * runs on click with the page's privileges. See docs/THREAT_MODEL.md.
 */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function safeHref(value: JsonValue | undefined): string | undefined {
  const raw = jsonToString(value).trim()
  if (!raw) return undefined

  // The URL parser strips control characters, so "java\tscript:" parses as
  // `javascript:`. Rejecting them all is simpler than tracking which survive.
  // eslint-disable-next-line no-control-regex -- matching them is the point
  if (/[\u0000-\u001f\u007f]/.test(raw)) return undefined

  // Network-path references are not relative to the current origin.
  if (/^[/\\]{2}/.test(raw)) return undefined

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw

  const parsed = URL.parse ? URL.parse(raw) : null
  if (parsed) return SAFE_SCHEMES.has(parsed.protocol) ? raw : undefined

  const scheme = raw.slice(0, raw.indexOf(':') + 1).toLowerCase()
  return SAFE_SCHEMES.has(scheme) ? raw : undefined
}

/**
 * Validation and conditions share this: two definitions would let a field be empty enough
 * to skip `minLength` and not empty enough to satisfy a condition. `false` and `0` are
 * answers.
 */
export function isEmpty(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0

  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * Own properties only: a data key of `toString` or `constructor` would otherwise hold a
 * function, which is present and truthy and not an answer.
 */
export function valueOf(data: FormData, dataKey: string): JsonValue | undefined {
  return Object.hasOwn(data, dataKey) ? data[dataKey] : undefined
}

/**
 * Own properties of plain objects only, at every step: `constructor.prototype` is a path
 * somebody can type.
 *
 * A key containing a dot, and a step through an array, are unreachable on purpose: an
 * escape syntax is a parser in the middle of a security boundary, and rows have their own
 * checked addresses. `missingContext` reports both as absent.
 */
export function readPath(source: JsonValue | undefined, path: string): JsonValue | undefined {
  if (typeof path !== 'string' || path === '') return undefined

  let current: JsonValue | undefined = source

  for (const step of path.split('.')) {
    if (step === '') return undefined
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined
    if (!Object.hasOwn(current, step)) return undefined
    current = current[step]
  }

  return current
}

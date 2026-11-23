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
 * The declared value behind a submitted option string.
 *
 * A `<select>` hands back `event.target.value`, which is always a string.
 * Options are matched on the spelling
 * `jsonToString` gave them, so this is the exact inverse of what the kit
 * rendered, and an option with no declared value keeps falling back to its
 * position.
 *
 * A submitted string matching nothing is returned as-is: that is the empty
 * placeholder, and inventing a value for it would be worse.
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

/**
 * Kits call `optionEntry` once per option inside `options.map`, so the table is
 * cached per list or rendering a select is quadratic. Keyed by identity: hashing
 * the contents would repeat the walk.
 */
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
  /**
   * The list this option came from, so its rendered value can be made unique.
   *
   * Optional so an existing caller keeps compiling. Every *kit* in this
   * repository passes it, and a caller that does not gets the per-option rule
   * with the collision it carries -- which is a real path, exercised on purpose
   * by `json.test.ts`, and the reason that branch is guarded rather than
   * assumed dead. See `optionValues`.
   */
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
 * A form author is not always the person deploying the form, and `javascript:`
 * in an `href` runs on click with the page's privileges. Core ships no
 * evaluator, so it must not ship one in a URL. See docs/THREAT_MODEL.md.
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
 * Whether a value counts as no answer.
 *
 * Shared, because "empty" has to mean one thing. Validation uses it for the
 * rule that everything except `required` passes on an empty value, and
 * conditions use it for `empty` and `notEmpty`. Two definitions would let a
 * field be empty enough to skip a `minLength` rule and not empty enough to
 * satisfy a visibility condition, and nobody would find that quickly.
 *
 * `false` and `0` are answers, not absences.
 */
export function isEmpty(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0

  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * What a field holds, or nothing.
 *
 * An own-property read, because a plain lookup finds the prototype: a field
 * whose data key is `toString` or `constructor` would come back holding a
 * function, which is present and truthy and not an answer anyone gave. Shared,
 * so validation, the renderer and conditions cannot disagree about whether a
 * field is missing.
 */
export function valueOf(data: FormData, dataKey: string): JsonValue | undefined {
  return Object.hasOwn(data, dataKey) ? data[dataKey] : undefined
}

/**
 * What a dot path holds in the host's context, or nothing.
 *
 * Nested, unlike {@link valueOf}, because a host's context already is: nobody
 * has `{ 'user.role': 'admin' }` sitting around, they have `{ user: { role } }`,
 * and making every host flatten it before handing it over is work WillowForms
 * would be creating rather than doing.
 *
 * Every step is an own-property read, for the reason `valueOf` is one, and the
 * consequence is stronger here: a path is authored in a picker and stored in a
 * document, so `constructor.prototype` is a string somebody can type. Each step
 * must also land on a plain object, so a path cannot walk into a string's
 * `length` or an array's `map`.
 *
 * A key containing a dot is unreachable. That is a real limit and it is stated
 * rather than worked around, because an escape syntax is a parser, and a parser
 * is a thing with its own bugs sitting in the middle of a security boundary.
 *
 * So is a step through an array. `addresses.0.country` reads nothing, on
 * purpose: an index in a path is the beginning of an addressing scheme, and this
 * project already has one -- for rows, in `rows.ts`, where it is checked. A host
 * that needs an element of a list can put it in the context under a name.
 *
 * Both limits look the same from outside: `missingContext` reports an
 * unreachable path exactly as it reports an absent one, because "the document
 * asks for something this context does not answer" is one fact from the form's
 * point of view and both have the same fix -- supply it under a name.
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

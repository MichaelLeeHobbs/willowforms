/**
 * Turning a JsonValue into text.
 *
 * Objects and arrays collapse to an empty string rather than JavaScript's
 * `"[object Object]"`. That default is never what a form wants: it lands in an
 * input the user then has to clear, and a `pattern` rule can accidentally match
 * it. A non-primitive where text was expected carries no text, so it reads as
 * empty, and the rules already know what to do with empty.
 */

import type { FormData, JsonValue } from './types.js'

export function jsonToString(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/**
 * The declared value behind a submitted option string.
 *
 * A `<select>` hands back `event.target.value`, which is always a string, so a
 * numeric option value came back as `"2"` and the form submitted a string where
 * the author had declared a number. Options are matched on the spelling
 * `jsonToString` gave them, so this is the exact inverse of what the kit
 * rendered, and an option with no declared value keeps falling back to its
 * position.
 *
 * A submitted string matching nothing is returned as-is: that is the empty
 * placeholder, and inventing a value for it would be worse.
 */
/**
 * A declared value, read as an own property.
 *
 * Own, not inherited: the rest of this package reads option fields with
 * `Object.hasOwn` for the reason `schema.ts` names -- "an application that has
 * polluted `Object.prototype.label`". A plain lookup meant a valueless option
 * resolved to the inherited value, so the control's submitted value stopped
 * being the inverse of what it rendered.
 *
 * A `null` declared value is *declared*, and distinct from absent. The old
 * `?? undefined` collapsed the two, so an option written `{ label: 'None',
 * value: null }` fell back to its position one line later and rendered a value
 * the author did not write.
 */
const declaredOf = (option: unknown): { declared: JsonValue } | undefined => {
  /*
   * A bare scalar declares itself, which is what the branch below in
   * `optionEntry` has always said and this did not.
   *
   * `options: ['Yes', 'No']` is the shortest thing an author writes and the
   * shape every JSON Schema `enum` has. Passing the list made it render as `0`
   * and `1` while the same list without one rendered `Yes` and `No` -- so the
   * change that introduced the list-scoped rule reintroduced, for every caller
   * that adopted it, the exact defect its own comment describes fixing. Both
   * kits pass the list.
   *
   * `null` is not a scalar for this purpose: it is handled below, as a
   * *declared* value on an object, and a bare `null` in a list is an option
   * with no name at all.
   */
  if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') {
    return { declared: option }
  }
  if (option === null || typeof option !== 'object' || Array.isArray(option)) return undefined
  if (!Object.hasOwn(option, 'value')) return undefined

  /*
   * An own `value: undefined` is absent, not declared.
   *
   * `Object.hasOwn` alone said `{ label: 'None', value: undefined }` declared
   * one, so it rendered as the empty string instead of falling back to its
   * position -- and `undefined` is not a `JsonValue`, so the key is one
   * `JSON.parse` would never produce and one `JSON.stringify` drops. It comes
   * from an object literal a caller built, which is exactly where a key spelled
   * out and left unset comes from.
   *
   * `null` is still declared, which is the distinction this function exists for
   * and the paragraph above is about.
   */
  const declared = (option as Record<string, JsonValue | undefined>)['value']
  return declared === undefined ? undefined : { declared }
}

/**
 * The string every option in a list renders as, computed over the whole list.
 *
 * The list is the unit because uniqueness is a property of the list, and this is
 * the defect that made it one. `optionEntry` fell back to `String(index)` for an
 * option with no declared value while looking at that option alone -- so
 * `[{ label: 'A' }, { label: 'B', value: 0 }]` rendered **two `<option>`s with
 * `value="0"`**: A took position 0 and B declared the number 0. `optionValue`
 * then resolved `'0'` through its declared-first pass and returned B's answer
 * for a user who picked A.
 *
 * The two functions' contract is that they are inverses -- `optionEntry`'s
 * docblock says "The rules are `optionValue`'s, exactly, because the two have to
 * be inverses" -- and they cannot be while one of them decides per option and
 * the other decides per list. Both read this table now, so the claim is true by
 * construction rather than by two implementations agreeing.
 *
 * A colliding position is pushed out with a suffix rather than renumbered.
 * Renumbering would move *other* options' values, which changes what a form
 * submits for answers nobody edited; a suffix changes only the option that had
 * no declared value in the first place, and that option's rendered value was
 * never anything an author chose.
 */
export function optionValues(options: readonly unknown[]): string[] {
  const declared = options.map(declaredOf)

  // Every declared spelling, so a position can be seen to collide with one that
  // appears later in the list as well as earlier.
  const spoken = new Set<string>()
  for (const entry of declared) if (entry) spoken.add(jsonToString(entry.declared))

  const out: string[] = []
  const used = new Set<string>()

  options.forEach((_option, index) => {
    const entry = declared[index]
    if (entry) {
      const value = jsonToString(entry.declared)
      out.push(value)
      used.add(value)
      return
    }

    /*
     * `.` because it cannot end a number's rendering, so `1.` never collides
     * with a position, and the loop covers the case where an author declared
     * the literal string `'0.'` as well.
     */
    let candidate = String(index)
    while (spoken.has(candidate) || used.has(candidate)) candidate += '.'
    out.push(candidate)
    used.add(candidate)
  })

  return out
}

export function optionValue(options: readonly unknown[], submitted: string): JsonValue {
  /*
   * Resolved through the same table the control rendered from, so the two are
   * inverses by construction.
   *
   * This used to walk the list twice on its own -- declared spellings first,
   * positions second -- which is the right *rule* and could not express the
   * one case it exists for: a position that collides with a declared value
   * elsewhere. Both options rendered the same string, the declared pass won,
   * and picking the first submitted the second one's answer.
   */
  const values = optionValues(options)
  const at = values.indexOf(submitted)

  if (at !== -1) {
    const entry = declaredOf(options[at])
    /*
     * A declared value is handed back as the author wrote it -- the number `0`
     * rather than the string `'0'` -- because that is what the form is
     * collecting. An option with no declared value has only its position, and
     * the string the control put in the DOM is that position.
     */
    return entry ? entry.declared : submitted
  }

  /*
   * A submitted string that matches no option at all is handed back unchanged.
   * It is what a control put in the DOM, and inventing a value for it would be
   * worse than passing it through.
   */
  return submitted
}

/**
 * One entry of an options list, as the two strings a control needs.
 *
 * Every kit drew its own version of this and every one of them read `.value`
 * off the entry without asking what the entry was, so a `null` in the array
 * threw during render — in four places across two kits. The guarded read
 * already existed here, in `optionValue`, which is the function these controls
 * hand their answer back through; it was just not the one they used to draw.
 *
 * The rules are `optionValue`'s, exactly, because the two have to be inverses.
 * An entry that is not an object has no declared value, and an option with no
 * declared value falls back to its position — so the value a control submits is
 * the string this returns.
 */
/**
 * `optionValues` for one list, computed once however many options ask.
 *
 * `optionEntry` is called from inside `options.map(...)` in both kits, and it
 * called `optionValues(all)` on every one of those calls -- so a list of N
 * options walked the whole list N times and rendering a long select was
 * quadratic. The table is a property of the list, so it is cached against the
 * list.
 *
 * Keyed by identity in a `WeakMap`: a list is an array a document holds, so it
 * is stable across the map that renders it, and it is collected with the
 * document. Identity rather than contents on purpose -- hashing the list to
 * find the table would do the walk this exists to avoid.
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
   * Optional only so an existing caller keeps compiling; every caller in this
   * repository passes it, and one that does not gets the old per-option rule
   * with the collision it carries. See `optionValues`.
   */
  all?: readonly unknown[],
): { value: string; label: string } {
  const record =
    option !== null && typeof option === 'object' && !Array.isArray(option) ? option : undefined

  /*
   * A bare option is its own value, not its position.
   *
   * `options: ['Yes', 'No']` is the shortest thing an author writes and the
   * shape every JSON Schema `enum` has, and it rendered as `0` and `1` in both
   * kits: the position was used because no `value` was *declared*, and a plain
   * string declares one by being one. The index remains the fallback for an
   * option that carries neither -- `{}`, `null`, a nested list -- because a
   * position is the only name such an option has.
   */
  const value = all
    ? (valuesFor(all)[index] ?? String(index))
    : (() => {
        /*
         * `declaredOf`, not `record['value']`.
         *
         * The plain lookup read through the prototype chain, so an option
         * object inheriting a `value` -- which is what a polluted
         * `Object.prototype` gives every object literal in the process -- took
         * a value nobody wrote. This branch exists only for a caller that does
         * not pass the list, and a caller that has not been updated is the last
         * one that should be reading through the prototype.
         *
         * `declaredOf` also settles `null` the same way here as it does above:
         * declared, and distinct from absent.
         */
        const found = record ? declaredOf(record) : undefined
        const declared = record ? found?.declared : option
        return declared === undefined || declared === null ? String(index) : jsonToString(declared)
      })()
  /*
   * `jsonToString`, not a string check.
   *
   * A numeric label -- `{ label: 2024, value: 'y2024' }`, which is what an
   * author writing years in the JSON options editor produces -- was discarded
   * and the control drew the value instead. This file already has the function
   * that renders a number, a boolean or a string as text, and it is the one
   * every other read here uses.
   *
   * The value is still the fallback, so an option always draws as something:
   * `null`, an object or a list has no label a person wrote.
   */
  const written = record?.['label']
  const label =
    written === undefined || written === null || typeof written === 'object'
      ? value
      : jsonToString(written)

  return { value, label }
}

/**
 * A link address that is safe to put in `href`, or undefined.
 *
 * A document is data, and a form author is not always the person deploying the
 * form. `javascript:` in an `href` runs on click with the page's full
 * privileges, which is the same code-execution boundary this project refuses to
 * cross anywhere else: core ships no evaluator, so it must not ship one by
 * accident in a URL.
 *
 * Allowed: http, https, mailto, tel, and anything relative. Relative addresses
 * cannot name a scheme, so they cannot smuggle one.
 */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function safeHref(value: JsonValue | undefined): string | undefined {
  const raw = jsonToString(value).trim()
  if (!raw) return undefined

  /*
   * A leading control character is stripped by the URL parser and by browsers,
   * so "java\tscript:alert(1)" parses as javascript: after the fact. Rejecting
   * them outright is simpler than reasoning about which ones survive.
   */
  // eslint-disable-next-line no-control-regex -- matching them is the point
  if (/[\u0000-\u001f\u007f]/.test(raw)) return undefined

  /*
   * A network-path reference. `//evil.com` names no scheme, so the scheme check
   * below waves it through, and the browser then borrows the page's own scheme
   * and navigates off-origin. Backslashes count, because browsers normalise
   * them to forward slashes, so `\\evil.com` and `/\evil.com` reach the same
   * place.
   *
   * This is the case that made the rest of this function worth nothing. The
   * comment that used to sit below said a relative address cannot escape the
   * origin, which is true, and missed that this was never a relative address.
   */
  if (/^[/\\]{2}/.test(raw)) return undefined

  // Relative: no scheme to borrow and no authority to name, so it stays here.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw

  const parsed = URL.parse ? URL.parse(raw) : null
  if (parsed) return SAFE_SCHEMES.has(parsed.protocol) ? raw : undefined

  /*
   * Two ways to arrive here, and the comment used to name only the first.
   *
   * A runtime with no `URL.parse` -- Node before 22.1, Safari before 18 -- and a
   * string that names a scheme and does not parse as a URL, which on every
   * current runtime is the one that actually happens: `https://[` is a scheme
   * with nothing usable after it. Either way the scheme is what decides, and
   * anything outside the allowlist is refused rather than guessed at.
   */
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
  /*
   * An object with nothing in it is nothing, the same way an empty list is. The
   * fall-through used to answer `false` for every object, so `{"consent": {}}`
   * satisfied a required consent — a client could post it and be accepted.
   *
   * Own keys, because a value out of a request body can carry a prototype and
   * an inherited key is not an answer somebody gave.
   */
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
 * and making every host flatten it before handing it over is work Formsmith
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

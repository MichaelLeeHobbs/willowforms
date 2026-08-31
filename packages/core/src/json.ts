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
export function optionValue(options: readonly JsonValue[], submitted: string): JsonValue {
  const declaredOf = (option: JsonValue | undefined): JsonValue | undefined =>
    option !== null && typeof option === 'object' && !Array.isArray(option)
      ? option['value']
      : undefined

  /*
   * Declared values first, positions second, in two passes rather than one.
   *
   * A list mixing the two -- `['Yes', { label: 'No', value: '0' }]` -- has an
   * option whose declared value is the string `0` and an option whose position
   * is 0, and a single pass returned whichever came first in the list. An
   * author who wrote a value meant that value; a position is what an option
   * falls back to when nobody wrote one.
   */
  for (const option of options) {
    const declared = declaredOf(option)
    if (declared !== undefined && jsonToString(declared) === submitted) return declared
  }

  for (let i = 0; i < options.length; i++) {
    if (declaredOf(options[i]) === undefined && String(i) === submitted) return submitted
  }

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
export function optionEntry(
  option: JsonValue | undefined,
  index: number,
): { value: string; label: string } {
  const record =
    option !== null && typeof option === 'object' && !Array.isArray(option) ? option : undefined

  const declared = record?.['value']
  const value = declared === undefined ? String(index) : jsonToString(declared)
  // The value is the fallback label, so an option always draws as something.
  const label = typeof record?.['label'] === 'string' ? record['label'] : value

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

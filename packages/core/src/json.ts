/**
 * Turning a JsonValue into text.
 *
 * Objects and arrays collapse to an empty string rather than JavaScript's
 * `"[object Object]"`. That default is never what a form wants: it lands in an
 * input the user then has to clear, and a `pattern` rule can accidentally match
 * it. A non-primitive where text was expected carries no text, so it reads as
 * empty, and the rules already know what to do with empty.
 */

import type { JsonValue } from './types.js'

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
  for (let i = 0; i < options.length; i++) {
    const option = options[i]
    const declared =
      option !== null && typeof option === 'object' && !Array.isArray(option)
        ? option['value']
        : undefined
    if (declared === undefined) {
      if (String(i) === submitted) return submitted
      continue
    }
    if (jsonToString(declared) === submitted) return declared
  }
  return submitted
}

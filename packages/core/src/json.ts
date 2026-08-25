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

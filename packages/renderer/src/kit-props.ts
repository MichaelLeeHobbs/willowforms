import { jsonToString } from '@willowforms/core'
import type { JsonValue } from '@willowforms/core'
import type { NodeEventHandlers } from './index.js'

/**
 * A prop read as display text, or the fallback when it has none.
 *
 * A non-string that is still text renders as its text through `jsonToString`, so
 * a `computed` label that evaluates to a number shows the number. An empty
 * result falls back, because an empty label is a label nobody wrote.
 */
export const str = (v: unknown, fallback = ''): string => {
  const text = typeof v === 'string' ? v : jsonToString(v as JsonValue | undefined)
  return text === '' ? fallback : text
}

/**
 * `aria-required` for a required field, and nothing otherwise.
 *
 * ARIA exposes required state without enabling a second, browser-owned validator.
 */
export const requiredProps = (required: boolean): { 'aria-required'?: true } =>
  required ? { 'aria-required': true } : {}

/** A prop read as a flag: only `true` is on. */
export const bool = (v: unknown): boolean => v === true

/**
 * A prop read as a finite number, or the fallback.
 *
 * `NaN` and `Infinity` fall back. Both are `typeof 'number'` and both reach a
 * document (`1e999` parses as `Infinity`, an expression can return either), and
 * neither is a usable width or `aria-valuenow`.
 */
export const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Report a new value to the form, then to the node's `onChange` event, if it has one. */
export const changed = (
  onChange: (value: JsonValue) => void,
  events: NodeEventHandlers | undefined,
  value: JsonValue,
): void => {
  onChange(value)
  events?.onChange?.(value)
}

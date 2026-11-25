import { jsonToString } from '@willowforms/core'
import type { JsonValue } from '@willowforms/core'
import type { NodeEventHandlers } from './index.js'

export const str = (v: unknown, fallback = ''): string => {
  const text = typeof v === 'string' ? v : jsonToString(v as JsonValue | undefined)
  return text === '' ? fallback : text
}

/** ARIA exposes required state without enabling a second, browser-owned validator. */
export const requiredProps = (required: boolean): { 'aria-required'?: true } =>
  required ? { 'aria-required': true } : {}

export const bool = (v: unknown): boolean => v === true

/**
 * `NaN` and `Infinity` reach a prop (`1e999` parses as `Infinity`, an expression can return
 * either), and neither is a usable width or `aria-valuenow`.
 */
export const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

export const changed = (
  onChange: (value: JsonValue) => void,
  events: NodeEventHandlers | undefined,
  value: JsonValue,
): void => {
  onChange(value)
  events?.onChange?.(value)
}

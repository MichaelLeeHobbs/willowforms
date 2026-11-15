/*
 * Package-internal type guards. Not exported from the package entry point, so
 * they are free to change without a public API change.
 */

/** True for any non-null object that is not an array, including null-prototype objects. */
// eslint-disable-next-line no-restricted-syntax -- the one definition; the rule refuses copies.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

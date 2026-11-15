/*
 * Package-internal type guards. Not exported from the package entry point, so
 * they are free to change without a public API change.
 */

/** True for any non-null object that is not an array, including null-prototype objects. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// eslint-disable-next-line no-restricted-syntax -- the one definition; the rule refuses copies.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

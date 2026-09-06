import type { JsonValue } from './types.js'
import { safeHref } from './json.js'

export const MAX_EMBEDDED_IMAGE_BYTES = 2 * 1024 * 1024
const RASTER = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]*={0,2})$/i

/** Image contexts accept web addresses and bounded embedded rasters, never navigation schemes. */
export function safeImageSource(value: JsonValue | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const source = value.trim()
  if (source.includes('\\')) return undefined
  if (/^data:/i.test(source)) {
    if (source.length > Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4 + 40) return undefined
    const match = RASTER.exec(source)
    const data = match?.[2]
    if (!data || data.length % 4 !== 0) return undefined
    const size = (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
    return size <= MAX_EMBEDDED_IMAGE_BYTES ? source : undefined
  }
  const safe = safeHref(source)
  return safe && (!/^[a-z][a-z0-9+.-]*:/i.test(safe) || /^https?:/i.test(safe)) ? safe : undefined
}

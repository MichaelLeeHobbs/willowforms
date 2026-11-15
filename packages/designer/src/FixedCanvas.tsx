import { useId } from 'react'
import type { ReactNode } from 'react'
import type { Device } from '@willowforms/core'

const PAPER_SIZES = {
  letter: { label: 'Letter (8.5 × 11 in)', width: 816, height: 1056 },
  legal: { label: 'Legal (8.5 × 14 in)', width: 816, height: 1344 },
  a4: { label: 'A4 (210 × 297 mm)', width: 794, height: 1123 },
  a3: { label: 'A3 (297 × 420 mm)', width: 1123, height: 1587 },
}

export interface FixedCanvasSize {
  preset: keyof typeof PAPER_SIZES | 'custom'
  landscape: boolean
  width: number
  height: number
}

export const DEFAULT_FIXED_SIZE: FixedCanvasSize = {
  preset: 'letter',
  landscape: false,
  width: 816,
  height: 1056,
}

export function fixedDimensions(size: FixedCanvasSize): { width: number; height: number } {
  if (size.preset === 'custom') return { width: size.width, height: size.height }
  const paper = PAPER_SIZES[size.preset]
  return size.landscape
    ? { width: paper.height, height: paper.width }
    : { width: paper.width, height: paper.height }
}

export const deviceAtWidth = (width: number): Exclude<Device, 'any'> =>
  width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'

export function FixedCanvasControls({
  size,
  onChange,
}: {
  size: FixedCanvasSize
  onChange: (size: FixedCanvasSize) => void
}): ReactNode {
  const id = useId()
  const dimensions = fixedDimensions(size)
  /**
   * Accepts sizes from 100 to 10000 pixels, rounded to whole pixels, and puts
   * the last valid size back in the field instead of showing an error.
   */
  const commit = (axis: 'width' | 'height', input: HTMLInputElement): void => {
    const value = input.valueAsNumber
    const valid = Number.isFinite(value) && value >= 100 && value <= 10000
    input.value = String(valid ? Math.round(value) : size[axis])
    if (valid) onChange({ ...size, [axis]: Math.round(value) })
  }
  return (
    <div className="fs-fixed-canvas" role="group" aria-label="Fixed canvas size">
      <label htmlFor={id + '-paper'}>Size</label>
      <select
        id={id + '-paper'}
        value={size.preset}
        onChange={(event) =>
          onChange({
            ...size,
            ...dimensions,
            preset: event.target.value as FixedCanvasSize['preset'],
          })
        }
      >
        {Object.entries(PAPER_SIZES).map(([value, paper]) => (
          <option key={value} value={value}>
            {paper.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {size.preset === 'custom' ? (
        <>
          {(['width', 'height'] as const).map((axis) => (
            <label key={axis}>
              {axis === 'width' ? 'Width (px)' : 'Height (px)'}
              <input
                type="number"
                min={100}
                max={10000}
                defaultValue={size[axis]}
                onBlur={(event) => commit(axis, event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commit(axis, event.currentTarget)
                  }
                }}
              />
            </label>
          ))}
        </>
      ) : (
        <>
          <label htmlFor={id + '-orientation'}>Orientation</label>
          <select
            id={id + '-orientation'}
            value={size.landscape ? 'landscape' : 'portrait'}
            onChange={(event) =>
              onChange({ ...size, landscape: event.target.value === 'landscape' })
            }
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </>
      )}
      <span>
        {dimensions.width} × {dimensions.height} px
      </span>
      <small>Content can extend beyond the page outline.</small>
    </div>
  )
}

import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { parseDeclarations, printDeclarations, safeDeclarations } from '@willowforms/core'

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const FONTS = [
  ['Default font', ''],
  ['System UI', 'system-ui, sans-serif'],
  ['Sans serif', 'sans-serif'],
  ['Serif', 'serif'],
  ['Monospace', 'ui-monospace, monospace'],
  ['Arial', 'Arial, sans-serif'],
  ['Verdana', 'Verdana, sans-serif'],
  ['Trebuchet MS', '"Trebuchet MS", sans-serif'],
  ['Georgia', 'Georgia, serif'],
  ['Cambria', 'Cambria, Georgia, serif'],
  ['Times New Roman', '"Times New Roman", serif'],
] as const

export function FriendlyStyle({
  text,
  base,
  onChange,
}: {
  text: string
  base: string
  onChange: (text: string) => void
}): ReactNode {
  // Let the browser expand shorthands and resolve declaration order. Never serialize
  // its normalized copy: unsupported declarations in the original must survive.
  const css = typeof document === 'undefined' ? undefined : document.createElement('span').style
  if (css) css.cssText = base + ';' + text
  const read = (name: string): string => css?.getPropertyValue(name) ?? ''
  const write = (values: Record<string, string>): void => {
    const declarations = parseDeclarations(text).filter(([name]) => !(name in values))
    for (const [name, value] of Object.entries(values)) {
      if (value)
        declarations.push([name, value + (css?.getPropertyPriority(name) ? ' !important' : '')])
    }
    const next = printDeclarations(declarations)
    if (!next || safeDeclarations(next)) onChange(next)
  }
  return (
    <div className="fs-style-tools">
      <fieldset className="fs-style-tools__group">
        <legend>Text alignment</legend>
        <div className="fs-style-tools__buttons">
          {['left', 'center', 'right'].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={read('text-align') === value}
              onClick={() => write({ 'text-align': value })}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="fs-style-tools__group">
        <legend>Text formatting</legend>
        <div className="fs-style-tools__buttons fs-style-tools__buttons--format">
          {(
            [
              [
                'Bold',
                'font-weight',
                '700',
                '400',
                read('font-weight') === 'bold' || Number(read('font-weight')) >= 600,
              ],
              ['Italic', 'font-style', 'italic', 'normal', read('font-style') === 'italic'],
              [
                'Underline',
                'text-decoration-line',
                'underline',
                'none',
                read('text-decoration-line').includes('underline'),
              ],
              [
                'Strikethrough',
                'text-decoration-line',
                'line-through',
                'none',
                read('text-decoration-line').includes('line-through'),
              ],
            ] as const
          ).map(([label, name, on, off, active]) => (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                const other =
                  name === 'text-decoration-line'
                    ? read(name)
                        .split(/\s+/)
                        .filter((v) => v && v !== 'none' && v !== on)
                    : []
                write({
                  [name]:
                    name === 'text-decoration-line'
                      ? [...other, ...(active ? [] : [on])].join(' ') || 'none'
                      : active
                        ? off
                        : on,
                })
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="fs-style-tools__field">
        Font family
        <select
          aria-label="Font family"
          value={read('font-family')}
          onChange={(e) => write({ 'font-family': e.target.value })}
        >
          {read('font-family') && !FONTS.some(([, value]) => value === read('font-family')) && (
            <option value={read('font-family')}>Custom — {read('font-family')}</option>
          )}
          {FONTS.map(([label, value]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Length
        label="Text size"
        value={read('font-size')}
        onChange={(value) => write({ 'font-size': value })}
        percent
      />
      <Color
        label="Text color"
        value={read('color')}
        onChange={(value) => write({ color: value })}
      />
      <Length
        label="Component width"
        value={read('width')}
        onChange={(value) => write({ width: value })}
        percent
      />
      <p className="fs-style-tools__hint">
        Alignment positions text inside the component. Use the parent layout&apos;s alignment to
        position whole components.
      </p>
      <details className="fs-style-tools__section">
        <summary>Spacing</summary>
        {(['padding', 'margin'] as const).map((name) => (
          <fieldset key={name} className="fs-style-tools__group">
            <legend>{name === 'padding' ? 'Inside spacing' : 'Outside spacing'}</legend>
            <div className="fs-style-tools__sides">
              {SIDES.map((side) => (
                <Length
                  key={side}
                  label={side[0]!.toUpperCase() + side.slice(1)}
                  accessibleLabel={`${name === 'padding' ? 'Inside' : 'Outside'} ${side}`}
                  value={read(name + '-' + side)}
                  onChange={(value) => write({ [name + '-' + side]: value })}
                  negative={name === 'margin'}
                  percent
                />
              ))}
            </div>
          </fieldset>
        ))}
      </details>
      <details className="fs-style-tools__section">
        <summary>Background and border</summary>
        <Color
          label="Background color"
          value={read('background-color')}
          onChange={(value) => write({ 'background-color': value })}
        />
        <Length
          label="Border thickness"
          value={read('border-top-width')}
          onChange={(value) =>
            write(
              Object.fromEntries(
                SIDES.flatMap((side) => [
                  [`border-${side}-width`, value],
                  [
                    `border-${side}-style`,
                    read(`border-${side}-style`) && read(`border-${side}-style`) !== 'none'
                      ? read(`border-${side}-style`)
                      : 'solid',
                  ],
                ]),
              ),
            )
          }
        />
        <label className="fs-style-tools__field">
          Border appearance
          <select
            value={read('border-top-style')}
            onChange={(e) =>
              write(
                Object.fromEntries(SIDES.map((side) => [`border-${side}-style`, e.target.value])),
              )
            }
          >
            <option value="">Default</option>
            {['none', 'solid', 'dashed', 'dotted', 'double'].map((v) => (
              <option key={v} value={v}>
                {v[0]!.toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <Color
          label="Border color"
          value={read('border-top-color')}
          onChange={(value) =>
            write(Object.fromEntries(SIDES.map((side) => [`border-${side}-color`, value])))
          }
        />
        <Length
          label="Corner rounding"
          value={read('border-top-left-radius')}
          onChange={(value) =>
            write(
              Object.fromEntries(
                ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((corner) => [
                  `border-${corner}-radius`,
                  value,
                ]),
              ),
            )
          }
        />
      </details>
    </div>
  )
}

function Length({
  label,
  accessibleLabel = label,
  value,
  onChange,
  negative,
  percent,
}: {
  label: string
  accessibleLabel?: string
  value: string
  onChange: (value: string) => void
  negative?: boolean
  percent?: boolean
}): ReactNode {
  const id = useId()
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%)?$/.exec(value)
  const unit = match?.[2] ?? 'px'
  const [draft, setDraft] = useState(match?.[1] ?? '')
  const [seen, setSeen] = useState(value)
  const [chosenUnit, setChosenUnit] = useState(unit)
  const [badInput, setBadInput] = useState(false)
  const invalid =
    badInput ||
    (draft !== '' && (!Number.isFinite(Number(draft)) || (!negative && Number(draft) < 0)))
  if (seen !== value) {
    setSeen(value)
    setDraft(match?.[1] ?? '')
    setChosenUnit(unit)
    setBadInput(false)
  }
  const commit = (): void => {
    if (invalid || draft === (match?.[1] ?? '')) return
    const number = Number(draft)
    if (draft === '') onChange('')
    else if (Number.isFinite(number) && (negative || number >= 0)) onChange(draft + chosenUnit)
  }
  return (
    <div className="fs-style-tools__field">
      <label htmlFor={id}>{label}</label>
      <span className="fs-style-tools__length">
        <input
          id={id}
          type="number"
          aria-label={accessibleLabel}
          min={negative ? undefined : 0}
          step="any"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? id + '-error' : undefined}
          value={draft}
          placeholder={value && !match ? 'Custom' : 'Default'}
          onChange={(e) => {
            setDraft(e.target.value)
            setBadInput(e.target.validity.badInput)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft(match?.[1] ?? '')
              setBadInput(false)
            }
          }}
        />
        <select
          aria-label={accessibleLabel + ' unit'}
          value={chosenUnit}
          onChange={(e) => {
            setChosenUnit(e.target.value)
            if (draft !== '' && !invalid) onChange(draft + e.target.value)
          }}
        >
          <option value="px">px</option>
          <option value="rem">rem</option>
          <option value="em">em</option>
          {percent && <option value="%">%</option>}
        </select>
      </span>
      {invalid && (
        <span id={id + '-error'} role="alert">
          Enter a valid size.
        </span>
      )}
      {value && !match && (
        <span className="fs-style-tools__hint">
          Custom: {value}. Edit in Advanced CSS or enter a size.
        </span>
      )}
    </div>
  )
}

function Color({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): ReactNode {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setDraft(value)
  }
  const css = typeof document === 'undefined' ? undefined : document.createElement('span').style
  if (css) css.color = draft
  const valid = !draft || (Boolean(css?.color) && Boolean(safeDeclarations('color:' + draft)))
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value)
  const swatch = /^#[\da-f]{6}$/i.test(value)
    ? value
    : rgb
      ? '#' +
        rgb
          .slice(1)
          .map((v) => Number(v).toString(16).padStart(2, '0'))
          .join('')
      : '#000000'
  const commit = (): void => {
    if (valid && draft !== value) onChange(draft)
  }
  return (
    <div className="fs-style-tools__field">
      <label htmlFor={id}>{label}</label>
      <div className="fs-color">
        <input
          id={id}
          className="fs-color__text"
          value={draft}
          placeholder="Default"
          aria-invalid={!valid || undefined}
          aria-describedby={!valid ? id + '-error' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
        />
        <input
          type="color"
          className="fs-color__swatch"
          aria-label={'Choose ' + label.toLowerCase()}
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {!valid && (
        <span id={id + '-error'} role="alert">
          Enter a color name or choose a color.
        </span>
      )}
    </div>
  )
}

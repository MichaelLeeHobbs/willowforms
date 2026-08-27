/**
 * Editors for the two non-static property bindings.
 *
 * `PropValue` is a tagged union, so a property is static text, a computed
 * expression, or a translation key, and never some blend of the three. The
 * panel mirrors that: one control picks the mode, and the editor below it
 * belongs to whichever mode is chosen. Before this existed, computed and i18n
 * bindings rendered correctly but could only be authored by editing the
 * document JSON by hand.
 *
 * Which modes a property offers comes from its `PropSchema`. `computable: false`
 * means an expression makes no sense there, and `localizable` is set on
 * user-facing copy, so a colour or a gap never offers a translation key.
 */

import type { ReactNode } from 'react'
import { languageTag } from '@formsmith/core'
import type { Language, PropSchema, PropValue } from '@formsmith/core'

export type BindingKind = PropValue['kind']

/** The conventional key for a translated property, per ARCHITECTURE.md. */
export function translationKey(componentKey: string, propName: string): string {
  return componentKey + '_' + propName
}

export function modesFor(schema: PropSchema): BindingKind[] {
  const modes: BindingKind[] = ['static']
  if (schema.computable !== false) modes.push('computed')
  if (schema.localizable) modes.push('i18n')
  if (schema.conditional) modes.push('condition')
  return modes
}

const MODE_LABELS: Record<BindingKind, string> = {
  static: 'Value',
  computed: 'Expression',
  i18n: 'Translation',
  condition: 'Condition',
}

export interface BindingModeProps {
  id: string
  schema: PropSchema
  value: PropValue | undefined
  componentKey: string
  onChange: (value: PropValue | undefined) => void
}

/** The mode picker. Rendered only when a property has more than one mode. */
export function BindingMode({
  id,
  schema,
  value,
  componentKey,
  onChange,
}: BindingModeProps): ReactNode {
  const modes = modesFor(schema)
  if (modes.length < 2) return null

  const current: BindingKind = value?.kind ?? 'static'

  return (
    <div className="fs-binding__modes">
      <label className="fs-visually-hidden" htmlFor={id}>
        {schema.label} binding
      </label>
      <select
        id={id}
        className="fs-binding__mode"
        value={current}
        onChange={(e) => {
          const kind = e.target.value as BindingKind
          if (kind === current) return
          // Switching mode starts that mode empty rather than trying to carry a
          // value across: an expression is not a label, and a translation key is
          // not either.
          if (kind === 'static') onChange(undefined)
          if (kind === 'computed') onChange({ kind: 'computed', expression: '' })
          if (kind === 'i18n') {
            onChange({ kind: 'i18n', key: translationKey(componentKey, schema.name) })
          }
        }}
      >
        {modes.map((mode) => (
          <option key={mode} value={mode}>
            {MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    </div>
  )
}

export interface ComputedEditorProps {
  id: string
  value: Extract<PropValue, { kind: 'computed' }>
  onChange: (value: PropValue) => void
}

export function ComputedEditor({ id, value, onChange }: ComputedEditorProps): ReactNode {
  return (
    <>
      <textarea
        id={id}
        className="fs-binding__expression"
        rows={2}
        spellCheck={false}
        placeholder="data.firstName + ' ' + data.lastName"
        value={value.expression}
        onChange={(e) => onChange({ kind: 'computed', expression: e.target.value })}
      />
      <p className="fs-prop-row__hint">
        Runs through the evaluator the host injects. With none injected this resolves to nothing
        rather than throwing, so the field still renders.
      </p>
    </>
  )
}

export interface TranslationEditorProps {
  id: string
  value: Extract<PropValue, { kind: 'i18n' }>
  languages: Language[]
  defaultLanguage: string
  translations: Record<string, Record<string, string>>
  onChange: (value: PropValue) => void
  onTranslate: (language: string, key: string, text: string) => void
}

export function TranslationEditor({
  id,
  value,
  languages,
  defaultLanguage,
  translations,
  onChange,
  onTranslate,
}: TranslationEditorProps): ReactNode {
  return (
    <>
      <input
        id={id}
        type="text"
        className="fs-binding__key"
        value={value.key}
        onChange={(e) => onChange({ kind: 'i18n', key: e.target.value })}
      />

      <ul className="fs-binding__languages">
        {languages.map((language) => {
          /*
           * Bundles are keyed by BCP 47 tag, which is what the renderer looks up.
           * Writing to the bare code put every translation authored here into a
           * bundle nothing read, so the canvas kept showing the raw key.
           */
          const tag = languageTag(language)
          const text = translations[tag]?.[value.key] ?? ''
          const fieldId = id + '-' + tag
          return (
            <li key={tag}>
              {/*
                The badge sits outside the label so the field's accessible name
                is exactly the language, not "English default".
              */}
              <div className="fs-binding__language-head">
                <label htmlFor={fieldId}>{language.name}</label>
                {tag === defaultLanguage && <span className="fs-binding__default">default</span>}
              </div>
              <input
                id={fieldId}
                type="text"
                dir={language.bidi}
                value={text}
                onChange={(e) => onTranslate(tag, value.key, e.target.value)}
              />
            </li>
          )
        })}
      </ul>

      <p className="fs-prop-row__hint">
        An untranslated key renders as the key itself, which makes a gap obvious rather than showing
        an empty label. Languages are managed on the Form tab.
      </p>
    </>
  )
}

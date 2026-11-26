/**
 * The binding mode picker, and the expression and translation editors.
 *
 * Which modes a property offers comes from its `PropSchema`: `computable: false` rules
 * out an expression, `localizable` allows a translation key, and `conditional` allows a
 * condition.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { languageTag } from '@willowforms/core'
import type { Language, PropSchema, PropValue } from '@willowforms/core'

import { unreadableTag } from '@willowforms/core'

import { nameOf } from '../language.js'
import { emptyCondition } from './ConditionEditor.js'

export type BindingKind = PropValue['kind']

/**
 * A seed only: a component rename never rewrites the key or its bundles. See
 * docs/spec/07-bindings.md.
 */
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
  /** A field the condition mode can start by testing. Empty means it cannot. */
  firstDataKey?: string
  /** `row` inside a repeater: a form-scope seed there is false on arrival. */
  firstDataKeyScope?: 'form' | 'row'
  onChange: (value: PropValue | undefined) => void
}

export function BindingMode({
  id,
  schema,
  value,
  componentKey,
  firstDataKey,
  firstDataKeyScope,
  onChange,
}: BindingModeProps): ReactNode {
  const modes = modesFor(schema)
  if (modes.length < 2) return null

  const current: BindingKind = value?.kind ?? 'static'

  return (
    <div>
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

          /*
           * Exhaustive, so a new `PropValue` kind fails to compile here. Each
           * mode starts empty: a value from one mode means nothing in another.
           */
          switch (kind) {
            case 'static':
              onChange(undefined)
              return
            case 'computed':
              onChange({ kind: 'computed', expression: '' })
              return
            case 'i18n':
              onChange({ kind: 'i18n', key: translationKey(componentKey, schema.name) })
              return
            case 'condition':
              if (firstDataKey) {
                onChange({
                  kind: 'condition',
                  condition: emptyCondition(firstDataKey, firstDataKeyScope),
                })
              }
              return
            default:
              return unreadableTag(kind, undefined)
          }
        }}
      >
        {modes.map((mode) => (
          // Without a field, a condition would be seeded with an empty key that
          // is always false.
          <option key={mode} value={mode} disabled={mode === 'condition' && !firstDataKey}>
            {MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    </div>
  )
}

export interface ComputedEditorProps {
  id: string
  label?: string
  value: Extract<PropValue, { kind: 'computed' }>
  onChange: (value: PropValue) => void
}

export function ComputedEditor({ id, value, label, onChange }: ComputedEditorProps): ReactNode {
  return (
    <>
      <textarea
        id={id}
        className="fs-binding__expression"
        // Named, because the only label on this row points at the mode select.
        aria-label={(label ? label + ' ' : '') + 'expression'}
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

/**
 * Guards the record as well as the bundle: a host's document reaches this panel
 * even when `validateDocument` rejects it (see `store.ts`).
 */
function bundleFor(
  translations: Record<string, Record<string, string>>,
  tag: string,
): Record<string, string> {
  if (!translations || typeof translations !== 'object') return {}
  const bundle = Object.hasOwn(translations, tag) ? translations[tag] : undefined
  return bundle && typeof bundle === 'object' ? bundle : {}
}

function textFor(bundle: Record<string, string>, key: string): string {
  if (!Object.hasOwn(bundle, key)) return ''
  const held = bundle[key]
  return typeof held === 'string' ? held : ''
}

function TranslationKeyField({
  id,
  value,
  languages,
  translations,
  onRename,
}: {
  id: string
  value: string
  languages: Language[]
  translations: Record<string, Record<string, string>>
  onRename: (next: string, carried: [string, string][]) => void
}): ReactNode {
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)

  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
  }

  const commit = (): void => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      setDraft(value)
      return
    }

    const carried = languages
      .map((language): [string, string] => {
        const tag = languageTag(language)
        return [tag, textFor(bundleFor(translations, tag), value)]
      })
      .filter(([, text]) => text !== '')

    setCommitted(trimmed)
    setDraft(trimmed)
    onRename(trimmed, carried)
  }

  return (
    <input
      id={id}
      type="text"
      className="fs-binding__key"
      // Named, because the only label on this row points at the mode select.
      aria-label="Translation key"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
        if (e.key === 'Escape') setDraft(value)
      }}
    />
  )
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
      {}
      <TranslationKeyField
        id={id}
        value={value.key}
        languages={languages}
        translations={translations}
        onRename={(next, carried) => {
          onChange({ kind: 'i18n', key: next })

          // A move, not a copy: `setTranslation` deletes a key given empty text.
          for (const [language, text] of carried) {
            onTranslate(language, next, text)
            onTranslate(language, value.key, '')
          }
        }}
      />

      <ul className="fs-binding__languages">
        {languages.map((language, at) => {
          // Bundles are keyed by BCP 47 tag, which is what the renderer looks up.
          const tag = languageTag(language)
          const text = textFor(bundleFor(translations, tag), value.key)
          const fieldId = id + '-' + String(at) + '-' + tag
          return (
            /*
             * Position and tag: nothing dedupes `languages`, so two entries can
             * share a tag, and the React key and the input id must stay unique.
             */
            <li key={String(at) + ':' + tag}>
              {/*
                The badge sits outside the label so the field's accessible name
                is exactly the language, not "English default".
              */}
              <div className="fs-binding__language-head">
                {/*
                  The tag for a nameless language, so every control has a label
                  (docs/accessibility.md) and matches the language list.
                */}
                <label htmlFor={fieldId}>{nameOf(language) || tag}</label>
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
        an empty label. Languages are managed on the Settings tab.
      </p>
    </>
  )
}

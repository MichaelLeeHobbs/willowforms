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

import { useState } from 'react'
import type { ReactNode } from 'react'
import { languageTag } from '@formsmith/core'
import type { Language, PropSchema, PropValue } from '@formsmith/core'

import { emptyCondition } from './ConditionEditor.js'

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
  /** A field the condition mode can start by testing. Empty means it cannot. */
  firstDataKey?: string
  /**
   * Which scope that field lives in. `row` inside a repeater, where a seed at
   * form scope names a key the top level does not hold and is false on arrival.
   */
  firstDataKeyScope?: 'form' | 'row'
  onChange: (value: PropValue | undefined) => void
}

/** The mode picker. Rendered only when a property has more than one mode. */
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
          /*
           * Without this the option was in the list and selecting it did
           * nothing, which is the dead-control failure this project treats as
           * worst. It is reachable only for a property whose schema opts in.
           */
          if (kind === 'condition' && firstDataKey) {
            onChange({
              kind: 'condition',
              condition: emptyCondition(firstDataKey, firstDataKeyScope),
            })
          }
        }}
      >
        {modes.map((mode) => (
          /*
           * A condition needs a field to test. With none on the document it
           * would be seeded with an empty key, evaluate to false, and leave a
           * control that cannot be corrected: the same refusal the visibility
           * row makes, and this path had been left without it.
           */
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
  /** What this expression is for, so the box can name itself. */
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
        /*
         * Named. The only label on this row points at the mode select, so this
         * box announced itself as nothing — and the accessibility suite audits a
         * selected component at rest, which is a state in which this box is not
         * on screen, so axe never saw it.
         */
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
 * One language's bundle, whatever the document holds in its place.
 *
 * `translations[tag]?.[key]` guards the bundle and not the record, so a
 * document missing `translations` altogether crashed this panel — and the panel
 * is where somebody goes to repair such a document. `validateDocument` refuses
 * it now; nothing on the path from a host's storage to here runs that.
 */
function bundleFor(
  translations: Record<string, Record<string, string>>,
  tag: string,
): Record<string, string> {
  if (!translations || typeof translations !== 'object') return {}
  const bundle = translations[tag]
  return bundle && typeof bundle === 'object' ? bundle : {}
}

/**
 * The translation key, committed on blur, carrying its text with it.
 *
 * It was a controlled input writing a new binding on every keystroke, so typing
 * a new name walked through every prefix of it. None of those prefixes has a
 * bundle entry, so both language boxes blanked as you typed — and the text
 * already written stayed under the old key, orphaned, with no way back to it
 * from the panel.
 *
 * The same draft-and-commit shape as every other editor here that parses or
 * renames. What is different is that the commit has to move the translations
 * too: a key is the name of something, and renaming it without the thing it
 * names is what made this destructive rather than merely awkward.
 */
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
        return [tag, bundleFor(translations, tag)[value] ?? '']
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
      {/*
       * A draft, committed on blur, and the rename carries the translations
       * with it.
       *
       * It wrote a new binding on every keystroke, so typing a new name walked
       * through every prefix of it — and none of those prefixes had a bundle
       * entry, so both language boxes blanked as you typed and the text already
       * written was orphaned under the old key, permanently. There is no way
       * back to it from the panel.
       */}
      <TranslationKeyField
        id={id}
        value={value.key}
        languages={languages}
        translations={translations}
        onRename={(next, carried) => {
          onChange({ kind: 'i18n', key: next })
          for (const [language, text] of carried) onTranslate(language, next, text)
        }}
      />

      <ul className="fs-binding__languages">
        {languages.map((language) => {
          /*
           * Bundles are keyed by BCP 47 tag, which is what the renderer looks up.
           * Writing to the bare code put every translation authored here into a
           * bundle nothing read, so the canvas kept showing the raw key.
           */
          const tag = languageTag(language)
          const text = bundleFor(translations, tag)[value.key] ?? ''
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

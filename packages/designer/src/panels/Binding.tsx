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
import { languageTag } from '@willowforms/core'
import type { Language, PropSchema, PropValue } from '@willowforms/core'

import { unreadableTag } from '@willowforms/core'

import { emptyCondition } from './ConditionEditor.js'

export type BindingKind = PropValue['kind']

/**
 * The conventional key for a translated property, per ARCHITECTURE.md.
 *
 * Baked in when the binding is made, and never rewritten afterwards: renaming
 * the component leaves `email_label` on a component now keyed `contact`, and the
 * translation still resolves, because the key is a string in the document and
 * the bundle is keyed by that string.
 *
 * So the convention holds until the first rename, and it is a convention rather
 * than a rule for that reason -- a translation key belongs to the text, not to
 * the component that happens to show it, and rewriting bundles on a rename would
 * be a migration with two ways to go wrong (a key two components share, a key a
 * host also uses) to keep a naming habit tidy.
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

          /*
           * A switch, so a fifth `PropValue` kind is a compile error here rather
           * than an option in the list that does nothing when chosen. This was
           * four independent `if`s, which is exactly the shape the comment
           * beneath them warns about: the `condition` arm had been added late
           * because nothing made its absence visible.
           *
           * Switching mode starts that mode empty rather than carrying a value
           * across: an expression is not a label, and a translation key is not
           * either.
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
              // Only with a field to test; the option is disabled without one.
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

/**
 * A language's name, or the empty string.
 *
 * The same shape `FormSettings.tsx` uses and for the same reason: a `Language`
 * arrives from a pasted document, so `name` can be absent or not a string, and
 * a nameless language is a state this product supports rather than a broken
 * one.
 */
function nameOf(language: { name?: unknown }): string {
  return typeof language.name === 'string' ? language.name.trim() : ''
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

          /*
           * Written under the new key, and cleared from the old one.
           *
           * The comment above says the rename "carries the translations with
           * it" and it only copied them: every rename left the old key's text
           * in every bundle, unreachable from the panel and exported with the
           * document. A translator opening the file sees two entries for one
           * string and no way to tell which one the form reads.
           *
           * `setTranslation` deletes a key when the text is empty, which is the
           * same path clearing a box takes.
           */
          for (const [language, text] of carried) {
            onTranslate(language, next, text)
            onTranslate(language, value.key, '')
          }
        }}
      />

      <ul className="fs-binding__languages">
        {languages.map((language, at) => {
          /*
           * Bundles are keyed by BCP 47 tag, which is what the renderer looks up.
           * Writing to the bare code put every translation authored here into a
           * bundle nothing read, so the canvas kept showing the raw key.
           */
          const tag = languageTag(language)
          const text = textFor(bundleFor(translations, tag), value.key)
          const fieldId = id + '-' + String(at) + '-' + tag
          return (
            /*
             * Position and tag, because two languages can carry the same tag:
             * nothing dedupes `languages` and the gate checks only that
             * `defaultLanguage` is present. Keyed by tag alone, a document with
             * `en` twice gave React two children with one key, and the id built
             * from the tag gave two inputs one `id` -- so `label for` resolved
             * to the first and the second box had no accessible name.
             */
            <li key={String(at) + ':' + tag}>
              {/*
                The badge sits outside the label so the field's accessible name
                is exactly the language, not "English default".
              */}
              <div className="fs-binding__language-head">
                {/*
                  The tag when the language has no name, so the field always has
                  an accessible name.

                  This rendered `language.name` raw. `FormSettings.tsx:85`
                  writes `name: name.trim()` with an explicit comment that a
                  nameless language is a supported state, and has a `nameOf`
                  helper for exactly this shape -- which this file did not use.
                  So a language with an empty name produced a text input with no
                  accessible name at all, and `docs/accessibility.md:17` lists
                  "Every form control in the shell has a label" as a
                  build-failing check. It passed because no fixture exercises a
                  nameless language.

                  The tag rather than a placeholder: it is what the author sees
                  in the language list beside it for the same case, so the two
                  panels name the same language the same way.
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
        an empty label. Languages are managed on the Form tab.
      </p>
    </>
  )
}

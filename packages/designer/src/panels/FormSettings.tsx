/**
 * Document-level settings: the form's name and its languages.
 *
 * Languages need a home somewhere, because a translation binding is only useful
 * once there is more than one language to translate into, and editing the
 * document JSON by hand to add one is not an answer.
 *
 * Removing a language deliberately leaves its translation bundle in the
 * document. Dropping the text along with the language would make an accidental
 * removal unrecoverable except through undo, and the bundle costs nothing.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { languageTag } from '@formsmith/core'
import type { Language } from '@formsmith/core'

import type { DesignerApi } from '../store.js'

export interface FormSettingsProps {
  api: DesignerApi
}

export function FormSettings({ api }: FormSettingsProps): ReactNode {
  const { document: doc } = api
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const add = (): void => {
    const raw = code.trim()
    /*
     * A tag is a primary subtag and an optional region, and Language keeps the
     * two in separate fields. Lowercasing the whole string into `code` made
     * pt-BR the language "pt-br": `dialect` could never be set through the UI,
     * and the tag the renderer looks translations up by was never the one the
     * panel had written.
     */
    /*
     * Checked against a grammar, not merely split.
     *
     * `raw.split('-')` took the first two subtags and dropped the rest, so
     * `zh-Hans-CN` was stored as `zh-HANS`: every translation authored for it
     * went into a bundle the renderer will never look up, because the tag it
     * looks up is the one this panel wrote. And nothing checked the shape at
     * all, so `en US` became a bundle key nothing can ever resolve.
     *
     * The subset this library supports, stated: a primary subtag and an
     * optional region, which is what `Language` has fields for. A tag with a
     * script subtag is refused with a reason rather than silently truncated —
     * saying "not yet" is a smaller failure than storing text nobody will find.
     */
    const parsed = /^([A-Za-z]{2,3})(?:-([A-Za-z]{2}|\d{3}))?$/.exec(raw)
    if (!parsed) {
      setError(
        raw.split('-').length > 2
          ? 'A script subtag such as zh-Hans-CN is not supported yet. Use zh or zh-CN.'
          : 'Enter a language code, such as fr or pt-BR.',
      )
      return
    }

    const [, primary = '', region] = parsed
    const language: Language = {
      code: primary.toLowerCase(),
      ...(region ? { dialect: region.toUpperCase() } : {}),
      name: name.trim() || raw,
      bidi: 'ltr',
    }
    const tag = languageTag(language)
    if (doc.languages.some((l) => languageTag(l).toLowerCase() === tag.toLowerCase())) {
      setError(tag + ' is already in the list.')
      return
    }

    api.setLanguages([...doc.languages, language])
    setCode('')
    setName('')
    setError('')
  }

  const remove = (target: string): void => {
    if (doc.languages.length === 1) return
    api.setLanguages(doc.languages.filter((l) => languageTag(l) !== target))
  }

  return (
    <div className="fs-form-settings">
      <div className="fs-prop-row">
        <label htmlFor="fs-form-name">Form name</label>
        <input
          id="fs-form-name"
          type="text"
          value={doc.name}
          onChange={(e) => api.renameDocument(e.target.value)}
        />
      </div>

      <h3 className="fs-rules__heading">
        Languages <span className="fs-rules__count">{doc.languages.length}</span>
      </h3>

      <ul className="fs-languages">
        {doc.languages.map((language) => {
          const tag = languageTag(language)
          const isDefault = tag === doc.defaultLanguage
          return (
            <li key={tag} className="fs-languages__item">
              <span className="fs-languages__name">
                {language.name} <code>{tag}</code>
              </span>

              <div className="fs-languages__controls">
                <label>
                  <input
                    type="radio"
                    name="fs-default-language"
                    checked={isDefault}
                    onChange={() => api.setLanguages(doc.languages, tag)}
                  />
                  Default
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={language.bidi === 'rtl'}
                    onChange={(e) =>
                      api.setLanguages(
                        doc.languages.map((l) =>
                          languageTag(l) === tag
                            ? { ...l, bidi: e.target.checked ? 'rtl' : 'ltr' }
                            : l,
                        ),
                      )
                    }
                  />
                  Right to left
                </label>

                <button
                  type="button"
                  className="fs-rule__remove"
                  aria-label={'Remove ' + language.name}
                  // A document with no languages renders every translation as its
                  // raw key, so the last one cannot be removed.
                  disabled={doc.languages.length === 1}
                  onClick={() => remove(languageTag(language))}
                >
                  &times;
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="fs-languages__add">
        <div className="fs-prop-row">
          <label htmlFor="fs-language-code">Code</label>
          <input
            id="fs-language-code"
            type="text"
            placeholder="fr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="fs-prop-row">
          <label htmlFor="fs-language-name">Name</label>
          <input
            id="fs-language-name"
            type="text"
            placeholder="French"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="button" onClick={add}>
          Add language
        </button>
        {error && (
          <p className="fs-languages__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

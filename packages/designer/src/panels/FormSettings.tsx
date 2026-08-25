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
    const trimmed = code.trim().toLowerCase()
    if (!trimmed) {
      setError('Enter a language code, such as fr or pt-BR.')
      return
    }
    if (doc.languages.some((l) => l.code === trimmed)) {
      setError(trimmed + ' is already in the list.')
      return
    }

    const language: Language = { code: trimmed, name: name.trim() || trimmed, bidi: 'ltr' }
    api.setLanguages([...doc.languages, language])
    setCode('')
    setName('')
    setError('')
  }

  const remove = (target: string): void => {
    if (doc.languages.length === 1) return
    api.setLanguages(doc.languages.filter((l) => l.code !== target))
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
          const isDefault = language.code === doc.defaultLanguage
          return (
            <li key={language.code} className="fs-languages__item">
              <span className="fs-languages__name">
                {language.name} <code>{language.code}</code>
              </span>

              <div className="fs-languages__controls">
                <label>
                  <input
                    type="radio"
                    name="fs-default-language"
                    checked={isDefault}
                    onChange={() => api.setLanguages(doc.languages, language.code)}
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
                          l.code === language.code
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
                  onClick={() => remove(language.code)}
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

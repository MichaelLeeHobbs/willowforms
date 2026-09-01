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
import { languagesOf } from '../language.js'
import { languageTag } from '@formsmith/core'
import type { Language } from '@formsmith/core'

import type { DesignerApi } from '../store.js'

export interface FormSettingsProps {
  api: DesignerApi
}

/**
 * A language's name, whatever the document put there.
 *
 * `language.name.trim()` threw on a language with no `name` -- and a `Language`
 * arrives from a pasted document, so `{ code: 'en' }` is a shape somebody can
 * type. A throw during render in React 19 unmounts the tree, so a missing name
 * took the whole designer down and left the JSON dialog, the one place the
 * document could be repaired, unreachable.
 */
function nameOf(language: { name?: unknown }): string {
  return typeof language.name === 'string' ? language.name.trim() : ''
}

export function FormSettings({ api }: FormSettingsProps): ReactNode {
  const { document: doc } = api

  /*
   * The list's shape is guarded, and the shape of each language already was.
   *
   * `nameOf` exists precisely because "a `Language` arrives from a pasted
   * document", and its docblock states that a throw during render in React 19
   * unmounts the whole designer -- so every language in this list was defended
   * and the list itself was not. `doc.languages` was read as an array three
   * times, and the Form tab is the tab the left pane can open, so
   * `doc.languages.map` threw and took the designer with it, including the JSON
   * dialog that would repair the document. `store.ts` only warns about a host's
   * `initialDocument`, which is the path such a document arrives by.
   */
  const languages = languagesOf(doc)
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
      /*
       * The typed name, or none. It fell back to the raw code, so a language
       * added without a name displayed as "pt-BR pt-BR" -- the tag twice. The
       * list draws the tag on its own when there is no name.
       */
      name: name.trim(),
      bidi: 'ltr',
    }
    const tag = languageTag(language)
    if (languages.some((l) => languageTag(l).toLowerCase() === tag.toLowerCase())) {
      setError(tag + ' is already in the list.')
      return
    }

    api.setLanguages([...languages, language])
    setCode('')
    setName('')
    setError('')
  }

  /*
   * Removed by position, not by tag.
   *
   * A tag is not unique: nothing stops a document holding `en` twice, and a
   * hand-edited one can, so filtering by tag deleted both entries for one click
   * -- and with a translation bundle keyed by that tag, the author had no way to
   * tell which of the two they had lost.
   */
  const remove = (at: number): void => {
    if (languages.length === 1) return
    api.setLanguages(languages.filter((_, index) => index !== at))
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
        {/*
          The count of what this panel can draw, not of what the array holds.
          A document with three entries and one usable one said "3" over a list
          of one, which reads as a panel that lost something.
        */}
        Languages <span className="fs-rules__count">{languages.length}</span>
      </h3>

      <ul className="fs-languages">
        {languages.map((language, at) => {
          const tag = languageTag(language)
          const isDefault = tag === doc.defaultLanguage
          return (
            // Keyed by position and tag: a document can hold one tag twice, and
            // a duplicated React key drops a row without a word.
            <li key={String(at) + ':' + tag} className="fs-languages__item">
              <span className="fs-languages__name">
                {/*
                 * The tag when there is no name. It fell back to the raw code,
                 * which for `pt-BR` produced "pt-BR pt-BR" -- the same string
                 * twice, reading as though something had gone wrong.
                 */}
                {nameOf(language) ? (
                  <>
                    {language.name} <code>{tag}</code>
                  </>
                ) : (
                  <code>{tag}</code>
                )}
              </span>

              <div className="fs-languages__controls">
                <label>
                  <input
                    type="radio"
                    name="fs-default-language"
                    checked={isDefault}
                    /*
                     * The guarded list here too. Passing `doc.languages` back
                     * would write whatever the document held -- including the
                     * entries this panel refused to draw -- through an API that
                     * takes `Language[]`, so a malformed entry would be handed
                     * on as though it had been read.
                     *
                     * Writing `languages` instead does drop the unusable
                     * entries, and that is the one place in this panel where
                     * dropping is right: the author has chosen a default
                     * language, which is an edit, and an edit writes what the
                     * panel showed them.
                     */
                    onChange={() => api.setLanguages(languages, tag)}
                  />
                  Default
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={language.bidi === 'rtl'}
                    /*
                     * By position, like the Remove button beside it.
                     *
                     * Nothing stops a hand-edited document holding one tag
                     * twice, and matching by tag then wrote both rows: ticking
                     * "Right to left" on one flipped the other. The removal on
                     * this same row was fixed and pinned by a test; the checkbox
                     * next to it kept matching by tag, which is one side of a
                     * symmetry fixed and the other left alone.
                     */
                    onChange={(e) =>
                      api.setLanguages(
                        languages.map((l, i) =>
                          i === at ? { ...l, bidi: e.target.checked ? 'rtl' : 'ltr' } : l,
                        ),
                      )
                    }
                  />
                  Right to left
                </label>

                <button
                  type="button"
                  className="fs-rule__remove"
                  aria-label={'Remove ' + (nameOf(language) || tag)}
                  // A document with no languages renders every translation as its
                  // raw key, so the last one cannot be removed.
                  /*
                   * `languages`, the guarded list, not `doc.languages`.
                   *
                   * This read the raw array for its length, so a document whose
                   * `languages` is not one threw here -- during render, in the
                   * panel that exists to survive exactly that, three lines after
                   * the filter that was added for it.
                   *
                   * The rule is unchanged: a document with no languages renders
                   * every translation as its raw key, so the last one cannot be
                   * removed. It is now the last one this panel can *draw*, which
                   * is the only one a person can act on anyway.
                   */
                  disabled={languages.length === 1}
                  onClick={() => remove(at)}
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
            /*
             * Flagged and described, the way `KeyField` does it. `role="alert"`
             * reads the refusal once as it appears and then it is gone: a
             * screen-reader user who tabbed back to the box had no way to hear
             * why the code was refused, or to know that it was.
             */
            aria-invalid={error ? true : undefined}
            {...(error ? { 'aria-describedby': 'fs-language-error' } : {})}
            /*
             * Editing the code clears the refusal it earned.
             *
             * The error was cleared only by the next successful `add()`, so
             * correcting `en US` to `en-US` left "not a language code" sitting
             * under a field that no longer holds one -- and the box is
             * `aria-invalid` and described by that message, so a screen reader
             * went on reading a refusal of text that had been fixed.
             */
            onChange={(e) => {
              setCode(e.target.value)
              setError('')
            }}
            /*
             * Enter adds the language, the way Enter commits every other field
             * in this panel. This block is not a `<form>` -- it sits inside the
             * designer's own markup, and a nested form in a host's page is a
             * submit nobody asked for -- so the key is handled here instead of
             * by the browser.
             */
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              add()
            }}
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
          <p id="fs-language-error" className="fs-languages__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

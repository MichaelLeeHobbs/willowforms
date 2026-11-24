/**
 * Removing a language deliberately leaves its translation bundle in the
 * document, so an accidental removal stays recoverable without undo.
 */

import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { languagesOf, nameOf } from '../language.js'
import { indexKit, keyProblem, languageTag, prop } from '@willowforms/core'
import type { CodeAction, JsonValue, Kit, Language } from '@willowforms/core'

import { useAnnouncement } from '../announce.js'
import type { DesignerApi } from '../store.js'
import { paramsText } from './text.js'

export interface FormSettingsProps {
  api: DesignerApi
  kit?: Kit
}

function CodeActionEditor({
  action,
  onChange,
  onRemove,
}: {
  action: CodeAction
  onChange: (next: CodeAction) => void
  onRemove: () => void
}): ReactNode {
  const errorId = useId()
  const [params, setParams] = useState(() => paramsText(action.params))
  const [paramsError, setParamsError] = useState('')

  const commitParams = (): void => {
    try {
      const value: unknown = JSON.parse(params)
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        setParamsError('Parameters must be a JSON object.')
        return
      }
      onChange({ ...action, params: value as Record<string, JsonValue> })
      setParamsError('')
    } catch {
      setParamsError('Parameters must be valid JSON.')
    }
  }

  return (
    <li className="fs-action-definition">
      <div className="fs-action__head">
        <code>{action.name}</code>
        <button type="button" aria-label={`Remove ${action.name}`} onClick={onRemove}>
          ×
        </button>
      </div>
      <label>
        Body
        <textarea
          className="fs-code__area"
          rows={6}
          value={action.body}
          onChange={(event) => onChange({ ...action, body: event.target.value })}
        />
      </label>
      <label>
        Default parameters
        <textarea
          className="fs-code__area"
          rows={4}
          value={params}
          aria-invalid={paramsError ? true : undefined}
          {...(paramsError ? { 'aria-describedby': errorId } : {})}
          onChange={(event) => {
            setParams(event.target.value)
            setParamsError('')
          }}
          onBlur={commitParams}
        />
      </label>
      {paramsError && (
        <p id={errorId} className="fs-languages__error" role="alert">
          {paramsError}
        </p>
      )}
    </li>
  )
}

export function FormSettings({ api, kit }: FormSettingsProps): ReactNode {
  const idBase = useId()
  const { document: doc } = api
  const supportsDensity =
    kit &&
    indexKit(kit)
      .get(doc.root.type)
      ?.props.some((entry) => entry.name === 'density')
  const authoredDensity = doc.root.props['density']
  const density =
    authoredDensity?.kind === 'static' &&
    (authoredDensity.value === 'compact' || authoredDensity.value === 'comfortable')
      ? authoredDensity.value
      : 'inherit'

  const languages = languagesOf(doc)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useAnnouncement()
  const [actionName, setActionName] = useState('')
  const [actionError, setActionError] = useAnnouncement()
  const actions =
    doc.actions && typeof doc.actions === 'object' && !Array.isArray(doc.actions) ? doc.actions : {}

  const addAction = (): void => {
    const nextName = actionName.trim()
    const problem = keyProblem(nextName)
    if (problem) {
      setActionError(problem)
      return
    }
    if (Object.hasOwn(actions, nextName)) {
      setActionError(`${nextName} already exists.`)
      return
    }
    api.setCodeActions({ ...actions, [nextName]: { name: nextName, body: '', params: {} } })
    setActionName('')
    setActionError('')
  }

  const add = (): void => {
    const raw = code.trim()

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
      // No fallback to the code: the list draws the tag alone when there is no
      // name, and a fallback would draw it twice.
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

  // By position, not by tag: a document can hold one tag twice.
  const remove = (at: number): void => {
    if (languages.length === 1) return
    api.setLanguages(languages.filter((_, index) => index !== at))
  }

  return (
    <div className="fs-form-settings">
      <div className="fs-prop-row">
        <label htmlFor={idBase + '-fs-form-name'}>Form name</label>
        <input
          id={idBase + '-fs-form-name'}
          type="text"
          value={doc.name}
          onChange={(e) => api.renameDocument(e.target.value)}
        />
      </div>

      {supportsDensity && (
        <div className="fs-prop-row">
          <label htmlFor={idBase + '-fs-form-density'}>Form density</label>
          <select
            id={idBase + '-fs-form-density'}
            value={density}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'compact' || value === 'comfortable' || value === 'inherit')
                api.setProp(doc.root.key, 'density', value === 'inherit' ? undefined : prop(value))
            }}
          >
            <option value="inherit">Host default</option>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
      )}

      <h3 className="fs-rules__heading">
        {/* The count of what this panel draws, not of what the array holds. */}
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
                    // Writes the `languagesOf` list, as every write here does.
                    onChange={() => api.setLanguages(languages, tag)}
                  />
                  Default
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={language.bidi === 'rtl'}

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
          <label htmlFor={idBase + '-fs-language-code'}>Code</label>
          <input
            id={idBase + '-fs-language-code'}
            type="text"
            placeholder="fr"
            value={code}
            // `role="alert"` is read out when it appears; the description lets a
            // returning screen-reader user hear the refusal.
            aria-invalid={error ? true : undefined}
            {...(error ? { 'aria-describedby': idBase + '-fs-language-error' } : {})}

            onChange={(e) => {
              setCode(e.target.value)
              setError('')
            }}
            // Not a `<form>`: the designer can sit inside a host's form, and a
            // nested one would submit it. Enter is handled here instead.
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              add()
            }}
          />
        </div>
        <div className="fs-prop-row">
          <label htmlFor={idBase + '-fs-language-name'}>Name</label>
          <input
            id={idBase + '-fs-language-name'}
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
          <p id={idBase + '-fs-language-error'} className="fs-languages__error" role="alert">
            {error}
          </p>
        )}
      </div>

      <h3 className="fs-rules__heading">
        Code actions <span className="fs-rules__count">{Object.keys(actions).length}</span>
      </h3>
      <p className="fs-rules__note">
        WillowForms stores this source but never executes it directly. The host must provide a
        sandboxed action evaluator.
      </p>
      {Object.keys(actions).length > 0 && (
        <ul className="fs-actions__list">
          {Object.keys(actions)
            .sort()
            .map((actionKey) => {
              const action = actions[actionKey]!
              return (
                <CodeActionEditor
                  key={`${actionKey}:${paramsText(action.params)}`}
                  action={action}
                  onChange={(next) => api.setCodeActions({ ...actions, [actionKey]: next })}
                  onRemove={() => {
                    const next = { ...actions }
                    delete next[actionKey]
                    api.setCodeActions(next)
                  }}
                />
              )
            })}
        </ul>
      )}
      <div className="fs-rules__add">
        <input
          type="text"
          aria-label="New code action name"
          placeholder="actionName"
          value={actionName}
          aria-invalid={actionError ? true : undefined}
          {...(actionError ? { 'aria-describedby': idBase + '-fs-action-error' } : {})}
          onChange={(event) => {
            setActionName(event.target.value)
            setActionError('')
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            addAction()
          }}
        />
        <button type="button" onClick={addAction}>
          Add action
        </button>
      </div>
      {actionError && (
        <p id={idBase + '-fs-action-error'} className="fs-languages__error" role="alert">
          {actionError}
        </p>
      )}
    </div>
  )
}

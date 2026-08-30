/**
 * Designer state: the document, the selection, and the undo stack.
 *
 * History is a past/present/future triple over whole documents. Snapshots are
 * cheap because every tree operation in @formsmith/core is immutable and shares
 * structure with the previous version, so an edit deep in the tree allocates
 * only its own ancestors. The stack is capped; an unbounded undo history is a
 * memory leak that only shows up in long authoring sessions.
 */

import { useCallback, useMemo, useState } from 'react'
import type {
  ComponentDef,
  ComponentNode,
  Device,
  FieldSchema,
  FormDocument,
  Language,
  PropValue,
} from '@formsmith/core'
import {
  duplicateNode,
  findNode,
  findParent,
  insertNode,
  instantiate,
  keyProblem,
  languageTag,
  moveNode,
  removeNode,
  updateNode,
} from '@formsmith/core'

export const MAX_HISTORY = 100

interface History {
  past: FormDocument[]
  present: FormDocument
  future: FormDocument[]
  /**
   * What produced `present`. Consecutive edits sharing a label are folded into
   * one entry, so typing a label is one undo step rather than one per keystroke.
   */
  label?: string
}

/**
 * Add a version to the history, coalescing a run of edits to the same thing.
 *
 * Without this, every keystroke in a text field was its own undo step: typing a
 * thirteen-character label spent thirteen of the hundred slots and pushed the
 * real edits out of reach, which made undo useless for anything but the last few
 * characters.
 *
 * A run breaks when the label changes, which happens on a different property, a
 * different component, a structural edit, or an undo. Deliberately not on a
 * timer: wall-clock coalescing makes the behaviour depend on how fast someone
 * types, and makes the tests depend on how fast the machine runs them. The cost
 * is that pausing mid-field and resuming stays one entry, which is a smaller
 * problem than the one it replaces.
 */
function commit(history: History, next: FormDocument, label?: string): History {
  if (next === history.present) return history

  // Same label as the version already on top: replace it rather than stack on it.
  if (label !== undefined && history.label === label) {
    return { past: history.past, present: next, future: [], label }
  }

  const past = [...history.past, history.present]
  return {
    past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past,
    present: next,
    future: [],
    ...(label === undefined ? {} : { label }),
  }
}

function undo(history: History): History {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    // The restored version was not produced by the edit that is still labelled,
    // so the next keystroke must start a new entry rather than overwrite it.
  }
}

function redo(history: History): History {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  }
}

/** Why a rename was refused, so the panel can say so instead of doing nothing. */
export type RenameResult = { ok: true } | { ok: false; reason: string }

export interface DesignerApi {
  document: FormDocument
  selectedKey: string | undefined
  selectedNode: ComponentNode | undefined
  canUndo: boolean
  canRedo: boolean

  select: (key: string | undefined) => void
  /** Add a palette entry under a parent, selecting the new node. */
  addComponent: (def: ComponentDef, parentKey?: string, index?: number) => void
  setProp: (key: string, name: string, value: PropValue | undefined) => void
  /**
   * Replace a component's field schema, which is where its validation rules
   * live. Passing undefined drops the schema entirely, which is what a
   * component that carries no form data should have.
   */
  setFieldSchema: (key: string, schema: FieldSchema | undefined) => void
  /** Rename the form itself. */
  renameDocument: (name: string) => void
  /**
   * Write one translation. An empty string removes the entry, so an untranslated
   * key falls back to showing the key rather than an empty label.
   */
  setTranslation: (language: string, key: string, text: string) => void
  /**
   * Replace the language list. The default language follows if the current
   * default is no longer in it, because a document pointing at a language it
   * does not have renders every translation as its raw key.
   */
  setLanguages: (languages: Language[], defaultLanguage?: string) => void
  renameKey: (key: string, nextKey: string) => RenameResult
  /**
   * Rename the value this component submits, without touching its identity.
   *
   * An empty string, or one matching the component's own key, removes the
   * override rather than storing a redundant copy of the key. Data keys are
   * allowed to collide, so nothing is refused here.
   */
  setDataKey: (key: string, dataKey: string) => void
  /**
   * Set or clear a component's visibility condition.
   *
   * Separate from `setProp` because `renderWhen` is a field on the node rather
   * than an entry in `props`. Passing undefined removes it, which is not the
   * same as setting it to false: absent means always shown.
   */
  setRenderWhen: (key: string, value: PropValue | undefined) => void
  /**
   * Set a component's CSS for one device. Empty text removes that entry, and
   * removing the last one removes `css` entirely, so a component nobody styled
   * carries no key rather than an empty object.
   */
  setNodeCss: (key: string, device: Device, text: string) => void
  moveComponent: (key: string, parentKey: string, index?: number) => void
  /**
   * Copy a component and its subtree in beside it, and select the copy.
   *
   * Returns the new key, or undefined when there is nothing to copy: the root
   * has no siblings to sit among, so duplicating it is refused rather than
   * silently doing nothing.
   */
  duplicateComponent: (key: string) => string | undefined
  removeComponent: (key: string) => void
  replaceDocument: (next: FormDocument) => void
  undo: () => void
  redo: () => void
}

export function useDesigner(initial: FormDocument): DesignerApi {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] })
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)

  const document = history.present

  const apply = useCallback((mutate: (doc: FormDocument) => FormDocument, label?: string) => {
    setHistory((h) => commit(h, mutate(h.present), label))
  }, [])

  const addComponent = useCallback((def: ComponentDef, parentKey?: string, index?: number) => {
    /*
     * The new key is computed here rather than inside the updater. A state
     * updater must be pure: React is free to call it twice, and this one used to
     * call setSelectedKey from inside it, which is a state update during another
     * component's render.
     */
    setHistory((h) => {
      const node = instantiate(def, h.present.root)
      const parent = parentKey ?? h.present.root.key
      queueMicrotask(() => setSelectedKey(node.key))
      return commit(h, { ...h.present, root: insertNode(h.present.root, parent, node, index) })
    })
  }, [])

  const setProp = useCallback(
    (key: string, name: string, value: PropValue | undefined) => {
      apply(
        (doc) => ({
          ...doc,
          root: updateNode(doc.root, key, (node) => {
            const props = { ...node.props }
            // Clearing a property removes it so the component default applies again.
            if (value === undefined) delete props[name]
            else props[name] = value
            return { ...node, props }
          }),
        }),
        // Typing into one property is one undo step, not one per character.
        'prop:' + key + ':' + name,
      )
    },
    [apply],
  )

  const setFieldSchema = useCallback(
    (key: string, schema: FieldSchema | undefined) => {
      apply(
        (doc) => ({
          ...doc,
          root: updateNode(doc.root, key, (node) => {
            if (!schema) {
              // exactOptionalPropertyTypes: an absent schema is an absent key,
              // not a key holding undefined.
              const { schema: _dropped, ...rest } = node
              return rest
            }
            return { ...node, schema }
          }),
        }),
        'schema:' + key,
      )
    },
    [apply],
  )

  const renameDocument = useCallback(
    (name: string) => {
      apply((doc) => (doc.name === name ? doc : { ...doc, name }), 'document-name')
    },
    [apply],
  )

  const setTranslation = useCallback(
    (language: string, key: string, text: string) => {
      apply(
        (doc) => {
          const bundle = { ...(doc.translations[language] ?? {}) }
          if (text) bundle[key] = text
          else delete bundle[key]
          return { ...doc, translations: { ...doc.translations, [language]: bundle } }
        },
        'translation:' + language + ':' + key,
      )
    },
    [apply],
  )

  const setLanguages = useCallback(
    (languages: Language[], defaultLanguage?: string) => {
      apply((doc) => {
        if (languages.length === 0) return doc
        const first = languages[0]
        if (!first) return doc

        /*
         * Compared as BCP 47 tags, not bare codes. A document's default is a tag
         * such as `en-US`, and comparing it against `['en']` decided the default
         * was missing and silently rewrote it, which then made the document fail
         * its own structural validation on re-import.
         */
        const tags = languages.map(languageTag)
        const preferred = defaultLanguage ?? doc.defaultLanguage

        return {
          ...doc,
          languages,
          defaultLanguage: tags.includes(preferred) ? preferred : languageTag(first),
        }
      })
    },
    [apply],
  )

  const renameKey = useCallback(
    (key: string, nextKey: string): RenameResult => {
      const trimmed = nextKey.trim()
      if (trimmed === key) return { ok: true }

      /*
       * The same rule `validateDocument` applies to a pasted document, so the
       * panel cannot create a key a paste would be told off for.
       */
      const problem = keyProblem(trimmed)
      if (problem) return { ok: false, reason: problem }

      /*
       * Checked against the current document rather than inside the updater. A
       * state updater does not run when it is called, so a decision made in
       * there cannot be reported back to the caller, and the old version moved
       * the selection regardless: the panel silently began editing whichever
       * component already owned the name.
       */
      if (findNode(history.present.root, trimmed)) {
        return { ok: false, reason: trimmed + ' is already used by another component.' }
      }

      apply((doc) => ({
        ...doc,
        root: updateNode(doc.root, key, (node) => ({ ...node, key: trimmed })),
      }))
      setSelectedKey((current) => (current === key ? trimmed : current))
      return { ok: true }
    },
    [apply, history.present.root],
  )

  const moveComponent = useCallback(
    (key: string, parentKey: string, index?: number) => {
      apply((doc) => {
        const root = moveNode(doc.root, key, parentKey, index)
        // moveNode returns the same root for an illegal move. Wrapping it in a
        // new document anyway defeated the identity check in commit, so a
        // refused drop still grew the undo stack with a state identical to the
        // one before it.
        return root === doc.root ? doc : { ...doc, root }
      })
    },
    [apply],
  )

  const removeComponent = useCallback(
    (key: string) => {
      apply((doc) => {
        const root = removeNode(doc.root, key)
        return root === doc.root ? doc : { ...doc, root }
      })
      setSelectedKey((current) => (current === key ? undefined : current))
    },
    [apply],
  )

  const duplicateComponent = useCallback(
    (key: string): string | undefined => {
      const parent = findParent(history.present.root, key)
      if (!parent) return undefined

      const copy = duplicateNode(history.present.root, key)
      if (!copy) return undefined

      const index = parent.children?.findIndex((child) => child.key === key) ?? -1
      if (index === -1) return undefined

      // Directly after the original, which is where a duplicate belongs and
      // where the eye is already looking.
      apply((doc) => ({
        ...doc,
        root: insertNode(doc.root, parent.key, copy, index + 1),
      }))
      setSelectedKey(copy.key)
      return copy.key
    },
    [apply, history],
  )

  const setRenderWhen = useCallback(
    (key: string, value: PropValue | undefined) => {
      apply(
        (doc) => ({
          ...doc,
          root: updateNode(doc.root, key, (node) => {
            if (!value) {
              // exactOptionalPropertyTypes: absent is an absent key, not a key
              // holding undefined.
              const { renderWhen: _dropped, ...rest } = node
              return rest
            }
            return { ...node, renderWhen: value }
          }),
        }),
        'renderWhen:' + key,
      )
    },
    [apply],
  )

  const setNodeCss = useCallback(
    (key: string, device: Device, text: string) => {
      apply(
        (doc) => ({
          ...doc,
          root: updateNode(doc.root, key, (node) => {
            const next = { ...(node.css ?? {}) }
            if (text.trim()) next[device] = text
            else delete next[device]

            if (Object.keys(next).length === 0) {
              // exactOptionalPropertyTypes: absent is an absent key.
              const { css: _dropped, ...rest } = node
              return rest
            }
            return { ...node, css: next }
          }),
        }),
        // Coalesced per device, so typing a padding value is one undo entry.
        'css:' + key + ':' + device,
      )
    },
    [apply],
  )

  const setDataKey = useCallback(
    (key: string, dataKey: string) => {
      const trimmed = dataKey.trim()
      apply(
        (doc) => ({
          ...doc,
          root: updateNode(doc.root, key, (node) => {
            if (!trimmed || trimmed === key) {
              // exactOptionalPropertyTypes: no override is an absent key, not a
              // key holding undefined.
              const { dataKey: _dropped, ...rest } = node
              return rest
            }
            return { ...node, dataKey: trimmed }
          }),
        }),
        'dataKey:' + key,
      )
    },
    [apply],
  )

  const replaceDocument = useCallback((next: FormDocument) => {
    setHistory((h) => commit(h, next))
    setSelectedKey(undefined)
  }, [])

  const selectedNode = useMemo(
    () => (selectedKey ? findNode(document.root, selectedKey) : undefined),
    [document, selectedKey],
  )

  return {
    document,
    selectedKey,
    selectedNode,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    select: setSelectedKey,
    addComponent,
    setProp,
    setFieldSchema,
    renameDocument,
    setTranslation,
    setLanguages,
    renameKey,
    setDataKey,
    setRenderWhen,
    setNodeCss,
    moveComponent,
    duplicateComponent,
    removeComponent,
    replaceDocument,
    undo: () => setHistory(undo),
    redo: () => setHistory(redo),
  }
}

/** Exported for tests; the hook wraps these. */
export const history = { commit, undo, redo }

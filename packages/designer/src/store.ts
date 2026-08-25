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
  FieldSchema,
  FormDocument,
  PropValue,
} from '@formsmith/core'
import {
  findNode,
  insertNode,
  instantiate,
  moveNode,
  removeNode,
  updateNode,
} from '@formsmith/core'

export const MAX_HISTORY = 100

interface History {
  past: FormDocument[]
  present: FormDocument
  future: FormDocument[]
}

function commit(history: History, next: FormDocument): History {
  if (next === history.present) return history
  const past = [...history.past, history.present]
  return {
    past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past,
    present: next,
    future: [],
  }
}

function undo(history: History): History {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
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
  renameKey: (key: string, nextKey: string) => void
  moveComponent: (key: string, parentKey: string, index?: number) => void
  removeComponent: (key: string) => void
  replaceDocument: (next: FormDocument) => void
  undo: () => void
  redo: () => void
}

export function useDesigner(initial: FormDocument): DesignerApi {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] })
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)

  const document = history.present

  const apply = useCallback((mutate: (doc: FormDocument) => FormDocument) => {
    setHistory((h) => commit(h, mutate(h.present)))
  }, [])

  const addComponent = useCallback((def: ComponentDef, parentKey?: string, index?: number) => {
    setHistory((h) => {
      const node = instantiate(def, h.present.root)
      const parent = parentKey ?? h.present.root.key
      const next = { ...h.present, root: insertNode(h.present.root, parent, node, index) }
      setSelectedKey(node.key)
      return commit(h, next)
    })
  }, [])

  const setProp = useCallback(
    (key: string, name: string, value: PropValue | undefined) => {
      apply((doc) => ({
        ...doc,
        root: updateNode(doc.root, key, (node) => {
          const props = { ...node.props }
          // Clearing a property removes it so the component default applies again.
          if (value === undefined) delete props[name]
          else props[name] = value
          return { ...node, props }
        }),
      }))
    },
    [apply],
  )

  const setFieldSchema = useCallback(
    (key: string, schema: FieldSchema | undefined) => {
      apply((doc) => ({
        ...doc,
        root: updateNode(doc.root, key, (node) => {
          if (!schema) {
            // exactOptionalPropertyTypes: an absent schema is an absent key, not
            // a key holding undefined.
            const { schema: _dropped, ...rest } = node
            return rest
          }
          return { ...node, schema }
        }),
      }))
    },
    [apply],
  )

  const renameKey = useCallback(
    (key: string, nextKey: string) => {
      const trimmed = nextKey.trim()
      if (!trimmed) return
      apply((doc) => {
        // Refuse a collision rather than silently producing a duplicate key.
        if (findNode(doc.root, trimmed) && trimmed !== key) return doc
        return { ...doc, root: updateNode(doc.root, key, (node) => ({ ...node, key: trimmed })) }
      })
      setSelectedKey((current) => (current === key ? trimmed : current))
    },
    [apply],
  )

  const moveComponent = useCallback(
    (key: string, parentKey: string, index?: number) => {
      apply((doc) => ({ ...doc, root: moveNode(doc.root, key, parentKey, index) }))
    },
    [apply],
  )

  const removeComponent = useCallback(
    (key: string) => {
      apply((doc) => ({ ...doc, root: removeNode(doc.root, key) }))
      setSelectedKey((current) => (current === key ? undefined : current))
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
    renameKey,
    moveComponent,
    removeComponent,
    replaceDocument,
    undo: () => setHistory(undo),
    redo: () => setHistory(redo),
  }
}

/** Exported for tests; the hook wraps these. */
export const history = { commit, undo, redo }

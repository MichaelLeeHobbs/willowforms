/**
 * Undo snapshots whole documents, which is cheap only because core tree
 * operations share structure (invariant 4). The stack is capped because an
 * unbounded history leaks memory in long sessions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ComponentDef,
  ComponentNode,
  CodeAction,
  Device,
  FieldSchema,
  FormDocument,
  JsonValue,
  Kit,
  Language,
  PropValue,
} from '@willowforms/core'

import { buildPreset } from './presets.js'
import type { PresetId } from './presets.js'
import {
  same,
  duplicateNode,
  findNode,
  findParent,
  insertNode,
  instantiate,
  keyProblem,
  languageTag,
  moveNode,
  removeNode,
  repointBinding,
  updateNode,
  validateDocument,
  dataKeyOf,
  writersOf,
  repointDataKey,
  flatten,
  walk,
  isRowScope,
} from '@willowforms/core'

export const MAX_HISTORY = 100

interface History {
  past: FormDocument[]
  present: FormDocument
  future: FormDocument[]
  /** An edit with the same label as `present` replaces it, so a run of typing is one undo step. */
  label?: string
}

function commit(history: History, next: FormDocument, label?: string): History {
  if (next === history.present) return history

  if (label !== undefined && history.label === label) {
    return { past: history.past, present: next, future: [], label }
  }

  const past = [...history.past, history.present]
  return {
    // `MAX_HISTORY` past documents plus the present one: docs/spec/12-api.md#undo.
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

  addComponent: (def: ComponentDef, parentKey?: string, index?: number) => boolean
  /** Insert an editable composition as one undoable action. */
  addPreset: (id: PresetId, kit: Kit, parentKey?: string) => boolean
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
  setDataKey: (key: string, dataKey: string) => RenameResult
  /**
   * Set or clear a component's visibility condition.
   *
   * Separate from `setProp` because `renderWhen` is a field on the node rather
   * than an entry in `props`. Passing undefined removes it, which is not the
   * same as setting it to false: absent means always shown.
   */
  setRenderWhen: (key: string, value: PropValue | undefined) => void
  /** Replace the selected component's event wiring. */
  setNodeEvents: (key: string, events: ComponentNode['events']) => void
  /** Replace the document's reusable code actions. */
  setCodeActions: (actions: Record<string, CodeAction>) => void
  /**
   * Set a component's CSS for one device. Empty text removes that entry, and
   * removing the last one removes `css` entirely, so a component nobody styled
   * carries no key rather than an empty object.
   */
  setNodeCss: (key: string, device: Device, text: string) => void
  /** Moves a component, and answers whether it moved. See `addComponent`. */
  moveComponent: (key: string, parentKey: string, index?: number) => boolean
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

/**
 * The nearest node at or above `key` that can hold children. `insertNode` would
 * give a leaf children no renderer draws, and refusing would make the palette
 * click a dead control. A container is the node with a `children` array, so no
 * kit is needed.
 */
function containerFor(root: ComponentNode, key: string | undefined): string {
  if (key === undefined) return root.key

  let node = findNode(root, key)
  if (!node) return root.key

  while (!Array.isArray(node.children)) {
    const parent = findParent(root, node.key)
    if (!parent) return root.key
    node = parent
  }
  return node.key
}

/**
 * Operator and clause count, for the undo label: an edit that changes either
 * starts a new undo entry instead of folding into a run of typing.
 */
function conditionShape(value: PropValue | undefined): string {
  if (!value || value.kind !== 'condition') return ''
  const condition = value.condition as { op?: unknown; conditions?: unknown } | undefined
  const op = typeof condition?.op === 'string' ? condition.op : '?'
  const count = Array.isArray(condition?.conditions) ? condition.conditions.length : 0
  return op + ':' + String(count)
}

function writeNode(
  doc: FormDocument,
  key: string,
  update: (node: ComponentNode) => ComponentNode,
): FormDocument {
  return withRoot(
    doc,
    updateNode(doc.root, key, (node) => {
      const next = update(node)
      /*
       * `same`, not `JSON.stringify`: spreads put keys in different orders, and
       * stringify cannot tell an absent property from one holding `undefined`.
       */
      return same(next as unknown as JsonValue, node as unknown as JsonValue) ? node : next
    }),
  )
}

function retainActionRefs(node: ComponentNode, actions: Record<string, CodeAction>): ComponentNode {
  const children = node.children?.map((child) => retainActionRefs(child, actions))
  const entries = Object.entries(node.events ?? {}).flatMap(([event, refs]) => {
    const kept =
      refs?.filter((ref) => ref.type === 'builtin' || Object.hasOwn(actions, ref.name)) ?? []
    return kept.length > 0 ? [[event, kept] as const] : []
  })
  const events = Object.fromEntries(entries) as NonNullable<ComponentNode['events']>
  const { children: _children, events: _events, ...base } = node
  return {
    ...base,
    ...(children ? { children } : {}),
    ...(entries.length > 0 ? { events } : {}),
  }
}

function withRoot(doc: FormDocument, root: ComponentNode): FormDocument {
  return root === doc.root ? doc : { ...doc, root }
}

function rowOwners(root: ComponentNode): Map<string, string | undefined> {
  const owners = new Map<string, string | undefined>()
  walk(root, (node, parent) => {
    owners.set(node.key, parent && (isRowScope(parent) ? parent.key : owners.get(parent.key)))
  })
  return owners
}

function repointNodeData(
  node: ComponentNode,
  from: string,
  to: string,
  scope: 'form' | 'row',
): ComponentNode {
  const binding = (value: PropValue): PropValue => repointDataKey(value, from, to, scope)
  const next = {
    ...node,
    props: Object.fromEntries(
      Object.entries(node.props).map(([name, value]) => [name, binding(value)]),
    ),
    ...(node.renderWhen ? { renderWhen: binding(node.renderWhen) } : {}),
    ...(Array.isArray(node.schema?.validations)
      ? {
          schema: {
            ...node.schema,
            validations: node.schema.validations.map((rule) => ({
              ...rule,
              ...((rule.key === 'matches' || rule.key === 'after') &&
              rule.field === from &&
              (rule.scope ?? 'form') === scope
                ? { field: to }
                : {}),
              ...(rule.when ? { when: binding(rule.when) } : {}),
            })),
          },
        }
      : {}),
  }
  return (['props', 'renderWhen', 'schema'] as const).every((key) =>
    same(node[key] as JsonValue | undefined, next[key] as JsonValue | undefined),
  )
    ? node
    : next
}

const bindingKind = (value: PropValue | undefined): string => {
  if (value === undefined) return 'none'
  if (value !== null && typeof value === 'object' && 'kind' in value) {
    return String((value as { kind: unknown }).kind)
  }
  return 'static'
}

export function useDesigner(initial: FormDocument): DesignerApi {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] })
  const [chosenKey, setSelectedKey] = useState<string | undefined>(undefined)

  const document = history.present

  const selectedKey =
    chosenKey !== undefined && findNode(document.root, chosenKey) ? chosenKey : undefined

  /*
   * The current document, readable from a handler without putting it in a
   * dependency array.
   *
   * A state updater has to be pure — React is free to call it twice — so a
   * handler that must *decide* something before it writes cannot decide it in
   * there. `addComponent` is the case: where a component lands depends on the
   * tree, and so does whether anything landed at all.
   *
   * A ref rather than the render closure, which is what `duplicateComponent`
   * reads and is a render behind whenever two edits land in one tick. Written in
   * an effect rather than during render, for the reason `drag.ts` gives.
   */
  /*
   * A host's document skips the `validateDocument` gate pasted JSON passes, so
   * it is checked once per mount. A warning, not a refusal: the designer is
   * where somebody repairs a broken document.
   */

  const mountedWith = useRef(initial)
  useEffect(() => {
    const problems = validateDocument(mountedWith.current)
    if (problems.length === 0) return
    console.warn(
      'WillowForms: this document does not validate. ' +
        problems.map((problem) => problem.message).join(' '),
    )
  }, [])

  const latest = useRef(history.present)
  useEffect(() => {
    latest.current = history.present
  }, [history.present])

  const commitDecided = useCallback((doc: FormDocument, next: FormDocument, label?: string) => {
    if (doc !== latest.current) {
      throw new Error('a document was decided against a stale read of the store')
    }

    latest.current = next
    setHistory((h) => commit(h, next, label))
  }, [])

  /**
   * Runs `mutate` outside the state updater so `latest` advances before the
   * next write in the same tick. `mutate` must be pure.
   */
  const apply = useCallback(
    (mutate: (doc: FormDocument) => FormDocument, label?: string) => {
      const doc = latest.current
      const next = mutate(doc)
      if (next === doc) return
      commitDecided(doc, next, label)
    },
    [commitDecided],
  )

  const addComponent = useCallback(
    (def: ComponentDef, parentKey?: string, index?: number) => {
      const doc = latest.current
      const node = instantiate(def, doc.root)
      if (!node) return false

      const root = insertNode(doc.root, containerFor(doc.root, parentKey), node, index)

      if (root === doc.root) return false

      commitDecided(doc, { ...doc, root })
      setSelectedKey(node.key)
      return true
    },
    [commitDecided],
  )

  const addPreset = useCallback(
    (id: PresetId, kit: Kit, parentKey?: string) => {
      const doc = latest.current
      const node = buildPreset(id, kit, doc.root)
      if (!node) return false
      const root = insertNode(doc.root, containerFor(doc.root, parentKey), node)
      if (root === doc.root) return false
      commitDecided(doc, { ...doc, root })
      setSelectedKey(node.key)
      return true
    },
    [commitDecided],
  )

  const setProp = useCallback(
    (key: string, name: string, value: PropValue | undefined) => {
      apply(
        (doc) =>
          writeNode(doc, key, (node) => {
            const props = { ...node.props }
            if (value === undefined) delete props[name]
            else props[name] = value
            return { ...node, props }
          }),

        'prop:' + key + ':' + name + ':' + bindingKind(value),
      )
    },
    [apply],
  )

  const setFieldSchema = useCallback(
    (key: string, schema: FieldSchema | undefined) => {
      apply(
        (doc) =>
          writeNode(doc, key, (node) => {
            if (!schema) {
              const { schema: _dropped, ...rest } = node
              return rest
            }
            return { ...node, schema }
          }),
        // Rule keys are in the label, so adding or removing a rule starts a new
        // undo entry while typing a rule's value still folds.

        'schema:' +
          key +
          ':' +
          String(schema?.type) +
          ':' +
          String(schema?.autoValidate) +
          ':' +
          (schema?.validations ?? []).map((rule) => rule.key).join(','),
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
          const bundles =
            doc.translations && typeof doc.translations === 'object' ? doc.translations : {}
          const held = bundles[language]
          const bundle = { ...(held && typeof held === 'object' ? held : {}) }

          if (text) bundle[key] = text
          else delete bundle[key]
          return { ...doc, translations: { ...bundles, [language]: bundle } }
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

        // Compared as BCP 47 tags: a default such as `en-US` never equals a bare code.
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
      const doc = latest.current
      const trimmed = nextKey.trim()
      if (trimmed === key) return { ok: true }

      // The grammar `validateDocument` applies, so the panel cannot write a key an
      // import would refuse.
      const problem = keyProblem(trimmed)
      if (problem) return { ok: false, reason: problem }

      // Decided here, not in a state updater: an updater runs later, so its
      // decision could not be returned to the caller.
      if (findNode(doc.root, trimmed)) {
        return { ok: false, reason: trimmed + ' is already used by another component.' }
      }

      const before = findNode(doc.root, key)
      if (!before) {
        return { ok: false, reason: 'There is no component keyed ' + key + ' any more.' }
      }

      const movedName = dataKeyOf(before)
      const owners = rowOwners(doc.root)
      const owner = owners.get(key)
      owners.set(trimmed, owner)
      const alsoWrites = writersOf(doc.root, movedName).filter(
        (each) => each !== key && owners.get(each) === owner,
      )

      const followsTheRename =
        alsoWrites.length === 0 && before.schema !== undefined && before.dataKey === undefined

      apply((doc) => {
        const renamed = updateNode(doc.root, key, (node) => ({
          ...node,
          key: trimmed,
          ...(node.renderWhen ? { renderWhen: repointBinding(node.renderWhen, key, trimmed) } : {}),
        }))

        if (!followsTheRename) return withRoot(doc, renamed)

        // Form references can occur in any row; row references belong to one repeater.
        const repointed = new Map<string, ComponentNode>()
        for (const { node } of flatten(renamed).reverse()) {
          const next =
            owner === undefined || owners.get(node.key) === owner
              ? repointNodeData(node, movedName, trimmed, owner === undefined ? 'form' : 'row')
              : node
          const children = node.children?.map((child) => repointed.get(child.key) ?? child)
          repointed.set(
            node.key,
            children?.some((child, index) => child !== node.children?.[index])
              ? { ...next, children }
              : next,
          )
        }

        return withRoot(doc, repointed.get(renamed.key) ?? renamed)
      })
      setSelectedKey((current) => (current === key ? trimmed : current))
      return { ok: true }
    },
    [apply],
  )

  const moveComponent = useCallback(
    (key: string, parentKey: string, index?: number) => {
      const doc = latest.current
      const root = moveNode(doc.root, key, parentKey, index)

      if (root === doc.root) return false

      commitDecided(doc, { ...doc, root })
      return true
    },
    [commitDecided],
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
      const doc = latest.current

      const parent = findParent(doc.root, key)
      if (!parent) return undefined

      const copy = duplicateNode(doc.root, key)
      if (!copy) return undefined

      const index = parent.children?.findIndex((child) => child.key === key) ?? -1
      if (index === -1) return undefined

      const root = insertNode(doc.root, parent.key, copy, index + 1)

      if (root === doc.root) return undefined

      commitDecided(doc, { ...doc, root })
      setSelectedKey(copy.key)
      return copy.key
    },
    [commitDecided],
  )

  const setRenderWhen = useCallback(
    (key: string, value: PropValue | undefined) => {
      apply(
        (doc) =>
          writeNode(doc, key, (node) => {
            if (!value) {
              const { renderWhen: _dropped, ...rest } = node
              return rest
            }
            return { ...node, renderWhen: value }
          }),

        'renderWhen:' + key + ':' + (value?.kind ?? 'none') + ':' + conditionShape(value),
      )
    },
    [apply],
  )

  const setNodeEvents = useCallback(
    (key: string, events: ComponentNode['events']) => {
      apply(
        (doc) =>
          writeNode(doc, key, (node) => {
            const populated = Object.fromEntries(
              Object.entries(events ?? {}).filter(
                ([, refs]) => Array.isArray(refs) && refs.length > 0,
              ),
            ) as NonNullable<ComponentNode['events']>
            if (Object.keys(populated).length === 0) {
              const { events: _dropped, ...rest } = node
              return rest
            }
            return { ...node, events: populated }
          }),
        'events:' + key,
      )
    },
    [apply],
  )

  const setCodeActions = useCallback(
    (actions: Record<string, CodeAction>) => {
      apply(
        (doc) => {
          const removed = Object.keys(doc.actions).some((name) => !Object.hasOwn(actions, name))
          return {
            ...doc,
            actions,
            root: removed ? retainActionRefs(doc.root, actions) : doc.root,
          }
        },
        'document-actions:' + Object.keys(actions).sort().join(','),
      )
    },
    [apply],
  )

  const setNodeCss = useCallback(
    (key: string, device: Device, text: string) => {
      apply(
        (doc) =>
          writeNode(doc, key, (node) => {
            const next = { ...(node.css ?? {}) }
            if (text.trim()) next[device] = text
            else delete next[device]

            if (Object.keys(next).length === 0) {
              const { css: _dropped, ...rest } = node
              return rest
            }
            return { ...node, css: next }
          }),
        // A run of typing is one undo entry per device; clearing the box starts a new one.
        'css:' + key + ':' + device + ':' + (text.trim() === '' ? 'cleared' : 'text'),
      )
    },
    [apply],
  )

  const setDataKey = useCallback(
    (key: string, dataKey: string): RenameResult => {
      const trimmed = dataKey.trim()
      /*
       * A data key names the answer in the payload, JSON Schema and refs, so
       * `validateDocument` judges it by the key grammar. An empty value clears
       * the override and is not checked.
       */
      if (trimmed && trimmed !== key) {
        const problem = keyProblem(trimmed)
        if (problem) return { ok: false, reason: problem }
      }
      apply(
        (doc) =>
          writeNode(doc, key, (node) => {
            if (!trimmed || trimmed === key) {
              const { dataKey: _dropped, ...rest } = node
              return rest
            }
            return { ...node, dataKey: trimmed }
          }),
        'dataKey:' + key,
      )
      return { ok: true }
    },
    [apply],
  )

  const replaceDocument = useCallback((next: FormDocument) => {
    // The ref too, or an edit later in this tick is decided against the
    // document this one replaced.
    latest.current = next
    setHistory((h) => commit(h, next))
    setSelectedKey(undefined)
  }, [])

  const selectedNode = useMemo(
    () => (selectedKey ? findNode(document.root, selectedKey) : undefined),
    [document, selectedKey],
  )

  const undoNow = useCallback(
    () =>
      setHistory((h) => {
        const next = undo(h)
        latest.current = next.present
        return next
      }),
    [],
  )
  const redoNow = useCallback(
    () =>
      setHistory((h) => {
        const next = redo(h)
        latest.current = next.present
        return next
      }),
    [],
  )

  return useMemo(
    () => ({
      document,
      selectedKey,
      selectedNode,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      select: setSelectedKey,
      addComponent,
      addPreset,
      setProp,
      setFieldSchema,
      renameDocument,
      setTranslation,
      setLanguages,
      renameKey,
      setDataKey,
      setRenderWhen,
      setNodeEvents,
      setCodeActions,
      setNodeCss,
      moveComponent,
      duplicateComponent,
      removeComponent,
      replaceDocument,
      undo: undoNow,
      redo: redoNow,
    }),
    [
      document,
      selectedKey,
      selectedNode,
      history,
      addComponent,
      addPreset,
      setProp,
      setFieldSchema,
      renameDocument,
      setTranslation,
      setLanguages,
      renameKey,
      setDataKey,
      setRenderWhen,
      setNodeEvents,
      setCodeActions,
      setNodeCss,
      moveComponent,
      duplicateComponent,
      removeComponent,
      replaceDocument,
      undoNow,
      redoNow,
    ],
  )
}

/**
 * Exported for tests: `useDesigner` never exposes the history, so only these
 * can show that a `History` React already rendered from is not mutated
 * (invariant 4).
 */
export const historyOps = { commit, undo, redo }

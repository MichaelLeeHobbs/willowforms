/**
 * Designer state: the document, the selection, and the undo stack.
 *
 * History is a past/present/future triple over whole documents. Snapshots are
 * cheap because every tree operation in @formsmith/core is immutable and shares
 * structure with the previous version, so an edit deep in the tree allocates
 * only its own ancestors. The stack is capped; an unbounded undo history is a
 * memory leak that only shows up in long authoring sessions.
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
} from '@formsmith/core'

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

function commit(history: History, next: FormDocument, label?: string): History {
  if (next === history.present) return history

  // Same label as the version already on top: replace it rather than stack on it.
  if (label !== undefined && history.label === label) {
    return { past: history.past, present: next, future: [], label }
  }

  const past = [...history.past, history.present]
  return {
    /*
     * `MAX_HISTORY` past documents, plus the present one.
     *
     * The specification said "the last hundred documents" and this keeps a
     * hundred *edits* to go back through, which is one more document in memory
     * and the number a person counts. `12-api.md` says that now.
     */
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
 * Where a component dropped "onto" this key actually goes.
 *
 * `insertNode` gives `children` to whatever it is pointed at, so nesting a
 * component inside a leaf produces a subtree no renderer draws — while
 * `validateForm` and `toJsonSchema` still walk it, so it adds a required field
 * nobody can fill in. Every other insertion path already refused that:
 * `dnd.ts` skips a non-container drop target and `keyboard.ts` refuses to move
 * right into one. The palette's click did not.
 *
 * Refusing is the wrong answer here, though. Clicking a palette entry and
 * having nothing happen is the dead control this project treats as the worst
 * failure, so this walks out to the nearest ancestor that can hold children —
 * which is what an author selecting a field and adding a component means.
 *
 * Whether a node can hold children is asked of the node. A container is
 * instantiated with `children: []` and a leaf is not, so no kit is needed:
 * the same "recognise it from the node" rule `isRowScope` follows.
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
 * How a visibility rule is *shaped*, for the undo label.
 *
 * The operator and how many clauses hang off it. Two edits that leave both alone
 * are somebody typing; one that changes either is a different decision, and the
 * two must not share a history entry.
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
       * `same`, which is core's deep equality, not `JSON.stringify` on both
       * sides.
       *
       * A `ComponentNode` is built by spreading -- `{ ...node, dataKey }` puts
       * the new key last, `{ dataKey, ...node }` puts it first -- so two nodes
       * that are equal in every value could serialise differently, and a no-op
       * edit then took an undo slot and rebuilt every ancestor. `stringify` also
       * drops `undefined` values, so it cannot tell an absent property from one
       * holding `undefined`, which `exactOptionalPropertyTypes` makes a real
       * distinction in this codebase.
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
   * A host's own document, checked once and said out loud.
   *
   * The only in-repo write path is gated by `validateDocument` — the JSON
   * dialog refuses anything that would crash the renderer — and a document
   * restored from a host's storage goes through no gate at all. Duplicate keys
   * then make every tree operation edit the first match, silently.
   *
   * A warning rather than a refusal: a library that will not open a host's own
   * saved document is worse than one that opens it and says what is wrong, and
   * the designer is where somebody goes to repair it.
   */

  const mountedWith = useRef(initial)
  useEffect(() => {
    const problems = validateDocument(mountedWith.current)
    if (problems.length === 0) return
    console.warn(
      'Formsmith: this document does not validate. ' +
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
   * Every other edit, decided out here for the same reason.
   *
   * This ran `mutate` inside the updater, so it never advanced the ref -- and a
   * `setProp` followed by an `addComponent` in one tick therefore left the
   * insert deciding against a document that no longer existed. `mutate` is pure
   * by contract, so running it out here changes nothing about what is written.
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
            // Clearing a property removes it so the component default applies again.
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
              // exactOptionalPropertyTypes: an absent schema is an absent key,
              // not a key holding undefined.
              const { schema: _dropped, ...rest } = node
              return rest
            }
            return { ...node, schema }
          }),
        /*
         * The rule keys too, for the reason above. Every write on the Rules tab
         * shared one label, so adding a rule folded into the preceding run of
         * typing and one undo took away both -- the rule and the message being
         * typed into the rule before it.
         *
         * Typing a rule's value leaves the set of rules alone and still
         * coalesces. Adding or removing one changes it, which is what starts a
         * new entry.
         */

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
      const doc = latest.current
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
      if (findNode(doc.root, trimmed)) {
        return { ok: false, reason: trimmed + ' is already used by another component.' }
      }

      /*
       * And the component being renamed has to exist. It answered `{ok: true}`,
       * moved the selection onto the new name, and committed an entry for an
       * edit that did not happen — reachable whenever the selection names a node
       * an undo has removed, which is an ordinary state rather than a rare one.
       */
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
      /*
       * Answers whether the move happened, for the reason `addComponent` does:
       * every caller announced one unconditionally, and `moveNode` returns the
       * identical root for an illegal move -- so a screen-reader user was told a
       * component moved into a container that will not hold it.
       */
      const doc = latest.current
      const root = moveNode(doc.root, key, parentKey, index)

      /*
       * `moveNode` returns the identical root for an illegal move, and wrapping
       * it in a new document anyway defeated the identity check in `commit` --
       * so a refused drop still grew the undo stack with a state identical to
       * the one before it.
       */
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
      /*
       * `latest.current`, and committed against it, the way `addComponent` does.
       *
       * This read `history.present` out of the render closure, which is a render
       * behind whenever two edits land in one tick -- and `duplicateNode` derives
       * the copy's key from the root it is handed. Two duplications resolved
       * against the same stale root produce two nodes with the same generated key,
       * which is the duplicate-key state that makes every later tree operation
       * edit the first match, silently. The whole point of this callback is to
       * hand back a key nothing else is using.
       */
      const doc = latest.current

      const parent = findParent(doc.root, key)
      if (!parent) return undefined

      const copy = duplicateNode(doc.root, key)
      if (!copy) return undefined

      const index = parent.children?.findIndex((child) => child.key === key) ?? -1
      if (index === -1) return undefined

      // Directly after the original, which is where a duplicate belongs and
      // where the eye is already looking.
      const root = insertNode(doc.root, parent.key, copy, index + 1)

      /*
       * Nothing landed, so nothing is committed, the way every other writer here
       * guards. An insert the tree refused still took a slot in a capped
       * undo stack -- which means a real edit fell off the end of it -- and still
       * moved the selection onto a key that is not in the document.
       */
      if (root === doc.root) return undefined

      /*
       * Through `commitDecided`, which advances the ref -- so the next call in
       * this tick derives its copy's key from a tree that already holds this one.
       * That is what stops two duplications producing one key twice, which is the
       * collision this callback exists to avoid.
       */
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
              // exactOptionalPropertyTypes: absent is an absent key, not a key
              // holding undefined.
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
              // exactOptionalPropertyTypes: absent is an absent key.
              const { css: _dropped, ...rest } = node
              return rest
            }
            return { ...node, css: next }
          }),
        // Coalesced per device, so typing a padding value is one undo entry.
        /*
         * The device, and the *shape* of what is being written. Same reasoning
         * as `setProp` above: within one device a coalesced run of typing and
         * the gesture that clears the box shared a slot, so one undo took both.
         */
        'css:' + key + ':' + device + ':' + (text.trim() === '' ? 'cleared' : 'text'),
      )
    },
    [apply],
  )

  const setDataKey = useCallback(
    (key: string, dataKey: string): RenameResult => {
      const trimmed = dataKey.trim()
      /*
       * The same rule a rename is judged by, which this never applied.
       *
       * A `dataKey` is the name an answer takes in the payload, in exported
       * JSON Schema and in every `ref` a condition writes -- the same jobs a
       * `key` does, judged by the same grammar in `validateDocument`. The panel
       * refused `first-name` as a key and accepted it here, so the panel could
       * write a document its own gate reports as malformed.
       *
       * `renameKey` is the twin and already had the shape: report the reason so
       * the field can show it, rather than storing it or silently doing nothing.
       * Clearing the override is exempt, because an empty value means "use the
       * key" rather than a name to check.
       */
      if (trimmed && trimmed !== key) {
        const problem = keyProblem(trimmed)
        if (problem) return { ok: false, reason: problem }
      }
      apply(
        (doc) =>
          writeNode(doc, key, (node) => {
            if (!trimmed || trimmed === key) {
              // exactOptionalPropertyTypes: no override is an absent key, not a
              // key holding undefined.
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
 * The three pure functions, exported for tests; the hook wraps them.
 *
 * Named `history` at module scope while the hook holds a state variable also
 * called `history`, which is legal and reads badly: two different things with
 * one name in one file. The state is what a reader of the hook means, so the
 * export is the one that changes.
 *
 * This is the only way to assert the half of invariant 4 the hook cannot show.
 * "Undo holds references to prior documents" is a claim about these arrays as
 * much as about the tree -- a `History` React has already rendered from must
 * not change underneath it -- and `useDesigner` never hands a caller the
 * history, so an `undo` written as `past.pop()` returns the same array and
 * every observable answer through the hook is identical.
 */
export const historyOps = { commit, undo, redo }

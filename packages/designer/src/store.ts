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
  Device,
  FieldSchema,
  FormDocument,
  JsonValue,
  Language,
  PropValue,
} from '@formsmith/core'
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
  setDataKey: (key: string, dataKey: string) => RenameResult
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
 * The document with one node rewritten, or the document itself when the rewrite
 * changed nothing.
 *
 * `updateNode` compares by identity and every writer's updater returns a fresh
 * object — `{ ...node, props }` — so the root was always new and `commit`'s own
 * identity check never fired. Setting a property to what it already was
 * therefore took a slot in a capped undo stack, which means a real edit fell
 * off the far end of it.
 *
 * Compared as JSON, on one node. A `ComponentNode` is JSON by construction —
 * that is what makes a document storable — and a node is small, so this costs a
 * few microseconds on the edit path and nothing anywhere else. Comparing whole
 * documents would have been simpler and would have put the same cost on every
 * keystroke.
 */
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

/**
 * The document with a new root, or the document itself when nothing moved.
 *
 * `commit` already refuses to record a document it has seen — by identity — and
 * every writer defeated that by building a fresh one around a root `updateNode`
 * had handed back unchanged. So setting a property to what it already was took
 * a slot in a capped stack, which means a real edit fell off the end of it.
 */
function withRoot(doc: FormDocument, root: ComponentNode): FormDocument {
  return root === doc.root ? doc : { ...doc, root }
}

export function useDesigner(initial: FormDocument): DesignerApi {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] })
  const [chosenKey, setSelectedKey] = useState<string | undefined>(undefined)

  const document = history.present

  /*
   * The selection always names a node that is in the document, or nothing.
   *
   * Every path that removes a node used to clear the selection itself, and each
   * got it slightly wrong: `removeComponent` compared the removed key against
   * the selection, so removing a *container* left the selection on a
   * descendant; undo and redo restored the document and never touched the
   * selection at all. That state — a selection naming a node that is not there
   * — is the precondition for every other bug in this file.
   *
   * Derived rather than reconciled. An effect would leave a render in which the
   * two disagree, and would be a `setState` in an effect besides; this cannot
   * disagree at all, because there is nothing to keep in step.
   */
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
  useEffect(() => {
    const problems = validateDocument(initial)
    if (problems.length === 0) return
    console.warn(
      'Formsmith: this document does not validate. ' +
        problems.map((problem) => problem.message).join(' '),
    )
    // Once, for the document this hook was mounted with.
  }, [initial])

  const latest = useRef(history.present)
  useEffect(() => {
    latest.current = history.present
  }, [history.present])

  const apply = useCallback((mutate: (doc: FormDocument) => FormDocument, label?: string) => {
    setHistory((h) => commit(h, mutate(h.present), label))
  }, [])

  const addComponent = useCallback((def: ComponentDef, parentKey?: string, index?: number) => {
    /*
     * Everything is decided here and the updater only writes. It used to do both
     * in the updater and schedule the selection out of it with `queueMicrotask`,
     * which is a side effect inside a function three lines of its own comment
     * said had to be pure.
     */
    const doc = latest.current
    const node = instantiate(def, doc.root)
    const root = insertNode(doc.root, containerFor(doc.root, parentKey), node, index)

    /*
     * Nothing landed, so nothing is committed and the selection does not move.
     * It used to wrap the result unconditionally, so an insert that matched no
     * parent still took an undo slot — and still selected a key that is not in
     * the document, which is the precondition for the next mistake.
     * `moveComponent` and `removeComponent` have always guarded this.
     */
    if (root === doc.root) return

    /*
     * Committed against the version it was decided on, not against whatever the
     * updater is handed.
     *
     * `commit(h, { ...doc, root })` reads `h` for the history and `doc` for the
     * content, so a second edit arriving between the read of `latest.current`
     * and the updater running was silently overwritten -- the new component
     * landed and the other edit did not, with no sign either way. React batches,
     * and `latest.current` is a ref updated on render, so the two are not the
     * same document as often as this shape assumes.
     *
     * Refused rather than merged: if the document has moved, the insert was
     * decided against a tree that no longer exists and its index means something
     * else. Doing nothing is recoverable; writing the wrong thing is not.
     */
    setHistory((h) => (h.present === doc ? commit(h, { ...doc, root }) : h))
    setSelectedKey(node.key)
  }, [])

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
        // Typing into one property is one undo step, not one per character.
        'prop:' + key + ':' + name,
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
        'schema:' + key + ':' + (schema?.validations ?? []).map((rule) => rule.key).join(','),
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
          /*
           * Both levels guarded. The index happened *before* the `?? {}` that
           * was meant to defend it, so a pasted document with no `translations`
           * threw — inside a state updater, which takes the designer and its
           * whole undo history with it. A bundle that is not an object is the
           * same shape one level down: spreading a string yields a record of
           * its characters.
           */
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

      /*
       * And the component being renamed has to exist. It answered `{ok: true}`,
       * moved the selection onto the new name, and committed an entry for an
       * edit that did not happen — reachable whenever the selection names a node
       * an undo has removed, which is an ordinary state rather than a rare one.
       */
      if (!findNode(history.present.root, key)) {
        return { ok: false, reason: 'There is no component keyed ' + key + ' any more.' }
      }

      /*
       * The key and anything that names it. A `Step` ships with a condition
       * comparing `context.step` against its own key, so renaming one rewrote
       * `node.key` and left the condition naming the old one — the step became
       * unsatisfiable, permanently, with nothing reporting why. `duplicateNode`
       * in core had the same hole from the other side and is fixed the same way.
       */
      apply((doc) =>
        withRoot(
          doc,
          updateNode(doc.root, key, (node) => ({
            ...node,
            key: trimmed,
            ...(node.renderWhen
              ? { renderWhen: repointBinding(node.renderWhen, key, trimmed) }
              : {}),
          })),
        ),
      )
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
        /*
         * The kind is part of the label, and that is the whole fix.
         *
         * Consecutive edits sharing a label replace the entry on top rather than
         * stacking on it, which is right for typing an expression and wrong for
         * changing what kind of rule this is. Every write here shared one label,
         * so choosing "Always" after authoring a condition replaced the version
         * that held the condition -- destroying it in `past` and in `present` at
         * once, so it was reachable by neither undo nor redo. The panel offered
         * no other way back.
         *
         * A label has to name what makes an edit a continuation. Same kind is a
         * continuation; a different kind is a new decision.
         */
        'renderWhen:' + key + ':' + (value?.kind ?? 'none'),
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
        'css:' + key + ':' + device,
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
    setHistory((h) => commit(h, next))
    setSelectedKey(undefined)
  }, [])

  const selectedNode = useMemo(
    () => (selectedKey ? findNode(document.root, selectedKey) : undefined),
    [document, selectedKey],
  )

  /*
   * One object, held across renders.
   *
   * This returned a fresh object with fresh closures every time, so nothing
   * downstream could memoise anything: every keystroke re-rendered the canvas
   * and the tree in full and re-attached the shell's window keydown listener.
   * Every member below is already stable — `useCallback` with empty or narrow
   * dependencies — so the only thing that was changing was the wrapper.
   */
  const undoNow = useCallback(() => setHistory(undo), [])
  const redoNow = useCallback(() => setHistory(redo), [])

  return useMemo(
    () => ({
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
      undo: undoNow,
      redo: redoNow,
    }),
    [
      document,
      selectedKey,
      selectedNode,
      history,
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
 */
export const historyOps = { commit, undo, redo }

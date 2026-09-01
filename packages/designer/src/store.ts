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
  dataKeyOf,
  writersOf,
  repointDataKey,
  flatten,
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
  /**
   * Adds a component, and answers whether anything landed.
   *
   * It returned `void`, so every caller announced an insert unconditionally --
   * including the refusals inside: a definition a kit got wrong, which
   * `instantiate` answers `undefined` for, and an insert the tree itself
   * refuses, which is `insertNode` handing back the root unchanged because the
   * target cannot hold children. A screen-reader user was told a component was
   * added when none was.
   *
   * Not "an insert that matched no parent". `containerFor` falls back to the
   * root for a key it does not find, deliberately, so an unknown parent still
   * lands somewhere -- and the comment claimed a refusal the code does not
   * have.
   */
  addComponent: (def: ComponentDef, parentKey?: string, index?: number) => boolean
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

/**
 * Which kind of binding a property value is, for an undo label.
 *
 * A static value, an expression and a translation key are three different
 * gestures on one control, and `commit` folds consecutive edits that share a
 * label. Without this they shared one, so switching between them replaced the
 * entry holding what was typed rather than stacking on it.
 *
 * `'none'` for a cleared property, which is `ClearButton`'s gesture and has
 * to be distinguishable from typing for exactly the same reason.
 */
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
  /*
   * Once, for the document this hook was mounted with -- and the dependency
   * was `[initial]`, which is not that.
   *
   * `initialDocument` is read once, in a `useState` initializer, and ignored
   * after mount. The effect keyed on it re-ran on every identity change of a
   * prop the hook does not otherwise look at -- and `README.md` documents the
   * pattern `initialDocument={form} onChange={setForm}`, under which `form` is
   * a new object per edit. So a host following the README got a full-document
   * structural walk plus a repeated `console.warn` on every keystroke,
   * describing a document `useDesigner` had already discarded.
   *
   * An empty dependency array says what the comment said. The value read inside
   * is the one from the first render, which is the document this hook is about.
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

  /**
   * Commit a document this callback already decided on.
   *
   * `addComponent` and `moveComponent` used to answer by assigning to a local
   * from inside the `setHistory` updater. React requires an updater to be pure
   * and is free to defer it or run it twice, so the boolean was read before the
   * assignment on any path where React did not eagerly evaluate -- and it worked
   * only because React's eager-state optimisation happens to run it. A value
   * that is right because of an optimisation is a value that is wrong.
   *
   * So the decision is made out here, from `latest.current`, and the updater
   * only writes. `latest.current` advances *now* rather than in the effect
   * below, which closes the other half of the same problem: the ref was a render
   * behind, so two edits in one tick both read the document from before either
   * of them.
   *
   * There is no `h.present !== doc` guard any more, and that is the point rather
   * than a simplification. It could refuse a commit while the caller had already
   * returned `true` and moved the selection -- reintroducing the exact
   * "announced as a success" failure the return value exists to prevent -- and
   * it was reachable: any other writer in the same tick left `latest.current`
   * behind `h.present`. It cannot be right to keep a guard whose firing is
   * itself the bug.
   *
   * What replaces it is that *every* writer below advances the ref, so
   * `latest.current` is always the document as of now and every decision is
   * made against it. The check at the top of this function holds that in
   * place: it throws rather than refusing, because a stale read means a writer
   * skipped the ref, which is a bug in this file and not a race.
   */
  const commitDecided = useCallback((doc: FormDocument, next: FormDocument, label?: string) => {
    /*
     * The caller decided against the document as of now, which is the property
     * the guard used to check for at commit time and could only enforce by
     * refusing. Checked here instead, where a violation is a bug in this file
     * rather than a race: it means a writer changed the history without
     * advancing the ref, which is the one way `latest.current` can fall behind.
     *
     * A throw rather than a refusal, because there is no correct thing to write
     * in that state and silently doing nothing is what this whole area was
     * getting wrong.
     */
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
      /*
       * Everything is decided here and the updater only writes. It used to do both
       * in the updater and schedule the selection out of it with `queueMicrotask`,
       * which is a side effect inside a function three lines of its own comment
       * said had to be pure.
       */
      const doc = latest.current

      /*
       * A definition a kit got wrong produces no node, and no drop.
       *
       * `instantiate` refuses a `ComponentDef` with no usable `type` -- a kit
       * built from JSON can arrive without one -- rather than handing
       * `generateKey` something it will call `.charAt` on. Nothing to insert is
       * the same outcome as an insert the tree refuses, three lines down.
       */
      const node = instantiate(def, doc.root)
      if (!node) return false

      const root = insertNode(doc.root, containerFor(doc.root, parentKey), node, index)

      /*
       * Nothing landed, so nothing is committed and the selection does not move.
       * It used to wrap the result unconditionally, so an insert the tree
       * refused still took an undo slot — and still selected a key that is not
       * in the document, which is the precondition for the next mistake.
       * `moveComponent` and `removeComponent` have always guarded this.
       *
       * Refused by `insertNode`, which hands back the root unchanged when the
       * target cannot hold children. Not "matched no parent": `containerFor`
       * falls back to the root for a key it does not find, so an unknown parent
       * lands rather than refusing.
       */
      if (root === doc.root) return false

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
      /*
       * The selection moves only if the commit landed.
       *
       * `setSelectedKey` ran unconditionally on the next line, so when the
       * document had moved between the read of `latest.current` and the updater,
       * nothing was inserted and the selection still went to a key that is not in
       * the document. `Designer.tsx` then announced "Text added to root." for an
       * insert that did not happen.
       *
       * Decided against the same document the commit was decided against, so the
       * two cannot disagree.
       */
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
        /*
         * Typing into one property is one undo step, not one per character --
         * and the *binding kind* is in the label, which it was not.
         *
         * `commit` replaces the present when the new label matches the last
         * one, so a coalesced run of keystrokes and the gesture that follows it
         * shared a slot: type "Email address" into Label, then switch the Label
         * binding select to Expression, and the same label matched. The present
         * became the empty expression and "Email address" was in neither `past`
         * nor `future` -- destroyed in one step, with Ctrl+Z landing on the
         * empty original and Ctrl+Y returning the empty expression. Reset does
         * the same thing, from the same `onChange`.
         *
         * `Properties.tsx` passes one `onChange` to the text editors, to
         * `ClearButton` and to `BindingMode`, so all three arrive here
         * indistinguishable unless the value says which is which.
         *
         * This file has already fixed this defect twice, and both fixes are the
         * same shape: `setRenderWhen` puts the kind in its label with a comment
         * describing this failure verbatim, and `setFieldSchema` puts the type
         * and rule keys in its own. This was the third site and it was left.
         */
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
        /*
         * The data type and the auto-validate flag are part of the label too.
         *
         * Item 13 put the rule *keys* in it, so adding or removing a rule breaks
         * the run. Changing the field's type -- string to number, which rewrites
         * what every rule means -- and toggling "Validate while typing" still
         * folded into whatever typing came before them, so one undo took a
         * structural change and an unrelated edit together.
         *
         * A label names what makes an edit a continuation. Typing a rule's
         * value is one; changing the shape of the field is not.
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
       * The key, anything that names it *as a step*, and -- now -- anything that
       * reads its answer.
       *
       * The first two were here. A `Step` ships with a condition comparing
       * `context.step` against its own key, so renaming one rewrote `node.key`
       * and left the condition naming the old one, and `repointBinding` fixes
       * that on the renamed node itself.
       *
       * The third was not, and the comment above claimed it was. `dataKeyOf` is
       * `node.dataKey ?? node.key` and `instantiate` never writes a `dataKey`,
       * so a freshly dropped component's answer name *is* its key -- and this
       * moved the answer while every `renderWhen` elsewhere in the document went
       * on naming the old one. The ref reads an answer nothing writes, the
       * condition is false, the component is permanently hidden, and because
       * `renderWhen` gates validation, `validateForm` skips whatever is inside
       * it on the server too. `repointBinding` cannot do this job: it rewrites
       * literals in comparisons that read `context` and says in as many words
       * that it leaves refs alone, because a *copy* shares its source's data key
       * deliberately. A rename is the case where that is false.
       *
       * Only when the renamed node was the sole writer of the name. Two fields
       * behind opposite guards writing one answer is a supported shape, and if
       * another node still writes it every ref still resolves -- rewriting them
       * would break a document that was correct.
       *
       * `docs/decisions.md` records why re-pointing rather than the three other
       * defensible answers.
       */
      const before = findNode(history.present.root, key) as ComponentNode
      const movedName = dataKeyOf(before)
      const alsoWrites = writersOf(history.present.root, movedName).filter(
        (each: string) => each !== key,
      )

      /*
       * Three conditions, and `movedName === key` was standing in for two of
       * them badly.
       *
       * The answer only moves when the node has no `dataKey` of its own, since
       * `dataKeyOf` is `node.dataKey ?? node.key` and an explicit one does not
       * follow the key. `movedName === key` is true for a node whose `dataKey`
       * is spelled out and happens to equal its key -- a shape a host's JSON
       * produces and the designer's own key editor can leave behind -- and for
       * that node the rename moves nothing, so re-pointing every ref would send
       * them all at a name nothing writes. Exactly the defect this code exists
       * to prevent, caused by the fix for it.
       *
       * And a node with no `schema` writes no answer at all, so there is
       * nothing for a ref to have been reading. `writersOf` already tests
       * `node.schema`, which is why `alsoWrites` is empty for one of these and
       * the gate read that emptiness as "sole writer".
       */
      const followsTheRename =
        alsoWrites.length === 0 && before.schema !== undefined && before.dataKey === undefined

      apply((doc) => {
        const renamed = updateNode(doc.root, key, (node) => ({
          ...node,
          key: trimmed,
          ...(node.renderWhen ? { renderWhen: repointBinding(node.renderWhen, key, trimmed) } : {}),
        }))

        if (!followsTheRename) return withRoot(doc, renamed)

        /*
         * Every node's own `renderWhen`, including the renamed one's -- a
         * component may read its own answer through a sibling's guard, and a
         * self-reference is no less dangling than any other.
         */
        let repointed = renamed
        for (const node of flatten(renamed)) {
          if (!node.node.renderWhen) continue
          const next = repointDataKey(node.node.renderWhen, movedName, trimmed)
          if (next === node.node.renderWhen) continue
          repointed = updateNode(repointed, node.node.key, (each) => ({
            ...each,
            renderWhen: next,
          }))
        }

        return withRoot(doc, repointed)
      })
      setSelectedKey((current) => (current === key ? trimmed : current))
      return { ok: true }
    },
    [apply, history.present.root],
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
        /*
         * The shape of the condition too, not only its kind.
         *
         * Item 13 put the kind in the label, so switching to "Always" no longer
         * destroys a condition. Within one kind the run still coalesced
         * everything, so removing a clause from a group folded into the typing
         * that preceded it -- and one undo took the clause and the text back
         * together, which is the same defect one level down.
         *
         * The operator and the clause count are what change structurally; a
         * literal being typed does not move either.
         */
        'renderWhen:' + key + ':' + (value?.kind ?? 'none') + ':' + conditionShape(value),
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

  /*
   * One object, held across renders.
   *
   * This returned a fresh object with fresh closures every time, so nothing
   * downstream could memoise anything: every keystroke re-rendered the canvas
   * and the tree in full and re-attached the shell's window keydown listener.
   * Every member below is already stable — `useCallback` with empty or narrow
   * dependencies — so the only thing that was changing was the wrapper.
   */
  /*
   * These step the history rather than editing the document, so they cannot
   * decide a next document out here -- what they move to depends on the history
   * React holds. The ref is advanced from inside the updater, which is the one
   * place that knows, and it is a write to a ref rather than a decision read
   * back out: the value is not used to answer anything this tick.
   */
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
 *
 * This is the only way to assert the half of invariant 4 the hook cannot show.
 * "Undo holds references to prior documents" is a claim about these arrays as
 * much as about the tree -- a `History` React has already rendered from must
 * not change underneath it -- and `useDesigner` never hands a caller the
 * history, so an `undo` written as `past.pop()` returns the same array and
 * every observable answer through the hook is identical.
 */
export const historyOps = { commit, undo, redo }

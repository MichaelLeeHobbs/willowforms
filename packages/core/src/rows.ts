/**
 * Where a rendered thing sits among repetitions.
 *
 * A `Repeater` draws one authored subtree once per row of data. **Rows never
 * mint keys.** The subtree exists once in the document; a row exists in the DOM,
 * in `FormData` and in `FormErrors`, and never in the tree. That prohibition is
 * what keeps `tree.ts` untouched: every way duplicate keys break it needs the
 * same key at three places in the tree, and it never is.
 *
 * No address string ever appears in a document. Addresses are formed here at the
 * boundary and consumed at the boundary — an error key, a DOM attribute, a read
 * into data. An author never types an index, so there is no path grammar in the
 * document for a later feature to overload, which is how one library ended up
 * with eight flavours of path per component.
 *
 * The grammar parses unambiguously because `KEY_PATTERN` excludes `.`, `[` and
 * `]`. That is the return on holding them back when the key grammar landed.
 */

import { MAX_CONDITION_DEPTH } from './condition.js'
import { keyProblem } from './keys.js'
import { dataKeyOf } from './tree.js'
import type { ComponentNode, Condition, FormData, JsonValue } from './types.js'

/**
 * One repetition.
 *
 * `key` is the repeater's **data** key, not its node key. The coordinate is
 * dereferenced in exactly one place — `applyChange` — and it is dereferenced as
 * data; everywhere else it is a label. Built from identity instead, a repeater
 * whose two names differ discarded every row edit, and could write an answer
 * into an unrelated list that happened to share the name.
 *
 * The **leaf** of an error key stays the node key. The prefix disambiguates
 * rows; the leaf carries identity, and two components may share a data key and
 * still fail for different reasons.
 */
export interface RowFrame {
  key: string
  index: number
}

/** Outermost first, matching document order. Empty means "not in a row". */
export type RowPath = readonly RowFrame[]

/** Not in any row. Frozen, so identity comparisons in a memo hold. */
export const NO_ROWS: RowPath = Object.freeze([])

/** A frame appended, outermost stays first. */
export function pushRow(path: RowPath, frame: RowFrame): RowPath {
  return [...path, frame]
}

/** The innermost repeater's frame, or nothing at the top level. */
export function innermost(path: RowPath): RowFrame | undefined {
  return path[path.length - 1]
}

/**
 * The coordinate as text: `addresses[1].contacts[0]`.
 *
 * Used for `data-fs-row` and as the prefix of an error key. Empty outside a
 * repeater, so every existing selector and error key is byte-identical for a
 * document that has none.
 */
export function encodeRow(path: RowPath): string {
  return path.map((frame) => frame.key + '[' + String(frame.index) + ']').join('.')
}

/**
 * An address for one node under one row path.
 *
 * `street` at the top level, `addresses[1].street` inside a row. This is the
 * error key, and with the repeater's data key rather than its node key it is
 * also where the answer lives.
 */
export function addressOf(path: RowPath, name: string): string {
  const prefix = encodeRow(path)
  return prefix === '' ? name : prefix + '.' + name
}

/*
 * A coordinate segment: a name, then an index in brackets.
 *
 * The index is bounded at fifteen digits. Without a bound, `addresses[1e21]`
 * cannot be written -- but `addresses[1000000000000000000000]` can, and
 * `String(Number(...))` gives it back in exponential form, so a coordinate this
 * decoded no longer re-encoded to itself. Fifteen digits stays inside the
 * integers a double represents exactly, and a list that long is not a list.
 */
const SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)\[(0|[1-9][0-9]{0,14})\]$/

/**
 * A coordinate read back, or nothing if it is not one.
 *
 * Total, and deliberately strict: no sign, no leading zero, no bare name. Only
 * the JSON editor and `validateDocument` need this, never the evaluation path,
 * which is the answer to `readPath`'s objection that a parser is a thing with
 * its own bugs sitting in a security boundary.
 */
export function decodeRow(text: string): RowPath | undefined {
  if (text === '') return NO_ROWS

  const frames: RowFrame[] = []
  for (const part of text.split('.')) {
    const match = SEGMENT.exec(part)
    if (!match) return undefined

    const key = match[1] as string
    if (keyProblem(key)) return undefined
    frames.push({ key, index: Number(match[2]) })
  }
  return frames
}

/** The rows a repeater holds right now, or none when its value is not a list. */
export function rowsOf(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : []
}

/**
 * The row an evaluation is inside: where it sits, and what it holds.
 *
 * Both halves are needed and neither derives the other cheaply. `path` builds
 * the error key and the DOM coordinate; `values` is the row object itself, so a
 * row-scoped read is `valueOf(row.values, dataKey)` and inherits the same
 * own-property rule every other read in this project follows.
 */
export interface RowContext {
  path: RowPath
  values: FormData
}

/** A row's object as a record, or an empty one if the data is not shaped that way. */
export function rowContext(path: RowPath, value: JsonValue | undefined): RowContext {
  const values: FormData =
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return { path, values }
}

/** The two sets of data keys a condition authored on one node can name. */
export interface KeyScopes {
  /** Every answer the top level holds, which is what an absent scope reads. */
  form: string[]
  /**
   * The enclosing row's answers, or absent when the node is not inside a row.
   *
   * Absent and empty mean different things and the panel draws them
   * differently: absent is "there is no row here", empty is "there is a row and
   * it holds nothing else yet".
   */
  row?: string[]
}

/**
 * What a condition authored on this node is allowed to name, by scope.
 *
 * The picker's half of the answer to the quiet failure below. That one reports
 * the mistake at boot; this one stops it being authorable, by telling the panel
 * which names belong to the row and which to the form so that choosing a field
 * is also choosing a scope. An author never types a scope and never leaves one
 * at a default that reads the wrong place.
 *
 * Row keys stop at a nested repeater. The nested repeater's own data key is an
 * answer in this row — it holds the inner list — but what is inside it is one
 * row further down and no ref from here can name it.
 */
export function keyScopesFor(root: ComponentNode, nodeKey: string): KeyScopes {
  const kids = (node: ComponentNode): ComponentNode[] =>
    Array.isArray(node?.children) ? node.children : []

  /** The answers one row of this repeater holds, not counting the list itself. */
  const rowKeysOf = (repeater: ComponentNode): string[] => {
    const names: string[] = []
    const gather = (node: ComponentNode, isRepeater: boolean): void => {
      if (!node || typeof node !== 'object') return
      if (!isRepeater) {
        if (node.schema) names.push(dataKeyOf(node))
        // Its children are answers in *its* rows, not in this one.
        if (isRowScopeNode(node)) return
      }
      for (const child of kids(node)) gather(child, false)
    }
    gather(repeater, true)
    return names
  }

  const form: string[] = []
  let row: string[] | undefined

  const visit = (node: ComponentNode, enclosing: ComponentNode | undefined): void => {
    if (!node || typeof node !== 'object') return
    if (!enclosing && node.schema) form.push(dataKeyOf(node))
    if (node.key === nodeKey && enclosing) row = rowKeysOf(enclosing)
    // The innermost repeater wins, which is what `scope: 'row'` names.
    const deeper = isRowScopeNode(node) ? node : enclosing
    for (const child of kids(node)) visit(child, deeper)
  }
  visit(root, undefined)

  // Deduplicated, because data keys may legally repeat: two fields behind
  // opposite guards can write one answer, and as names to test they are one.
  const unique = (names: string[]): string[] => [...new Set(names)]
  return row === undefined ? { form: unique(form) } : { form: unique(form), row: unique(row) }
}

/**
 * Refs that will read nothing, reported before anyone submits.
 *
 * The failure this exists for is quiet and it is the one this codebase is
 * organised against. A condition authored inside a repeater names a field that
 * only exists in a row, and is left at the default form scope: the read is
 * `undefined`, the condition is false, the component is hidden, and
 * `validateForm` skips it. A required answer becomes advisory, on the server,
 * where nobody is looking.
 *
 * Nothing at evaluation time can fix it — a form-scoped ref to a key the form
 * genuinely does not hold is indistinguishable from this — so it takes the same
 * boot-time answer `missingContext` takes. Unlike context, this one is decidable
 * from the tree alone, so `validateDocument` reports it rather than a host.
 */
/**
 * How deep this will walk before stopping.
 *
 * Same reason as the gate's own bound, and the same number: this runs from
 * `validateDocument`, so an unbounded walk here throws a `RangeError` out of the
 * function whose whole job is never to throw on a document. Stopping quietly is
 * right — the gate has already refused a document this deep, and reporting the
 * depth twice helps nobody.
 */
const MAX_TREE_DEPTH = 500

export function rowScopeProblems(root: ComponentNode): { key: string; problem: string }[] {
  const problems: { key: string; problem: string }[] = []

  /*
   * Total, like everything reachable from `validateDocument`: this walks a
   * document that has not been checked yet, so `children` can be a number and
   * `props` can be a string. Anything unreadable contributes nothing rather
   * than throwing, and the checks above report the malformed shape.
   */
  const kids = (node: ComponentNode): ComponentNode[] =>
    Array.isArray(node?.children) ? node.children : []

  const rowKeys = (node: ComponentNode): Set<string> => {
    const names = new Set<string>()
    const gather = (inner: ComponentNode, depth: number): void => {
      if (depth > MAX_TREE_DEPTH) return
      if (inner !== node && inner?.schema) names.add(dataKeyOf(inner))
      for (const child of kids(inner)) gather(child, depth + 1)
    }
    gather(node, 0)
    return names
  }

  /*
   * Only the form-level answers. Which keys a given row holds is `rowKeys`'s
   * question and it is asked per repeater, so a set of every key inside any
   * repeater was collected here and read by nothing.
   */
  const formKeys = new Set<string>()

  const mark = (node: ComponentNode, repeating: boolean, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
    if (node.schema && !isRowScopeNode(node) && !repeating) {
      formKeys.add(dataKeyOf(node))
    }
    const deeper = repeating || isRowScopeNode(node)
    for (const child of kids(node)) mark(child, deeper, depth + 1)
  }
  mark(root, false, 0)

  /*
   * The refs at one scope, and a reported problem if the walk stopped short.
   *
   * A check that reports problems must never answer "no problem" when what
   * happened was "did not look". Reported once per node, because all three
   * branches below ask the same condition the same question and three identical
   * lines about one component is noise.
   */
  const tooDeep = new Set<string>()
  const refsOf = (
    node: ComponentNode,
    condition: Condition | undefined,
    wanted: 'row' | 'form',
  ): string[] => {
    const { refs, truncated } = refsAtScope(condition, wanted)
    if (truncated && !tooDeep.has(node.key)) {
      tooDeep.add(node.key)
      problems.push({
        key: node.key,
        problem:
          node.key +
          ' holds a condition nested deeper than this library will walk, so its refs ' +
          'could not be checked. The renderer cannot read it either, which leaves the ' +
          'component hidden and never validated.',
      })
    }
    return refs
  }

  const visit = (node: ComponentNode, enclosing: Set<string> | undefined, depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
    if (enclosing) {
      const props =
        node.props && typeof node.props === 'object' && !Array.isArray(node.props)
          ? Object.values(node.props)
          : []

      /*
       * All three places a document holds a condition, which is what
       * `contextKeys` already sweeps. A rule's `when` guard was the one missing,
       * and it is the worst of the three to miss: the failure is not a component
       * quietly disappearing, it is a rule that never applies — on the server,
       * where nobody is looking.
       */
      const guards = Array.isArray(node.schema?.validations)
        ? node.schema.validations.map((rule) => rule?.when)
        : []

      for (const value of [node.renderWhen, ...props, ...guards]) {
        if (!value || typeof value !== 'object' || value.kind !== 'condition') continue
        for (const ref of refsOf(node, value.condition, 'form')) {
          if (enclosing.has(ref) && !formKeys.has(ref)) {
            problems.push({
              key: node.key,
              problem:
                node.key +
                ' tests ' +
                ref +
                ', which only exists inside a row. Set the test to read this row, ' +
                'or it will read nothing and quietly hide the component.',
            })
          }
        }
      }
    }

    /*
     * The mirror case: a `scope: 'row'` ref on a node that is not inside any
     * repeater. It always reads nothing — `operand` answers `undefined` when
     * there is no row — so the condition is false and the component is hidden
     * forever, with nothing about the document looking wrong. Dragging a
     * conditional field out of a repeater produces exactly this.
     */
    if (!enclosing) {
      const props =
        node.props && typeof node.props === 'object' && !Array.isArray(node.props)
          ? Object.values(node.props)
          : []
      const guards = Array.isArray(node.schema?.validations)
        ? node.schema.validations.map((rule) => rule?.when)
        : []

      for (const value of [node.renderWhen, ...props, ...guards]) {
        if (!value || typeof value !== 'object' || value.kind !== 'condition') continue
        for (const ref of refsOf(node, value.condition, 'row')) {
          problems.push({
            key: node.key,
            problem:
              node.key +
              ' tests ' +
              ref +
              " as this row's answer, and it is not inside a repeater. " +
              'That reads nothing, so the component is hidden and never validated.',
          })
        }
      }
    }

    /*
     * The third mismatch, and the last one that can be told apart from a
     * deliberate choice: a `scope: 'row'` ref, inside a repeater, naming a key
     * no node in this row writes while a node outside every repeater does. The
     * read is undefined, the condition is false, the component is hidden and its
     * rules never run — the same silent-permissive ending as the other two,
     * reached by moving a conditional field *into* a repeater instead of out of
     * one.
     *
     * Conservative in the same way as the check above it: reported only when the
     * key demonstrably lives at the other scope. A row's data can carry keys no
     * component authors, so a ref naming a key that exists nowhere in the
     * document is left alone rather than guessed at.
     */
    if (enclosing) {
      const props =
        node.props && typeof node.props === 'object' && !Array.isArray(node.props)
          ? Object.values(node.props)
          : []
      const guards = Array.isArray(node.schema?.validations)
        ? node.schema.validations.map((rule) => rule?.when)
        : []

      for (const value of [node.renderWhen, ...props, ...guards]) {
        if (!value || typeof value !== 'object' || value.kind !== 'condition') continue
        for (const ref of refsOf(node, value.condition, 'row')) {
          if (!enclosing.has(ref) && formKeys.has(ref)) {
            problems.push({
              key: node.key,
              problem:
                node.key +
                ' tests ' +
                ref +
                " as this row's answer, and only the form has that answer. " +
                'That reads nothing, so the component is hidden and never validated.',
            })
          }
        }
      }
    }

    const scope = isRowScopeNode(node) ? rowKeys(node) : enclosing
    for (const child of kids(node)) visit(child, scope, depth + 1)
  }
  visit(root, undefined)

  return problems
}

function isRowScopeNode(node: ComponentNode): boolean {
  return node?.schema?.type === 'array' && Array.isArray(node.children)
}

/**
 * Every data key a condition reads at one scope, however deeply nested.
 *
 * One function with a `wanted` scope rather than two that differ by a single
 * predicate. They were two, character-for-character identical apart from
 * `if (shape.scope === 'row')` reading one way in one and the other way in the
 * other -- so a fix to either was a fix to one side of a symmetry, which is the
 * exact shape the whole of this remediation run exists to remove. Neither was
 * bounded, and both had to be found to know that.
 *
 * Bounded at the depth the evaluator stops at. Past it there is nothing to
 * collect: a ref nested deeper than `MAX_CONDITION_DEPTH` is one `evaluate`
 * never reads, so it cannot be the cause of the silently-hidden component this
 * check reports. `truncated` says the walk stopped, because a caller that
 * reports problems must not report "no problem" when what happened was "did not
 * look".
 */
function refsAtScope(
  condition: Condition | undefined,
  wanted: 'row' | 'form',
): { refs: string[]; truncated: boolean } {
  const refs: string[] = []
  let truncated = false

  const operand = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const shape = value as { kind?: unknown; dataKey?: unknown; scope?: unknown }
    if (shape.kind !== 'ref' || typeof shape.dataKey !== 'string') return
    // Absent means the form, which is what every ref written before repeaters
    // existed already meant.
    const scope = shape.scope === 'row' ? 'row' : 'form'
    if (scope === wanted) refs.push(shape.dataKey)
  }

  const visit = (inner: Condition | undefined, depth: number): void => {
    if (!inner || typeof inner !== 'object') return
    if (depth > MAX_CONDITION_DEPTH) {
      truncated = true
      return
    }
    const shape = inner as Partial<Record<string, unknown>>
    operand(shape['left'])
    operand(shape['right'])
    operand(shape['value'])
    if (Array.isArray(shape['conditions'])) {
      for (const nested of shape['conditions'] as Condition[]) visit(nested, depth + 1)
    }
    visit(shape['condition'] as Condition | undefined, depth + 1)
  }

  visit(condition, 0)
  return { refs, truncated }
}

/** An address split into the rows it sits under and the name at the end. */
export interface ParsedAddress {
  path: RowPath
  name: string
}

/**
 * An address read back, or nothing if it is not one.
 *
 * `postcode` outside a repeater, `addresses[1].postcode` inside one. Total, and
 * only used at the boundary — the host's writer and the JSON editor — never on
 * the evaluation path.
 */
export function decodeAddress(address: string): ParsedAddress | undefined {
  const at = address.lastIndexOf('.')
  if (at === -1) return keyProblem(address) ? undefined : { path: NO_ROWS, name: address }

  const name = address.slice(at + 1)
  if (keyProblem(name)) return undefined

  const path = decodeRow(address.slice(0, at))
  return path ? { path, name } : undefined
}

/**
 * One answer written at an address, immutably.
 *
 * The writer a host uses in `onChange`. For a document with no repeater an
 * address is the data key, so this is `{ ...data, [key]: value }` and a host
 * that never adds one sees no difference. It ships in core so that no host
 * implements array descent, and so a `__proto__` step cannot be handled two
 * different ways in two hosts.
 *
 * Structure-shared: rows the write did not touch keep referential identity, so
 * a kit comparing props by identity still skips them. A write that cannot be
 * placed returns the input unchanged rather than throwing or inventing a slot,
 * which keeps a hostile index from minting a sparse array.
 */
export function applyChange(data: FormData, address: string, value: JsonValue): FormData {
  // `decodeAddress` refuses a reserved or malformed name on both of its
  // branches, so the name is already known good here. It used to be checked
  // twice, which reads as though one of the two might not do it.
  const parsed = decodeAddress(address)
  if (!parsed) return data

  const place = (holder: FormData, depth: number): FormData | undefined => {
    const frame = parsed.path[depth]
    if (!frame) return { ...holder, [parsed.name]: value }

    const list = holder[frame.key]
    if (!Array.isArray(list)) return undefined

    const row = list[frame.index]
    if (row === undefined || row === null || typeof row !== 'object' || Array.isArray(row)) {
      return undefined
    }

    const nextRow = place(row, depth + 1)
    if (!nextRow) return undefined

    const rows = [...list]
    rows[frame.index] = nextRow
    return { ...holder, [frame.key]: rows }
  }

  return place(data, 0) ?? data
}

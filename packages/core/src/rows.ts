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
import { MAX_TREE_DEPTH, dataKeyOf, isRowScope, validationsOf } from './tree.js'
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

    /*
     * Read, not asserted. `match[1] as string` and `Number(match[2])` are true
     * of this regex today and they are the shape `noUncheckedIndexedAccess`
     * exists to stop: `Number(undefined)` is `NaN`, and a frame with a `NaN`
     * index re-encodes as `addresses[NaN]`, an address nothing can resolve.
     */
    const key = match[1]
    const index = match[2]
    if (key === undefined || index === undefined) return undefined
    if (keyProblem(key)) return undefined
    frames.push({ key, index: Number(index) })
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
    const gather = (node: ComponentNode, isRepeater: boolean, depth: number): void => {
      if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
      if (!isRepeater) {
        if (node.schema) names.push(dataKeyOf(node))
        // Its children are answers in *its* rows, not in this one.
        if (isRowScope(node)) return
      }
      for (const child of kids(node)) gather(child, false, depth + 1)
    }
    gather(repeater, true, 0)
    return names
  }

  const form: string[] = []
  let row: string[] | undefined

  let matched = false
  const visit = (
    node: ComponentNode,
    enclosing: ComponentNode | undefined,
    depth: number,
  ): void => {
    if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
    if (!enclosing && node.schema) form.push(dataKeyOf(node))

    if (!matched && node.key === nodeKey) {
      matched = true
      if (enclosing) row = rowKeysOf(enclosing)
    }
    // The innermost repeater wins, which is what `scope: 'row'` names.
    const deeper = isRowScope(node) ? node : enclosing
    for (const child of kids(node)) visit(child, deeper, depth + 1)
  }
  visit(root, undefined, 0)

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
// `MAX_TREE_DEPTH` is imported, not re-declared -- see the import block. The
// docblock that used to sit here belonged to the local constant and documented
// nothing once that went.

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
      /*
       * A nested repeater's own row is a different scope, so its contents are
       * not this row's keys. This descended through them, crediting an outer row
       * with names that live one row further down -- so a `scope: 'row'` ref
       * naming an inner field read as correct from the outer row, where it reads
       * nothing.
       *
       * The repeater node itself is counted, because the *list* is an answer the
       * outer row holds. Only its contents belong to the row below.
       */
      for (const child of kids(inner)) {
        if (isRowScope(child)) {
          if (child.schema) names.add(dataKeyOf(child))
          continue
        }
        gather(child, depth + 1)
      }
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
    if (node.schema && !isRowScope(node) && !repeating) {
      formKeys.add(dataKeyOf(node))
    }
    const deeper = repeating || isRowScope(node)
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

      const guards = validationsOf(node).map((rule) => rule?.when)

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

      for (const rule of validationsOf(node)) {
        if (!rule || typeof rule !== 'object') continue
        if ((rule.key !== 'matches' && rule.key !== 'after') || typeof rule.field !== 'string') {
          continue
        }
        if (rule.scope !== 'row' && enclosing.has(rule.field) && !formKeys.has(rule.field)) {
          problems.push({
            key: node.key,
            problem:
              node.key +
              ' compares with ' +
              rule.field +
              ', which only exists inside this row. Set the comparison scope to row.',
          })
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
      const guards = validationsOf(node).map((rule) => rule?.when)

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

      for (const rule of validationsOf(node)) {
        if (!rule || typeof rule !== 'object') continue
        if ((rule.key === 'matches' || rule.key === 'after') && rule.scope === 'row') {
          problems.push({
            key: node.key,
            problem:
              node.key +
              ' compares with ' +
              rule.field +
              " as this row's answer, but it is not inside a repeater.",
          })
        }
      }
    }

    if (enclosing) {
      const props =
        node.props && typeof node.props === 'object' && !Array.isArray(node.props)
          ? Object.values(node.props)
          : []
      const guards = validationsOf(node).map((rule) => rule?.when)

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

      for (const rule of validationsOf(node)) {
        if (!rule || typeof rule !== 'object') continue
        if (
          (rule.key === 'matches' || rule.key === 'after') &&
          rule.scope === 'row' &&
          typeof rule.field === 'string' &&
          !enclosing.has(rule.field) &&
          formKeys.has(rule.field)
        ) {
          problems.push({
            key: node.key,
            problem:
              node.key +
              ' compares with ' +
              rule.field +
              " as this row's answer, but only the form has that answer.",
          })
        }
      }
    }

    const scope = isRowScope(node) ? rowKeys(node) : enclosing
    for (const child of kids(node)) visit(child, scope, depth + 1)
  }
  visit(root, undefined)

  return problems
}

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

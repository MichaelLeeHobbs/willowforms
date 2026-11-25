/**
 * Rows never mint keys: a row exists in the DOM, `FormData` and `FormErrors`,
 * never in the tree. See docs/spec/03-components.md, "Rows never mint keys".
 *
 * The coordinate grammar parses unambiguously only because `KEY_PATTERN`
 * excludes `.`, `[` and `]`.
 */

import { MAX_CONDITION_DEPTH } from './condition.js'
import { keyProblem } from './keys.js'
import { MAX_TREE_DEPTH, childNodesOf, dataKeyOf, isRowScope, validationsOf } from './tree.js'
import type { ComponentNode, Condition, FormData, JsonValue } from './types.js'

/**
 * One repetition.
 *
 * `key` is the repeater's **data** key, not its node key. The coordinate is
 * dereferenced in exactly one place — `applyChange` — and it is dereferenced as
 * data; everywhere else it is a label.
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

/**
 * What a computed expression reads: the form's answers, with the enclosing row's
 * answers over them.
 */
// eslint-disable-next-line no-restricted-syntax -- the one definition; the rule refuses copies.
export function expressionData(data: FormData, row: RowContext | undefined): FormData {
  return row ? { ...data, ...row.values } : data
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

/** The picker and validation must agree on these keys. */
function gatherKeys(node: ComponentNode, names: Set<string>, depth: number): void {
  if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
  if (node.schema) names.add(dataKeyOf(node))
  if (isRowScope(node)) return
  for (const child of childNodesOf(node)) gatherKeys(child, names, depth + 1)
}

function formKeysOf(root: ComponentNode): Set<string> {
  const names = new Set<string>()
  gatherKeys(root, names, 0)
  return names
}

function rowKeysOf(repeater: ComponentNode): Set<string> {
  const names = new Set<string>()
  for (const child of childNodesOf(repeater)) gatherKeys(child, names, 1)
  return names
}

/**
 * What a condition authored on this node is allowed to name, by scope.
 *
 * `validateDocument` reports scope mismatches under the `row-scope` code; this
 * keeps the panel from offering one, by telling it which names belong to the row
 * and which to the form so that choosing a field is also choosing a scope. An
 * author never types a scope and never leaves one at a default that reads the
 * wrong place.
 *
 * Row keys stop at a nested repeater. The nested repeater's own data key is an
 * answer in this row — it holds the inner list — but what is inside it is one
 * row further down and no ref from here can name it.
 */
export function keyScopesFor(root: ComponentNode, nodeKey: string): KeyScopes {
  const form = [...formKeysOf(root)]
  let row: string[] | undefined

  let matched = false
  const visit = (
    node: ComponentNode,
    enclosing: ComponentNode | undefined,
    depth: number,
  ): void => {
    if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
    if (!matched && node.key === nodeKey) {
      matched = true
      if (enclosing) row = [...rowKeysOf(enclosing)]
    }
    // The innermost repeater wins, which is what `scope: 'row'` names.
    const deeper = isRowScope(node) ? node : enclosing
    for (const child of childNodesOf(node)) visit(child, deeper, depth + 1)
  }
  visit(root, undefined, 0)

  return row === undefined ? { form } : { form, row }
}

/**
 * Total: `validateDocument` calls this on an unchecked document, so anything unreadable
 * contributes nothing.
 */
export function rowScopeProblems(root: ComponentNode): { key: string; problem: string }[] {
  const problems: { key: string; problem: string }[] = []

  const formKeys = formKeysOf(root)

  // A truncated walk is reported, never passed as clean.
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

  const visit = (node: ComponentNode, rows: readonly Set<string>[], depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
    const enclosing = rows[rows.length - 1]

    const onlyInOuterRow = (name: string): boolean =>
      !formKeys.has(name) && !enclosing?.has(name) && rows.some((row) => row.has(name))

    const reportOuterRow = (verb: string, name: string): void => {
      problems.push({
        key: node.key,
        problem:
          node.key +
          ' ' +
          verb +
          ' ' +
          name +
          ', which only an outer row holds. Nothing inside a nested row can read an outer row, ' +
          'so this reads nothing. Move the component into that row, or name an answer this row ' +
          'or the form holds.',
      })
    }

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
          } else if (onlyInOuterRow(ref)) {
            reportOuterRow('tests', ref)
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
        } else if (onlyInOuterRow(rule.field)) {
          // Both scopes end here, so the row-scope branch below leaves this out.
          reportOuterRow('compares with', rule.field)
        }
      }
    }

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
          } else if (onlyInOuterRow(ref)) {
            reportOuterRow('tests', ref)
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

    const inner = isRowScope(node) ? [...rows, rowKeysOf(node)] : rows
    for (const child of childNodesOf(node)) visit(child, inner, depth + 1)
  }
  visit(root, [])

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
  // Refuses reserved and malformed names, which `place` writes unchecked.
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

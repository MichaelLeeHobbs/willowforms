/**
 * JSON Schema export.
 *
 * JSON Schema is an export format here, never storage. It cannot express layout
 * or nesting, and layout is half of what a visual builder produces, so the tree
 * stays the source of truth and this is a one-way projection of it. See
 * docs/ARCHITECTURE.md.
 *
 * What comes out describes the submitted data: `FormData` is flat, keyed by
 * data key -- `dataKeyOf(node)`, which is `node.dataKey ?? node.key` -- so the
 * schema is a flat object of the names an answer is submitted under, regardless
 * of how deeply the components nest. A repeater is the one nesting that
 * survives, because its rows are.
 */

import { MAX_TREE_DEPTH, dataKeyOf, validationsOf, walk } from './tree.js'
import { isRowScope } from './validation.js'
import type {
  ComponentNode,
  FieldSchema,
  FormDocument,
  PropValue,
  ValidationRule,
} from './types.js'

export interface JsonSchemaProperty {
  type?: string
  format?: string
  title?: string
  minLength?: number
  maxLength?: number
  /**
   * The list keywords, for the same two rules on a field that holds one.
   *
   * `minLength` on an `array` is ignored by every validator, and `lengthOf` in
   * `validation.ts` counts an array's items — so a multi-select with
   * `minLength: 2` means two choices and used to export a constraint nothing
   * read.
   */
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  pattern?: string
  items?: JsonSchemaProperty
  /**
   * A repeater's rows are objects, so `items` carries their shape.
   *
   * Repetition is the one structural thing JSON Schema expresses natively, and
   * a row's `required` belongs here rather than on the document: those fields
   * are required *of each row*, not of the payload.
   */
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  /** Draft 2020-12 keyword, used for file fields. */
  contentEncoding?: string
}

export interface JsonSchema {
  $schema: string
  type: 'object'
  title?: string
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

const DRAFT = 'https://json-schema.org/draft/2020-12/schema'

/**
 * Rules that JSON Schema has no vocabulary for.
 *
 * `custom` is arbitrary JavaScript, and any rule carrying a `when` guard applies
 * conditionally, which no keyword expresses. Both are dropped from the export,
 * so callers that need to know theirs is lossy can ask.
 */
export function unexportableRules(document: FormDocument): { key: string; rule: string }[] {
  const lossy: { key: string; rule: string }[] = []

  /*
   * One walk. This was three, each visiting every node to answer a different
   * question, and the three shared no state that forced the separation -- and
   * the JSON dialog calls this unmemoized in its component body, so the cost
   * was paid three times on every render of a document a person is reading.
   *
   * The order of the questions is preserved, because the order they are pushed
   * in is the order the dialog lists them.
   */
  const FORMAT_RULES = new Set(['email', 'url', 'uuid'])
  const claimed = new Set<string>()

  walk(document.root, (node) => {
    for (const rule of validationsOf(node)) {
      // Arbitrary JavaScript has no declarative equivalent at all.
      if (rule.key === 'custom') {
        lossy.push({ key: node.key, rule: rule.key })
        continue
      }
      /*
       * A rule that applies only sometimes, and no keyword expresses that. Two
       * ways a rule gets there: its own guard, or a `renderWhen` on the node
       * that holds it. The second was missing, so a required field behind a
       * condition exported as unconditionally required and the dialog reported
       * the export as lossless.
       */
      if (rule.when || node.renderWhen !== undefined) {
        lossy.push({ key: node.key, rule: rule.key })
      }
    }

    /*
     * Two format rules on one field collapse, one level down. `email`, `url`
     * and `uuid` each write `format`, and a property has one, so a field
     * carrying two of them exported only the last -- silently, while the dialog
     * called the export lossless. Which of two formats an answer really has is
     * not a question this can answer.
     */
    const formats = validationsOf(node).filter((rule) => FORMAT_RULES.has(rule.key))
    for (const rule of formats.slice(0, -1)) {
      lossy.push({ key: node.key, rule: rule.key })
    }

    /*
     * Two components submitting one answer collapse in the export, and the
     * collapse is silent. Sharing a `dataKey` is deliberate and documented --
     * two fields behind opposite guards write one answer -- but a JSON Schema
     * property is one property, so the last one visited wins and the first's
     * type, format and constraints are discarded. Reported rather than
     * resolved, for the same reason.
     */
    if (!node.schema) return
    const name = dataKeyOf(node)
    if (claimed.has(name)) lossy.push({ key: node.key, rule: 'a schema for ' + name })
    claimed.add(name)
  })

  return lossy
}

/** The JSON Schema type and format for a field's declared data type. */
function baseType(type: FieldSchema['type']): JsonSchemaProperty {
  switch (type) {
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'date':
      return { type: 'string', format: 'date' }
    case 'array':
      return { type: 'array', items: {} }
    case 'object':
      return { type: 'object' }
    case 'file':
      // No file type exists; a base64 payload is the conventional stand-in.
      return { type: 'string', contentEncoding: 'base64' }
    case 'string':
    default:
      return { type: 'string' }
  }
}

/**
 * Fold one rule into the property it constrains.
 *
 * `minLength` and `maxLength` are the two whose keyword depends on what the
 * field holds. `lengthOf` in `validation.ts` counts an array's items, so a
 * multi-select with `minLength: 2` means two choices — but `minLength` on an
 * `array` is ignored by every JSON Schema validator, which drops a constraint
 * the form does enforce. The keyword for a list is `minItems`.
 */
function withRule(property: JsonSchemaProperty, rule: ValidationRule): JsonSchemaProperty {
  const counting = property.type === 'array'
  /*
   * `minLength` on a number or a boolean is not a length at all.
   *
   * The choice was between the item keywords and the length keywords, decided by
   * whether the type is `array` -- so a `minLength` rule on a `number` field
   * exported `minLength`, which JSON Schema defines for strings only and every
   * validator ignores. The form enforces the rule and the exported schema drops
   * it, silently, which is the direction that matters: a server validating
   * against the export accepts what the form refused.
   *
   * `unexportableRules` is where a rule that cannot be expressed is reported, so
   * this returns the property unchanged and lets that reporting stand.
   */
  const measurable = property.type === 'array' || property.type === 'string'

  switch (rule.key) {
    case 'minLength':
      if (!measurable) return property
      return counting
        ? { ...property, minItems: rule.value }
        : { ...property, minLength: rule.value }
    case 'maxLength':
      if (!measurable) return property
      return counting
        ? { ...property, maxItems: rule.value }
        : { ...property, maxLength: rule.value }
    case 'min':
      return { ...property, minimum: rule.value }
    case 'max':
      return { ...property, maximum: rule.value }
    case 'pattern':
      return { ...property, pattern: rule.value }
    case 'email':
      return { ...property, format: 'email' }
    case 'url':
      return { ...property, format: 'uri' }
    case 'uuid':
      return { ...property, format: 'uuid' }
    // `required` is a keyword on the parent object, not the property, and
    // `custom` has no declarative equivalent at all.
    case 'required':
    case 'custom':
    default:
      return property
  }
}

/** A component's static `label`, if it has one, for the property title. */
function titleOf(node: ComponentNode): string | undefined {
  /*
   * Guarded, because `props` can be anything. `validateDocument` reports a
   * malformed `props` and reporting is not refusing: a host that exports a
   * schema from a document it never gated, or gated and chose to keep, reached
   * here and threw on `undefined['label']` -- in the JSON dialog, which is the
   * one place somebody is looking at a broken document on purpose.
   */
  const props: unknown = node.props
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined

  /*
   * Own properties only, the way `valueOf` and `readPath` read a document.
   *
   * A plain lookup finds the prototype: `props` arriving with a non-null
   * prototype that carries `label`, or an application that has polluted
   * `Object.prototype.label`, gave every untitled field the same inherited
   * title in the export. This function's whole job is hardening against a
   * `props` that is not what it claims.
   */
  const held = props as Record<string, PropValue | undefined>
  const own = (name: string): PropValue | undefined =>
    Object.hasOwn(held, name) ? held[name] : undefined
  const label = own('label') ?? own('text')
  if (label?.kind === 'static' && typeof label.value === 'string' && label.value) return label.value
  return undefined
}

export function toJsonSchema(document: FormDocument): JsonSchema {
  /*
   * A root that is itself a repeater keeps its rows.
   *
   * `objectFor` skips the node it is given -- it exists to describe that node's
   * *children* -- which is right for a screen and wrong for a repeater: the
   * root's rows were flattened to the top level and the array disappeared, so
   * the export named a row's fields as the document's own. That is the exact
   * failure `objectFor`'s comment says is silent and was already fixed once,
   * one level up from where it was fixed.
   *
   * The root is always a container and a repeater is a container, so this is
   * reachable from any imported document.
   */
  if (isRowScope(document.root)) {
    const row = objectFor(document.root)
    const items: JsonSchemaProperty = { type: 'object', properties: row.properties }
    if (row.required.length > 0) items.required = row.required

    const rows: JsonSchemaProperty = { type: 'array', items }
    const name = dataKeyOf(document.root)
    const schema: JsonSchema = {
      $schema: DRAFT,
      type: 'object',
      properties: { ...{ [name]: rows } },
    }
    if (document.name) schema.title = document.name
    return schema
  }

  const shape = objectFor(document.root)

  const schema: JsonSchema = { $schema: DRAFT, type: 'object', properties: shape.properties }
  if (document.name) schema.title = document.name
  if (shape.required.length > 0) schema.required = shape.required
  return schema
}

/**
 * One object's worth of the projection: a form, or one row of a repeater.
 *
 * Nesting is layout and does not reach the payload, so a `Stack` contributes
 * its children flat. Repetition is cardinality, which is the one structural
 * thing JSON Schema does express, so a repeater contributes an `array` whose
 * `items` is the object its own children describe — and its rows' `required`
 * lands inside `items`, never on the document.
 *
 * Getting this wrong is silent. The flat projection named a repeater's fields
 * at the top level, so a server validating a real payload against the exported
 * schema would reject every submission or accept anything.
 */
function objectFor(root: ComponentNode): {
  properties: Record<string, JsonSchemaProperty>
  required: string[]
} {
  /*
   * No prototype, the twin item 1 named and left here.
   *
   * `properties[name] = property` for a `dataKey` of `__proto__` runs the
   * inherited setter and adds no own property, so the field vanishes from the
   * exported schema -- and a server validating a payload against that export
   * then has no constraint for it at all. Plain assignment rather than a
   * coalesce, so this is quieter than `validateAcross` was and reaches the same
   * place: `submittedData` and `validateForm` both build on a null prototype for
   * exactly this reason, and the export did not.
   *
   * Spread into a plain object on the way out, like `submittedData` does: spread
   * defines own properties rather than invoking the setter, so the schema a
   * caller receives is an ordinary object that still holds the key.
   */
  const properties: Record<string, JsonSchemaProperty> = Object.create(null) as Record<
    string,
    JsonSchemaProperty
  >
  const required: string[] = []

  const visit = (node: ComponentNode, depth = 0): void => {
    // The same bound `validateDocument` walks a tree with. An export runs on a
    // document a host may never have gated, and a `RangeError` out of it is a
    // 500 on a route whose whole job is to hand over a schema.
    if (depth > MAX_TREE_DEPTH) return

    // Only data-bound components carry a schema, and only they appear in the
    // submitted data. Layout and display components are not in the projection.
    const field = node.schema
    if (!field) {
      for (const child of node.children ?? []) visit(child, depth + 1)
      return
    }

    let property = baseType(field.type)
    const title = titleOf(node)
    if (title) property = { ...property, title }

    // The submitted name, which is the node's key unless the author renamed it.
    const name = dataKeyOf(node)

    /*
     * A node the document can hide is a node whose rules apply only sometimes,
     * which is the same fact a guarded rule states one level down. JSON Schema's
     * `required` is unconditional, so exporting it rejects payloads the form
     * itself accepts — `validateForm` does not require a field `isVisible` says
     * is not on screen.
     *
     * Read from the node rather than from the rule, and `renderWhen` present at
     * all is enough: a static `true` is a document that could hold anything
     * tomorrow, and the export is not the place to start evaluating conditions.
     */
    const conditional = node.renderWhen !== undefined

    for (const rule of validationsOf(node)) {
      property = withRule(property, rule)
      /*
       * Only an unguarded `required` becomes a schema requirement. A guarded one
       * applies sometimes, and JSON Schema's `required` is unconditional, so
       * exporting it would reject payloads the form itself accepts.
       */
      if (rule.key === 'required' && !rule.when && !conditional && !required.includes(name)) {
        required.push(name)
      }
    }

    if (isRowScope(node)) {
      const row = objectFor(node)
      const items: JsonSchemaProperty = { type: 'object', properties: row.properties }
      if (row.required.length > 0) items.required = row.required
      properties[name] = { ...property, items }
      return
    }

    properties[name] = property
    for (const child of node.children ?? []) visit(child)
  }

  /*
   * Either the root is itself a field -- `validateForm(stepNode, data)` hands
   * this a subtree, and that subtree can carry a schema -- or it is a container
   * whose children are the fields. Visiting the root and then its children
   * walked every child twice, once directly and once through the root, which
   * doubled the work and made the "two components claim one answer" check below
   * report a node as colliding with itself.
   */
  if (root.schema && !isRowScope(root)) visit(root)
  else for (const child of root.children ?? []) visit(child)

  // Spread on the way out, so a caller gets an ordinary object that still
  // holds a key named after something on `Object.prototype`.
  return { properties: { ...properties }, required }
}

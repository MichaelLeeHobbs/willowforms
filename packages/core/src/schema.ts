/**
 * A one-way projection of the submitted data, never storage. See
 * docs/ARCHITECTURE.md.
 */

import { MAX_TREE_DEPTH, childNodesOf, dataKeyOf, flatten, validationsOf, walk } from './tree.js'
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
  const?: boolean
  format?: string
  title?: string
  minLength?: number
  maxLength?: number

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
  /** Optional encoding annotation for host-authored schemas; not inferred from a file field. */
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

function conditionalKeys(root: ComponentNode): Set<string> {
  const keys = new Set<string>()
  for (const { node, parentKey } of flatten(root)) {
    if (node.renderWhen !== undefined || (parentKey !== undefined && keys.has(parentKey)))
      keys.add(node.key)
  }
  return keys
}

/**
 * Rules that JSON Schema has no vocabulary for.
 *
 * `custom` is arbitrary JavaScript, and any rule carrying a `when` guard applies
 * conditionally, which no keyword expresses. Both are dropped from the export,
 * so callers that need to know theirs is lossy can ask.
 */
export function unexportableRules(document: FormDocument): { key: string; rule: string }[] {
  const lossy: { key: string; rule: string }[] = []
  const conditional = conditionalKeys(document.root)

  const FORMAT_RULES = new Set(['email', 'url', 'uuid'])
  const claimed = new Set<string>()

  walk(document.root, (node) => {
    for (const rule of validationsOf(node)) {
      if (rule.key === 'custom' || rule.key === 'matches' || rule.key === 'after') {
        lossy.push({ key: node.key, rule: rule.key })
        continue
      }

      if (rule.when || conditional.has(node.key)) {
        lossy.push({ key: node.key, rule: rule.key })
        continue
      }

      // A measuring rule on a type `withRule` exports no keyword for. The form still
      // enforces it, so the loss has to be reported.
      // Asked on the exported type, as `withRule` asks it: `date` and `file` export as
      // `string`.
      const exported = node.schema ? baseType(node.schema.type).type : undefined
      const lengthy = exported === 'string' || exported === 'array'
      const numeric = exported === 'number'

      if ((rule.key === 'minLength' || rule.key === 'maxLength') && !lengthy) {
        lossy.push({ key: node.key, rule: rule.key })
        continue
      }
      if ((rule.key === 'minItems' || rule.key === 'maxItems') && exported !== 'array') {
        lossy.push({ key: node.key, rule: rule.key })
        continue
      }
      if ((rule.key === 'min' || rule.key === 'max') && !numeric) {
        lossy.push({ key: node.key, rule: rule.key })
      }
    }

    // `email`, `url` and `uuid` each write `format`, and a property has one, so
    // all but the last are lost.
    const formats = validationsOf(node).filter((rule) => FORMAT_RULES.has(rule.key))
    for (const rule of formats.slice(0, -1)) {
      lossy.push({ key: node.key, rule: rule.key })
    }

    // Sharing a `dataKey` is legal (opposite guards writing one answer), but a
    // JSON Schema property is one property, so the last one visited wins.
    if (!node.schema) return
    const name = dataKeyOf(node)
    if (claimed.has(name)) lossy.push({ key: node.key, rule: 'a schema for ' + name })
    claimed.add(name)
  })

  return lossy
}

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
    case 'string':
    default:
      return { type: 'string' }
  }
}

/**
 * `lengthOf` in `validation.ts` counts an array's items, and JSON Schema ignores
 * `minLength` on an array, so a length rule on a list becomes `minItems`.
 */
function withRule(property: JsonSchemaProperty, rule: ValidationRule): JsonSchemaProperty {
  const counting = property.type === 'array'

  const measurable = property.type === 'array' || property.type === 'string'

  const comparable = property.type === 'number' || property.type === 'integer'

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
    case 'minItems':
      return property.type === 'array' ? { ...property, minItems: rule.value } : property
    case 'maxItems':
      return property.type === 'array' ? { ...property, maxItems: rule.value } : property
    case 'min':
      if (!comparable) return property
      return { ...property, minimum: rule.value }
    case 'max':
      if (!comparable) return property
      return { ...property, maximum: rule.value }
    case 'pattern':
      return { ...property, pattern: rule.value }
    case 'email':
      return { ...property, format: 'email' }
    case 'url':
      return { ...property, format: 'uri' }
    case 'uuid':
      return { ...property, format: 'uuid' }
    // `required` belongs to the parent object; the others have no keyword.
    case 'required':
    case 'matches':
    case 'after':
    case 'custom':
    default:
      return property
  }
}

function titleOf(node: ComponentNode): string | undefined {
  const props: unknown = node.props
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined

  // Own properties only, as `valueOf` and `readPath` read: a polluted or
  // non-null prototype must not supply a `label`.
  const held = props as Record<string, PropValue | undefined>
  const own = (name: string): PropValue | undefined =>
    Object.hasOwn(held, name) ? held[name] : undefined
  const label = own('label') ?? own('text')
  if (label?.kind === 'static' && typeof label.value === 'string' && label.value) return label.value
  return undefined
}

export function toJsonSchema(document: FormDocument): JsonSchema {
  if (!document.root || typeof document.root !== 'object') {
    return { $schema: DRAFT, type: 'object', properties: {} }
  }

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

/** A row's `required` belongs inside its `items`, never on the document. */
function objectFor(
  root: ComponentNode,

  from = 0,
  conditional = conditionalKeys(root),
): {
  properties: Record<string, JsonSchemaProperty>
  required: string[]
} {
  const properties: Record<string, JsonSchemaProperty> = Object.create(null) as Record<
    string,
    JsonSchemaProperty
  >
  const required: string[] = []

  const visit = (node: ComponentNode, depth: number): void => {
    // The document may be ungated, so the walk is bounded like `validateDocument`.
    if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return

    const field = node.schema
    if (!field) {
      for (const child of childNodesOf(node)) visit(child, depth + 1)
      return
    }

    let property = baseType(field.type)
    const title = titleOf(node)
    if (title) property = { ...property, title }

    const name = dataKeyOf(node)

    /*
     * A guarded rule, or any rule on a node `renderWhen` can hide, applies only
     * sometimes, and JSON Schema's `required` is unconditional. Any `renderWhen`
     * counts, even a static `true`: the export does not evaluate conditions.
     */
    for (const rule of validationsOf(node)) {
      if (rule.when || conditional.has(node.key)) continue
      property = withRule(property, rule)
      if (rule.key === 'required') {
        if (!required.includes(name)) required.push(name)
        if (property.type === 'boolean') property = { ...property, const: true }
      }
    }

    if (isRowScope(node)) {
      const row = objectFor(node, depth + 1, conditional)
      const items: JsonSchemaProperty = { type: 'object', properties: row.properties }
      if (row.required.length > 0) items.required = row.required
      properties[name] = { ...property, items }
      return
    }

    properties[name] = property
    for (const child of childNodesOf(node)) visit(child, depth + 1)
  }

  // The document's root can itself be a field. Visiting it and then its children too
  // would walk every child twice.
  // Seeded from the caller's depth so nested repeaters share one bound.
  if (root.schema && !isRowScope(root)) visit(root, from)
  else for (const child of childNodesOf(root)) visit(child, from)

  // Spread on the way out, so a caller gets an ordinary object that still
  // holds a key named after something on `Object.prototype`.
  return { properties: { ...properties }, required }
}

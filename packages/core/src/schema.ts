/**
 * JSON Schema export.
 *
 * JSON Schema is an export format here, never storage. It cannot express layout
 * or nesting, and layout is half of what a visual builder produces, so the tree
 * stays the source of truth and this is a one-way projection of it. See
 * docs/ARCHITECTURE.md.
 *
 * What comes out describes the submitted data: `FormData` is flat, keyed by
 * component key, so the schema is a flat object regardless of how deeply the
 * components nest.
 */

import { dataKeyOf, walk } from './tree.js'
import { isRowScope } from './validation.js'
import type { ComponentNode, FieldSchema, FormDocument, ValidationRule } from './types.js'

export interface JsonSchemaProperty {
  type?: string
  format?: string
  title?: string
  minLength?: number
  maxLength?: number
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
  walk(document.root, (node) => {
    for (const rule of node.schema?.validations ?? []) {
      // Arbitrary JavaScript has no declarative equivalent at all.
      if (rule.key === 'custom') {
        lossy.push({ key: node.key, rule: rule.key })
        continue
      }
      // A guarded rule applies only sometimes, and no keyword expresses that.
      if (rule.when) lossy.push({ key: node.key, rule: rule.key })
    }
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

/** Fold one rule into the property it constrains. */
function applyRule(property: JsonSchemaProperty, rule: ValidationRule): JsonSchemaProperty {
  switch (rule.key) {
    case 'minLength':
      return { ...property, minLength: rule.value }
    case 'maxLength':
      return { ...property, maxLength: rule.value }
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
  const label = node.props['label'] ?? node.props['text']
  if (label?.kind === 'static' && typeof label.value === 'string' && label.value) return label.value
  return undefined
}

export function toJsonSchema(document: FormDocument): JsonSchema {
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
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []

  const visit = (node: ComponentNode): void => {
    // Only data-bound components carry a schema, and only they appear in the
    // submitted data. Layout and display components are not in the projection.
    const field = node.schema
    if (!field) {
      for (const child of node.children ?? []) visit(child)
      return
    }

    let property = baseType(field.type)
    const title = titleOf(node)
    if (title) property = { ...property, title }

    // The submitted name, which is the node's key unless the author renamed it.
    const name = dataKeyOf(node)

    for (const rule of field.validations) {
      property = applyRule(property, rule)
      /*
       * Only an unguarded `required` becomes a schema requirement. A guarded one
       * applies sometimes, and JSON Schema's `required` is unconditional, so
       * exporting it would reject payloads the form itself accepts.
       */
      if (rule.key === 'required' && !rule.when && !required.includes(name)) {
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

  for (const child of root.children ?? []) visit(child)
  if (root.schema && !isRowScope(root)) visit(root)
  return { properties, required }
}

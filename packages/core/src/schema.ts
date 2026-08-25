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

import { walk } from './tree.js'
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
 * `custom` is arbitrary JavaScript, so nothing in a declarative schema can carry
 * it. Callers that need to know their export is lossy can ask.
 */
export function unexportableRules(document: FormDocument): { key: string; rule: string }[] {
  const lossy: { key: string; rule: string }[] = []
  walk(document.root, (node) => {
    for (const rule of node.schema?.validations ?? []) {
      if (rule.key === 'custom') lossy.push({ key: node.key, rule: rule.key })
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
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []

  walk(document.root, (node) => {
    // Only data-bound components carry a schema, and only they appear in the
    // submitted data. Layout and display components are not in the projection.
    const field = node.schema
    if (!field) return

    let property = baseType(field.type)
    const title = titleOf(node)
    if (title) property = { ...property, title }

    for (const rule of field.validations) {
      property = applyRule(property, rule)
      if (rule.key === 'required' && !required.includes(node.key)) required.push(node.key)
    }

    properties[node.key] = property
  })

  const schema: JsonSchema = { $schema: DRAFT, type: 'object', properties }
  if (document.name) schema.title = document.name
  if (required.length > 0) schema.required = required
  return schema
}

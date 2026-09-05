import { createDocument, emptyRoot, instantiate, prop } from '@formsmith/core'
import type { ComponentNode, FormDocument, JsonValue, ValidationRule } from '@formsmith/core'
import { htmlKit } from '@formsmith/kit-html'

export function node(
  type: string,
  key: string,
  values: Record<string, JsonValue> = {},
  children?: ComponentNode[],
): ComponentNode {
  const definition = htmlKit.components.find((entry) => entry.type === type)
  const result = definition && instantiate(definition, emptyRoot())
  if (!result) throw new Error('Unknown example component: ' + type)
  result.key = key
  result.props = {
    ...result.props,
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, prop(v)])),
  }
  if (children) result.children = children
  if (type === 'Heading')
    result.css = {
      any: `font-size: ${values['level'] === 'h1' ? '32' : '24'}px; line-height: 1.25; font-weight: 600;`,
    }
  return result
}

export function field(
  type: string,
  key: string,
  label: string,
  rules: ValidationRule[] = [],
  values: Record<string, JsonValue> = {},
): ComponentNode {
  const result = node(type, key, { label, ...values })
  if (!result.schema) throw new Error('Not a field: ' + type)
  result.schema.validations = rules
  return result
}

export const required: ValidationRule[] = [{ key: 'required' }]
export const text = (key: string, label: string, rules: ValidationRule[] = []): ComponentNode =>
  field('TextField', key, label, rules)
export const notes = (key: string, label: string, help = ''): ComponentNode =>
  field('TextArea', key, label, [], { helperText: help, rows: 3 })
export const check = (key: string, label: string): ComponentNode => field('Checkbox', key, label)
export const date = (key: string, label: string, rules: ValidationRule[] = []): ComponentNode =>
  field('DatePicker', key, label, rules)
export const email = (key: string, label = 'Email'): ComponentNode =>
  text(key, label, [...required, { key: 'email' }])
export const number = (key: string, label: string, min = 0, max?: number): ComponentNode =>
  field('NumberField', key, label, [
    { key: 'min', value: min },
    ...(max === undefined ? [] : [{ key: 'max' as const, value: max }]),
  ])
export const choices = (
  key: string,
  label: string,
  options: string[],
  mandatory = false,
): ComponentNode =>
  field('Select', key, label, mandatory ? required : [], {
    options: options.map((value) => ({ label: value, value })),
  })
export const grid = (key: string, children: ComponentNode[], columns = 2): ComponentNode =>
  node('Grid', key, { columns, gap: 20, minColumnWidth: 200 }, children)
export const section = (
  key: string,
  title: string,
  children: ComponentNode[],
  subtitle = '',
): ComponentNode =>
  node('Card', key, { title, subtitle, variant: 'outlined' }, [
    node('Stack', key + 'Content', { gap: 20 }, children),
  ])

export function repeat(
  key: string,
  label: string,
  children: ComponentNode[],
  help: string,
): ComponentNode {
  const result = field('Repeater', key + 'List', label, [{ key: 'maxItems', value: 30 }], {
    helperText: help,
    gap: 20,
  })
  result.dataKey = key
  result.children = [section(key + 'Row', label + ' details', children)]
  return result
}

export function when(component: ComponentNode, dataKey: string, value: JsonValue): ComponentNode {
  component.renderWhen = {
    kind: 'condition',
    condition: { op: 'eq', left: { kind: 'ref', dataKey }, right: { kind: 'literal', value } },
  }
  return component
}

export function step(key: string, title: string, children: ComponentNode[]): ComponentNode {
  const result = node('Step', key, { gap: 24 }, [
    node('Heading', key + 'Heading', { text: title, level: 'h2' }),
    ...children,
  ])
  result.renderWhen = {
    kind: 'condition',
    condition: {
      op: 'eq',
      left: { kind: 'context', path: 'step' },
      right: { kind: 'literal', value: title },
    },
  }
  return result
}

export function form(
  id: string,
  name: string,
  introduction: string,
  children: ComponentNode[],
): FormDocument {
  const document = createDocument(name, id)
  document.root.props = { maxWidth: prop(880), gap: prop(24) }
  document.root.children = [
    node('Heading', 'heading', { text: name, level: 'h1' }),
    node('Text', 'introduction', { text: introduction }),
    ...children,
  ]
  return document
}

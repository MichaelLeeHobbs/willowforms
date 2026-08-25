import { describe, expect, it } from 'vitest'

import { toJsonSchema, unexportableRules } from './schema.js'
import type { ComponentNode, FormDocument, ValidationRule } from './types.js'

function field(
  key: string,
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'file',
  validations: ValidationRule[] = [],
  label?: string,
): ComponentNode {
  return {
    key,
    type: 'TextField',
    props: label ? { label: { kind: 'static', value: label } } : {},
    schema: { type, validations },
  }
}

function doc(children: ComponentNode[], name = 'Contact request'): FormDocument {
  return {
    version: '1',
    id: 'doc',
    name,
    root: { key: 'root', type: 'Screen', props: {}, children },
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

describe('toJsonSchema', () => {
  it('produces a draft 2020-12 object schema titled after the form', () => {
    const schema = toJsonSchema(doc([]))
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(schema.title).toBe('Contact request')
    expect(schema.properties).toEqual({})
  })

  it('includes only data-bound components', () => {
    const schema = toJsonSchema(
      doc([
        { key: 'heading', type: 'Heading', props: {} },
        field('email', 'string'),
        { key: 'row', type: 'Stack', props: {}, children: [field('nested', 'number')] },
      ]),
    )
    // Layout and display components never appear in submitted data.
    expect(Object.keys(schema.properties)).toEqual(['email', 'nested'])
  })

  it('flattens nesting, because form data is flat', () => {
    const schema = toJsonSchema(
      doc([
        {
          key: 'outer',
          type: 'Stack',
          props: {},
          children: [
            { key: 'inner', type: 'Stack', props: {}, children: [field('deep', 'string')] },
          ],
        },
      ]),
    )
    expect(schema.properties['deep']).toEqual({ type: 'string' })
  })

  it('maps each data type', () => {
    const schema = toJsonSchema(
      doc([
        field('s', 'string'),
        field('n', 'number'),
        field('b', 'boolean'),
        field('d', 'date'),
        field('a', 'array'),
        field('o', 'object'),
        field('f', 'file'),
      ]),
    )
    expect(schema.properties['s']).toEqual({ type: 'string' })
    expect(schema.properties['n']).toEqual({ type: 'number' })
    expect(schema.properties['b']).toEqual({ type: 'boolean' })
    expect(schema.properties['d']).toEqual({ type: 'string', format: 'date' })
    expect(schema.properties['a']).toEqual({ type: 'array', items: {} })
    expect(schema.properties['o']).toEqual({ type: 'object' })
    expect(schema.properties['f']).toEqual({ type: 'string', contentEncoding: 'base64' })
  })

  it('turns length and range rules into keywords', () => {
    const schema = toJsonSchema(
      doc([
        field('name', 'string', [
          { key: 'minLength', value: 2 },
          { key: 'maxLength', value: 40 },
        ]),
        field('age', 'number', [
          { key: 'min', value: 0 },
          { key: 'max', value: 130 },
        ]),
      ]),
    )
    expect(schema.properties['name']).toMatchObject({ minLength: 2, maxLength: 40 })
    expect(schema.properties['age']).toMatchObject({ minimum: 0, maximum: 130 })
  })

  it('turns the string rules into formats and patterns', () => {
    const schema = toJsonSchema(
      doc([
        field('email', 'string', [{ key: 'email' }]),
        field('site', 'string', [{ key: 'url' }]),
        field('id', 'string', [{ key: 'uuid' }]),
        field('code', 'string', [{ key: 'pattern', value: '^[A-Z]{3}$' }]),
      ]),
    )
    expect(schema.properties['email']?.format).toBe('email')
    // JSON Schema calls it uri, not url.
    expect(schema.properties['site']?.format).toBe('uri')
    expect(schema.properties['id']?.format).toBe('uuid')
    expect(schema.properties['code']?.pattern).toBe('^[A-Z]{3}$')
  })

  it('lifts required onto the object rather than the property', () => {
    const schema = toJsonSchema(
      doc([field('email', 'string', [{ key: 'required' }]), field('note', 'string')]),
    )
    expect(schema.required).toEqual(['email'])
    expect(schema.properties['email']).not.toHaveProperty('required')
  })

  it('omits required entirely when no field demands it', () => {
    const schema = toJsonSchema(doc([field('note', 'string')]))
    expect(schema.required).toBeUndefined()
  })

  it('titles a property from its static label', () => {
    const schema = toJsonSchema(doc([field('email', 'string', [], 'Email address')]))
    expect(schema.properties['email']?.title).toBe('Email address')
  })

  it('leaves the title off when the label is a binding rather than static text', () => {
    const node = field('email', 'string')
    node.props['label'] = { kind: 'i18n', key: 'email_label' }
    const schema = toJsonSchema(doc([node]))
    expect(schema.properties['email']).not.toHaveProperty('title')
  })

  it('drops a custom rule, which has no declarative equivalent', () => {
    const schema = toJsonSchema(
      doc([field('email', 'string', [{ key: 'custom', expression: 'value !== "x"' }])]),
    )
    expect(schema.properties['email']).toEqual({ type: 'string' })
  })
})

describe('unexportableRules', () => {
  it('reports nothing for a form JSON Schema can express', () => {
    expect(unexportableRules(doc([field('email', 'string', [{ key: 'email' }])]))).toEqual([])
  })

  it('names the fields whose rules will be lost', () => {
    const document = doc([
      field('a', 'string', [{ key: 'custom', expression: 'true' }]),
      field('b', 'string', [{ key: 'required' }]),
    ])
    expect(unexportableRules(document)).toEqual([{ key: 'a', rule: 'custom' }])
  })
})

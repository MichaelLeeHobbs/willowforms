import { describe, expect, it } from 'vitest'

import { createDocument } from './factory.js'
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

describe('dataKey in the export', () => {
  it('names the property after the data key, not the component key', () => {
    const node = { ...field('emailField', 'string'), dataKey: 'email' }
    const schema = toJsonSchema(doc([node]))

    expect(Object.keys(schema.properties)).toEqual(['email'])
    expect(Object.keys(schema.properties)).not.toContain('emailField')
  })

  it('names a required entry after the data key too', () => {
    // Otherwise the schema requires a property it never declared.
    const node = { ...field('emailField', 'string', [{ key: 'required' }]), dataKey: 'email' }
    const schema = toJsonSchema(doc([node]))

    expect(schema.required).toEqual(['email'])
  })

  it('falls back to the component key when no data key is set', () => {
    const schema = toJsonSchema(doc([field('email', 'string')]))
    expect(Object.keys(schema.properties)).toEqual(['email'])
  })

  it('collapses two components sharing a data key into one property', () => {
    /*
     * Legal, and the reason data keys may repeat: two fields behind opposite
     * renderWhen guards write one answer. The payload has one slot for it.
     */
    const a = { ...field('personalEmail', 'string'), dataKey: 'email' }
    const b = { ...field('workEmail', 'string'), dataKey: 'email' }
    const schema = toJsonSchema(doc([a, b]))

    expect(Object.keys(schema.properties)).toEqual(['email'])
  })
})

describe('a repeater in the exported schema', () => {
  /*
   * Repetition is cardinality, and cardinality is the one structural thing JSON
   * Schema expresses natively. The flat projection named a repeater's fields at
   * the top level, so a server validating a real payload against the export
   * would have rejected every submission — silently, because the export looked
   * perfectly well-formed.
   */
  const doc = (): FormDocument => ({
    ...createDocument('Order', 'order'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'email',
          type: 'TextField',
          props: {},
          schema: { type: 'string', validations: [{ key: 'required' }] },
        },
        {
          key: 'lines',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [{ key: 'minLength', value: 1 }] },
          children: [
            {
              key: 'sku',
              type: 'TextField',
              props: {},
              schema: { type: 'string', validations: [{ key: 'required' }] },
            },
            {
              key: 'qty',
              type: 'NumberField',
              props: {},
              schema: { type: 'number', validations: [] },
            },
          ],
        },
      ],
    },
  })

  it('nests the row shape under items', () => {
    const schema = toJsonSchema(doc())
    expect(schema.properties['lines']).toEqual({
      type: 'array',
      minLength: 1,
      items: {
        type: 'object',
        properties: { sku: { type: 'string' }, qty: { type: 'number' } },
        required: ['sku'],
      },
    })
  })

  it('keeps a row field out of the document properties', () => {
    // The bug this replaces: `sku` sitting at the top level, where no real
    // payload has it.
    const schema = toJsonSchema(doc())
    expect(Object.keys(schema.properties)).toEqual(['email', 'lines'])
  })

  it('requires a row field of each row, not of the payload', () => {
    const schema = toJsonSchema(doc())
    expect(schema.required).toEqual(['email'])
    expect(schema.properties['lines']?.items?.required).toEqual(['sku'])
  })

  it('leaves a form with no repeater exactly as it was', () => {
    const plain = doc()
    plain.root.children = [plain.root.children?.[0] as never]
    const schema = toJsonSchema(plain)
    expect(schema.properties).toEqual({ email: { type: 'string' } })
    expect(schema.required).toEqual(['email'])
  })
})

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
    // `en-US`, as `createDocument` produces. A dialect-free fixture makes a tag
    // and a bare code the same string (write-tests skill, Trap 5).
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
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
    expect(schema.properties['f']).toEqual({ type: 'string' })
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

  it('leaves a guarded required off the object', () => {
    const guarded = field('vat', 'string', [
      { key: 'required', when: { kind: 'static', value: true } },
    ])
    const schema = toJsonSchema(doc([guarded, field('email', 'string', [{ key: 'required' }])]))

    expect(schema.required).toEqual(['email'])
  })

  it('reports that guarded rule as lost rather than exporting it as absolute', () => {
    const guarded = field('vat', 'string', [
      { key: 'required', when: { kind: 'static', value: true } },
    ])
    expect(unexportableRules(doc([guarded]))).toEqual([{ key: 'vat', rule: 'required' }])
  })

  it('omits required entirely when no field demands it', () => {
    const schema = toJsonSchema(doc([field('note', 'string')]))
    expect(schema.required).toBeUndefined()
  })

  it('does not make guarded constraints unconditional in the exported schema', () => {
    const node = field('code', 'string', [
      { key: 'minLength', value: 8, when: { kind: 'static', value: false } },
    ])
    expect(toJsonSchema(doc([node])).properties['code']).toEqual({ type: 'string' })
    expect(unexportableRules(doc([node]))).toEqual([{ key: 'code', rule: 'minLength' }])
  })

  it('does not require fields hidden by a conditional ancestor and reports the loss', () => {
    const document = doc([
      {
        key: 'optionalSection',
        type: 'Box',
        props: {},
        renderWhen: { kind: 'static', value: false },
        children: [field('code', 'string', [{ key: 'required' }, { key: 'minLength', value: 8 }])],
      },
    ])
    expect(toJsonSchema(document).required).toBeUndefined()
    expect(toJsonSchema(document).properties['code']).toEqual({ type: 'string' })
    expect(unexportableRules(document)).toEqual([
      { key: 'code', rule: 'required' },
      { key: 'code', rule: 'minLength' },
    ])
  })

  it('requires an unconditional consent checkbox to be true, not merely present', () => {
    const document = doc([
      field('consent', 'boolean', [{ key: 'required' }]),
      field('optional', 'boolean'),
    ])
    const exported = toJsonSchema(document)
    expect(exported.properties['consent']).toEqual({ type: 'boolean', const: true })
    expect(exported.properties['optional']).toEqual({ type: 'boolean' })
    expect(exported.required).toEqual(['consent'])
  })

  it('titles a property from its static label', () => {
    const schema = toJsonSchema(doc([field('email', 'string', [], 'Email address')]))
    expect(schema.properties['email']?.title).toBe('Email address')
  })

  it('titles a button from its text, since that is the label it has', () => {
    const node = field('agree', 'boolean')
    node.props['text'] = { kind: 'static', value: 'I agree' }
    const schema = toJsonSchema(doc([node]))

    expect(schema.properties['agree']?.title).toBe('I agree')
  })

  it('prefers the label when a component has both', () => {
    const node = field('agree', 'boolean', [], 'Terms')
    node.props['text'] = { kind: 'static', value: 'I agree' }
    expect(toJsonSchema(doc([node])).properties['agree']?.title).toBe('Terms')
  })

  it('exports a document whose props are not an object at all', () => {
    // `props` is required by the type, so only an unvalidated document reaches this.
    // Without the guard in `titleOf`, `toJsonSchema` throws on it.
    for (const props of [null, 'nope', 42, ['label']]) {
      const node = { ...field('email', 'string'), props } as unknown as ComponentNode
      const schema = toJsonSchema(doc([node]))

      expect(schema.properties['email'], JSON.stringify(props)).toEqual({ type: 'string' })
    }
  })

  it('takes no title from a label it merely inherits', () => {
    const inherited = Object.create({
      label: { kind: 'static', value: 'Inherited' },
    }) as ComponentNode['props']

    const node = { ...field('email', 'string'), props: inherited }

    expect(toJsonSchema(doc([node])).properties['email']).not.toHaveProperty('title')
  })

  it('still takes the title from a label the props really hold', () => {
    const own = Object.create({ label: { kind: 'static', value: 'Inherited' } }) as Record<
      string,
      unknown
    >
    own['label'] = { kind: 'static', value: 'Own' }

    const node = { ...field('email', 'string'), props: own as ComponentNode['props'] }

    expect(toJsonSchema(doc([node])).properties['email']?.title).toBe('Own')
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

  it('reports the second of two format rules, which the export silently drops', () => {
    // `email`, `url` and `uuid` all write `format`, and a property has one, so only the
    // last is exported. The rule reported is the earlier one, which is discarded.
    const document = doc([field('id', 'string', [{ key: 'email' }, { key: 'uuid' }])])

    expect(unexportableRules(document)).toEqual([{ key: 'id', rule: 'email' }])
    expect(toJsonSchema(document).properties['id']?.format).toBe('uuid')
  })

  it('reports every format rule but the last when a field carries three', () => {
    const document = doc([
      field('id', 'string', [{ key: 'email' }, { key: 'url' }, { key: 'uuid' }]),
    ])

    expect(unexportableRules(document)).toEqual([
      { key: 'id', rule: 'email' },
      { key: 'id', rule: 'url' },
    ])
  })

  it('reports nothing for one format rule beside rules of other kinds', () => {
    expect(
      unexportableRules(
        doc([field('email', 'string', [{ key: 'email' }, { key: 'minLength', value: 3 }])]),
      ),
    ).toEqual([])
  })

  it('names the fields whose rules will be lost', () => {
    const document = doc([
      field('a', 'string', [{ key: 'custom', expression: 'true' }]),
      field('b', 'string', [{ key: 'required' }]),
    ])
    expect(unexportableRules(document)).toEqual([{ key: 'a', rule: 'custom' }])
  })
})

describe('a repeater inside a repeater, and a root that is a field', () => {
  const nested = (): FormDocument => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'orderList',
          dataKey: 'orders',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [] },
          children: [
            field('reference', 'string', [{ key: 'required' }]),
            {
              key: 'lineList',
              dataKey: 'lines',
              type: 'Repeater',
              props: {},
              schema: { type: 'array', validations: [] },
              children: [field('sku', 'string', [{ key: 'required' }])],
            },
          ],
        },
      ],
    }
    return { ...createDocument('Nested', 'nested'), root }
  }

  it('nests items inside items, all the way down', () => {
    const schema = toJsonSchema(nested())
    const orders = schema.properties['orders']

    expect(orders?.type).toBe('array')
    expect(orders?.items?.required).toEqual(['reference'])

    const lines = orders?.items?.properties?.['lines']
    expect(lines?.type).toBe('array')
    expect(lines?.items?.required).toEqual(['sku'])
  })

  it('names the inner list by its data key, not its component key', () => {
    const schema = toJsonSchema(nested())
    const orders = schema.properties['orders']
    expect(Object.keys(orders?.items?.properties ?? {})).toEqual(['reference', 'lines'])
  })

  it('exports a root that carries its own schema as a property of itself', () => {
    const root: ComponentNode = {
      ...field('note', 'string', [{ key: 'required' }]),
      children: [field('ignored', 'string')],
    }
    const schema = toJsonSchema({ ...createDocument('One', 'one'), root })

    expect(Object.keys(schema.properties)).toEqual(['note', 'ignored'])
    expect(schema.required).toEqual(['note'])
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
    const node = { ...field('emailField', 'string', [{ key: 'required' }]), dataKey: 'email' }
    const schema = toJsonSchema(doc([node]))

    expect(schema.required).toEqual(['email'])
  })

  it('falls back to the component key when no data key is set', () => {
    const schema = toJsonSchema(doc([field('email', 'string')]))
    expect(Object.keys(schema.properties)).toEqual(['email'])
  })

  it('collapses two components sharing a data key into one property', () => {
    // Legal: two fields behind opposite renderWhen guards can write one answer.
    const a = { ...field('personalEmail', 'string'), dataKey: 'email' }
    const b = { ...field('workEmail', 'string'), dataKey: 'email' }
    const schema = toJsonSchema(doc([a, b]))

    expect(Object.keys(schema.properties)).toEqual(['email'])
  })

  it('names the shared key once in required, not twice', () => {
    const a = { ...field('personalEmail', 'string', [{ key: 'required' }]), dataKey: 'email' }
    const b = { ...field('workEmail', 'string', [{ key: 'required' }]), dataKey: 'email' }

    expect(toJsonSchema(doc([a, b])).required).toEqual(['email'])
  })
})

describe('a repeater in the exported schema', () => {
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
      minItems: 1,
      items: {
        type: 'object',
        properties: { sku: { type: 'string' }, qty: { type: 'number' } },
        required: ['sku'],
      },
    })
  })

  it('keeps a row field out of the document properties', () => {
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

describe('what the export cannot carry', () => {
  const doc = (root: ComponentNode): FormDocument => ({
    ...createDocument('Export', 'export'),
    root,
  })

  describe('a field made conditional by renderWhen', () => {
    const conditional = (): ComponentNode => ({
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'married',
          type: 'Checkbox',
          props: {},
          schema: { type: 'boolean', validations: [] },
        },
        {
          key: 'spouse',
          type: 'TextField',
          props: {},
          schema: { type: 'string', validations: [{ key: 'required' }] },
          renderWhen: {
            kind: 'condition',
            condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'married' } },
          },
        },
      ],
    })

    it('is not exported as unconditionally required', () => {
      expect(toJsonSchema(doc(conditional())).required ?? []).toEqual([])
    })

    it('is reported as lossy, so the dialog stops calling the export complete', () => {
      expect(unexportableRules(doc(conditional()))).toEqual([{ key: 'spouse', rule: 'required' }])
    })

    it('still exports a field nothing hides', () => {
      const plain = conditional()
      delete plain.children?.[1]?.renderWhen

      expect(toJsonSchema(doc(plain)).required).toEqual(['spouse'])
      expect(unexportableRules(doc(plain))).toEqual([])
    })
  })

  describe('a length rule on a field that holds a list', () => {
    const multi = (rules: ComponentNode['schema']): ComponentNode => ({
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'colours', type: 'MultiSelect', props: {}, ...(rules ? { schema: rules } : {}) },
      ],
    })

    it('exports as a count of items rather than a length of text', () => {
      const schema = toJsonSchema(
        doc(
          multi({
            type: 'array',
            validations: [
              { key: 'minLength', value: 2 },
              { key: 'maxLength', value: 4 },
            ],
          }),
        ),
      )

      expect(schema.properties['colours']).toMatchObject({
        type: 'array',
        minItems: 2,
        maxItems: 4,
      })
      expect(schema.properties['colours']).not.toHaveProperty('minLength')
    })

    it('still exports a length as a length on text', () => {
      const schema = toJsonSchema(
        doc(multi({ type: 'string', validations: [{ key: 'minLength', value: 2 }] })),
      )

      expect(schema.properties['colours']).toMatchObject({ type: 'string', minLength: 2 })
      expect(schema.properties['colours']).not.toHaveProperty('minItems')
    })
  })
})

describe('a rule that applies only sometimes', () => {
  const guarded = (): FormDocument => ({
    ...createDocument('Export', 'export'),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'business',
          type: 'Checkbox',
          props: {},
          schema: { type: 'boolean', validations: [] },
        },
        {
          key: 'vat',
          type: 'TextField',
          props: {},
          schema: {
            type: 'string',
            validations: [
              {
                key: 'required',
                when: {
                  kind: 'condition',
                  condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'business' } },
                },
              },
            ],
          },
        },
      ],
    },
  })

  it('is reported as lossy', () => {
    expect(unexportableRules(guarded())).toEqual([{ key: 'vat', rule: 'required' }])
  })

  it('is not exported as unconditionally required', () => {
    expect(toJsonSchema(guarded()).required ?? []).toEqual([])
  })

  it('says nothing about the same rule unguarded', () => {
    const plain = guarded()
    const vat = plain.root.children?.[1]
    if (vat?.schema) vat.schema.validations = [{ key: 'required' }]

    expect(unexportableRules(plain)).toEqual([])
    expect(toJsonSchema(plain).required).toEqual(['vat'])
  })
})

describe('the exported schema and a document that is data', () => {
  const withField = (node: ComponentNode): FormDocument => ({
    ...createDocument('Export', 'export'),
    root: { key: 'root', type: 'Screen', props: {}, children: [node] },
  })

  it('keeps a property whose data key is a name on Object.prototype', () => {
    const schema = toJsonSchema(
      withField({
        key: 'sneaky',
        dataKey: '__proto__',
        type: 'TextField',
        props: {},
        schema: { type: 'string', validations: [{ key: 'required' }] },
      }),
    )

    expect(Object.hasOwn(schema.properties, '__proto__')).toBe(true)
    expect(schema.required).toContain('__proto__')
  })

  it('does not put a length keyword on a type that has no length', () => {
    const schema = toJsonSchema(
      withField({
        key: 'age',
        type: 'NumberField',
        props: {},
        schema: { type: 'number', validations: [{ key: 'minLength', value: 3 }] },
      }),
    )

    expect(schema.properties['age']).not.toHaveProperty('minLength')
    expect(schema.properties['age']).not.toHaveProperty('minItems')
  })

  it('still puts one on a string and on a list', () => {
    const text = toJsonSchema(
      withField({
        key: 'name',
        type: 'TextField',
        props: {},
        schema: { type: 'string', validations: [{ key: 'minLength', value: 3 }] },
      }),
    )
    expect(text.properties['name']).toHaveProperty('minLength', 3)

    const list = toJsonSchema(
      withField({
        key: 'tags',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [{ key: 'minLength', value: 3 }] },
        children: [],
      }),
    )
    expect(list.properties['tags']).toHaveProperty('minItems', 3)
  })

  it('does not overflow on a document nested deeper than the gate walks', () => {
    let node: ComponentNode = { key: 'leaf', type: 'Box', props: {} }
    for (let i = 0; i < 50_000; i += 1) {
      node = { key: 'box' + String(i), type: 'Box', props: {}, children: [node] }
    }

    expect(() => toJsonSchema(withField(node))).not.toThrow()
  })
})

/** A repeater is a container, so an imported document can have one as its root. */
describe('a repeater at the root', () => {
  const rooted = (): FormDocument => {
    const root: ComponentNode = {
      key: 'orderList',
      dataKey: 'orders',
      type: 'Repeater',
      props: {},
      schema: { type: 'array', validations: [] },
      children: [
        field('sku', 'string', [{ key: 'required' }]),
        field('quantity', 'number', [{ key: 'min', value: 1 }]),
      ],
    }
    return { ...createDocument('Orders', 'orders'), root }
  }

  it('exports an array of rows, not the row', () => {
    const schema = toJsonSchema(rooted())
    const orders = schema.properties['orders']

    expect(Object.keys(schema.properties)).toEqual(['orders'])
    expect(orders?.type).toBe('array')
    expect(Object.keys(orders?.items?.properties ?? {})).toEqual(['sku', 'quantity'])
  })

  it("keeps the rows' required inside items, never on the document", () => {
    const schema = toJsonSchema(rooted())

    expect(schema.properties['orders']?.items?.required).toEqual(['sku'])
    expect(schema.required).toBeUndefined()
  })

  it('names the array by the data key, not the component key', () => {
    expect(Object.keys(toJsonSchema(rooted()).properties)).not.toContain('orderList')
  })
})

const documentOf = (root: ComponentNode): FormDocument => ({ ...doc([]), root })

describe('the two branches the deep test never took', () => {
  const DEEP = 50_000

  const schemaChain = (n: number): ComponentNode => {
    let node: ComponentNode = {
      key: 'leaf',
      type: 'Field',
      props: {},
      schema: { type: 'string', validations: [] },
    }
    for (let i = 0; i < n; i += 1) {
      node = {
        key: 'field' + String(i),
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [] },
        children: [node],
      }
    }
    return { key: 'root', type: 'Screen', props: {}, children: [node] }
  }

  const repeaterChain = (n: number): ComponentNode => {
    let node: ComponentNode = {
      key: 'leaf',
      type: 'Field',
      props: {},
      schema: { type: 'string', validations: [] },
    }
    for (let i = 0; i < n; i += 1) {
      node = {
        key: 'list' + String(i),
        dataKey: 'rows' + String(i),
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [node],
      }
    }
    return { key: 'root', type: 'Screen', props: {}, children: [node] }
  }

  it('does not overflow on a chain of schema-carrying nodes', () => {
    expect(() => toJsonSchema(documentOf(schemaChain(DEEP)))).not.toThrow()
  })

  it('does not overflow on nested repeaters', () => {
    expect(() => toJsonSchema(documentOf(repeaterChain(DEEP)))).not.toThrow()
  })

  it('still exports a document nobody would call deep', () => {
    const schema = toJsonSchema(documentOf(schemaChain(2)))

    expect(Object.keys(schema.properties).length).toBeGreaterThan(0)
  })

  it('survives children that are not an array, like unexportableRules does', () => {
    for (const children of [7, {}, 'ab', [null]]) {
      const root = {
        key: 'root',
        type: 'Screen',
        props: {},
        children,
      } as unknown as ComponentNode

      expect(() => toJsonSchema(documentOf(root)), JSON.stringify(children)).not.toThrow()
      expect(() => unexportableRules(documentOf(root)), JSON.stringify(children)).not.toThrow()
    }
  })

  it('does not throw on a document with no root', () => {
    const rootless = { ...documentOf({ key: 'x', type: 'Screen', props: {} }), root: undefined }

    expect(() => toJsonSchema(rootless as unknown as FormDocument)).not.toThrow()
  })
})

describe('keywords a validator would ignore', () => {
  const field = (type: string, rule: unknown): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'x',
        type: 'Field',
        props: {},
        schema: { type, validations: [rule] },
      } as unknown as ComponentNode,
    ],
  })

  it('does not put minimum on a string', () => {
    const schema = toJsonSchema(documentOf(field('string', { key: 'min', value: 3 })))
    const property = schema.properties['x'] as Record<string, unknown>

    expect(property['minimum'], 'minimum was exported onto a string').toBeUndefined()
  })

  it('reports it as a loss rather than exporting it silently', () => {
    expect(
      unexportableRules(documentOf(field('string', { key: 'min', value: 3 }))).length,
    ).toBeGreaterThan(0)
  })

  it('still puts minimum on a number', () => {
    const schema = toJsonSchema(documentOf(field('number', { key: 'min', value: 3 })))
    const property = schema.properties['x'] as Record<string, unknown>

    expect(property['minimum']).toBe(3)
  })
})

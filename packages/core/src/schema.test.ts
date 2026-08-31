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
    // `en-US`, which is what `createDocument` produces. A dialect-free
    // fixture makes a bundle keyed by tag and one keyed by bare code the
    // same string, which is Trap 5 in the write-tests skill and the shape
    // that made the language filter green here and broken for real
    // documents.
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

  it('leaves a guarded required off the object', () => {
    /*
     * A rule with a `when` applies sometimes, and JSON Schema's `required` is
     * unconditional, so exporting it rejects payloads the form itself accepts.
     * No fixture had a guard on the rule, only a `renderWhen` on the node, so
     * `&& !rule.when` could be deleted and every schema test stayed green.
     */
    const guarded = field('vat', 'string', [
      { key: 'required', when: { kind: 'static', value: true } },
    ])
    const schema = toJsonSchema(doc([guarded, field('email', 'string', [{ key: 'required' }])]))

    expect(schema.required).toEqual(['email'])
  })

  it('reports that guarded rule as lost rather than exporting it as absolute', () => {
    // The other half: dropping it from `required` is only honest if the caller
    // is told the export no longer says everything the form does.
    const guarded = field('vat', 'string', [
      { key: 'required', when: { kind: 'static', value: true } },
    ])
    expect(unexportableRules(doc([guarded]))).toEqual([{ key: 'vat', rule: 'required' }])
  })

  it('omits required entirely when no field demands it', () => {
    const schema = toJsonSchema(doc([field('note', 'string')]))
    expect(schema.required).toBeUndefined()
  })

  it('titles a property from its static label', () => {
    const schema = toJsonSchema(doc([field('email', 'string', [], 'Email address')]))
    expect(schema.properties['email']?.title).toBe('Email address')
  })

  it('titles a button from its text, since that is the label it has', () => {
    // `titleOf` reads `label` and falls back to `props.text`, and the fallback
    // had no fixture: a Button carries `text`, not `label`.
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
    /*
     * `props` is required on `ComponentNode`, so only a cast reaches this, and
     * a cast is exactly how it happens: the JSON dialog is where somebody looks
     * at a pasted document, and a pasted document has been through no gate.
     * `validateDocument` reports a malformed `props` and reporting is not
     * refusing. Delete the guard at `schema.ts:204` and `toJsonSchema` throws a
     * `TypeError` in the one place a person is deliberately holding something
     * broken.
     */
    for (const props of [null, 'nope', 42, ['label']]) {
      const node = { ...field('email', 'string'), props } as unknown as ComponentNode
      const schema = toJsonSchema(doc([node]))

      expect(schema.properties['email'], JSON.stringify(props)).toEqual({ type: 'string' })
    }
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
    /*
     * `email`, `url` and `uuid` all write `format`, and a property has one, so
     * a field carrying two of them exports only the last. Every fixture in this
     * file put one format rule on a field, so the branch that reports the
     * collapse was never executed: delete `schema.ts:111-117` and the suite
     * stayed green while the dialog called a lossy export lossless, which is
     * the single thing this function exists to prevent.
     *
     * The rule reported is the one being discarded -- the earlier one -- not
     * the one that survives.
     */
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
    // The control: `slice(0, -1)` on a one-element list is empty, and the
    // neighbouring `minLength` is not a format rule and must not be counted as
    // one. Without this, reporting every format rule would also pass.
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
    /*
     * One level of repeater was the deepest fixture here, so the recursion --
     * `objectFor` calling itself for a row scope -- was never exercised, and a
     * version that flattened the inner list would have exported a schema a
     * server accepts every submission against.
     */
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
    /*
     * `validateForm(stepNode, data)` hands core a subtree, and that subtree can
     * be a field. The branch that visits the root itself had no fixture, and
     * visiting it twice -- once directly, once through its children -- was the
     * defect it was hiding.
     */
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
      // A repeater holds a list, so a length rule on it counts rows. It used to
      // export `minLength`, which every JSON Schema validator ignores on an
      // array — the form enforced a minimum the exported schema did not.
      minItems: 1,
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

/**
 * Two ways the export said something the form does not mean.
 *
 * The exported schema is what a server validates a real payload against, so a
 * constraint it states and the form does not — or the other way round — is a
 * disagreement between two validators nobody is comparing.
 *
 * `unexportableRules` exists to tell an author what the export could not carry.
 * Both of these were absent from it, so the dialog said the export was
 * lossless while it was wrong.
 */
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
      /*
       * A guarded *rule* was already excluded, with a comment saying why:
       * JSON Schema's `required` is unconditional, so exporting one the form
       * applies only sometimes rejects payloads the form itself accepts. A
       * field hidden by `renderWhen` is the same fact reached from the node
       * rather than from the rule — and `validateForm` does not require it.
       */
      expect(toJsonSchema(doc(conditional())).required ?? []).toEqual([])
    })

    it('is reported as lossy, so the dialog stops calling the export complete', () => {
      expect(unexportableRules(doc(conditional()))).toEqual([{ key: 'spouse', rule: 'required' }])
    })

    it('still exports a field nothing hides', () => {
      // The control. Dropping every `required` would pass both tests above.
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
      /*
       * `minLength` on an `array` is ignored by every JSON Schema validator —
       * the keyword for a list is `minItems`. The form counts items, so the
       * export was dropping a constraint the form enforces.
       */
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
      // The control: the same two rules on a string mean characters.
      const schema = toJsonSchema(
        doc(multi({ type: 'string', validations: [{ key: 'minLength', value: 2 }] })),
      )

      expect(schema.properties['colours']).toMatchObject({ type: 'string', minLength: 2 })
      expect(schema.properties['colours']).not.toHaveProperty('minItems')
    })
  })
})

/**
 * The other half of `unexportableRules`, which no fixture executed.
 *
 * Deleting the `rule.when` line left both of this file's tests green, so a host
 * could be told a lossy export was lossless — which is the one thing this
 * function exists to prevent.
 */
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
    // The same fact from the other side: JSON Schema's `required` cannot say
    // "sometimes", so exporting it rejects payloads the form itself accepts.
    expect(toJsonSchema(guarded()).required ?? []).toEqual([])
  })

  it('says nothing about the same rule unguarded', () => {
    // The control. Reporting every `required` as lossy would pass both tests
    // above and make the dialog's warning meaningless.
    const plain = guarded()
    const vat = plain.root.children?.[1]
    if (vat?.schema) vat.schema.validations = [{ key: 'required' }]

    expect(unexportableRules(plain)).toEqual([])
    expect(toJsonSchema(plain).required).toEqual(['vat'])
  })
})

/**
 * What the export does with a document nobody gated.
 *
 * `toJsonSchema` runs on whatever a host hands it, and a server validating a
 * payload against its output is trusting it -- so a constraint the form enforces
 * and the export drops is accepted where the form refused. Silently, which is
 * the direction that matters.
 */
describe('the exported schema and a document that is data', () => {
  const withField = (node: ComponentNode): FormDocument => ({
    ...createDocument('Export', 'export'),
    root: { key: 'root', type: 'Screen', props: {}, children: [node] },
  })

  it('keeps a property whose data key is a name on Object.prototype', () => {
    /*
     * `properties[name] = property` for a `dataKey` of `__proto__` runs the
     * inherited setter and adds no own property, so the field vanished from the
     * export -- and a server checking a payload against it then had no
     * constraint for that answer at all. The twin item 1 named and left here.
     */
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
    /*
     * `minLength` is defined for strings, and every validator ignores it on a
     * number -- so the form enforced the rule and the export dropped it. The
     * choice was made by asking whether the type is `array`, which answers the
     * wrong question for everything that is neither a list nor a string.
     */
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
    // The controls. A rule that dropped every length keyword would pass the row
    // above and export nothing useful.
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
    // Built with a loop, because building it recursively would overflow first.
    let node: ComponentNode = { key: 'leaf', type: 'Box', props: {} }
    for (let i = 0; i < 50_000; i += 1) {
      node = { key: 'box' + String(i), type: 'Box', props: {}, children: [node] }
    }

    expect(() => toJsonSchema(withField(node))).not.toThrow()
  })
})

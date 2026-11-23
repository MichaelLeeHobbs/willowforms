import { describe, expect, it } from 'vitest'

import type {
  ComponentNode,
  Condition,
  FieldSchema,
  FormData,
  JsonValue,
  ValidationRule,
} from './types.js'
import { contextValues } from './context.js'
import { MAX_TREE_DEPTH } from './tree.js'
import type { EvalOptions, Evaluator } from './validation.js'
import {
  DEFAULT_MESSAGES,
  INVALID_TYPE,
  MAX_ROWS,
  TOO_DEEP,
  TOO_MANY_ROWS,
  UNREADABLE_RULE,
  applyRule,
  isRequired,
  autoValidateKeys,
  patternProblem,
  submittedAcross,
  NOT_A_LIST,
  submittedData,
  validateAcross,
  validateField,
  validateForm,
} from './validation.js'

const NO_DATA: FormData = {}

function check(rule: ValidationRule, value: unknown): string | undefined {
  return applyRule(rule, value as never, NO_DATA)
}

describe('required', () => {
  it('rejects undefined, null, empty string, whitespace and empty array', () => {
    for (const v of [undefined, null, '', '   ', []]) {
      expect(check({ key: 'required' }, v)).toBe(DEFAULT_MESSAGES.required)
    }
  })

  it('accepts 0, which is a value rather than an absence', () => {
    expect(check({ key: 'required' }, 0)).toBeUndefined()
  })

  it('rejects false, because an unchecked box is a non-answer', () => {
    expect(check({ key: 'required' }, false)).toBe(DEFAULT_MESSAGES.required)
  })

  it('uses a custom message when supplied', () => {
    expect(check({ key: 'required', message: 'Need it.' }, '')).toBe('Need it.')
  })
})

describe('every non-required rule passes on an empty value', () => {
  // The `maxLength`, `max` and `custom` rows pass on empty even without the
  // empty guard; they pin invariant 5 as a contract.
  const rules: ValidationRule[] = [
    { key: 'email' },
    { key: 'url' },
    { key: 'uuid' },
    { key: 'minLength', value: 5 },
    { key: 'maxLength', value: 5 },
    { key: 'minItems', value: 2 },
    { key: 'maxItems', value: 2 },
    { key: 'min', value: 10 },
    { key: 'max', value: 10 },
    { key: 'matches', field: 'expected' },
    { key: 'after', field: 'start' },
    { key: 'pattern', value: '^x+$' },
    { key: 'custom', expression: 'false' },
  ]

  it('covers every rule the union has except required', () => {
    // `DEFAULT_MESSAGES` is a total record over the rule union, so a new rule
    // shows up here.
    const covered = new Set(rules.map((rule) => rule.key))
    const missing = Object.keys(DEFAULT_MESSAGES).filter(
      (key) => key !== 'required' && !covered.has(key as ValidationRule['key']),
    )

    expect(missing, 'these rules are outside invariant 5 and nothing says why').toEqual([])
  })

  const EMPTY: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['an empty list', []],
    ['an empty object', {}],
  ]

  it.each(
    rules.flatMap((rule) => EMPTY.map((empty) => [rule.key, empty[0], rule, empty[1]] as const)),
  )('%s passes on %s', (_key, _shape, rule, value) => {
    expect(check(rule, value)).toBeUndefined()
  })

  it('still fails each of them on a value that is not empty', () => {
    expect(check({ key: 'email' }, 'nope')).toBeDefined()
    expect(check({ key: 'url' }, 'nope')).toBeDefined()
    expect(check({ key: 'uuid' }, 'nope')).toBeDefined()
    expect(check({ key: 'minLength', value: 5 }, 'ab')).toBeDefined()
    expect(check({ key: 'maxLength', value: 5 }, 'abcdef')).toBeDefined()
    expect(check({ key: 'minItems', value: 2 }, ['one'])).toBeDefined()
    expect(check({ key: 'maxItems', value: 2 }, ['one', 'two', 'three'])).toBeDefined()
    expect(check({ key: 'min', value: 10 }, 9)).toBeDefined()
    expect(check({ key: 'max', value: 10 }, 11)).toBeDefined()
    expect(
      applyRule({ key: 'matches', field: 'expected' }, 'wrong', { expected: 'right' }),
    ).toBeDefined()
    expect(
      applyRule({ key: 'after', field: 'start' }, '2026-01-01', { start: '2026-02-01' }),
    ).toBeDefined()
    expect(check({ key: 'pattern', value: '^x+$' }, 'y')).toBeDefined()
    expect(
      applyRule({ key: 'custom', expression: 'false' }, 'x', NO_DATA, { evaluate: () => false }),
    ).toBeDefined()
  })
})

describe('format rules', () => {
  it('validates email', () => {
    expect(check({ key: 'email' }, 'a@b.co')).toBeUndefined()
    expect(check({ key: 'email' }, 'not-an-email')).toBe(DEFAULT_MESSAGES.email)
    expect(check({ key: 'email' }, 'a@b')).toBe(DEFAULT_MESSAGES.email)
  })

  it('validates url', () => {
    expect(check({ key: 'url' }, 'https://example.com')).toBeUndefined()
    expect(check({ key: 'url' }, 'not a url')).toBe(DEFAULT_MESSAGES.url)
  })

  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['//evil.example.com'],
  ])('refuses %s, which parses as a URL and is not one anybody should follow', (value) => {
    expect(check({ key: 'url' }, value)).toBe(DEFAULT_MESSAGES.url)
  })

  it('accepts the schemes a link can safely carry', () => {
    expect(check({ key: 'url' }, 'http://example.com/x?y=1')).toBeUndefined()
    expect(check({ key: 'url' }, 'mailto:someone@example.com')).toBeUndefined()
    expect(check({ key: 'url' }, 'tel:+441234567890')).toBeUndefined()
  })

  it('validates uuid case-insensitively', () => {
    expect(check({ key: 'uuid' }, '3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBeUndefined()
    expect(check({ key: 'uuid' }, '3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBeUndefined()
    expect(check({ key: 'uuid' }, 'nope')).toBe(DEFAULT_MESSAGES.uuid)
  })

  it('validates a regex pattern', () => {
    expect(check({ key: 'pattern', value: '^\\d{5}$' }, '08807')).toBeUndefined()
    expect(check({ key: 'pattern', value: '^\\d{5}$' }, '888')).toBe(DEFAULT_MESSAGES.pattern)
  })
})

describe('range rules', () => {
  it('applies length bounds inclusively', () => {
    expect(check({ key: 'minLength', value: 3 }, 'abc')).toBeUndefined()
    expect(check({ key: 'minLength', value: 3 }, 'ab')).toBe(DEFAULT_MESSAGES.minLength)
    expect(check({ key: 'maxLength', value: 3 }, 'abc')).toBeUndefined()
    expect(check({ key: 'maxLength', value: 3 }, 'abcd')).toBe(DEFAULT_MESSAGES.maxLength)
  })

  it('applies numeric bounds inclusively', () => {
    expect(check({ key: 'min', value: 10 }, 10)).toBeUndefined()
    expect(check({ key: 'min', value: 10 }, 9)).toBe(DEFAULT_MESSAGES.min)
    expect(check({ key: 'max', value: 10 }, 10)).toBeUndefined()
    expect(check({ key: 'max', value: 10 }, 11)).toBe(DEFAULT_MESSAGES.max)
  })

  it('applies list bounds inclusively', () => {
    expect(check({ key: 'minItems', value: 2 }, ['one', 'two'])).toBeUndefined()
    expect(check({ key: 'minItems', value: 2 }, ['one'])).toBe(DEFAULT_MESSAGES.minItems)
    expect(check({ key: 'maxItems', value: 2 }, ['one', 'two'])).toBeUndefined()
    expect(check({ key: 'maxItems', value: 2 }, ['one', 'two', 'three'])).toBe(
      DEFAULT_MESSAGES.maxItems,
    )
  })

  it('rejects a list rule applied to a non-list value', () => {
    expect(check({ key: 'minItems', value: 1 }, 'one')).toBe(DEFAULT_MESSAGES.minItems)
    expect(check({ key: 'maxItems', value: 1 }, { one: true })).toBe(DEFAULT_MESSAGES.maxItems)
  })
})

describe('cross-field rules', () => {
  it('matches primitive and structured values', () => {
    expect(
      applyRule({ key: 'matches', field: 'password' }, 'secret', { password: 'secret' }),
    ).toBeUndefined()
    expect(
      applyRule({ key: 'matches', field: 'password' }, 'different', { password: 'secret' }),
    ).toBe(DEFAULT_MESSAGES.matches)
    expect(
      applyRule(
        { key: 'matches', field: 'expected' },
        { nested: [1, true] },
        {
          expected: { nested: [1, true] },
        },
      ),
    ).toBeUndefined()
  })

  it('compares numbers and ISO-style strings in order', () => {
    expect(applyRule({ key: 'after', field: 'start' }, 11, { start: 10 })).toBeUndefined()
    expect(applyRule({ key: 'after', field: 'start' }, 10, { start: 10 })).toBe(
      DEFAULT_MESSAGES.after,
    )
    expect(
      applyRule({ key: 'after', field: 'start' }, '2026-03-01', { start: '2026-02-28' }),
    ).toBeUndefined()
  })

  it('can compare against the current repeater row', () => {
    const row = { path: [], values: { password: 'row-secret' } }
    expect(
      applyRule(
        { key: 'matches', field: 'password', scope: 'row' },
        'row-secret',
        { password: 'form-secret' },
        { row },
      ),
    ).toBeUndefined()
  })
})

describe('expression-backed rules degrade permissively without an evaluator', () => {
  it('passes a custom rule when no evaluator is injected', () => {
    expect(check({ key: 'custom', expression: 'false' }, 'x')).toBeUndefined()
  })

  it('runs a custom rule when an evaluator is injected', () => {
    const evaluate = (expr: string): boolean => expr === 'true'
    expect(
      applyRule({ key: 'custom', expression: 'true' }, 'x', NO_DATA, { evaluate }),
    ).toBeUndefined()
    expect(applyRule({ key: 'custom', expression: 'false' }, 'x', NO_DATA, { evaluate })).toBe(
      DEFAULT_MESSAGES.custom,
    )
  })

  it('skips a computed guard when no evaluator is injected', () => {
    const rule: ValidationRule = { key: 'required', when: { kind: 'computed', expression: 'true' } }
    expect(check(rule, '')).toBeUndefined()
  })

  it('runs a computed guard in both directions once one is', () => {
    const evaluate: Evaluator = (expression) => expression === 'true'
    const guarded = (expression: string): ValidationRule => ({
      key: 'required',
      when: { kind: 'computed', expression },
    })

    expect(applyRule(guarded('true'), '', NO_DATA, { evaluate })).toBe(DEFAULT_MESSAGES.required)
    expect(applyRule(guarded('false'), '', NO_DATA, { evaluate })).toBeUndefined()
  })

  it('honours a static guard', () => {
    expect(check({ key: 'required', when: { kind: 'static', value: false } }, '')).toBeUndefined()
    expect(check({ key: 'required', when: { kind: 'static', value: true } }, '')).toBe(
      DEFAULT_MESSAGES.required,
    )
  })

  it('hands the host context to the evaluator, for a guard and for a rule', () => {
    const evaluate: Evaluator = (expression, _data, context) =>
      expression === 'admin' &&
      (context?.['user'] as { role?: string } | undefined)?.role === 'admin'

    const admin = { context: { user: { role: 'admin' } }, evaluate }
    const guest = { context: { user: { role: 'guest' } }, evaluate }
    const guarded: ValidationRule = {
      key: 'required',
      when: { kind: 'computed', expression: 'admin' },
    }

    expect(applyRule(guarded, '', NO_DATA, admin)).toBe(DEFAULT_MESSAGES.required)
    expect(applyRule(guarded, '', NO_DATA, guest)).toBeUndefined()

    const custom: ValidationRule = { key: 'custom', expression: 'admin' }
    expect(applyRule(custom, 'x', NO_DATA, admin)).toBeUndefined()
    expect(applyRule(custom, 'x', NO_DATA, guest)).toBe(DEFAULT_MESSAGES.custom)
  })

  it('applies a rule guarded by a translation, which says nothing about whether it holds', () => {
    const rule: ValidationRule = { key: 'required', when: { kind: 'i18n', key: 'when_required' } }

    expect(check(rule, '')).toBe(DEFAULT_MESSAGES.required)
    expect(check(rule, 'Ada')).toBeUndefined()
  })
})

describe('isRequired', () => {
  const node = (validations: ValidationRule[]): ComponentNode => ({
    key: 'email',
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations },
  })

  it('is true for an unguarded required rule', () => {
    expect(isRequired(node([{ key: 'required' }]))).toBe(true)
    expect(isRequired(node([{ key: 'minLength', value: 2 }, { key: 'required' }]))).toBe(true)
  })

  it('is false when the rule is guarded, however the guard would answer', () => {
    // Even a statically true guard: without data, only unconditional rules
    // count.
    expect(isRequired(node([{ key: 'required', when: { kind: 'static', value: true } }]))).toBe(
      false,
    )
    expect(
      isRequired(node([{ key: 'required', when: { kind: 'computed', expression: 'x' } }])),
    ).toBe(false)
  })

  it('is false without a required rule, and for a component with no schema', () => {
    expect(isRequired(node([]))).toBe(false)
    expect(isRequired(node([{ key: 'email' }]))).toBe(false)
    expect(isRequired({ key: 'stack', type: 'Stack', props: {} })).toBe(false)
  })

  it('evaluates a required rule against supplied host context', () => {
    const field = node([
      {
        key: 'required',
        when: {
          kind: 'condition',
          condition: {
            op: 'truthy',
            value: { kind: 'context', path: 'needsEmail' },
          },
        },
      },
    ])
    expect(isRequired(field, {}, { context: { needsEmail: true } })).toBe(true)
    expect(isRequired(field, {}, { context: { needsEmail: false } })).toBe(false)
  })

  it('uses the same computed guard policy as validation', () => {
    const field = node([{ key: 'required', when: { kind: 'computed', expression: 'needsEmail' } }])
    expect(isRequired(field, {})).toBe(false)
    expect(isRequired(field, {}, { evaluate: () => true })).toBe(true)
    expect(isRequired(field, {}, { evaluate: () => false })).toBe(false)
    expect(
      isRequired(
        field,
        {},
        {
          evaluate: () => {
            throw new Error('Unavailable')
          },
        },
      ),
    ).toBe(true)
  })
})

describe('validateField', () => {
  const field: ComponentNode = {
    key: 'email',
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }, { key: 'email' }] },
  }

  it('returns undefined for a component with no schema', () => {
    expect(validateField({ key: 'x', type: 'Stack', props: {} }, NO_DATA)).toBeUndefined()
  })

  it('reports the first failing rule in declaration order', () => {
    expect(validateField(field, {})).toBe(DEFAULT_MESSAGES.required)
    expect(validateField(field, { email: 'bad' })).toBe(DEFAULT_MESSAGES.email)
    expect(validateField(field, { email: 'a@b.co' })).toBeUndefined()
  })

  it.each<[FieldSchema['type'], JsonValue, JsonValue]>([
    ['string', 'text', 1],
    ['number', 42, true],
    ['boolean', false, 1],
    ['date', '2026-09-04', 20260904],
    ['array', ['one'], { one: true }],
    ['object', { one: true }, ['one']],
    ['file', 'base64-data', { bytes: [] }],
  ])('enforces the declared %s value type', (type, valid, invalid) => {
    const node: ComponentNode = {
      key: 'answer',
      type: 'Field',
      props: {},
      schema: { type, validations: [] },
    }

    expect(validateField(node, { answer: valid })).toBeUndefined()
    expect(validateField(node, { answer: invalid })).toBe(INVALID_TYPE)
  })

  it.each([undefined, null, '', '   '])('leaves empty values to required (%s)', (value) => {
    const node: ComponentNode = {
      key: 'answer',
      type: 'NumberField',
      props: {},
      schema: { type: 'number', validations: [] },
    }

    expect(validateField(node, value === undefined ? {} : { answer: value })).toBeUndefined()
  })
})

describe('validateForm', () => {
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'first',
        type: 'TextField',
        props: {},
        schema: { type: 'string', validations: [{ key: 'required' }] },
      },
      {
        key: 'stack',
        type: 'Stack',
        props: {},
        children: [
          {
            key: 'age',
            type: 'NumberField',
            props: {},
            schema: { type: 'number', validations: [{ key: 'min', value: 18 }] },
          },
        ],
      },
    ],
  }

  it('returns an empty object when everything passes', () => {
    expect(validateForm(root, { first: 'Ada', age: 30 })).toEqual({})
  })

  it('collects errors from nested fields, keyed by component key', () => {
    expect(validateForm(root, { age: 12 })).toEqual({
      first: DEFAULT_MESSAGES.required,
      age: DEFAULT_MESSAGES.min,
    })
  })
})

describe('required on a boolean', () => {
  const box = (validations: ValidationRule[]): ComponentNode => ({
    key: 'terms',
    type: 'Checkbox',
    props: {},
    schema: { type: 'boolean', validations },
  })

  it('fails when the box has never been touched', () => {
    expect(validateField(box([{ key: 'required' }]), {})).toBeDefined()
  })

  it('fails when the box is explicitly unchecked', () => {
    // Matches <input type="checkbox" required>, which is invalid unless checked.
    expect(validateField(box([{ key: 'required' }]), { terms: false })).toBeDefined()
  })

  it('passes when the box is checked', () => {
    expect(validateField(box([{ key: 'required' }]), { terms: true })).toBeUndefined()
  })

  it('leaves an unrequired box alone either way', () => {
    expect(validateField(box([]), { terms: false })).toBeUndefined()
    expect(validateField(box([]), {})).toBeUndefined()
  })

  it('does not make false empty for every other rule', () => {
    // A custom rule runs only if `false` is not empty; a length rule would pass
    // either way.
    const evaluate: Evaluator = () => false
    const node = box([{ key: 'custom', expression: 'never' }])

    expect(validateField(node, { terms: false }, { evaluate })).toBe(DEFAULT_MESSAGES.custom)
    expect(
      validateField(box([{ key: 'custom', expression: 'never' }]), {}, { evaluate }),
    ).toBeUndefined()
  })
})

describe('autoValidateKeys', () => {
  const tree: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'eager',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [], autoValidate: true },
      },
      { key: 'patient', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      {
        key: 'explicit',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [], autoValidate: false },
      },
      {
        key: 'group',
        type: 'Stack',
        props: {},
        children: [
          {
            key: 'nested',
            type: 'Field',
            props: {},
            schema: { type: 'string', validations: [], autoValidate: true },
          },
        ],
      },
    ],
  }

  it('names only the fields that asked for it', () => {
    expect(autoValidateKeys(tree)).toEqual(new Set(['eager', 'nested']))
  })

  it('reaches fields nested inside containers', () => {
    expect(autoValidateKeys(tree).has('nested')).toBe(true)
  })

  it('is empty for a tree where nobody asked', () => {
    expect(autoValidateKeys({ key: 'root', type: 'Screen', props: {}, children: [] })).toEqual(
      new Set(),
    )
  })
})

describe('dataKey in validation', () => {
  const node = (key: string, dataKey?: string): ComponentNode => ({
    key,
    ...(dataKey ? { dataKey } : {}),
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }] },
  })

  const root = (children: ComponentNode[]): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children,
  })

  it('reads the value under the data key', () => {
    const errors = validateForm(root([node('emailField', 'email')]), { email: 'a@b.com' })
    expect(errors).toEqual({})
  })

  it('does not find the value under the component key', () => {
    const errors = validateForm(root([node('emailField', 'email')]), { emailField: 'a@b.com' })
    expect(errors['emailField']).toBe(DEFAULT_MESSAGES.required)
  })

  it('reports the error against the component key, not the data key', () => {
    const errors = validateForm(root([node('emailField', 'email')]), {})
    expect(Object.keys(errors)).toEqual(['emailField'])
  })

  it('keeps both errors when two components share a data key', () => {
    const errors = validateForm(root([node('personal', 'email'), node('work', 'email')]), {})
    expect(Object.keys(errors).sort()).toEqual(['personal', 'work'])
  })

  it('falls back to the component key when no data key is set', () => {
    expect(validateForm(root([node('email')]), { email: 'a@b.com' })).toEqual({})
  })
})

describe('submittedData', () => {
  const married: Condition = { op: 'truthy', value: { kind: 'ref', dataKey: 'married' } }

  const form: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      { key: 'married', type: 'Checkbox', props: {}, schema: { type: 'boolean', validations: [] } },
      {
        key: 'spouse',
        type: 'Stack',
        props: {},
        renderWhen: { kind: 'condition', condition: married },
        children: [
          {
            key: 'spouseName',
            type: 'Field',
            props: {},
            schema: { type: 'string', validations: [] },
          },
        ],
      },
    ],
  }

  it('keeps what the form is asking for', () => {
    const data = { married: true, spouseName: 'Alex' }
    expect(submittedData(form, data)).toEqual({ married: true, spouseName: 'Alex' })
  })

  it('drops an answer whose question is hidden', () => {
    const data = { married: false, spouseName: 'Alex' }
    expect(submittedData(form, data)).toEqual({ married: false })
  })

  it('drops everything beneath a hidden container, not just the container', () => {
    const data = { married: false, spouseName: 'Alex' }
    expect(submittedData(form, data)['spouseName']).toBeUndefined()
  })

  it('leaves the held data alone, because hiding is often temporary', () => {
    const data = { married: false, spouseName: 'Alex' }
    submittedData(form, data)
    expect(data['spouseName']).toBe('Alex')
  })

  it('omits a key nobody answered rather than sending undefined', () => {
    expect(Object.hasOwn(submittedData(form, { married: true }), 'spouseName')).toBe(false)
  })

  it('ignores components that hold no data', () => {
    const withHeading: ComponentNode = {
      ...form,
      children: [...(form.children ?? []), { key: 'note', type: 'Heading', props: {} }],
    }
    expect(submittedData(withHeading, { married: true, note: 'stray' })['note']).toBeUndefined()
  })

  it('reads the same context the renderer was given', () => {
    const gated: ComponentNode = {
      key: 'form',
      type: 'Form',
      props: {},
      children: [
        {
          key: 'reason',
          type: 'Field',
          props: {},
          schema: { type: 'string', validations: [] },
          renderWhen: {
            kind: 'condition',
            condition: {
              op: 'eq',
              left: { kind: 'context', path: 'user.role' },
              right: { kind: 'literal', value: 'admin' },
            },
          },
        },
      ],
    }
    const data: FormData = { reason: 'because' }

    expect(submittedData(gated, data, { context: { user: { role: 'admin' } } })).toEqual({
      reason: 'because',
    })
    expect(submittedData(gated, data, { context: { user: { role: 'guest' } } })).toEqual({})
  })

  it('carries a field called __proto__ as an answer, not as a prototype', () => {
    const odd: ComponentNode = {
      key: 'odd',
      type: 'Form',
      children: [
        {
          key: 'protoField',
          dataKey: '__proto__',
          type: 'Field',
          props: {},
          schema: { type: 'string', validations: [] },
        },
      ],
      props: {},
    }

    // Parsed, because a `{ __proto__: … }` literal sets the prototype, not a key.
    const data = JSON.parse('{"__proto__": {"polluted": true}}') as FormData
    expect(Object.hasOwn(data, '__proto__')).toBe(true)

    const out = submittedData(odd, data)

    expect(Object.hasOwn(out, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('agrees with validateForm about what is on screen', () => {
    const data = { married: false, spouseName: 'Alex' }
    const required: ComponentNode = {
      ...form,
      children: (form.children ?? []).map((child) =>
        child.key === 'spouse'
          ? {
              ...child,
              children: [
                {
                  key: 'spouseName',
                  type: 'Field',
                  props: {},
                  schema: { type: 'string', validations: [{ key: 'required' as const }] },
                },
              ],
            }
          : child,
      ),
    }

    expect(validateForm(required, data)).toEqual({})
    expect(submittedData(required, data)['spouseName']).toBeUndefined()
  })
})

describe('validateAcross, and the submit it exists to stop', () => {
  const field = (key: string): ComponentNode => ({
    key,
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }] },
  })

  const step = (name: string, children: ComponentNode[]): ComponentNode => ({
    // `stepWho`, not `step-who`: a hyphen is not in the key grammar.
    key: 'step' + name.charAt(0).toUpperCase() + name.slice(1),
    type: 'Box',
    props: {},
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: name },
      },
    },
    children,
  })

  const wizard: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      step('who', [field('name')]),
      step('where', [field('street'), field('city')]),
      step('pay', [field('card')]),
    ],
  }

  const onStep = (name: string): EvalOptions => ({ context: { step: name } })

  // A context value that is not a string is not a step name; do not stringify it.
  const stepScopes = (root: ComponentNode): EvalOptions[] =>
    contextValues(root, 'step')
      .filter((name): name is string => typeof name === 'string')
      .map(onStep)
  const answered = { name: 'Ada', street: 'Long Lane', card: '4242' }

  it('validates only the step the user is on', () => {
    expect(validateForm(wizard, {}, onStep('where'))).toEqual({
      street: DEFAULT_MESSAGES.required,
      city: DEFAULT_MESSAGES.required,
    })
  })

  it('accepts a submit missing an earlier step, which is the bug', () => {
    // Correct for validateForm, which skips hidden steps. validateAcross covers it.
    expect(validateForm(wizard, answered, onStep('pay'))).toEqual({})
  })

  it('catches it when every step is checked', () => {
    const scopes = ['who', 'where', 'pay'].map(onStep)
    expect(validateAcross(wizard, answered, scopes)).toEqual({ city: DEFAULT_MESSAGES.required })
  })

  it('takes the steps from the document, so a client cannot name only its own', () => {
    const scopes = stepScopes(wizard)
    expect(scopes).toHaveLength(3)
    expect(validateAcross(wizard, answered, scopes)).toEqual({ city: DEFAULT_MESSAGES.required })
  })

  it('is empty when every step is satisfied', () => {
    const scopes = stepScopes(wizard)
    expect(validateAcross(wizard, { ...answered, city: 'Ely' }, scopes)).toEqual({})
  })

  it('keeps the first message when two scopes report the same field', () => {
    /*
     * Keys are unique, so only one node seen under two scopes can collide. Two
     * guarded rules make each scope give a different message, so which one wins
     * is observable.
     */
    const shared: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'nickname',
          type: 'TextField',
          props: {},
          schema: {
            type: 'string',
            validations: [
              {
                key: 'required',
                message: 'The first step says so.',
                when: {
                  kind: 'condition',
                  condition: {
                    op: 'eq',
                    left: { kind: 'context', path: 'step' },
                    right: { kind: 'literal', value: 'who' },
                  },
                },
              },
              {
                key: 'required',
                message: 'The second step says so.',
                when: {
                  kind: 'condition',
                  condition: {
                    op: 'eq',
                    left: { kind: 'context', path: 'step' },
                    right: { kind: 'literal', value: 'where' },
                  },
                },
              },
            ],
          },
        },
        step('who', []),
        step('where', []),
      ],
    }

    expect(validateForm(shared, {}, onStep('who'))['nickname']).toBe('The first step says so.')
    expect(validateForm(shared, {}, onStep('where'))['nickname']).toBe('The second step says so.')

    const merged = validateAcross(shared, {}, ['who', 'where'].map(onStep))
    expect(Object.keys(merged)).toEqual(['nickname'])
    expect(merged['nickname']).toBe('The first step says so.')

    const backwards = validateAcross(shared, {}, ['where', 'who'].map(onStep))
    expect(backwards['nickname']).toBe('The second step says so.')
  })

  it('merges nothing into an empty scope list, rather than validating everything', () => {
    expect(validateAcross(wizard, {}, [])).toEqual({})
  })
})

describe('validateAcross and a key that lives on Object.prototype', () => {
  const required = (key: string): ComponentNode => ({
    key,
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }] },
  })

  const step = (name: string, children: ComponentNode[]): ComponentNode => ({
    key: 'step' + name.charAt(0).toUpperCase() + name.slice(1),
    type: 'Box',
    props: {},
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: name },
      },
    },
    children,
  })

  const onStep = (name: string): EvalOptions => ({ context: { step: name } })

  // Two scopes, so the merge actually coalesces.
  const scopes = ['who', 'where'].map(onStep)

  const wizardWith = (key: string): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [step('who', [required(key)]), step('where', [required('city')])],
  })

  // Every other field answered, so only the inherited key can fail.
  const answered: FormData = { city: 'Ely' }

  const inherited = ['toString', 'valueOf', 'hasOwnProperty', 'constructor', 'isPrototypeOf']

  it.each(inherited)('reports a required field keyed %s', (key) => {
    const errors = validateAcross(wizardWith(key), answered, scopes)

    expect(Object.hasOwn(errors, key)).toBe(true)
    expect(errors[key]).toBe(DEFAULT_MESSAGES.required)
  })

  it.each(inherited)('does not read as a valid form when only %s is missing', (key) => {
    expect(Object.keys(validateAcross(wizardWith(key), answered, scopes))).toEqual([key])
  })

  it('reports a field whose key is __proto__', () => {
    const errors = validateAcross(wizardWith('__proto__'), answered, scopes)

    expect(Object.keys(errors)).toEqual(['__proto__'])
    expect(Object.hasOwn(errors, '__proto__')).toBe(true)
  })

  it('does not let a hostile key reshape the errors it returns', () => {
    const hostile: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [step('who', [required('__proto__'), required('email')])],
    }

    const errors = validateAcross(hostile, {}, scopes)

    expect(Object.keys(errors).sort()).toEqual(['__proto__', 'email'])
    expect(({} as Record<string, unknown>)['email']).toBeUndefined()
  })
})

describe('length rules on a value that is not text', () => {
  it('counts the items in an array', () => {
    expect(check({ key: 'minLength', value: 2 }, ['a', 'b'])).toBeUndefined()
    expect(check({ key: 'minLength', value: 3 }, ['a', 'b'])).toBe(DEFAULT_MESSAGES.minLength)
    expect(check({ key: 'maxLength', value: 1 }, ['a', 'b'])).toBe(DEFAULT_MESSAGES.maxLength)
    expect(check({ key: 'maxLength', value: 2 }, ['a', 'b'])).toBeUndefined()
  })

  it('still measures text by its characters', () => {
    expect(check({ key: 'minLength', value: 3 }, 'ab')).toBe(DEFAULT_MESSAGES.minLength)
    expect(check({ key: 'minLength', value: 2 }, 'ab')).toBeUndefined()
  })

  it('leaves an empty array to required, like every other empty value', () => {
    expect(check({ key: 'minLength', value: 1 }, [])).toBeUndefined()
    expect(check({ key: 'required' }, [])).toBe(DEFAULT_MESSAGES.required)
  })
})

describe('a validation tag this code cannot read', () => {
  it('applies a rule whose guard is unreadable, rather than skipping it', () => {
    const rule = {
      key: 'required',
      when: { kind: 'conditon', condition: { op: 'truthy', value: { kind: 'literal', value: 1 } } },
    }

    expect(check(rule as unknown as ValidationRule, '')).toBe(DEFAULT_MESSAGES.required)
  })

  it('still honours a guard it can read', () => {
    const rule: ValidationRule = { key: 'required', when: { kind: 'static', value: false } }
    expect(check(rule, '')).toBeUndefined()
  })

  it('fails a rule whose key is unreadable, rather than passing the value', () => {
    expect(check({ key: 'requird', value: 3 } as unknown as ValidationRule, '')).toBe(
      UNREADABLE_RULE,
    )
  })

  it('says which rule it could not read is not the point; blocking the submit is', () => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'a',
          type: 'Field',
          props: {},
          schema: {
            type: 'string',
            validations: [{ key: 'requird' } as unknown as ValidationRule],
          },
        },
      ],
    }

    expect(validateForm(root, { a: 'anything' })).toEqual({ a: UNREADABLE_RULE })
  })
})

describe('a required answer that was not required', () => {
  const field = (key: string): ComponentNode => ({
    key,
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }] },
  })

  const root = (children: ComponentNode[]): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children,
  })

  it('is not satisfied by an empty object', () => {
    expect(validateForm(root([field('consent')]), { consent: {} })).toEqual({
      consent: DEFAULT_MESSAGES.required,
    })
  })

  it('is satisfied by an object that holds something', () => {
    const objectField: ComponentNode = {
      ...field('consent'),
      schema: { type: 'object', validations: [{ key: 'required' }] },
    }
    expect(validateForm(root([objectField]), { consent: { agreed: true } })).toEqual({})
  })

  it('reports a field whose key is __proto__', () => {
    const errors = validateForm(root([field('__proto__')]), {})

    expect(Object.keys(errors)).toEqual(['__proto__'])
    expect(Object.hasOwn(errors, '__proto__')).toBe(true)
  })

  it('does not let a hostile key reshape the errors it returns', () => {
    const errors = validateForm(root([field('__proto__'), field('email')]), {})

    expect(Object.keys(errors).sort()).toEqual(['__proto__', 'email'])
    expect(({} as Record<string, unknown>)['email']).toBeUndefined()
  })
})

describe('a pattern rule', () => {
  const pattern = (value: string, against: string): string | undefined =>
    check({ key: 'pattern', value }, against)

  it('matches with the bounded engine', () => {
    expect(pattern('^[A-Z]{2}\\d{4}$', 'AB1234')).toBeUndefined()
    expect(pattern('^[A-Z]{2}\\d{4}$', 'nope')).toBe(DEFAULT_MESSAGES.pattern)
    expect(pattern('^(ab|ac)+$', 'abac')).toBeUndefined()
  })

  it('evaluates formerly catastrophic patterns without backtracking', () => {
    expect(pattern('^(a+)+$', 'a'.repeat(1_000) + 'X')).toBe(DEFAULT_MESSAGES.pattern)
    expect(pattern('^(a|ab)*$', 'ab')).toBeUndefined()
  })

  it('refuses unsupported or malformed syntax', () => {
    expect(pattern('^(?=a)', 'a')).toBe(DEFAULT_MESSAGES.pattern)
    expect(pattern('^(a', 'a')).toBe(DEFAULT_MESSAGES.pattern)
  })

  it('does not evaluate unbounded input', () => {
    expect(pattern('^a*$', 'a'.repeat(20_000))).toBe(DEFAULT_MESSAGES.pattern)
    expect(pattern('^a*$', 'a'.repeat(100))).toBeUndefined()
  })
})

describe('branches this file used to leave unexecuted', () => {
  const field = (key: string, validations: ValidationRule[]): ComponentNode => ({
    key,
    type: 'Field',
    props: {},
    schema: { type: 'string', validations },
  })

  const root = (children: ComponentNode[]): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children,
  })

  describe('a rule whose message is empty', () => {
    it('still fails, with the default message', () => {
      expect(check({ key: 'required', message: '' }, '')).toBe(DEFAULT_MESSAGES.required)
    })

    it('reaches validateForm, which is where it mattered', () => {
      const errors = validateForm(root([field('email', [{ key: 'required', message: '' }])]), {})

      expect(errors).toEqual({ email: DEFAULT_MESSAGES.required })
    })

    it('still prefers a message the author wrote', () => {
      expect(check({ key: 'required', message: 'We need this.' }, '')).toBe('We need this.')
    })

    it('resolves static and translated message bindings', () => {
      expect(
        applyRule(
          { key: 'required', message: { kind: 'static', value: 'Required here.' } },
          '',
          {},
        ),
      ).toBe('Required here.')
      expect(
        applyRule(
          { key: 'required', message: { kind: 'i18n', key: 'required_message' } },
          '',
          {},
          { messages: { required_message: 'Ce champ est obligatoire.' } },
        ),
      ).toBe('Ce champ est obligatoire.')
    })

    it('shows a missing translation key instead of hiding the failure', () => {
      expect(
        applyRule({ key: 'required', message: { kind: 'i18n', key: 'required_message' } }, '', {}),
      ).toBe('required_message')
    })

    it('resolves a computed message only through the injected evaluator', () => {
      const rule: ValidationRule = {
        key: 'required',
        message: { kind: 'computed', expression: 'messageFor(value)' },
      }
      expect(applyRule(rule, '', {})).toBe(DEFAULT_MESSAGES.required)
      expect(applyRule(rule, '', {}, { evaluate: () => 'A generated message.' })).toBe(
        'A generated message.',
      )
    })
  })

  describe('a rule guarded by a structured condition', () => {
    const guarded = (): ComponentNode =>
      field('vat', [
        {
          key: 'required',
          when: {
            kind: 'condition',
            condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'business' } },
          },
        },
      ])

    it('applies when the condition holds, with no evaluator anywhere', () => {
      const errors = validateForm(root([guarded()]), { business: true })

      expect(errors).toEqual({ vat: DEFAULT_MESSAGES.required })
    })

    it('does not apply when the condition does not hold', () => {
      expect(validateForm(root([guarded()]), { business: false })).toEqual({})
    })

    it('reads the condition rather than merely noticing there is one', () => {
      expect(validateForm(root([guarded()]), {})).toEqual({})
    })
  })

  describe('submittedData over a repeater', () => {
    // Component and data keys differ, so the test sees which one is read.
    const withRows = (): ComponentNode =>
      root([
        {
          key: 'addressList',
          dataKey: 'addresses',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [] },
          children: [field('street', []), field('postal', [])].map((node, i) => ({
            ...node,
            dataKey: i === 0 ? 'line1' : 'postcode',
          })),
        },
        field('email', []),
      ])

    it('keeps one object per row, under the answer name', () => {
      const data = {
        addresses: [{ line1: '1 High Street', postcode: 'SW1A 1AA' }, { line1: '2 Low Street' }],
        email: 'a@b.co',
      }

      expect(submittedData(withRows(), data)).toEqual(data)
    })

    it('drops what a row no longer asks for', () => {
      const data = { addresses: [{ line1: 'kept', removed: 'gone' }], email: '' }

      expect(submittedData(withRows(), data)).toEqual({ addresses: [{ line1: 'kept' }], email: '' })
    })

    it('reads a repeater whose stored value is not a list as no answer at all', () => {
      const out = submittedData(withRows(), { addresses: 'nonsense', email: '' })
      expect(out).toEqual({ email: '' })
      expect(Object.hasOwn(out, 'addresses')).toBe(false)
    })

    it('keeps a real empty list, which is an answer somebody gave', () => {
      expect(submittedData(withRows(), { addresses: [], email: '' })).toEqual({
        addresses: [],
        email: '',
      })
    })
  })
})

describe('bounds and schemes', () => {
  it('fails min and max on a value that is not a number', () => {
    expect(check({ key: 'min', value: 18 }, 'not telling')).toBe(DEFAULT_MESSAGES.min)
    expect(check({ key: 'max', value: 65 }, 'not telling')).toBe(DEFAULT_MESSAGES.max)
  })

  it('still compares numbers, however they were typed', () => {
    expect(check({ key: 'min', value: 18 }, 21)).toBeUndefined()
    expect(check({ key: 'min', value: 18 }, '21')).toBeUndefined()
    expect(check({ key: 'min', value: 18 }, 3)).toBe(DEFAULT_MESSAGES.min)
    expect(check({ key: 'max', value: 65 }, '70')).toBe(DEFAULT_MESSAGES.max)
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd'])(
    'refuses %s as a URL',
    (value) => {
      expect(check({ key: 'url' }, value)).toBe(DEFAULT_MESSAGES.url)
    },
  )

  it.each(['https://example.com', 'http://example.com/a?b=1', 'mailto:a@b.co', 'tel:+441234'])(
    'accepts %s',
    (value) => {
      expect(check({ key: 'url' }, value)).toBeUndefined()
    },
  )

  it('still refuses something that is not a URL at all', () => {
    expect(check({ key: 'url' }, 'not a url')).toBe(DEFAULT_MESSAGES.url)
  })
})

/**
 * A bounded quantifier wrapping an unbounded one.
 *
 * The ReDoS guard asks whether an *unbounded* quantifier is applied to a group
 * holding another one, so `(a+)+` is refused and `(a+){10}` is not. The bound on
 * the outside is not what makes it safe: splitting thirty characters into ten
 * non-empty groups is ten million ways, and the exponent is the repeat count,
 * which the author chooses.
 *
 * The guard's own comment says a bounded quantifier "is not the shape that goes
 * exponential, because there is a fixed amount for the engine to try". That is
 * true of `a{10}` and false of `(a+){10}`, and the code was written to the
 * sentence rather than to the distinction inside it.
 */
describe('bounded matching of nested quantifiers', () => {
  // Each value matches its pattern, so a refusal cannot pass for a mismatch.
  const refused = (pattern: string, matching: string): boolean =>
    check({ key: 'pattern', value: pattern }, matching) === DEFAULT_MESSAGES.pattern

  it.each([
    ['(a+){10}b', 'aaaaaaaaaab', 'the shape the review named'],
    ['(a*){8}b', 'b', 'with a star inside'],
    ['(a+){2,5}b', 'aab', 'and with a range outside'],
    ['((a+)*){3}b', 'ab', 'and nested two deep'],
  ])('runs %s — %s safely', (pattern, matching) => {
    expect(refused(pattern, matching)).toBe(false)
  })

  it.each([
    ['(a+){1}b', 'ab', 'one repetition cannot backtrack between groups'],
    ['(a+)?b', 'b', 'and neither can none-or-one'],
    ['(\\d{3}-){4}x', '123-456-789-012-x', 'a fixed-length inner group is common'],
    ['(\\d{1,3}\\.){3}\\d{1,3}', '10.0.0.1', 'and an IP address must keep working'],
  ])('still runs %s — %s', (pattern, matching) => {
    expect(refused(pattern, matching)).toBe(false)
  })
})

/**
 * The host evaluator throwing, on the two call sites that did not catch it.
 *
 * `visibility.ts` wraps the same call in `try`/`catch` and explains why: a throw
 * out of `isVisible` is an unhandled 500 on submit and a blank form in the
 * browser. `guardPasses` and the `custom` rule call it bare, so an expression
 * that throws escapes `validateForm` entirely -- and the expression is authored
 * in a document while the evaluator belongs to the host, so neither side owns
 * the failure.
 *
 * The two answers differ on purpose, and each matches a decision already written
 * down one case away.
 */
describe('an evaluator that throws', () => {
  const boom: Evaluator = () => {
    throw new Error('the host evaluator blew up')
  }

  const guardedRule = (): ComponentNode => ({
    key: 'spouse',
    type: 'TextField',
    props: {},
    schema: {
      type: 'string',
      validations: [{ key: 'required', when: { kind: 'computed', expression: 'boom()' } }],
    },
  })

  const customRule = (): ComponentNode => ({
    key: 'code',
    type: 'TextField',
    props: {},
    schema: {
      type: 'string',
      validations: [{ key: 'custom', expression: 'boom()' }],
    },
  })

  const root = (child: ComponentNode): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [child],
  })

  it('does not escape validateForm from a rule guard', () => {
    expect(() => validateForm(root(guardedRule()), {}, { evaluate: boom })).not.toThrow()
  })

  it('leaves the guarded rule applying, because a guard nobody can read has not said no', () => {
    expect(validateForm(root(guardedRule()), {}, { evaluate: boom })).toEqual({
      spouse: DEFAULT_MESSAGES.required,
    })
  })

  it('does not escape validateForm from a custom rule', () => {
    expect(() => validateForm(root(customRule()), { code: 'x' }, { evaluate: boom })).not.toThrow()
  })

  it('fails the custom rule, because a rule that cannot be run has not been satisfied', () => {
    expect(validateForm(root(customRule()), { code: 'x' }, { evaluate: boom })).toEqual({
      code: DEFAULT_MESSAGES.custom,
    })
  })

  it('still runs a custom rule whose evaluator works', () => {
    const yes: Evaluator = () => true
    const no: Evaluator = () => false

    expect(validateForm(root(customRule()), { code: 'x' }, { evaluate: yes })).toEqual({})
    expect(validateForm(root(customRule()), { code: 'x' }, { evaluate: no })).toEqual({
      code: DEFAULT_MESSAGES.custom,
    })
  })
})

describe('rules that a document can malform or misplace', () => {
  it('fails a pattern rule that carries no pattern rather than throwing', () => {
    expect(() => check({ key: 'pattern' } as ValidationRule, 'x')).not.toThrow()
    expect(check({ key: 'pattern' } as ValidationRule, 'x')).toBe(DEFAULT_MESSAGES.pattern)
  })

  it('evaluates a custom rule inside a row against that row', () => {
    // Component and data keys differ: the row is addressed by the data key.
    const seen: FormData[] = []
    const evaluate: Evaluator = (_expression, data) => {
      seen.push(data)
      return data['line1'] === 'in the row'
    }

    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'addressList',
          dataKey: 'addresses',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [] },
          children: [
            {
              key: 'street',
              dataKey: 'line1',
              type: 'TextField',
              props: {},
              schema: { type: 'string', validations: [{ key: 'custom', expression: 'row()' }] },
            },
          ],
        },
      ],
    }

    const errors = validateForm(
      root,
      { line1: 'at the top level', addresses: [{ line1: 'in the row' }] },
      { evaluate },
    )

    expect(errors).toEqual({})
    expect(seen[0]?.['line1']).toBe('in the row')
  })

  it('still lets a custom rule inside a row read a form-level answer', () => {
    const evaluate: Evaluator = (_expression, data) => data['country'] === 'GB'

    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'addressList',
          dataKey: 'addresses',
          type: 'Repeater',
          props: {},
          schema: { type: 'array', validations: [] },
          children: [
            {
              key: 'street',
              dataKey: 'line1',
              type: 'TextField',
              props: {},
              schema: { type: 'string', validations: [{ key: 'custom', expression: 'top()' }] },
            },
          ],
        },
      ],
    }

    expect(
      validateForm(root, { country: 'GB', addresses: [{ line1: 'a' }] }, { evaluate }),
    ).toEqual({})
  })
})

describe('patternProblem', () => {
  it.each(['(', '[a-', '^(?=a)', String.raw`(a)\1`])(
    'reports unsupported pattern %s',
    (pattern) => {
      expect(patternProblem(pattern)).toMatch(/invalid or uses syntax unsupported/)
    },
  )

  it('reports a pattern that exceeds the source limit', () => {
    expect(patternProblem('a'.repeat(1_025))).toMatch(/cannot be longer/)
  })

  it.each([
    '^\\d{5}$',
    '(\\d{3}-){4}x',
    '(\\d{1,3}\\.){3}\\d{1,3}',
    '',
    '^[A-Z]{2}$',
    '(a+)+$',
    '(a|ab)*',
  ])('accepts bounded-engine pattern %s', (pattern) => {
    expect(patternProblem(pattern)).toBeUndefined()
  })

  it('agrees with rule evaluation', () => {
    for (const pattern of ['(', '^(?=a)', String.raw`(a)\1`]) {
      expect(patternProblem(pattern)).toBeDefined()
      expect(check({ key: 'pattern', value: pattern }, 'a')).toBe(DEFAULT_MESSAGES.pattern)
    }
  })

  // The value matches, so a refusal cannot be mistaken for a mismatch.
  it('refuses a pattern whose compiled program is too large, and rule evaluation agrees', () => {
    const pattern = '^(a|b){999}$'
    const matching = 'a'.repeat(999)

    expect(pattern.length).toBeLessThan(1_024)
    expect(patternProblem(pattern)).toMatch(/too complex/)
    expect(check({ key: 'pattern', value: pattern }, matching)).toBe(DEFAULT_MESSAGES.pattern)
  })

  it.each([
    ['^(a|b){100}$', 'a'.repeat(100)],
    [String.raw`^[\p{L} ]{1,200}$`, 'José Núñez'],
    [String.raw`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$`, '2026-11-13T09:30Z'],
  ])('still runs realistic counted pattern %s', (pattern, matching) => {
    expect(patternProblem(pattern)).toBeUndefined()
    expect(check({ key: 'pattern', value: pattern }, matching)).toBeUndefined()
  })
})

describe('a repeater with more rows than will be checked', () => {
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          {
            key: 'street',
            dataKey: 'line1',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [{ key: 'required' }] },
          },
        ],
      },
    ],
  }

  const rows = (count: number): FormData => ({
    addresses: Array.from({ length: count }, () => ({ line1: 'x' })),
  })

  it('refuses the list rather than checking a prefix of it', () => {
    const errors = validateForm(root, rows(MAX_ROWS + 1))

    expect(errors).toEqual({ addressList: TOO_MANY_ROWS })
  })

  it('checks a list exactly at the cap', () => {
    const full = rows(MAX_ROWS)
    expect(validateForm(root, full)).toEqual({})

    const last = (full['addresses'] as FormData[])[MAX_ROWS - 1]
    delete last?.['line1']
    expect(validateForm(root, full)).toEqual({
      ['addresses[' + String(MAX_ROWS - 1) + '].street']: DEFAULT_MESSAGES.required,
    })
  })
})

describe('a repeater failing its own rule and the row cap at once', () => {
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [{ key: 'maxLength', value: 3 }] },
        children: [
          {
            key: 'street',
            dataKey: 'line1',
            type: 'TextField',
            props: {},
            schema: { type: 'string', validations: [] },
          },
        ],
      },
    ],
  }

  it('keeps the rule failure rather than replacing it with the cap', () => {
    const rows = { addresses: Array.from({ length: MAX_ROWS + 1 }, () => ({ line1: 'x' })) }

    expect(validateForm(root, rows)).toEqual({ addressList: DEFAULT_MESSAGES.maxLength })
  })

  it('still reports the cap when the repeater own rules pass', () => {
    const root2: ComponentNode = {
      ...root,
      children: [
        {
          ...(root.children?.[0] as ComponentNode),
          schema: { type: 'array', validations: [] },
        },
      ],
    }
    const rows = { addresses: Array.from({ length: MAX_ROWS + 1 }, () => ({ line1: 'x' })) }

    expect(validateForm(root2, rows)).toEqual({ addressList: TOO_MANY_ROWS })
  })
})

describe('a document nested deeper than the tree bound', () => {
  const nested = (n: number): ComponentNode => {
    let node: ComponentNode = {
      key: 'buried',
      type: 'TextField',
      props: {},
      schema: { type: 'string', validations: [{ key: 'required' }] },
    }
    for (let i = 0; i < n; i += 1) {
      node = { key: 'box' + String(i), type: 'Screen', props: {}, children: [node] }
    }
    return node
  }

  it('reports rather than throwing a RangeError out of the submit path', () => {
    const errors = validateForm(nested(MAX_TREE_DEPTH * 2), {})

    expect(Object.values(errors)).toContain(TOO_DEEP)
  })

  it('refuses rather than passing, because a subtree nobody checked is not a subtree that passed', () => {
    // Not by address: that is the walk's stopping point, which depends on the
    // bound's exact value.
    expect(validateForm(nested(MAX_TREE_DEPTH * 2), {})).not.toEqual({})
  })

  it('and the projection stops instead, which is the documented disagreement', () => {
    // Asserted by answering the buried field: this depth does not overflow, so
    // `not.toThrow()` would pass with the bound deleted.
    const deep = nested(MAX_TREE_DEPTH * 2)

    expect(submittedData(deep, { buried: 'an answer' })).toEqual({})
    expect(submittedData(nested(20), { buried: 'an answer' })).toEqual({ buried: 'an answer' })
  })

  /**
   * `at` is the hidden node's depth, root 0. Checking visibility or depth first
   * gives different answers only at `MAX_TREE_DEPTH + 1`.
   */
  const hiddenAt = (at: number): ComponentNode => {
    let node: ComponentNode = {
      key: 'branch',
      type: 'Screen',
      props: {},
      renderWhen: { kind: 'static', value: false },
      children: [
        {
          key: 'buried',
          type: 'Field',
          props: {},
          schema: { type: 'string', validations: [{ key: 'required' }] },
        },
      ],
    }
    for (let i = at - 1; i > 0; i -= 1) {
      node = { key: 'box' + String(i), type: 'Screen', props: {}, children: [node] }
    }
    return { key: 'root', type: 'Screen', props: {}, children: [node] }
  }

  it('does not refuse a submit over a subtree past the bound that nobody can see', () => {
    expect(validateForm(hiddenAt(MAX_TREE_DEPTH + 1), {})).toEqual({})
  })

  it('still refuses when the node past the bound is one somebody can see', () => {
    expect(Object.values(validateForm(nested(MAX_TREE_DEPTH * 2), {}))).toContain(TOO_DEEP)
  })

  it('still validates a form nobody would call deep', () => {
    const errors = validateForm(nested(20), {})

    expect(errors).toEqual({ buried: DEFAULT_MESSAGES.required })
  })
})

describe('a document the submit path cannot read', () => {
  const withChildren = (children: unknown): ComponentNode =>
    ({ key: 'root', type: 'Screen', props: {}, children }) as unknown as ComponentNode

  const BROKEN: [string, unknown][] = [
    ['a number', 7],
    ['an object map, which is how a list round-trips through some stores', { '0': {} }],
    ['a string, which is iterable but not of nodes', 'ab'],
    ['a list holding null', [null]],
    ['a list holding a string', ['nope']],
  ]

  it.each(BROKEN)('validateForm survives children that are %s', (_what, children) => {
    expect(() => validateForm(withChildren(children), {})).not.toThrow()
  })

  it.each(BROKEN)('submittedData survives children that are %s', (_what, children) => {
    expect(() => submittedData(withChildren(children), {})).not.toThrow()
  })

  it('still walks the children a real document has', () => {
    const root = withChildren([
      {
        key: 'name',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [{ key: 'required' }] },
      },
    ])

    expect(validateForm(root, {})).toEqual({ name: DEFAULT_MESSAGES.required })
  })

  it('reports a validations entry that is not a rule rather than throwing', () => {
    const root = withChildren([
      {
        key: 'name',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [null] },
      },
    ])

    expect(() => validateForm(root, {})).not.toThrow()
    expect(validateForm(root, {})).toEqual({ name: UNREADABLE_RULE })
  })

  it('does not let an unreadable rule pass as satisfied', () => {
    const root = withChildren([
      { key: 'name', type: 'Field', props: {}, schema: { type: 'string', validations: [null] } },
    ])

    expect(validateForm(root, { name: 'anything' })).not.toEqual({})
  })
})

describe('a rule with no value to check against', () => {
  const VALUELESS: [string, unknown][] = [
    ['absent', undefined],
    ['null', null],
    ['a string', '5'],
    ['NaN', Number.NaN],
  ]

  // Each value satisfies its rule under a usable bound, so a row can only fail
  // because the bound is unusable.
  const SATISFYING: Record<string, JsonValue> = {
    minLength: 'abcd',
    maxLength: 'abcd',
    minItems: ['one', 'two'],
    maxItems: ['one', 'two'],
    min: 7,
    max: 7,
  }

  const MEASURING = ['minLength', 'maxLength', 'minItems', 'maxItems', 'min', 'max'] as const

  it.each(MEASURING.flatMap((key) => VALUELESS.map((bound) => [key, bound[0], bound[1]] as const)))(
    '%s with a bound that is %s does not pass',
    (key, _shape, bound) => {
      const rule = { key, value: bound } as unknown as ValidationRule

      expect(applyRule(rule, SATISFYING[key], {})).toBeDefined()
    },
  )

  it('and each of those values really does satisfy the rule when the bound is usable', () => {
    expect(applyRule({ key: 'minLength', value: 3 }, SATISFYING['minLength'], {})).toBeUndefined()
    expect(applyRule({ key: 'maxLength', value: 9 }, SATISFYING['maxLength'], {})).toBeUndefined()
    expect(applyRule({ key: 'minItems', value: 1 }, SATISFYING['minItems'], {})).toBeUndefined()
    expect(applyRule({ key: 'maxItems', value: 3 }, SATISFYING['maxItems'], {})).toBeUndefined()
    expect(applyRule({ key: 'min', value: 3 }, SATISFYING['min'], {})).toBeUndefined()
    expect(applyRule({ key: 'max', value: 9 }, SATISFYING['max'], {})).toBeUndefined()
  })

  it('still applies each of them when the bound is a real number', () => {
    expect(applyRule({ key: 'minLength', value: 3 }, 'abcd', {})).toBeUndefined()
    expect(applyRule({ key: 'minLength', value: 5 }, 'abcd', {})).toBeDefined()
    expect(applyRule({ key: 'maxLength', value: 3 }, 'ab', {})).toBeUndefined()
    expect(applyRule({ key: 'min', value: 3 }, 4, {})).toBeUndefined()
    expect(applyRule({ key: 'min', value: 5 }, 4, {})).toBeDefined()
    expect(applyRule({ key: 'max', value: 3 }, 2, {})).toBeUndefined()
  })

  it('leaves an empty value alone, because that is invariant 5', () => {
    for (const key of MEASURING) {
      const rule = { key } as unknown as ValidationRule

      expect(applyRule(rule, '', {}), key + ' failed on an empty value').toBeUndefined()
      expect(applyRule(rule, undefined, {}), key + ' failed on no answer').toBeUndefined()
    }
  })
})

describe('the row cap on the projection', () => {
  const repeater: ComponentNode = {
    key: 'addressList',
    dataKey: 'addresses',
    type: 'Repeater',
    props: {},
    schema: { type: 'array', validations: [] },
    children: [
      { key: 'line1', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ],
  }

  const root: ComponentNode = { key: 'root', type: 'Screen', props: {}, children: [repeater] }

  it('drops a list past the cap rather than projecting it', () => {
    const over = { addresses: Array.from({ length: MAX_ROWS + 1 }, () => ({ line1: 'x' })) }

    expect(submittedData(root, over)).toEqual({})
  })

  it('still projects a list under the cap', () => {
    const under = { addresses: [{ line1: 'x' }, { line1: 'y' }] }

    expect(submittedData(root, under)).toEqual(under)
  })
})

describe('submittedAcross and a key that lives on Object.prototype', () => {
  const PROTOTYPE_KEYS = ['toString', 'valueOf', 'constructor', 'hasOwnProperty', 'isPrototypeOf']

  const field = (key: string): ComponentNode => ({
    key,
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  const step = (name: string, children: ComponentNode[]): ComponentNode => ({
    key: 'step' + name,
    type: 'Box',
    props: {},
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: name },
      },
    },
    children,
  })

  // Two scopes, each with prototype-named fields, so the merge coalesces names
  // from both.
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      step('one', PROTOTYPE_KEYS.slice(0, 3).map(field)),
      step('two', PROTOTYPE_KEYS.slice(3).map(field)),
    ],
  }

  const scopes = [{ context: { step: 'one' } }, { context: { step: 'two' } }]

  const answers: FormData = Object.fromEntries(
    PROTOTYPE_KEYS.map((key) => [key, 'answered ' + key]),
  )

  it('carries every answer whose key is inherited from Object.prototype', () => {
    const payload = submittedAcross(root, answers, scopes)

    const lost = PROTOTYPE_KEYS.filter((key) => payload[key] !== 'answered ' + key)
    expect(lost, 'these answers were dropped from the submitted payload').toEqual([])
  })

  it('hands back a plain object rather than a null-prototype one', () => {
    // A host calling `payload.hasOwnProperty(...)` on a null-prototype object
    // throws.
    const payload = submittedAcross(root, answers, scopes)

    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
    expect(Object.hasOwn(payload, 'toString')).toBe(true)
  })

  it('still submits an ordinary answer, and only what the form asked', () => {
    const plain: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [step('one', [field('email')])],
    }

    const payload = submittedAcross(plain, { email: 'a@b.c', notAsked: 'x' }, [
      { context: { step: 'one' } },
    ])

    expect(payload).toEqual({ email: 'a@b.c' })
  })
})

describe('a repeater whose own rule fails while its answer is the wrong shape', () => {
  const list: ComponentNode = {
    key: 'addressList',
    dataKey: 'addresses',
    type: 'Repeater',
    props: {},
    schema: { type: 'array', validations: [{ key: 'required' }] },
    children: [
      { key: 'line1', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ],
  }

  const root: ComponentNode = { key: 'root', type: 'Screen', props: {}, children: [list] }

  it('keeps the message a person can act on', () => {
    // An empty string, because a non-empty one satisfies `required` and leaves
    // no prior error for `NOT_A_LIST` to overwrite.
    const errors = validateForm(root, { addresses: '' })

    expect(errors['addressList']).toBe(DEFAULT_MESSAGES.required)
  })

  it('still reports the shape when no rule of its own failed', () => {
    const optional: ComponentNode = {
      ...root,
      children: [{ ...list, schema: { type: 'array', validations: [] } }],
    }

    expect(validateForm(optional, { addresses: 'nope' })['addressList']).toBe(NOT_A_LIST)
    expect(validateForm(optional, { addresses: '' })['addressList']).toBe(NOT_A_LIST)
  })
})

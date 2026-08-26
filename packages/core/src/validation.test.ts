import { describe, expect, it } from 'vitest'

import type { ComponentNode, FormData, ValidationRule } from './types.js'
import {
  applyRule,
  autoValidateKeys,
  DEFAULT_MESSAGES,
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
    /*
     * This assertion used to say the opposite, and the opposite was wrong: it
     * let a required consent checkbox pass while unticked. `false` stays a
     * value for every other rule; requiredness alone is stricter, matching
     * `<input type="checkbox" required>`.
     */
    expect(check({ key: 'required' }, false)).toBe(DEFAULT_MESSAGES.required)
  })

  it('uses a custom message when supplied', () => {
    expect(check({ key: 'required', message: 'Need it.' }, '')).toBe('Need it.')
  })
})

describe('every non-required rule passes on an empty value', () => {
  // This is the bug the prior-art study found in the demo it examined: a field declaring only
  // a `url` rule reported "Required" when left blank. Requiredness is one rule's
  // job, and only one.
  const rules: ValidationRule[] = [
    { key: 'email' },
    { key: 'url' },
    { key: 'uuid' },
    { key: 'minLength', value: 5 },
    { key: 'min', value: 10 },
    { key: 'pattern', value: '^x+$' },
  ]

  it.each(rules)('$key passes on empty string', (rule) => {
    expect(check(rule, '')).toBeUndefined()
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
})

describe('expression-backed rules degrade permissively without an evaluator', () => {
  it('passes a custom rule when no evaluator is injected', () => {
    expect(check({ key: 'custom', expression: 'false' }, 'x')).toBeUndefined()
  })

  it('runs a custom rule when an evaluator is injected', () => {
    const evaluate = (expr: string): boolean => expr === 'true'
    expect(applyRule({ key: 'custom', expression: 'true' }, 'x', NO_DATA, evaluate)).toBeUndefined()
    expect(applyRule({ key: 'custom', expression: 'false' }, 'x', NO_DATA, evaluate)).toBe(
      DEFAULT_MESSAGES.custom,
    )
  })

  it('skips a computed guard when no evaluator is injected', () => {
    const rule: ValidationRule = { key: 'required', when: { kind: 'computed', expression: 'true' } }
    expect(check(rule, '')).toBeUndefined()
  })

  it('honours a static guard', () => {
    expect(check({ key: 'required', when: { kind: 'static', value: false } }, '')).toBeUndefined()
    expect(check({ key: 'required', when: { kind: 'static', value: true } }, '')).toBe(
      DEFAULT_MESSAGES.required,
    )
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

/**
 * Requiredness on a boolean.
 *
 * Found by writing docs/spec/08-validation.md: the prose said an unchecked
 * required box was caught, the code said otherwise, and the code was wrong. A
 * consent checkbox that passes while unticked is the whole reason the rule
 * exists.
 */
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
    // Requiredness is one rule's job; nothing else changes meaning.
    const node = box([{ key: 'minLength', value: 3 }])
    expect(validateField(node, { terms: false })).toBeUndefined()
  })
})

describe('autoValidateKeys', () => {
  /*
   * The Rules tab wrote `autoValidate` and nothing anywhere read it, so the
   * checkbox was decoration for the whole of the tab's life.
   */
  const tree: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      { key: 'eager', type: 'Field', props: {}, schema: { type: 'string', autoValidate: true } },
      { key: 'patient', type: 'Field', props: {}, schema: { type: 'string' } },
      {
        key: 'explicit',
        type: 'Field',
        props: {},
        schema: { type: 'string', autoValidate: false },
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
            schema: { type: 'string', autoValidate: true },
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

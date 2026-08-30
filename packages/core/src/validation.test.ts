import { describe, expect, it } from 'vitest'

import type { ComponentNode, Condition, FormData, ValidationRule } from './types.js'
import { contextValues } from './context.js'
import type { EvalOptions } from './validation.js'
import {
  DEFAULT_MESSAGES,
  UNREADABLE_RULE,
  applyRule,
  autoValidateKeys,
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
    // The answer is in the payload under `email`, so the field is satisfied
    // even though the component is called emailField.
    const errors = validateForm(root([node('emailField', 'email')]), { email: 'a@b.com' })
    expect(errors).toEqual({})
  })

  it('does not find the value under the component key', () => {
    const errors = validateForm(root([node('emailField', 'email')]), { emailField: 'a@b.com' })
    expect(errors['emailField']).toBe(DEFAULT_MESSAGES.required)
  })

  it('reports the error against the component key, not the data key', () => {
    /*
     * Two components may share a data key and still fail for different
     * reasons, so an error belongs to the component rather than the answer.
     */
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
  /*
   * A value stays in `data` after its field is hidden, so the payload carries
   * an answer to a question the form no longer asks. validateForm already
   * stops checking it; this is the other half.
   */
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
    // An accordion closing must not destroy what someone typed. This is a
    // projection applied at submit, not an edit to the value.
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
    /*
     * This decides which answers leave. Given a different context than the
     * renderer had, it strips answers to questions the user really was asked —
     * the disagreement `isVisible` exists to prevent, arriving through an
     * argument list rather than a second code path. It was reachable: the two
     * halves of this were built on separate branches and `submittedData` kept a
     * positional `evaluate` while everything else moved to the options bag.
     */
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
    /*
     * `out[key] = value` on an object literal runs the `__proto__` setter
     * rather than adding a property: the answer disappears from the payload and
     * the payload's prototype becomes whatever it pointed at. Data keys come
     * out of a document and the grammar for them is still only planned, so this
     * is reachable now rather than in theory.
     */
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

    // The literal `{ __proto__: … }` sets the prototype rather than a key, so
    // even building the input takes care. This is how ordinary a mistake it is.
    const data = JSON.parse('{"__proto__": {"polluted": true}}') as FormData
    expect(Object.hasOwn(data, '__proto__')).toBe(true)

    const out = submittedData(odd, data)

    expect(Object.hasOwn(out, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('agrees with validateForm about what is on screen', () => {
    /*
     * The two must not disagree: a field validateForm checks and this drops
     * would be required and unsendable, and the reverse sends an answer nobody
     * checked.
     */
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
  /*
   * A three-step form, each step a container shown when `context.step` matches.
   * The trap is measured rather than described: submitting from the last step
   * validates only the last step, so an answer skipped on step two is accepted.
   */
  const field = (key: string): ComponentNode => ({
    key,
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }] },
  })

  const step = (name: string, children: ComponentNode[]): ComponentNode => ({
    key: 'step-' + name,
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

  /*
   * The steps as a server would take them: out of the document, never out of
   * the request. A value that is not a string is not a step name, so it is not
   * quietly stringified into one.
   */
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
    // Not a wish: this is what validateForm does, correctly, and why the merge
    // below has to exist. `city` was required and never answered.
    expect(validateForm(wizard, answered, onStep('pay'))).toEqual({})
  })

  it('catches it when every step is checked', () => {
    const scopes = ['who', 'where', 'pay'].map(onStep)
    expect(validateAcross(wizard, answered, scopes)).toEqual({ city: DEFAULT_MESSAGES.required })
  })

  it('takes the steps from the document, so a client cannot name only its own', () => {
    /*
     * The server never asks the browser which steps exist. A client that named
     * only `pay` would have the rest go unchecked, and unlike a blocked submit
     * that failure is invisible.
     */
    const scopes = stepScopes(wizard)
    expect(scopes).toHaveLength(3)
    expect(validateAcross(wizard, answered, scopes)).toEqual({ city: DEFAULT_MESSAGES.required })
  })

  it('is empty when every step is satisfied', () => {
    const scopes = stepScopes(wizard)
    expect(validateAcross(wizard, { ...answered, city: 'Ely' }, scopes)).toEqual({})
  })

  it('merges nothing into an empty scope list, rather than validating everything', () => {
    // A document that declares no steps yields no scopes, and the honest answer
    // to "validate across nothing" is nothing. A host that means the whole form
    // calls validateForm.
    expect(validateAcross(wizard, {}, [])).toEqual({})
  })
})

describe('length rules on a value that is not text', () => {
  /*
   * `jsonToString` returns '' for anything that is not a string, number or
   * boolean, so an array measured zero: `minLength: 2` failed for every
   * multi-select no matter how many options were chosen, and `maxLength` passed
   * for all of them. Silently, with the chosen options on screen and a message
   * saying the answer was too short.
   */
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
    // `isEmpty` counts an empty array as empty, and only `required` fails on
    // an empty value. A `minLength` on an unanswered multi-select must not
    // report before the user has touched it.
    expect(check({ key: 'minLength', value: 1 }, [])).toBeUndefined()
    expect(check({ key: 'required' }, [])).toBe(DEFAULT_MESSAGES.required)
  })
})

/**
 * A rule tag this code does not recognise.
 *
 * The same shape as the `renderWhen` typo, one function over. Both switches are
 * exhaustive over a closed union and neither had a tail, so an unrecognised tag
 * returned `undefined` — read as *guard not satisfied* in one and as *the value
 * passed* in the other. Either way the rule silently stopped applying, which on
 * the server is a required answer becoming optional with nothing logged.
 */
describe('a validation tag this code cannot read', () => {
  it('applies a rule whose guard is unreadable, rather than skipping it', () => {
    const rule = {
      key: 'required',
      when: { kind: 'conditon', condition: { op: 'truthy', value: { kind: 'literal', value: 1 } } },
    }

    // A guard that cannot be read has not said no. Skipping the rule is the
    // permissive answer, and permissive is the direction that fails silently.
    expect(check(rule as unknown as ValidationRule, '')).toBe(DEFAULT_MESSAGES.required)
  })

  it('still honours a guard it can read', () => {
    // The control. If an unreadable guard passing were achieved by ignoring
    // guards altogether, this would fail.
    const rule: ValidationRule = { key: 'required', when: { kind: 'static', value: false } }
    expect(check(rule, '')).toBeUndefined()
  })

  it('fails a rule whose key is unreadable, rather than passing the value', () => {
    // `{ key: 'requird' }` used to fall off the second switch and read as "the
    // value is fine", so a mistyped rule was a rule that never ran.
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

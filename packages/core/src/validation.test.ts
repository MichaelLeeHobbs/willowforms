import { describe, expect, it } from 'vitest'

import type { ComponentNode, Condition, FormData, ValidationRule } from './types.js'
import { contextValues } from './context.js'
import type { EvalOptions, Evaluator } from './validation.js'
import {
  DEFAULT_MESSAGES,
  MAX_ROWS,
  TOO_MANY_ROWS,
  UNREADABLE_RULE,
  applyRule,
  isRequired,
  autoValidateKeys,
  patternProblem,
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
  /*
   * This is the bug the prior-art study found in the demo it examined: a field
   * declaring only a `url` rule reported "Required" when left blank.
   * Requiredness is one rule's job, and only one.
   *
   * Invariant 5, and it was enforced for six of the nine rules and for one shape
   * of empty. `maxLength`, `max` and `custom` were not listed, and only `''` was
   * tried -- while `required`'s own test says empty means `undefined`, `null`,
   * `''`, whitespace and `[]`. An invariant checked on two thirds of its
   * subjects is a rule with three exceptions nobody wrote down.
   *
   * What each half earns is worth being exact about. Removing the empty guard
   * for `maxLength`, `max` or `custom` fails none of these rows, because those
   * three pass an empty value anyway -- 0 is within any maximum, and `custom`
   * with no evaluator passes. Their rows state the contract rather than
   * exercising the mechanism, and that is still worth having: invariant 5 is a
   * claim about behaviour, and a later rewrite of `maxLength` that decided an
   * empty answer is too short would be caught here.
   *
   * The empty *shapes* do exercise it. Measured: with `isEmpty` no longer
   * counting whitespace or an empty list, twelve of these rows go red.
   */
  const rules: ValidationRule[] = [
    { key: 'email' },
    { key: 'url' },
    { key: 'uuid' },
    { key: 'minLength', value: 5 },
    { key: 'maxLength', value: 5 },
    { key: 'min', value: 10 },
    { key: 'max', value: 10 },
    { key: 'pattern', value: '^x+$' },
    { key: 'custom', expression: 'false' },
  ]

  it('covers every rule the union has except required', () => {
    /*
     * Read from the message table rather than listed here, so a rule added
     * later is not silently outside the invariant. `DEFAULT_MESSAGES` is typed
     * as a total record over the union, which is what makes it the right source.
     */
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
  ]

  it.each(
    rules.flatMap((rule) => EMPTY.map((empty) => [rule.key, empty[0], rule, empty[1]] as const)),
  )('%s passes on %s', (_key, _shape, rule, value) => {
    expect(check(rule, value)).toBeUndefined()
  })

  it('still fails each of them on a value that is not empty', () => {
    /*
     * The control, and it is the whole difference between "the rule passes on
     * empty" and "the rule never fails". Without it a rule that returned
     * undefined unconditionally would satisfy every row above.
     */
    expect(check({ key: 'email' }, 'nope')).toBeDefined()
    expect(check({ key: 'url' }, 'nope')).toBeDefined()
    expect(check({ key: 'uuid' }, 'nope')).toBeDefined()
    expect(check({ key: 'minLength', value: 5 }, 'ab')).toBeDefined()
    expect(check({ key: 'maxLength', value: 5 }, 'abcdef')).toBeDefined()
    expect(check({ key: 'min', value: 10 }, 9)).toBeDefined()
    expect(check({ key: 'max', value: 10 }, 11)).toBeDefined()
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
    /*
     * The rule was tested against `not a url` only, so what it did with a
     * scheme was unmeasured — and this rule is what a host trusts before it
     * writes an answer into an `href`. `javascript:` parses perfectly well.
     * `isUrl` asks `safeHref` for exactly this reason and nothing said so.
     */
    expect(check({ key: 'url' }, value)).toBe(DEFAULT_MESSAGES.url)
  })

  it('accepts the schemes a link can safely carry', () => {
    // The control. A rule that refused everything would pass the rows above.
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
    /*
     * Only the no-evaluator direction was tested, so a guard that answered
     * "skip" whatever the expression said would have passed: the permissive
     * half was pinned and the half that makes a rule apply was not. This is
     * `required` on an empty value, so the guard alone decides the outcome.
     */
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
    /*
     * Every evaluator in this file was `(expression) => expression === 'true'`,
     * so the third argument could be dropped at the call site and nothing would
     * say so -- and a `computed` guard reading `context.user.role` would then
     * evaluate against `undefined`, come back falsy, and stop applying a
     * `required` rule on the server. That is the permissive failure, arrived at
     * through a parameter list.
     *
     * Both call sites pass it and both are checked here: the guard and the
     * `custom` rule.
     */
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
    /*
     * The fourth guard kind, and the only one with no test. An `i18n` binding
     * names a translated string; it is not a decision, so there is nothing for
     * it to say no with, and the rule applies. Flip that to `false` and every
     * rule carrying an `i18n` guard stops applying, quietly, which is the
     * direction this whole file leans against.
     */
    const rule: ValidationRule = { key: 'required', when: { kind: 'i18n', key: 'when_required' } }

    expect(check(rule, '')).toBe(DEFAULT_MESSAGES.required)
    expect(check(rule, 'Ada')).toBeUndefined()
  })
})

/**
 * What a kit asks before it writes `aria-required` on a control.
 *
 * Exported from core, called from four places across the two kits, and driven
 * by no test in the repository until now -- `kit-contract.test.tsx` reaches it
 * only through `[{key:'required'}]` and `[]`, which is the easy half. Drop
 * `&& !rule.when` and a conditionally-required field is announced to a screen
 * reader as always mandatory, which is the case the function's own docblock
 * says it exists to avoid.
 */
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
    // Including a guard that is statically true: what a screen reader is told
    // has to match what the form does now, and `isRequired` is asked without
    // the data or the evaluator that would settle it.
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
    /*
     * Requiredness is one rule's job; nothing else changes meaning.
     *
     * `minLength` on a boolean used to be the fixture here, and it passes under
     * either reading: a rule that skipped `false` as empty and a rule that ran
     * and found nothing to measure both answer "fine". A custom rule tells them
     * apart, because every rule but `required` short-circuits on an empty value
     * — so if `false` were empty this expression would never run and the
     * assertion would flip.
     */
    const evaluate: Evaluator = () => false
    const node = box([{ key: 'custom', expression: 'never' }])

    expect(validateField(node, { terms: false }, { evaluate })).toBe(DEFAULT_MESSAGES.custom)
    // And the empty answer really is skipped, which is what makes that a test.
    expect(
      validateField(box([{ key: 'custom', expression: 'never' }]), {}, { evaluate }),
    ).toBeUndefined()
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
    // `stepWho`, not `step-who`: a hyphen is not in the key grammar, so the
    // fixture was a document `validateDocument` refuses -- a wizard nobody
    // could have authored, standing in for the one people do.
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

  it('keeps the first message when two scopes report the same field', () => {
    /*
     * A field can be reported under more than one scope, and the merge takes the
     * first message rather than the last. Which one is arbitrary; that it is
     * decided is not, because a caller showing "Too short" where the earlier
     * step said "Required" is a form arguing with itself.
     *
     * The fixture this replaces could not collide. It used two components keyed
     * `nickname` and `nickname2`, and `validateForm` keys an error by the
     * *node's* key -- so the two never shared an entry and the merge had nothing
     * to resolve. Two nodes can never collide, because keys are unique in a
     * document.
     *
     * One node reported twice is the case that exists: a field outside every
     * step is visible under every scope. Two guarded rules on it, each applying
     * in a different step, make the two visits produce different messages -- so
     * "the first wins" is observable rather than asserted about identical
     * strings.
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

    // Each scope on its own reports its own message, which is what makes the
    // merge a choice rather than a formality.
    expect(validateForm(shared, {}, onStep('who'))['nickname']).toBe('The first step says so.')
    expect(validateForm(shared, {}, onStep('where'))['nickname']).toBe('The second step says so.')

    const merged = validateAcross(shared, {}, ['who', 'where'].map(onStep))
    expect(Object.keys(merged)).toEqual(['nickname'])
    expect(merged['nickname']).toBe('The first step says so.')

    // And the order is the scope order, not the rule order: reversing the
    // scopes reverses the answer.
    const backwards = validateAcross(shared, {}, ['where', 'who'].map(onStep))
    expect(backwards['nickname']).toBe('The second step says so.')
  })

  it('merges nothing into an empty scope list, rather than validating everything', () => {
    // A document that declares no steps yields no scopes, and the honest answer
    // to "validate across nothing" is nothing. A host that means the whole form
    // calls validateForm.
    expect(validateAcross(wizard, {}, [])).toEqual({})
  })
})

/**
 * The merge is the submit gate, and it read names off `Object.prototype`.
 *
 * `validateForm` builds its errors on a null prototype and explains why. The
 * merge one function below built on `{}` and coalesced with `??=`, so a message
 * keyed `toString` was compared against `Object.prototype.toString`, found not
 * nullish, and dropped. `Object.keys` on the result is then empty, and empty is
 * what every caller reads as a valid form — `apps/demo-server` submits on
 * exactly that check.
 *
 * Nothing has to be bypassed to reach it. `toString`, `valueOf` and
 * `hasOwnProperty` all pass `KEY_PATTERN`, and nothing on the render or
 * validate path calls `validateDocument`, which is the same reason the
 * `__proto__` twin above is reachable.
 */
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

  /*
   * Two scopes, not one, so the coalescing branch is the code under test rather
   * than a single pass that never merges anything.
   */
  const scopes = ['who', 'where'].map(onStep)

  const wizardWith = (key: string): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [step('who', [required(key)]), step('where', [required('city')])],
  })

  // The answer to every field except the one under test, so the only thing that
  // can make the gate report a problem is the inherited key.
  const answered: FormData = { city: 'Ely' }

  const inherited = ['toString', 'valueOf', 'hasOwnProperty', 'constructor', 'isPrototypeOf']

  it.each(inherited)('reports a required field keyed %s', (key) => {
    const errors = validateAcross(wizardWith(key), answered, scopes)

    expect(Object.hasOwn(errors, key)).toBe(true)
    expect(errors[key]).toBe(DEFAULT_MESSAGES.required)
  })

  it.each(inherited)('does not read as a valid form when only %s is missing', (key) => {
    /*
     * The consequence in the shape the caller reads it. The demo server
     * submits when `Object.keys(errors).length === 0`, so a dropped message is
     * not a cosmetic loss — it is a submit accepted with a required answer
     * missing.
     */
    expect(Object.keys(validateAcross(wizardWith(key), answered, scopes))).toEqual([key])
  })

  it('reports a field whose key is __proto__', () => {
    // The twin of the `validateForm` pin above. It was pinned for the walk and
    // not for the merge, which is the shape this whole run exists to stop.
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
    // A control. The merge never reached the inherited setter even unfixed,
    // because `??=` read a truthy `Object.prototype` and skipped the write.
    expect(({} as Record<string, unknown>)['email']).toBeUndefined()
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

/**
 * Two ways a required answer stopped being required, both silent, both on the
 * server.
 *
 * The first is an empty object: `isEmpty` fell through to `false` for anything
 * that was not a string or an array, so `{"consent": {}}` satisfied `required`.
 * The second is a key named `__proto__`: the error message was computed
 * correctly and then assigned into a plain object literal, where `__proto__` is
 * a setter rather than a slot, so the assignment evaporated and `validateForm`
 * returned an empty object — a valid form.
 *
 * `validateDocument` refuses that key. Nothing on the render or validate path
 * calls `validateDocument`, which is what makes it reachable.
 */
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
    // The control. Reading every object as empty would be its own bug: an
    // object-typed field with an answer in it is answered.
    expect(validateForm(root([field('consent')]), { consent: { agreed: true } })).toEqual({})
  })

  it('reports a field whose key is __proto__', () => {
    /*
     * The message was always computed. It was the *assignment* that vanished:
     * `errors['__proto__'] = message` on an object literal runs the inherited
     * setter and creates no own property, so the result had zero keys and read
     * as a valid form.
     */
    const errors = validateForm(root([field('__proto__')]), {})

    expect(Object.keys(errors)).toEqual(['__proto__'])
    expect(Object.hasOwn(errors, '__proto__')).toBe(true)
  })

  it('does not let a hostile key reshape the errors it returns', () => {
    const errors = validateForm(root([field('__proto__'), field('email')]), {})

    // The other field still reports, and nothing has been written onto a
    // prototype that a later `errors[key]` read could pick up.
    expect(Object.keys(errors).sort()).toEqual(['__proto__', 'email'])
    expect(({} as Record<string, unknown>)['email']).toBeUndefined()
  })
})

/**
 * A pattern is authored in a document and run on the server against text an
 * attacker chose.
 *
 * `new RegExp(pattern).test(value)` with no cap on either side. The classic
 * shape is an unbounded quantifier wrapped in another one — `^(a+)+$` against
 * forty non-matching characters pins a thread, and a form runs one of these per
 * field per row of every repeater.
 *
 * Nothing here can make a backtracking engine linear, so the answer is narrower
 * and it is stated rather than implied: the shapes that go exponential are
 * refused when the rule is applied, and the text a pattern is run against is
 * bounded. `docs/build-out/triage.md` records what that still leaves.
 */
describe('a pattern rule', () => {
  const pattern = (value: string, against: string): string | undefined =>
    check({ key: 'pattern', value }, against)

  it('still does what a pattern is for', () => {
    expect(pattern('^[A-Z]{2}\\d{4}$', 'AB1234')).toBeUndefined()
    expect(pattern('^[A-Z]{2}\\d{4}$', 'nope')).toBe(DEFAULT_MESSAGES.pattern)
  })

  it.each([
    ['a quantified group that is itself quantified', '^(a+)+$'],
    ['the same shape with a star', '^(a*)*$'],
    ['a nested group', '^((a+)*)+$'],
  ])('refuses %s rather than running it', (_what, source) => {
    /*
     * Refused means the rule fails, not that it passes. A pattern the engine
     * cannot be trusted with has not been satisfied, and a silent pass is how a
     * constraint stops applying on the server.
     */
    expect(pattern(source, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX')).toBe(DEFAULT_MESSAGES.pattern)
  })

  it('does not catch every blowup, and says so', () => {
    /*
     * `(a|a)*` is exponential too and is not refused: no cheap syntactic rule
     * separates a dangerous alternation from `(ab|cd)+`. It is here so the
     * limit is written down in the suite rather than only in a comment — if a
     * later change does start catching it, this test says so.
     */
    expect(pattern('^(ab|cd)+$', 'abcd')).toBeUndefined()
  })

  it('allows a bounded inner quantifier, which is what real patterns look like', () => {
    // `(\d{3}-)+` is a phone number, not an attack: the inner repetition has a
    // fixed length, so there is nothing for the engine to try two ways.
    expect(pattern('^(\\d{3}-)+\\d{4}$', '123-456-7890')).toBeUndefined()
    expect(pattern('^(\\d{3}-)+\\d{4}$', 'nope')).toBe(DEFAULT_MESSAGES.pattern)
  })

  it('does not run a pattern against unbounded text', () => {
    // An answer to a form field is not a megabyte. Bounding the input does not
    // make an exponential pattern safe, but it does cap every polynomial one.
    const long = 'a'.repeat(20_000)
    expect(pattern('^a*$', long)).toBe(DEFAULT_MESSAGES.pattern)
    expect(pattern('^a*$', 'a'.repeat(100))).toBeUndefined()
  })

  it('still refuses a pattern that is not a pattern', () => {
    // The existing behaviour, kept: an unfinished pattern matches nothing,
    // which is the same answer it gives once the author closes the bracket.
    expect(pattern('^(a', 'a')).toBe(DEFAULT_MESSAGES.pattern)
  })
})

/**
 * Three holes in this file, each one a branch nothing executed.
 *
 * Every case here was written by mutating the source and watching the suite
 * stay green. That is the only evidence a test is doing anything, and it is how
 * these were found: `guardPasses`' whole condition branch could be replaced with
 * `return false` and nothing went red.
 */
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
      /*
       * `rule.message ?? DEFAULT` keeps `''`, because `''` is not nullish — and
       * `validateForm` records an error only `if (error)`, so an empty string
       * made the rule stop failing. A pasted `"message": ""` turned a required
       * field optional on the server with nothing to see.
       */
      expect(check({ key: 'required', message: '' }, '')).toBe(DEFAULT_MESSAGES.required)
    })

    it('reaches validateForm, which is where it mattered', () => {
      const errors = validateForm(root([field('email', [{ key: 'required', message: '' }])]), {})

      expect(errors).toEqual({ email: DEFAULT_MESSAGES.required })
    })

    it('still prefers a message the author wrote', () => {
      // The control. Ignoring `message` entirely would pass both tests above.
      expect(check({ key: 'required', message: 'We need this.' }, '')).toBe('We need this.')
    })
  })

  describe('a rule guarded by a structured condition', () => {
    /*
     * The whole no-sandbox story, and no test executed it. `guardPasses`'
     * `condition` branch could be replaced with `return false` and the entire
     * repository suite stayed green — which would have made every guarded rule
     * silently stop applying.
     */
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
      // Both directions above, on one fixture, which is what makes this a test
      // of the branch and not of its presence.
      expect(validateForm(root([guarded()]), {})).toEqual({})
    })
  })

  describe('submittedData over a repeater', () => {
    /*
     * The row branch had no fixture at all: deleting the `isRowScope` case left
     * every test green. Named so the two names differ, because a fixture that
     * spells them the same cannot see the branch that tells them apart.
     */
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
      // The point of `submittedData`: it projects the document over the data,
      // so an answer to a question that has been deleted does not survive.
      const data = { addresses: [{ line1: 'kept', removed: 'gone' }], email: '' }

      expect(submittedData(withRows(), data)).toEqual({ addresses: [{ line1: 'kept' }], email: '' })
    })

    it('reads a repeater whose stored value is not a list as no answer at all', () => {
      /*
       * Not `addresses: []`, which is what this used to expect. An empty list is
       * an answer -- "I have no addresses" -- and inventing one for a value the
       * form never collected is the thing `submittedData` exists to stop: it
       * submits what was asked and given, and nothing else.
       */
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

/**
 * Two rules that let through exactly what they exist to stop.
 */
describe('bounds and schemes', () => {
  it('fails min and max on a value that is not a number', () => {
    /*
     * `Number('not telling')` is `NaN`, and every comparison with `NaN` is
     * false — so `min` and `max` both passed. The exported schema says
     * `{"type":"number","minimum":18}` while the form accepts a sentence.
     */
    expect(check({ key: 'min', value: 18 }, 'not telling')).toBe(DEFAULT_MESSAGES.min)
    expect(check({ key: 'max', value: 65 }, 'not telling')).toBe(DEFAULT_MESSAGES.max)
  })

  it('still compares numbers, however they were typed', () => {
    // The control. A number field's value can arrive as a string from an input.
    expect(check({ key: 'min', value: 18 }, 21)).toBeUndefined()
    expect(check({ key: 'min', value: 18 }, '21')).toBeUndefined()
    expect(check({ key: 'min', value: 18 }, 3)).toBe(DEFAULT_MESSAGES.min)
    expect(check({ key: 'max', value: 65 }, '70')).toBe(DEFAULT_MESSAGES.max)
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd'])(
    'refuses %s as a URL',
    (value) => {
      /*
       * `URL.canParse` answers yes to any well-formed URL, scheme included —
       * and `safeHref` in the same package keeps an allowlist precisely because
       * these schemes are the ones that matter. A `url` rule that accepts
       * `javascript:` tells an author their field holds a link.
       */
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
describe('a pattern whose outer quantifier is bounded and whose inner is not', () => {
  /*
   * Each row supplies a value the pattern *matches*, which is what separates
   * "refused" from "ran and did not match". Both answer with the same message,
   * so a helper that fed every pattern a non-matching string would report every
   * one of them as refused -- including the controls -- and the table would have
   * proved nothing. That was the first version of this block.
   */
  const refused = (pattern: string, matching: string): boolean =>
    check({ key: 'pattern', value: pattern }, matching) === DEFAULT_MESSAGES.pattern

  it.each([
    ['(a+){10}b', 'aaaaaaaaaab', 'the shape the review named'],
    ['(a*){8}b', 'b', 'with a star inside'],
    ['(a+){2,5}b', 'aab', 'and with a range outside'],
    ['((a+)*){3}b', 'ab', 'and nested two deep'],
  ])('refuses %s — %s', (pattern, matching) => {
    expect(refused(pattern, matching)).toBe(true)
  })

  it.each([
    ['(a+){1}b', 'ab', 'one repetition cannot backtrack between groups'],
    ['(a+)?b', 'b', 'and neither can none-or-one'],
    ['(\\d{3}-){4}x', '123-456-789-012-x', 'a fixed-length inner group is common'],
    ['(\\d{1,3}\\.){3}\\d{1,3}', '10.0.0.1', 'and an IP address must keep working'],
  ])('still runs %s — %s', (pattern, matching) => {
    // The controls. A guard that refused every quantified group would pass every
    // assertion above and break patterns people actually write.
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
    /*
     * The same answer the `default` case in `guardPasses` gives an unreadable
     * guard, and for the same reason. The other direction is a required answer
     * quietly becoming optional on the server, which is the permissive failure
     * this project is organised against.
     */
    expect(validateForm(root(guardedRule()), {}, { evaluate: boom })).toEqual({
      spouse: DEFAULT_MESSAGES.required,
    })
  })

  it('does not escape validateForm from a custom rule', () => {
    expect(() => validateForm(root(customRule()), { code: 'x' }, { evaluate: boom })).not.toThrow()
  })

  it('fails the custom rule, because a rule that cannot be run has not been satisfied', () => {
    /*
     * The same answer `matchesPattern` gives a pattern it refuses to run, in the
     * same file. Not the same as a host that supplied no evaluator at all: that
     * is a configuration the boot-time `evaluatorKeys` check already covers, and
     * failing every custom rule for it would be wrong.
     */
    expect(validateForm(root(customRule()), { code: 'x' }, { evaluate: boom })).toEqual({
      code: DEFAULT_MESSAGES.custom,
    })
  })

  it('still runs a custom rule whose evaluator works', () => {
    // The control, in both directions.
    const yes: Evaluator = () => true
    const no: Evaluator = () => false

    expect(validateForm(root(customRule()), { code: 'x' }, { evaluate: yes })).toEqual({})
    expect(validateForm(root(customRule()), { code: 'x' }, { evaluate: no })).toEqual({
      code: DEFAULT_MESSAGES.custom,
    })
  })
})

/**
 * Three ways a rule read the wrong thing, or nothing.
 */
describe('rules that a document can malform or misplace', () => {
  it('fails a pattern rule that carries no pattern rather than throwing', () => {
    /*
     * A document is data, so `{ key: 'pattern' }` with no `value` arrives from a
     * paste, and `nestedUnbounded(undefined)` read `.length` off it -- out of
     * `validateForm`, which is a 500 on submit. The same answer a pattern this
     * refuses to run already gets.
     */
    expect(() => check({ key: 'pattern' } as ValidationRule, 'x')).not.toThrow()
    expect(check({ key: 'pattern' } as ValidationRule, 'x')).toBe(DEFAULT_MESSAGES.pattern)
  })

  it('evaluates a custom rule inside a row against that row', () => {
    /*
     * `validateField` already resolves the *value* from the row, and the custom
     * rule handed the expression top-level `FormData` -- so it checked a key
     * from outside the row and reported against the row it never read.
     *
     * The fixture's two names differ, because that is the distinction the code
     * branches on: the row is addressed by the repeater's data key.
     */
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
    /*
     * The control, and why the row's values are layered over the form's rather
     * than replacing them: an expression comparing a row answer against
     * something asked once, at the top of the form, has to reach both.
     */
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

/**
 * The reason a pattern will not be run, said once.
 *
 * A refused pattern makes the rule *fail*, so an author who typed one saw a
 * perfectly ordinary rule in the panel and every answer rejected on the server.
 * `patternProblem` is what the Rules tab shows while it can still be fixed, and
 * it is the same function `matchesPattern` decides with -- two sentences about
 * one rule is how the two come to disagree.
 */
describe('patternProblem', () => {
  it.each([
    ['(a+)+$', 'an unbounded repeat inside another'],
    ['(a+){10}b', 'and a bounded one wrapping an unbounded one'],
    ['(', 'a pattern that does not compile'],
    ['[a-', 'an unterminated class'],
  ])('reports %s — %s', (pattern) => {
    expect(patternProblem(pattern)).toBeDefined()
  })

  it.each(['^\\d{5}$', '(\\d{3}-){4}x', '(\\d{1,3}\\.){3}\\d{1,3}', '', '^[A-Z]{2}$'])(
    'says nothing about %s',
    (pattern) => {
      // The controls, including the empty one: it compiles, it matches
      // everything, and it is what a half-typed rule looks like. Reporting it
      // would put an error under the field before the first character.
      expect(patternProblem(pattern)).toBeUndefined()
    },
  )

  it('agrees with the rule, which is the point of it being one function', () => {
    /*
     * Every pattern this reports has to be one the engine refuses, and refusing
     * means the rule fails. If these two ever answered differently, the panel
     * would be describing a rule the server does not run.
     */
    for (const pattern of ['(a+)+$', '(a+){10}b', '(']) {
      expect(patternProblem(pattern)).toBeDefined()
      expect(check({ key: 'pattern', value: pattern }, 'aaaaaaaaaab')).toBe(
        DEFAULT_MESSAGES.pattern,
      )
    }
  })
})

/**
 * The cap on how much work a request body can ask for.
 *
 * `MAX_ROWS` and `TOO_MANY_ROWS` appeared in `validation.ts` and in the
 * re-export from `index.ts` and in no test anywhere in the repository. The row
 * count comes out of the data on purpose -- asking the browser how many rows
 * there are would let a client submit one and have the rest go unchecked -- so
 * the body decides how much work happens, and rows nest multiplicatively.
 *
 * Both directions matter. Delete the cap and a couple of hundred kilobytes of
 * JSON is millions of rule evaluations; flip the comparison and every repeater
 * refuses instead, which is a form nobody can submit.
 */
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

    // At the repeater's own address, and alone: a prefix that validated clean
    // would answer with the rows nobody looked at reported as fine.
    expect(errors).toEqual({ addressList: TOO_MANY_ROWS })
  })

  it('checks a list exactly at the cap', () => {
    /*
     * The boundary, and the control for the direction of the comparison. With
     * `<` in place of `>` this list would report `TOO_MANY_ROWS` too, and the
     * test above would still pass.
     */
    const full = rows(MAX_ROWS)
    expect(validateForm(root, full)).toEqual({})

    const last = (full['addresses'] as FormData[])[MAX_ROWS - 1]
    delete last?.['line1']
    expect(validateForm(root, full)).toEqual({
      ['addresses[' + String(MAX_ROWS - 1) + '].street']: DEFAULT_MESSAGES.required,
    })
  })
})

/**
 * A repeater that fails its own rule and is also over the cap.
 *
 * The rules on the repeater itself are checked first and write to the same
 * address, so `TOO_MANY_ROWS` overwrote them -- losing the message a person can
 * act on for one about the size of a body they did not choose.
 */
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
    // The control, and the reason the cap is there at all.
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

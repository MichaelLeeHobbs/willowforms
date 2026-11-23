import { describe, expect, it } from 'vitest'

import {
  MAX_CONTEXT_VALUES,
  contextKeys,
  contextValues,
  evaluatorKeys,
  missingContext,
} from './context.js'
import { MAX_CONDITION_DEPTH, evaluateCondition, same } from './condition.js'
import { validateForm } from './validation.js'
import type { ComponentNode, Condition, JsonValue, Operand } from './types.js'

const ctx = (path: string): Operand => ({ kind: 'context', path })
const lit = (value: string): Operand => ({ kind: 'literal', value })
const required = { type: 'string' as const, validations: [{ key: 'required' as const }] }

const isAdmin: Condition = { op: 'eq', left: ctx('user.role'), right: lit('admin') }

function tree(children: ComponentNode[]): ComponentNode {
  return { key: 'root', type: 'Form', props: {}, children }
}

describe('contextKeys', () => {
  it('finds a path in a visibility rule', () => {
    const root = tree([
      {
        key: 'secret',
        type: 'Field',
        props: {},
        renderWhen: { kind: 'condition', condition: isAdmin },
      },
    ])
    expect([...contextKeys(root)]).toEqual(['user.role'])
  })

  it('finds a path in a property binding', () => {
    const root = tree([
      {
        key: 'a',
        type: 'Field',
        props: {
          disabled: { kind: 'condition', condition: { op: 'truthy', value: ctx('locked') } },
        },
      },
    ])
    expect([...contextKeys(root)]).toEqual(['locked'])
  })

  it('finds a path in a validation rule guard', () => {
    const root = tree([
      {
        key: 'a',
        type: 'Field',
        props: {},
        schema: {
          type: 'string',
          validations: [{ key: 'required', when: { kind: 'condition', condition: isAdmin } }],
        },
      },
    ])
    expect([...contextKeys(root)]).toEqual(['user.role'])
  })

  it('finds paths buried in a group and under a not', () => {
    const root = tree([
      {
        key: 'a',
        type: 'Field',
        props: {},
        renderWhen: {
          kind: 'condition',
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'truthy', value: ctx('deep.one') } },
              { op: 'in', value: ctx('deep.two'), options: ['x'] },
            ],
          },
        },
      },
    ])
    expect([...contextKeys(root)].sort()).toEqual(['deep.one', 'deep.two'])
  })

  it('is empty for a document that reads no context', () => {
    const root = tree([
      {
        key: 'a',
        type: 'Field',
        props: {},
        renderWhen: {
          kind: 'condition',
          condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'consent' } },
        },
      },
      { key: 'b', type: 'Field', props: {}, renderWhen: { kind: 'computed', expression: 'x' } },
    ])
    expect([...contextKeys(root)]).toEqual([])
  })
})

describe('missingContext', () => {
  const root = tree([
    {
      key: 'a',
      type: 'Field',
      props: {},
      renderWhen: {
        kind: 'condition',
        condition: {
          op: 'and',
          conditions: [isAdmin, { op: 'truthy', value: ctx('flags.beta') }],
        },
      },
    },
  ])

  it('names every path the context does not hold, sorted', () => {
    expect(missingContext(root, {})).toEqual(['flags.beta', 'user.role'])
    expect(missingContext(root, { user: { role: 'admin' } })).toEqual(['flags.beta'])
  })

  it('is empty when the host supplied everything', () => {
    expect(missingContext(root, { user: { role: 'admin' }, flags: { beta: true } })).toEqual([])
  })

  it('does not call a false or a zero missing', () => {
    expect(missingContext(root, { user: { role: '' }, flags: { beta: false } })).toEqual([])
  })
})

describe('the failure missingContext exists to catch', () => {
  const root = tree([
    {
      key: 'reason',
      type: 'Field',
      props: {},
      schema: required,
      renderWhen: { kind: 'condition', condition: isAdmin },
    },
  ])

  it('validates the field when the context is supplied', () => {
    expect(validateForm(root, {}, { context: { user: { role: 'admin' } } })).toEqual({
      reason: 'This field is required.',
    })
  })

  it('silently skips it when the context is not, which is why the check is at boot', () => {
    expect(validateForm(root, {})).toEqual({})
    expect(missingContext(root, {})).toEqual(['user.role'])
  })
})

describe('what counts as supplied', () => {
  const root = tree([
    {
      key: 'secret',
      type: 'Field',
      props: {},
      renderWhen: { kind: 'condition', condition: isAdmin },
      schema: required,
    },
  ])

  it.each([
    ['null', null],
    ['false', false],
    ['zero', 0],
    ['empty text', ''],
  ])('treats %s as supplied, because a host meant to send it', (_label, value) => {
    expect(missingContext(root, { user: { role: value } })).toEqual([])
  })

  it('reports a path the context does not hold at all', () => {
    expect(missingContext(root, { user: {} })).toEqual(['user.role'])
    expect(missingContext(root, {})).toEqual(['user.role'])
  })
})

describe('contextValues, which is how a document declares its flow', () => {
  const step = (name: string): Condition => ({
    op: 'eq',
    left: { kind: 'context', path: 'step' },
    right: { kind: 'literal', value: name },
  })

  const wizard = (conditions: Condition[]): ComponentNode =>
    tree(
      conditions.map((condition, index) => ({
        key: 's' + String(index),
        type: 'Box',
        props: {},
        renderWhen: { kind: 'condition', condition },
        children: [],
      })),
    )

  it('reads the steps out of the document, in document order', () => {
    expect(contextValues(wizard([step('one'), step('two'), step('three')]), 'step')).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  it('reads a path on either side of the comparison', () => {
    const flipped: Condition = {
      op: 'eq',
      left: { kind: 'literal', value: 'backwards' },
      right: { kind: 'context', path: 'step' },
    }
    expect(contextValues(wizard([flipped]), 'step')).toEqual(['backwards'])
  })

  it('collects the options of a membership test', () => {
    const shared: Condition = {
      op: 'in',
      value: { kind: 'context', path: 'step' },
      options: ['a', 'b'],
    }
    expect(contextValues(wizard([shared]), 'step')).toEqual(['a', 'b'])
  })

  it('does not repeat a value two steps spell the same way', () => {
    // Lists, not strings: only a non-primitive tells a structural dedupe from `===`.
    const shared: Condition = {
      op: 'in',
      value: ctx('step'),
      options: [['a', 'b']],
    }
    const other: Condition = {
      op: 'in',
      value: ctx('step'),
      options: [['a', 'b']],
    }

    expect(contextValues(wizard([shared, other]), 'step')).toEqual([['a', 'b']])
  })

  it('skips a context operand with an empty path', () => {
    const empty: Condition = {
      op: 'eq',
      left: { kind: 'context', path: '' },
      right: lit('one'),
    }
    expect(contextValues(wizard([empty]), '')).toEqual([])
    expect([...contextKeys(wizard([empty]))]).toEqual([])
  })

  it('does not repeat a value two steps share', () => {
    expect(contextValues(wizard([step('one'), step('one')]), 'step')).toEqual(['one'])
  })

  it('ignores a different path, and a comparison with no name to collect', () => {
    const other = step('one')
    const againstAField: Condition = {
      op: 'eq',
      left: { kind: 'context', path: 'step' },
      right: { kind: 'ref', dataKey: 'whatever' },
    }
    expect(contextValues(wizard([other, againstAField]), 'phase')).toEqual([])
    expect(contextValues(wizard([againstAField]), 'step')).toEqual([])
  })

  it('reads a step out of a property binding and a rule guard, not only renderWhen', () => {
    const fromProp: ComponentNode = {
      key: 'byProp',
      type: 'Box',
      props: { disabled: { kind: 'condition', condition: step('review') } },
      children: [],
    }
    const fromGuard: ComponentNode = {
      key: 'byGuard',
      type: 'Field',
      props: {},
      schema: {
        type: 'string',
        validations: [{ key: 'required', when: { kind: 'condition', condition: step('confirm') } }],
      },
    }

    expect(contextValues(tree([fromProp, fromGuard]), 'step')).toEqual(['review', 'confirm'])
  })

  it('finds a step nested inside a group', () => {
    const guarded: Condition = {
      op: 'and',
      conditions: [step('buried'), { op: 'truthy', value: { kind: 'ref', dataKey: 'ok' } }],
    }
    expect(contextValues(wizard([guarded]), 'step')).toEqual(['buried'])
  })
})

describe('contextValues collects broadly on purpose', () => {
  it('takes a literal from a comparison nobody would write against a step', () => {
    const odd: Condition = {
      op: 'gt',
      left: { kind: 'context', path: 'step' },
      right: { kind: 'literal', value: 'two' },
    }
    const root = tree([
      { key: 'a', type: 'Box', props: {}, renderWhen: { kind: 'condition', condition: odd } },
    ])

    expect(contextValues(root, 'step')).toEqual(['two'])
  })
})

describe('evaluatorKeys', () => {
  const doc = (children: ComponentNode[]): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children,
  })

  it('names a node whose visibility is an expression', () => {
    const root = doc([
      {
        key: 'business',
        type: 'Field',
        props: {},
        renderWhen: { kind: 'computed', expression: 'data.kind === "business"' },
      },
    ])

    expect(evaluatorKeys(root)).toEqual(['business'])
  })

  it('names a node whose rule is guarded by an expression', () => {
    const root = doc([
      {
        key: 'vat',
        type: 'Field',
        props: {},
        schema: {
          type: 'string',
          validations: [{ key: 'required', when: { kind: 'computed', expression: 'x' } }],
        },
      },
    ])

    expect(evaluatorKeys(root)).toEqual(['vat'])
  })

  it('names a node carrying a custom rule, which is an expression by definition', () => {
    const root = doc([
      {
        key: 'confirm',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [{ key: 'custom', expression: 'a === b' }] },
      },
    ])

    expect(evaluatorKeys(root)).toEqual(['confirm'])
  })

  it('names a node with a computed property', () => {
    const root = doc([
      { key: 'label', type: 'Field', props: { text: { kind: 'computed', expression: 'x' } } },
    ])

    expect(evaluatorKeys(root)).toEqual(['label'])
  })

  it('names each node once, however many expressions it holds', () => {
    const root = doc([
      {
        key: 'busy',
        type: 'Field',
        props: { text: { kind: 'computed', expression: 'x' } },
        renderWhen: { kind: 'computed', expression: 'y' },
        schema: { type: 'string', validations: [{ key: 'custom', expression: 'z' }] },
      },
    ])

    expect(evaluatorKeys(root)).toEqual(['busy'])
  })

  it('says nothing about a document that needs no evaluator', () => {
    const root = doc([
      {
        key: 'spouse',
        type: 'Field',
        props: { text: { kind: 'static', value: 'Spouse' } },
        renderWhen: {
          kind: 'condition',
          condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'married' } },
        },
        schema: { type: 'string', validations: [{ key: 'required' }] },
      },
    ])

    expect(evaluatorKeys(root)).toEqual([])
  })

  it('is total on a document that never passed the gate', () => {
    const broken = {
      key: 'root',
      type: 'Screen',
      props: 5,
      children: 7,
    } as unknown as ComponentNode

    expect(evaluatorKeys(broken)).toEqual([])
  })
})

describe('the boot-time questions, on a document nobody checked', () => {
  const broken = (patch: Record<string, unknown>): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    ...patch,
  })

  it.each([
    ['children that are not an array', { children: 5 }],
    ['props that are not an object', { props: 'nope' }],
    ['validations that are not iterable', { schema: { type: 'string', validations: 5 } }],
    ['a child that is not a node', { children: [null] }],
  ])('answers rather than throwing on %s', (_what, patch) => {
    expect(() => contextKeys(broken(patch))).not.toThrow()
    expect(() => missingContext(broken(patch), {})).not.toThrow()
    expect(() => contextValues(broken(patch), 'step')).not.toThrow()
    expect(() => evaluatorKeys(broken(patch))).not.toThrow()
  })

  it('answers rather than overflowing on a condition nested past any bound', () => {
    let deep: Condition = isAdmin
    for (let i = 0; i < 5000; i += 1) deep = { op: 'not', condition: deep }

    const root = tree([
      {
        key: 'vat',
        type: 'TextField',
        props: {},
        renderWhen: { kind: 'condition', condition: deep },
      },
    ])

    expect(() => contextKeys(root)).not.toThrow()
    expect(() => missingContext(root, {})).not.toThrow()
    expect(() => contextValues(root, 'user.role')).not.toThrow()
  })

  it('reads the keys of a condition nested just inside the bound', () => {
    let nested: Condition = isAdmin
    for (let i = 0; i < 20; i += 1) nested = { op: 'not', condition: nested }

    const root = tree([
      {
        key: 'vat',
        type: 'TextField',
        props: {},
        renderWhen: { kind: 'condition', condition: nested },
      },
    ])

    expect([...contextKeys(root)]).toEqual(['user.role'])
    expect(contextValues(root, 'user.role')).toEqual(['admin'])
  })

  it('still reads a document that is fine', () => {
    const good: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'vat',
          type: 'Field',
          props: {},
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

    expect([...contextKeys(good)]).toEqual(['user.role'])
    expect(missingContext(good, {})).toEqual(['user.role'])
  })
})

describe('contextValues and a document that asks for too much', () => {
  const many = (n: number): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: Array.from({ length: n }, (_, i) => ({
      key: 'step' + String(i),
      type: 'Screen',
      props: {},
      renderWhen: {
        kind: 'condition' as const,
        condition: {
          op: 'eq' as const,
          left: { kind: 'context' as const, path: 'step' },
          right: { kind: 'literal' as const, value: 'step' + String(i) },
        },
      },
    })),
  })

  it('stops collecting well before it becomes a denial of service', () => {
    expect(contextValues(many(50_000), 'step').length).toBeLessThanOrEqual(1000)
  })

  it('still returns every step a real form has', () => {
    expect(contextValues(many(40), 'step')).toHaveLength(40)
  })
})

describe('evaluatorKeys on a node with no usable key', () => {
  const withExpression = (key: unknown): ComponentNode =>
    ({
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key, type: 'Field', props: {}, renderWhen: { kind: 'computed', expression: 'x' } },
      ],
    }) as ComponentNode

  it.each([
    ['a number', 42],
    ['missing', undefined],
    ['an object', {}],
  ])('still reports that an evaluator is needed for a key that is %s', (_what, key) => {
    expect(evaluatorKeys(withExpression(key))).toHaveLength(1)
  })

  it('names the node when it can', () => {
    expect(evaluatorKeys(withExpression('vat'))).toEqual(['vat'])
  })

  it('still reports nothing for a document with no expressions', () => {
    const plain: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: 'vat', type: 'Field', props: {} }],
    }

    expect(evaluatorKeys(plain)).toEqual([])
  })
})

describe('the boot-time walkers, driven deep through the branch a panel produces', () => {
  // Built with loops: a recursive builder would overflow first.
  const DEEP = 50_000

  const nest = (op: 'and' | 'or', n: number): Condition => {
    let condition: Condition = {
      op: 'eq',
      left: { kind: 'context', path: 'step' },
      right: { kind: 'literal', value: 'one' },
    }
    for (let i = 0; i < n; i += 1) condition = { op, conditions: [condition] }
    return condition
  }

  const guarded = (condition: Condition): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'field',
        type: 'Field',
        props: {},
        renderWhen: { kind: 'condition', condition },
        schema: { type: 'string', validations: [] },
      },
    ],
  })

  it.each([
    ['and', 'and' as const],
    ['or', 'or' as const],
  ])('contextKeys survives a document nested through %s', (_what, op) => {
    expect(() => contextKeys(guarded(nest(op, DEEP)))).not.toThrow()
  })

  it.each([
    ['and', 'and' as const],
    ['or', 'or' as const],
  ])('contextValues survives a document nested through %s', (_what, op) => {
    expect(() => contextValues(guarded(nest(op, DEEP)), 'step')).not.toThrow()
  })

  it('still reads the paths a document nobody would call deep names', () => {
    expect(contextKeys(guarded(nest('and', 3)))).toContain('step')
    expect(contextValues(guarded(nest('and', 3)), 'step')).toEqual(['one'])
  })
})

describe('the cap on how many values one path reports', () => {
  const withSteps = (count: number): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: Array.from({ length: count }, (_unused, index) => ({
      key: 'step' + String(index),
      type: 'Box',
      props: {},
      renderWhen: {
        kind: 'condition' as const,
        condition: {
          op: 'eq' as const,
          left: { kind: 'context' as const, path: 'step' },
          right: { kind: 'literal' as const, value: 'step' + String(index) },
        },
      },
    })),
  })

  it('reports exactly the cap when a document names more than it', () => {
    const values = contextValues(withSteps(MAX_CONTEXT_VALUES + 50), 'step')

    expect(values).toHaveLength(MAX_CONTEXT_VALUES)
  })

  it('lets a caller see that it truncated', () => {
    const truncated = contextValues(withSteps(MAX_CONTEXT_VALUES + 50), 'step')
    const complete = contextValues(withSteps(3), 'step')

    expect(truncated.length >= MAX_CONTEXT_VALUES).toBe(true)
    expect(complete.length >= MAX_CONTEXT_VALUES).toBe(false)
  })
})

describe('a comparison that could not be made', () => {
  /*
   * Asserted through `not`: `evaluateCondition` collapses unreadable to false,
   * so only a negation tells the two apart.
   */
  const cmp = (op: 'gt' | 'gte' | 'lt' | 'lte'): Condition => ({
    op,
    left: { kind: 'context', path: 'answer' },
    right: { kind: 'literal', value: 5 },
  })

  const notComparable = { answer: '5' }

  it.each(['gt', 'gte', 'lt', 'lte'] as const)(
    'does not show a component through a negated %s that never happened',
    (op) => {
      expect(
        evaluateCondition({ op: 'not', condition: cmp(op) }, {}, notComparable),
        'negating an unreadable comparison showed the component',
      ).toBe(false)
    },
  )

  it.each(['gt', 'gte', 'lt', 'lte'] as const)('%s itself stays hidden', (op) => {
    expect(evaluateCondition(cmp(op), {}, notComparable)).toBe(false)
  })

  it('still orders two values it can compare, in both directions', () => {
    expect(evaluateCondition(cmp('gt'), {}, { answer: 9 })).toBe(true)
    expect(evaluateCondition(cmp('lt'), {}, { answer: 1 })).toBe(true)
    expect(evaluateCondition({ op: 'not', condition: cmp('gt') }, {}, { answer: 9 })).toBe(false)
    expect(evaluateCondition({ op: 'not', condition: cmp('gt') }, {}, { answer: 1 })).toBe(true)
  })
})

describe('same, past its bound', () => {
  const wrap = (value: JsonValue, n: number): JsonValue => {
    let out = value
    for (let i = 0; i < n; i += 1) out = [out]
    return out
  }

  it('answers true when the walk reaches one object from two sides', () => {
    /*
     * Two distinct chains meeting on one shared object at exactly
     * `MAX_CONDITION_DEPTH + 1`, the only depth that tells whether the identity
     * check runs before the bound check.
     */
    const shared: JsonValue = { deep: 'value' }
    const left = wrap(shared, MAX_CONDITION_DEPTH + 1)
    const right = wrap(shared, MAX_CONDITION_DEPTH + 1)

    expect(same(left, right)).toBe(true)
  })

  it('still answers false for two deep values that never meet', () => {
    expect(
      same(
        wrap({ deep: 'value' }, MAX_CONDITION_DEPTH + 50),
        wrap({ deep: 'value' }, MAX_CONDITION_DEPTH + 50),
      ),
    ).toBe(false)
  })
})

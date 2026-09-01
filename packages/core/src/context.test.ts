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
    /*
     * The third and least obvious place a Condition lives. A guard reading a
     * context nobody supplied does not hide anything, it just stops applying,
     * which is even quieter than the visibility case.
     */
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
    // A flag that is off is supplied. Reporting it would train a host to ignore
    // the report, which is the only way this check fails.
    expect(missingContext(root, { user: { role: '' }, flags: { beta: false } })).toEqual([])
  })
})

describe('the failure missingContext exists to catch', () => {
  /*
   * The browser has the context, the server forgot it, and nothing anywhere
   * says so. `renderWhen` gates validation, so the field is not hidden on the
   * server, it is unvalidated: a required answer becomes optional in the one
   * place that was supposed to be authoritative.
   */
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
    /*
     * `null` is the one a real host produces: a lookup that found nothing, a
     * column with no value, a session field that is not set. Reporting it as
     * missing would have every host learn to ignore this report, which is the
     * only way a boot-time check fails.
     */
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
    // An author can write the literal first, and the condition means the same.
    const flipped: Condition = {
      op: 'eq',
      left: { kind: 'literal', value: 'backwards' },
      right: { kind: 'context', path: 'step' },
    }
    expect(contextValues(wizard([flipped]), 'step')).toEqual(['backwards'])
  })

  it('collects the options of a membership test', () => {
    // A step shown for more than one value of the path is still those steps.
    const shared: Condition = {
      op: 'in',
      value: { kind: 'context', path: 'step' },
      options: ['a', 'b'],
    }
    expect(contextValues(wizard([shared]), 'step')).toEqual(['a', 'b'])
  })

  it('does not repeat a value two steps spell the same way', () => {
    /*
     * The dedupe compares structurally, so two conditions naming the same list
     * are one step. Only strings were ever tested, which is the one type where
     * reference equality and structural equality agree, so a `===` dedupe passed
     * -- and a host running one validation pass per step would have run two for
     * the same one.
     */
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
    // An empty path reads nothing, so collecting it would offer a host a step
    // called "" and `readPath` refuses it anyway.
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
    /*
     * `contextValues` sweeps all three places a document holds a condition, and
     * every test here built its wizard out of `renderWhen`, so two thirds of
     * what it sweeps was unexercised. The consequence is not cosmetic: the step
     * list is what `validateAcross` walks, so a step reachable only from a
     * property or a rule guard would drop out of it and never be validated on
     * the server.
     */
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
    /*
     * `gt` on a step name is meaningless, and it is still collected. Too many
     * names costs `validateAcross` a pass over a tree where nothing matches;
     * one missed is a step whose required fields are never checked.
     */
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

/**
 * What a document needs an evaluator for, asked once at startup.
 *
 * `missingContext` exists because a condition reading a path the host never
 * supplies quietly hides its component and takes it out of validation. A
 * `computed` binding with no evaluator does exactly the same thing and had no
 * matching question: `isVisible` returns false for one, so the node and its
 * whole subtree leave `validateForm` — on the server, where nobody is looking.
 *
 * It is worse than the context case in one way. A host may inject an evaluator
 * in the browser and not on the server, and then the two disagree: the browser
 * shows a business-only section and validates it, the server validates nothing
 * beneath it and answers `{ok: true}`.
 */
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
    /*
     * The control, and the reason the structured condition vocabulary exists: a
     * form with conditional visibility and guarded rules works in a host that
     * injected nothing at all.
     */
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
    // Same obligation as `contextKeys`: a host is told to call this at startup,
    // which is before anything else has had a chance to refuse the document.
    const broken = {
      key: 'root',
      type: 'Screen',
      props: 5,
      children: 7,
    } as unknown as ComponentNode

    expect(evaluatorKeys(broken)).toEqual([])
  })
})

/**
 * The four exported functions are told to run at a host's startup, which is
 * before anything has had a chance to refuse the document.
 */
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
    // The fourth boot-time export. The docstring above says "the three
    // exported functions" and there are four, and `evaluatorKeys` -- the one a
    // host calls to decide whether it needs a sandbox at all -- was the one
    // this sweep left out.
    expect(() => evaluatorKeys(broken(patch))).not.toThrow()
  })

  it('answers rather than overflowing on a condition nested past any bound', () => {
    /*
     * The malformed fixtures above are all one level deep, so the depth bound
     * these three walks carry -- `fromCondition` and `contextValues`' `visit`,
     * both at `MAX_CONDITION_DEPTH` -- was never reached from this file.
     * `condition.test.ts` has the deep fixture; the functions a host calls at
     * startup had none.
     *
     * Delete both guards and `contextKeys(root)` throws a `RangeError` while an
     * application is booting, on a document somebody hand-wrote, which is the
     * one thing a function whose whole job is surviving malformed input
     * promises not to do. 5000 is well past the bound of 200 and well past what
     * an author can produce in a 288px panel.
     */
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
    // The control. A walk that stopped at the first `not` would pass the test
    // above by reading nothing at all.
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
    // The control: a guard that answered nothing for everything would pass the
    // whole block above and make the boot-time check useless.
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

/**
 * How much work a document can ask a server to do.
 *
 * `contextValues(root, 'step')` is how the reference server discovers a form's
 * steps, and it runs one full validation pass per value it returns. A hundred
 * thousand distinct literals is a few seconds to author in the JSON editor and
 * a hundred thousand passes to submit against.
 *
 * A cap rather than a refusal: the answer stays useful for every real document,
 * and a document that exceeds it is one no host should be running anyway.
 */
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
    // The control. A cap low enough to truncate a genuine flow would make the
    // server validate fewer steps than the document has, which is the silent
    // permissive failure this whole area is about.
    expect(contextValues(many(40), 'step')).toHaveLength(40)
  })
})

/**
 * A node that needs an evaluator and has no key to be named by.
 *
 * `evaluatorKeys` computed "this node holds an expression" and then discarded
 * it when the key was not a string -- so a document with `"key": 42` and a
 * computed `renderWhen` answered "no expressions here", a host wired no
 * evaluator, and every such node read as hidden. What this function is asked is
 * whether a sandbox is needed; that does not depend on the key being readable.
 */
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
    // The control: the key is what a host goes and looks at, so it is still the
    // answer wherever there is one.
    expect(evaluatorKeys(withExpression('vat'))).toEqual(['vat'])
  })

  it('still reports nothing for a document with no expressions', () => {
    // The other control. Reporting every node would make the boot-time check
    // demand a sandbox for a form that needs none.
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
  /*
   * The only deep fixture for these walkers nests through `not`, which is the
   * one branch that never had the bug.
   *
   * So the depth argument was only ever carried through the `not` recursion,
   * and the `conditions` loops in this module were never reached at depth by
   * any test in the repository -- while `and`/`or` is the branch the condition
   * editor actually produces. `condition.ts` records that this is exactly where
   * the depth argument was dropped once already. Delete `+ 1` on both loops and
   * the entire suite stayed green while `contextKeys(root)` threw a RangeError
   * during a host's startup.
   *
   * Built with loops; building either recursively would overflow first.
   */
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
    /*
     * The control, and it is load-bearing: bounding by returning nothing would
     * pass all four rows above while telling every host that its form reads no
     * context at all -- which is the permissive answer, since `missingContext`
     * would then report nothing missing.
     */
    expect(contextKeys(guarded(nest('and', 3)))).toContain('step')
    expect(contextValues(guarded(nest('and', 3)), 'step')).toEqual(['one'])
  })
})

describe('the cap on how many values one path reports', () => {
  /*
   * The cap was asserted as `toBeLessThanOrEqual(1000)` against a 40-step
   * control, which leaves any value between 40 and 1000 green -- and the
   * constant was neither exported nor named. So the number could have moved
   * anywhere in that range with nothing red.
   */
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
    /*
     * The whole reason the constant is exported. The function returns a bare
     * array, so without this a host cannot tell a complete answer from a
     * truncated one -- and `validateAcross` runs one pass per scope built from
     * this list, so every step past the cap goes unvalidated and the submit
     * succeeds with its required fields missing.
     */
    const truncated = contextValues(withSteps(MAX_CONTEXT_VALUES + 50), 'step')
    const complete = contextValues(withSteps(3), 'step')

    expect(truncated.length >= MAX_CONTEXT_VALUES).toBe(true)
    expect(complete.length >= MAX_CONTEXT_VALUES).toBe(false)
  })
})

describe('a comparison that could not be made', () => {
  /*
   * Asserted through `not`, because that is the only place the distinction is
   * observable -- `evaluateCondition` collapses unreadable to false at the
   * boundary and the docblock says the difference exists for `not` and only
   * for `not`.
   *
   * The ordering branch answered `false` rather than unreadable when the
   * operands could not be compared, so `not(gt(x, y))` was **true** and a
   * component appeared on the strength of a comparison that never happened.
   * The `in`/`notIn` branch was changed from `false` to `undefined` because
   * that exact shape was a bug; this one was not.
   */
  const cmp = (op: 'gt' | 'gte' | 'lt' | 'lte'): Condition => ({
    op,
    left: { kind: 'context', path: 'answer' },
    right: { kind: 'literal', value: 5 },
  })

  // The answer arrives as a string, which `order` cannot compare to a number.
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
    // The un-negated direction was already right and must stay right: the
    // boundary collapses unreadable to false, which is hidden.
    expect(evaluateCondition(cmp(op), {}, notComparable)).toBe(false)
  })

  it('still orders two values it can compare, in both directions', () => {
    // The control. Answering unreadable for everything would pass every row
    // above while breaking every ordering rule in every form -- including
    // through `not`, which is what the rows above actually read.
    expect(evaluateCondition(cmp('gt'), {}, { answer: 9 })).toBe(true)
    expect(evaluateCondition(cmp('lt'), {}, { answer: 1 })).toBe(true)
    expect(evaluateCondition({ op: 'not', condition: cmp('gt') }, {}, { answer: 9 })).toBe(false)
    expect(evaluateCondition({ op: 'not', condition: cmp('gt') }, {}, { answer: 1 })).toBe(true)
  })
})

describe('same, past its bound', () => {
  /** `[[[…value…]]]`, n deep, as a fresh chain each call. */
  const wrap = (value: JsonValue, n: number): JsonValue => {
    let out = value
    for (let i = 0; i < n; i += 1) out = [out]
    return out
  }

  it('answers true when the walk reaches one object from two sides', () => {
    /*
     * The identity shortcut sat *after* the bound check, so past the bound even
     * two references to the same object compared unequal -- and `false` from
     * `same` is what makes `ne` and `notIn` true, which is the outcome the
     * comment there says the choice avoids.
     *
     * Two distinct chains bottoming out on one shared value, placed at exactly
     * `MAX_CONDITION_DEPTH + 1` -- the one depth where the two orderings
     * disagree.
     *
     * Two earlier fixtures were wrong and both are worth recording.
     * `same(shared, shared)` at the top level never reaches the bound at all,
     * because identity fires at depth 0 whichever order the lines are in. And
     * burying the shared value at `+ 50` does not work either: the walk stops
     * at 201 on the distinct wrappers, so it never arrives at the shared object
     * to compare it. The window is one level wide.
     */
    const shared: JsonValue = { deep: 'value' }
    const left = wrap(shared, MAX_CONDITION_DEPTH + 1)
    const right = wrap(shared, MAX_CONDITION_DEPTH + 1)

    expect(same(left, right)).toBe(true)
  })

  it('still answers false for two deep values that never meet', () => {
    // The control: the bound is still there, and past it two structures that
    // are merely alike are not merged.
    expect(
      same(
        wrap({ deep: 'value' }, MAX_CONDITION_DEPTH + 50),
        wrap({ deep: 'value' }, MAX_CONDITION_DEPTH + 50),
      ),
    ).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { contextKeys, contextValues, evaluatorKeys, missingContext } from './context.js'
import { validateForm } from './validation.js'
import type { ComponentNode, Condition, Operand } from './types.js'

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
 * The three exported functions are told to run at a host's startup, which is
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

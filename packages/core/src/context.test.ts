import { describe, expect, it } from 'vitest'

import { contextKeys, contextValues, missingContext } from './context.js'
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

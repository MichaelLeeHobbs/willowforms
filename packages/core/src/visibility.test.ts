import { describe, expect, it } from 'vitest'
import type { ComponentNode, Condition, Evaluator } from './index.js'
import { isVisible, validateForm } from './index.js'

const required = { type: 'string' as const, validations: [{ key: 'required' as const }] }

function field(key: string, renderWhen?: ComponentNode['renderWhen']): ComponentNode {
  return renderWhen
    ? { key, type: 'Field', props: {}, schema: required, renderWhen }
    : { key, type: 'Field', props: {}, schema: required }
}

describe('isVisible', () => {
  it('shows a component with no condition', () => {
    expect(isVisible(field('a'), {})).toBe(true)
  })

  it('reads a static condition', () => {
    expect(isVisible(field('a', { kind: 'static', value: true }), {})).toBe(true)
    expect(isVisible(field('a', { kind: 'static', value: false }), {})).toBe(false)
  })

  it('uses the injected evaluator for a computed condition', () => {
    const evaluate: Evaluator = (expression) => expression === 'yes'
    expect(isVisible(field('a', { kind: 'computed', expression: 'yes' }), {}, { evaluate })).toBe(
      true,
    )
    expect(isVisible(field('a', { kind: 'computed', expression: 'no' }), {}, { evaluate })).toBe(
      false,
    )
  })

  it('hands the host context to the evaluator', () => {
    const evaluate: Evaluator = (expression, _data, context) =>
      expression === 'admin' &&
      (context?.['user'] as { role?: string } | undefined)?.role === 'admin'

    const node = field('a', { kind: 'computed', expression: 'admin' })

    expect(isVisible(node, {}, { evaluate, context: { user: { role: 'admin' } } })).toBe(true)
    expect(isVisible(node, {}, { evaluate, context: { user: { role: 'guest' } } })).toBe(false)
  })

  it('keeps a hidden subtree out of validateForm when the context is what hid it', () => {
    const evaluate: Evaluator = (expression, _data, context) =>
      expression === 'admin' &&
      (context?.['user'] as { role?: string } | undefined)?.role === 'admin'

    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [field('vat', { kind: 'computed', expression: 'admin' })],
    }

    expect(validateForm(root, {}, { evaluate, context: { user: { role: 'admin' } } })).toEqual({
      vat: 'This field is required.',
    })
    expect(validateForm(root, {}, { evaluate, context: { user: { role: 'guest' } } })).toEqual({})
  })

  it('hides a computed condition when no evaluator is injected', () => {
    expect(isVisible(field('a', { kind: 'computed', expression: 'anything' }), {})).toBe(false)
  })

  it('treats a translation key as no condition at all', () => {
    expect(isVisible(field('a', { kind: 'i18n', key: 'x' }), {})).toBe(true)
  })
})

describe('validateForm and visibility', () => {
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      field('visible'),
      field('hidden', { kind: 'static', value: false }),
      {
        key: 'hiddenGroup',
        type: 'Stack',
        props: {},
        renderWhen: { kind: 'static', value: false },
        children: [field('buried'), field('deeper')],
      },
    ],
  }

  it('never blocks a submit on a field the user cannot see', () => {
    const errors = validateForm(root, {})
    expect(errors['hidden']).toBeUndefined()
  })

  it('skips everything inside a hidden container', () => {
    const errors = validateForm(root, {})
    expect(errors['buried']).toBeUndefined()
    expect(errors['deeper']).toBeUndefined()
  })

  it('still validates what is on screen', () => {
    expect(validateForm(root, {})['visible']).toBe('This field is required.')
    expect(validateForm(root, { visible: 'filled' })).toEqual({})
  })

  it('validates nothing at all when the root it was given is itself hidden', () => {
    const step: ComponentNode = {
      key: 'who',
      type: 'Step',
      props: {},
      renderWhen: {
        kind: 'condition',
        condition: {
          op: 'eq',
          left: { kind: 'context', path: 'step' },
          right: { kind: 'literal', value: 'who' },
        },
      },
      children: [field('name')],
    }

    expect(validateForm(step, {}), 'a form nobody can see reports nothing').toEqual({})
    expect(validateForm(step, {}, { context: { step: 'who' } })).toEqual({
      name: 'This field is required.',
    })
  })

  it('starts validating a field once its condition turns true', () => {
    const conditional: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [field('why', { kind: 'computed', expression: 'other' })],
    }
    const evaluate: Evaluator = (_expression, data) => data['other'] === 'yes'

    expect(validateForm(conditional, {}, { evaluate })['why']).toBeUndefined()
    expect(validateForm(conditional, { other: 'yes' }, { evaluate })['why']).toBe(
      'This field is required.',
    )
  })
})

describe('what validateForm hands down to a condition', () => {
  it('forwards the context, so a condition can read what the host knows', () => {
    const gated: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'salary',
          type: 'TextField',
          props: {},
          schema: { type: 'string', validations: [{ key: 'required' }] },
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

    expect(validateForm(gated, {})).toEqual({})
    expect(validateForm(gated, {}, { context: { user: { role: 'guest' } } })).toEqual({})
    expect(validateForm(gated, {}, { context: { user: { role: 'admin' } } })).toEqual({
      salary: 'This field is required.',
    })
  })

  it('hides a container by a condition, not only by a static false', () => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'group',
          type: 'Stack',
          props: {},
          renderWhen: {
            kind: 'condition',
            condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'wanted' } },
          },
          children: [field('buried')],
        },
      ],
    }

    expect(validateForm(root, {})).toEqual({})
    expect(validateForm(root, { wanted: true })).toEqual({ buried: 'This field is required.' })
  })
})

describe('a structured condition needs no sandbox', () => {
  const node = (condition: Condition): ComponentNode => ({
    key: 'extra',
    type: 'TextField',
    props: {},
    renderWhen: { kind: 'condition', condition },
  })

  it('decides visibility with no evaluator injected at all', () => {
    const when: Condition = {
      op: 'eq',
      left: { kind: 'ref', dataKey: 'country' },
      right: { kind: 'literal', value: 'GB' },
    }

    expect(isVisible(node(when), { country: 'GB' })).toBe(true)
    expect(isVisible(node(when), { country: 'FR' })).toBe(false)
  })

  it('ignores an evaluator when one is present, rather than preferring it', () => {
    const explode = (): never => {
      throw new Error('a structured condition must not reach the sandbox')
    }
    const when: Condition = { op: 'truthy', value: { kind: 'ref', dataKey: 'consent' } }

    expect(isVisible(node(when), { consent: true }, { evaluate: explode })).toBe(true)
  })

  it('hides rather than throws on a condition the document got wrong', () => {
    // The renderer and validateForm both call it, so a throw takes the form down.
    const broken = { op: 'nonsense' } as unknown as Condition
    expect(() => isVisible(node(broken), {})).not.toThrow()
    expect(isVisible(node(broken), {})).toBe(false)
  })
})

describe('a renderWhen this code cannot read', () => {
  const typo = {
    kind: 'conditon',
    condition: { op: 'truthy', value: { kind: 'literal', value: 1 } },
  }

  it('shows the component rather than dropping it silently', () => {
    expect(isVisible(field('a', typo as unknown as ComponentNode['renderWhen']), {})).toBe(true)
  })

  it('never answers undefined for any tag, which is what made this invisible', () => {
    const shapes: unknown[] = [
      { kind: 'conditon', condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'a' } } },
      { kind: 42 },
      {},
      'always',
      [],
    ]

    for (const shape of shapes) {
      const answer = isVisible(field('a', shape as ComponentNode['renderWhen']), {})
      expect(typeof answer, JSON.stringify(shape)).toBe('boolean')
    }
  })

  it('keeps the field in validation, which is the point', () => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [field('a', typo as unknown as ComponentNode['renderWhen'])],
    }

    expect(Object.keys(validateForm(root, {}))).toEqual(['a'])
  })
})

describe('an evaluator that throws', () => {
  const boom: Evaluator = () => {
    throw new Error('half-written expression')
  }

  const computed = (): ComponentNode => field('a', { kind: 'computed', expression: 'data.x.y' })

  it('does not take the caller down', () => {
    expect(() => isVisible(computed(), {}, { evaluate: boom })).not.toThrow()
  })

  it('reads as hidden, which is what no answer already means here', () => {
    expect(isVisible(computed(), {}, { evaluate: boom })).toBe(false)
  })

  it('still uses an evaluator that works', () => {
    const evaluate: Evaluator = () => true
    expect(isVisible(computed(), {}, { evaluate })).toBe(true)
  })
})

describe('a computed renderWhen inside a row', () => {
  const evaluate: Evaluator = (expression, data) => data[expression] === 'yes'

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
            key: 'reason',
            dataKey: 'why',
            type: 'Field',
            props: {},
            schema: { type: 'string', validations: [{ key: 'required' }] },
            renderWhen: { kind: 'computed', expression: 'other' },
          },
        ],
      },
    ],
  }

  it('reads the row it is drawn in', () => {
    const data = { addresses: [{ other: 'yes' }, { other: 'no' }] }

    expect(validateForm(root, data, { evaluate })).toEqual({
      'addresses[0].reason': 'This field is required.',
    })
  })

  it('still reads a form-level answer the row does not shadow', () => {
    const data = { other: 'yes', addresses: [{}, {}] }

    expect(Object.keys(validateForm(root, data, { evaluate }))).toEqual([
      'addresses[0].reason',
      'addresses[1].reason',
    ])
  })
})

describe('a node or a condition that is not there at all', () => {
  it('does not throw on a child that is not a node', () => {
    const notANode = null as unknown as ComponentNode

    expect(() => isVisible(notANode, {})).not.toThrow()
  })

  it('shows it rather than hiding it', () => {
    expect(isVisible(null as unknown as ComponentNode, {})).toBe(true)
    expect(isVisible(7 as unknown as ComponentNode, {})).toBe(true)
  })

  it('shows a condition kind that carries no condition', () => {
    const bare = {
      key: 'x',
      type: 'Field',
      props: {},
      renderWhen: { kind: 'condition' },
    } as unknown as ComponentNode

    expect(isVisible(bare, {})).toBe(true)
  })

  it('still hides on a condition that is present and false', () => {
    const when = { op: 'truthy', value: { kind: 'literal', value: false } } as unknown as Condition
    const guarded: ComponentNode = {
      key: 'x',
      type: 'Field',
      props: {},
      renderWhen: { kind: 'condition', condition: when },
    }

    expect(isVisible(guarded, {})).toBe(false)
  })
})

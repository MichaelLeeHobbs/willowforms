import { describe, expect, it } from 'vitest'

import { instantiate } from './factory.js'
import type { ComponentDef } from './kit.js'
import type { ComponentNode } from './types.js'

/**
 * A kit that is not the shape its type says.
 *
 * `instantiate`'s own comment argues that "a kit is third-party code by
 * design", and it defended the prototype-pollution half while reading
 * `defaultProps` and calling `defaultRenderWhen` unguarded. Both are reachable
 * from a kit compiled loosely or built at runtime from JSON, and both throw
 * inside the designer's drop handler -- which reads as the builder crashing
 * rather than as a bad kit.
 */
describe('a component definition a kit got wrong', () => {
  const base: ComponentDef = {
    type: 'Field',
    label: 'Field',
    group: 'inputs',
    defaultProps: {},
    props: [],
    events: [],
  }

  const root: ComponentNode = { key: 'root', type: 'Screen', props: {}, children: [] }

  it.each([
    ['missing entirely', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['a list', ['label']],
  ])('instantiates with defaultProps %s', (_what, defaultProps) => {
    const def = { ...base, defaultProps } as unknown as ComponentDef

    const node = instantiate(def, root)
    expect(node.type).toBe('Field')
    expect(node.props).toEqual({})
  })

  it('still reads defaults a kit really declared', () => {
    // The control: guarding the read must not stop it reading.
    const def: ComponentDef = { ...base, defaultProps: { label: 'Email' } }

    expect(instantiate(def, root).props['label']).toEqual({ kind: 'static', value: 'Email' })
  })

  it('instantiates without a condition when defaultRenderWhen throws', () => {
    const def: ComponentDef = {
      ...base,
      defaultRenderWhen: () => {
        throw new Error('kit exploded')
      },
    }

    const node = instantiate(def, root)
    expect(node.key).toBe('field')
    expect(node.renderWhen).toBeUndefined()
  })

  it('still takes a condition a kit really supplies', () => {
    // The other control, and the reason the hook exists: a Step ships with a
    // condition comparing the host context against its own key.
    const def: ComponentDef = {
      ...base,
      defaultRenderWhen: (key) => ({
        kind: 'condition',
        condition: {
          op: 'eq',
          left: { kind: 'context', path: 'step' },
          right: { kind: 'literal', value: key },
        },
      }),
    }

    expect(instantiate(def, root).renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: 'field' },
      },
    })
  })
})

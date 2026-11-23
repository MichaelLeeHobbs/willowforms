import { describe, expect, it } from 'vitest'

import { instantiate } from './factory.js'
import { groupKit, indexKit } from './kit.js'
import { isRowScope } from './tree.js'
import type { ComponentDef, Kit } from './kit.js'
import type { ComponentNode } from './types.js'

function made(def: ComponentDef, root: ComponentNode): ComponentNode {
  const node = instantiate(def, root)
  if (!node) throw new Error('instantiate refused a definition this test expects it to accept')
  return node
}

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

    const node = made(def, root)
    expect(node.type).toBe('Field')
    expect(node.props).toEqual({})
  })

  it('still reads defaults a kit really declared', () => {
    const def: ComponentDef = { ...base, defaultProps: { label: 'Email' } }

    expect(made(def, root).props['label']).toEqual({ kind: 'static', value: 'Email' })
  })

  it('seeds new controls without replacing runtime defaults for saved controls', () => {
    const def: ComponentDef = {
      ...base,
      defaultProps: { label: 'Email', fillWidth: false },
      initialProps: { fillWidth: true },
    }
    expect(made(def, root).props).toEqual({
      label: { kind: 'static', value: 'Email' },
      fillWidth: { kind: 'static', value: true },
    })
    expect(def.defaultProps['fillWidth']).toBe(false)
  })

  it('instantiates without a condition when defaultRenderWhen throws', () => {
    const def: ComponentDef = {
      ...base,
      defaultRenderWhen: () => {
        throw new Error('kit exploded')
      },
    }

    const node = made(def, root)
    expect(node.key).toBe('field')
    expect(node.renderWhen).toBeUndefined()
  })

  it('still takes a condition a kit really supplies', () => {
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

    expect(made(def, root).renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: 'field' },
      },
    })
  })
})

describe('the prototype-pollution defence the restructure was for', () => {
  const base: ComponentDef = {
    type: 'Field',
    label: 'Field',
    icon: 'text',
    group: 'inputs',
    defaultProps: {},
    props: [],
    events: [],
  }
  const root: ComponentNode = { key: 'root', type: 'Screen', props: {}, children: [] }

  it('does not run the prototype setter for a defaultProps key of __proto__', () => {
    const def = {
      ...base,
      defaultProps: { __proto__: { polluted: true } },
    } as unknown as ComponentDef

    const node = made(def, root)

    /*
     * Asserted against the props object, not against `{}`: assigning `__proto__`
     * on an object literal sets that object's prototype and never writes to
     * `Object.prototype`.
     */
    expect(
      (node.props as Record<string, unknown>)['polluted'],
      'the props object inherited a value from a defaultProps __proto__ key',
    ).toBeUndefined()
    expect(Object.getPrototypeOf(node.props)).toBe(Object.prototype)
  })

  it.each(['__proto__', 'constructor', 'prototype'])(
    'keeps %s as an own property rather than losing it',
    (name) => {
      const def = { ...base, defaultProps: { [name]: 'x' } } as unknown as ComponentDef

      expect(Object.hasOwn(made(def, root).props, name)).toBe(true)
    },
  )

  it('does not offer a definition with no usable type in the palette', () => {
    const kit: Kit = {
      id: 'k',
      label: 'K',
      components: [
        { ...base, type: '' },
        { ...base, type: 'Real' },
      ],
    }

    expect(indexKit(kit).get('')).toBeUndefined()
    expect(indexKit(kit).get('Real'), 'the usable one was filtered too').toBeDefined()
    expect(
      groupKit(kit)
        .flatMap((group) => group.components)
        .map((c) => c.type),
    ).toEqual(['Real'])
  })

  it('refuses a definition with no usable type', () => {
    for (const type of [undefined, null, 42, '']) {
      const def = { ...base, type } as unknown as ComponentDef

      expect(() => instantiate(def, root), JSON.stringify(type)).not.toThrow()
      expect(instantiate(def, root), JSON.stringify(type)).toBeUndefined()
    }
  })

  it('still instantiates a definition that is fine', () => {
    expect(made(base, root).type).toBe('Field')
  })

  it('gives a container its children and a data-bound node its schema', () => {
    const container = made({ ...base, container: true }, root)
    const bound = made({ ...base, dataBound: true }, root)
    const list = made({ ...base, container: true, dataBound: true, dataType: 'array' }, root)

    expect(container.children).toEqual([])
    expect(bound.schema?.type).toBe('string')
    expect(list.schema?.type).toBe('array')
    expect(isRowScope(list)).toBe(true)
  })
})

describe('a kit whose component list is not one', () => {
  it.each([
    ['absent', undefined],
    ['an object', {}],
    ['a number', 5],
    ['a list holding null', [null]],
    ['a list of things that are not definitions', ['Field']],
  ])('does not throw when components are %s', (_what, components) => {
    const kit = { id: 'broken', label: 'Broken', components } as unknown as Kit

    expect(() => indexKit(kit)).not.toThrow()
    expect(() => groupKit(kit)).not.toThrow()
  })

  it('still indexes and groups a kit that is fine', () => {
    const kit: Kit = {
      id: 'ok',
      label: 'OK',
      components: [
        {
          type: 'Field',
          label: 'Field',
          icon: 'text',
          group: 'inputs',
          defaultProps: {},
          props: [],
          events: [],
        },
      ],
    }

    expect(indexKit(kit).get('Field')).toBeDefined()
    expect(groupKit(kit).length).toBeGreaterThan(0)
  })
})

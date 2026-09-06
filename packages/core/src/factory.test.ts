import { describe, expect, it } from 'vitest'

import { instantiate } from './factory.js'
import { groupKit, indexKit } from './kit.js'
import { isRowScope } from './tree.js'
import type { ComponentDef, Kit } from './kit.js'
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
/**
 * `instantiate`, asserted to have produced something.
 *
 * The signature is `ComponentNode | undefined` because a `ComponentDef` with no
 * usable `type` is refused rather than handed to `generateKey`, which would
 * call `.charAt` on it. Every case here supplies a real type, so this narrows
 * once and fails loudly rather than each assertion carrying a `?.`.
 */
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
    // The control: guarding the read must not stop it reading.
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
  /*
   * `instantiate` builds props on `Object.create(null)` specifically because "a
   * `defaultProps` key of `__proto__` on an object literal runs the setter
   * rather than adding a property" -- and nothing tested it. The four cases in
   * the describe above cover the second half of that function's argument (a
   * definition a kit got wrong) and leave the first half, which is the half the
   * code was restructured for. A repo-wide grep finds `__proto__` tests in
   * seven other files and none for this one. Revert to `{}` and every test in
   * the repository stays green.
   */
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
     * Asserted against the props object, not against `{}`.
     *
     * Assigning `__proto__` on an object literal sets *that object's*
     * prototype; it does not write to `Object.prototype`. So checking
     * `({})['polluted']` was checking an object the defect never touches -- a
     * redundant assertion with a misleading message, passing for reasons having
     * nothing to do with the guard. Raised in review on PR #47.
     *
     * What the defect produces is a props object that *inherits* `polluted`,
     * which is what these read.
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
      /*
       * The other half: on an object literal the key is swallowed, so the prop
       * the kit declared is silently absent. Both directions matter -- one
       * pollutes, the other loses the value.
       */
      const def = { ...base, defaultProps: { [name]: 'x' } } as unknown as ComponentDef

      expect(Object.hasOwn(made(def, root).props, name)).toBe(true)
    },
  )

  it('does not offer a definition with no usable type in the palette', () => {
    /*
     * `indexKit` and `groupKit` accepted a component whose `type` is the empty
     * string, so the palette could show an entry `instantiate` then refuses --
     * a control that is visible and inert, which is worse than one that is
     * absent. Raised in review on PR #47.
     */
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
    /*
     * `def.type` went straight to `generateKey`, whose first statement is
     * `type.charAt(0).toLowerCase()`, so a kit built from JSON with a missing
     * type threw inside the designer's drop handler. `defaultProps` is
     * shape-checked and `defaultRenderWhen` is wrapped in a try; this was the
     * third thing read off a third-party definition and the one left bare.
     */
    for (const type of [undefined, null, 42, '']) {
      const def = { ...base, type } as unknown as ComponentDef

      expect(() => instantiate(def, root), JSON.stringify(type)).not.toThrow()
      expect(instantiate(def, root), JSON.stringify(type)).toBeUndefined()
    }
  })

  it('still instantiates a definition that is fine', () => {
    // The control. Refusing everything would pass every row above while making
    // the palette inert.
    expect(made(base, root).type).toBe('Field')
  })

  it('gives a container its children and a data-bound node its schema', () => {
    /*
     * The `dataType ?? 'string'` fallback decides whether a node is a repeater
     * under `isRowScope`, and the `base` fixture in the describe above sets
     * neither `container` nor `dataBound`, so it had no direct assertion in
     * core.
     */
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
  /*
   * `indexKit` and `groupKit` iterated `kit.components` with no guard, in the
   * same "a kit is third-party code by design" seam `instantiate` explicitly
   * hardened. `groupKit` runs inside `Palette.tsx`'s `useMemo` and `indexKit`
   * in the render bodies of `Properties.tsx` and `StyleTab.tsx`, so the throw
   * is a render throw and React 19 unmounts the whole designer rather than
   * showing an empty palette.
   */
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
    // The control. Returning nothing for every kit would pass all five rows
    // above while emptying the palette.
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

/**
 * @vitest-environment jsdom
 */

/**
 * The kit contract, as an executable spec.
 *
 * Every rule here is run against every kit in the repo. That is the point of
 * having a second one: until `@formsmith/kit-html` existed, "adding a kit is a
 * new package, not a rewrite" was a claim in a design document, and the contract
 * it rests on was whatever `@formsmith/kit-mui` happened to do.
 *
 * A third kit should be added to KITS below and nothing else. If it passes, it
 * works in the designer; if it fails, the message says which obligation it
 * missed.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ComponentNode, FormDocument, Kit } from '@formsmith/core'
import { emptyRoot, groupKit, indexKit, instantiate } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

const KITS: { name: string; kit: Kit; renderers: RendererKit }[] = [
  { name: '@formsmith/kit-mui', kit: muiKit, renderers: muiRendererKit },
  { name: '@formsmith/kit-html', kit: htmlKit, renderers: htmlRendererKit },
]

function documentOf(root: ComponentNode): FormDocument {
  return {
    version: '1',
    id: 'contract',
    name: 'Contract',
    root,
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

/*
 * The two kits in this repository deliberately share component types, so a
 * document authored against one renders against the other and the playground
 * can switch between them live. Nothing in the contract requires that of a
 * third-party kit; it is a courtesy these two keep, and 03-components.md says
 * "Built means both kits implement it".
 *
 * A courtesy nothing checks is a courtesy that lapses. These two had already
 * drifted once: kit-mui carried icon names kit-html did not, and no palette
 * drew either, so nobody noticed until the vocabulary was closed.
 */
describe('the two kits in this repository agree', () => {
  const html = new Map(htmlKit.components.map((c) => [c.type, c]))
  const mui = new Map(muiKit.components.map((c) => [c.type, c]))

  it('offers the same component types', () => {
    expect([...html.keys()].sort()).toEqual([...mui.keys()].sort())
  })

  it.each([...new Set([...html.keys(), ...mui.keys()])].sort())(
    '%s is described identically by both',
    (type) => {
      const a = html.get(type)
      const b = mui.get(type)
      expect(a, type + ' is missing from @formsmith/kit-html').toBeDefined()
      expect(b, type + ' is missing from @formsmith/kit-mui').toBeDefined()
      if (!a || !b) return

      // Everything a form author sees or a document stores. Not defaultProps:
      // a kit is entitled to a different sensible default.
      expect(a.label).toBe(b.label)
      expect(a.icon).toBe(b.icon)
      expect(a.group).toBe(b.group)
      expect(a.container ?? false).toBe(b.container ?? false)
      expect(a.root ?? false).toBe(b.root ?? false)
      expect(a.dataBound ?? false).toBe(b.dataBound ?? false)
      expect(a.dataType).toBe(b.dataType)
      expect(a.props.map((prop) => prop.name)).toEqual(b.props.map((prop) => prop.name))
      expect(a.props.map((prop) => prop.editor)).toEqual(b.props.map((prop) => prop.editor))
      expect([...a.events].sort()).toEqual([...b.events].sort())
    },
  )
})

describe.each(KITS)('$name', ({ kit, renderers }) => {
  const container = kit.components.find((c) => c.container)

  it('names itself the same on both halves', () => {
    // The designer takes the metadata half and the runtime takes the renderers.
    // Mismatched ids make a mixed-up pairing impossible to spot.
    expect(renderers.id).toBe(kit.id)
  })

  it('has a renderer for every component it puts in the palette', () => {
    const missing = kit.components.map((c) => c.type).filter((type) => !renderers.renderers[type])
    expect(missing).toEqual([])
  })

  it('has no renderer the palette does not offer', () => {
    const declared = new Set(kit.components.map((c) => c.type))
    const orphans = Object.keys(renderers.renderers).filter((type) => !declared.has(type))
    expect(orphans).toEqual([])
  })

  it('offers at least one container to hold the rest', () => {
    expect(container).toBeDefined()
  })

  it('gives every component a unique type', () => {
    const types = kit.components.map((c) => c.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('declares a data type for every data-bound component', () => {
    // Without one the Rules tab has nothing to validate against.
    const bad = kit.components.filter((c) => c.dataBound && !c.dataType).map((c) => c.type)
    expect(bad).toEqual([])
  })

  it('gives every prop schema a name and a label', () => {
    const bad = kit.components.flatMap((c) =>
      c.props.filter((p) => !p.name || !p.label).map((p) => c.type + '.' + p.name),
    )
    expect(bad).toEqual([])
  })

  it('supplies options for every select prop', () => {
    const bad = kit.components.flatMap((c) =>
      c.props
        .filter((p) => p.editor === 'select' && (p.options?.length ?? 0) === 0)
        .map((p) => c.type + '.' + p.name),
    )
    expect(bad).toEqual([])
  })

  describe('every renderer', () => {
    const root = container
      ? instantiate(container, { key: 'seed', type: container.type, props: {} })
      : undefined

    it.each(kit.components.map((c) => [c.type, c] as const))(
      '%s spreads nodeProps onto a real element',
      (type, def) => {
        const node = instantiate(def, root ?? { key: 'r', type: 'r', props: {} })
        node.key = 'target'

        const { container: dom } = render(
          <FormRenderer
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            onChange={() => undefined}
          />,
        )

        const element = dom.querySelector('[data-fs-key="target"]')
        expect(
          element,
          `${type} does not put data-fs-key in the DOM, so the designer cannot select it. ` +
            'Spread nodeProps onto the outermost element.',
        ).not.toBeNull()
        expect(element?.getAttribute('data-fs-type')).toBe(type)
      },
    )

    it('renders children inside every container', () => {
      const containers = kit.components.filter((c) => c.container)
      expect(containers.length).toBeGreaterThan(0)

      for (const def of containers) {
        const child: ComponentNode = { key: 'child', type: def.type, props: {} }
        const parent: ComponentNode = {
          key: 'parent',
          type: def.type,
          props: {},
          children: [child],
        }

        const { container: dom } = render(
          <FormRenderer
            document={documentOf(parent)}
            kit={renderers}
            data={{}}
            onChange={() => undefined}
          />,
        )

        const outer = dom.querySelector('[data-fs-key="parent"]')
        const inner = dom.querySelector('[data-fs-key="child"]')
        expect(inner, `${def.type} did not render its children`).not.toBeNull()
        expect(
          outer?.contains(inner ?? null),
          `${def.type} rendered its children outside itself, which breaks drop targeting`,
        ).toBe(true)
      }
    })

    it('renders a data-bound component without crashing on an absent value', () => {
      // A freshly dropped field has no data yet. Any renderer that assumes one
      // takes the whole canvas down the moment it is added.
      for (const def of kit.components.filter((c) => c.dataBound)) {
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
        expect(() =>
          render(
            <FormRenderer
              document={documentOf(node)}
              kit={renderers}
              data={{}}
              onChange={() => undefined}
            />,
          ),
        ).not.toThrow()
      }
    })

    it('shows an error message when one is passed', () => {
      const bound = kit.components.filter((c) => c.dataBound)
      expect(bound.length).toBeGreaterThan(0)

      for (const def of bound) {
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
        node.key = 'field'

        const { container: dom } = render(
          <FormRenderer
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            errors={{ field: 'Something is wrong.' }}
            onChange={() => undefined}
          />,
        )

        expect(
          dom.textContent,
          `${def.type} swallowed its error, so a failed submit would say nothing`,
        ).toContain('Something is wrong.')
      }
    })

    /*
     * The two rules below were written down as kit obligations long before
     * anything ran them, and @formsmith/kit-mui had never satisfied either.
     * A contract nothing executes is a wish.
     */

    it('marks the message as an alert when it holds an error', () => {
      for (const def of kit.components.filter((c) => c.dataBound)) {
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
        node.key = 'field'

        const { container: dom } = render(
          <FormRenderer
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            errors={{ field: 'Something is wrong.' }}
            onChange={() => undefined}
          />,
        )

        const alert = dom.querySelector('[role="alert"]')
        expect(
          alert?.textContent,
          `${def.type} shows its error without role="alert", so a screen reader ` +
            'never announces a validation failure the user did not cause.',
        ).toContain('Something is wrong.')
      }
    })

    it('points every data-bound control at a message element that already exists', () => {
      for (const def of kit.components.filter((c) => c.dataBound)) {
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
        node.key = 'field'

        // No error. The element still has to be there, or the description is
        // attached only at the moment it changes and is announced twice or not
        // at all depending on the screen reader.
        const { container: dom } = render(
          <FormRenderer
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            onChange={() => undefined}
          />,
        )

        const host = dom.querySelector('[data-fs-key="field"]')
        const described = host?.matches('[aria-describedby]')
          ? host
          : (host?.querySelector('[aria-describedby]') ?? null)

        expect(described, `${def.type} has no control carrying aria-describedby`).not.toBeNull()

        for (const id of (described?.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
          expect(
            dom.querySelector('[id="' + id + '"]'),
            `${def.type} points aria-describedby at #${id}, which is not in the DOM`,
          ).not.toBeNull()
        }
      }
    })
  })

  it('gives every palette entry an icon', () => {
    /*
     * `ComponentDef.icon` is optional in the type, because a kit is allowed to
     * ship without one. It is required of the kits in this repository, because
     * these two are what a kit author copies: a palette of unadorned text is
     * the thing the vocabulary exists to fix, and half a palette with icons
     * looks like a bug rather than a choice.
     */
    const bare = kit.components.filter((c) => !c.icon).map((c) => c.type)
    expect(bare).toEqual([])
  })

  it('declares exactly one root component and keeps it out of the palette', () => {
    // The root already exists in every document. Offering it in the palette
    // let a screen be dropped inside a screen, which it did until this ran.
    const roots = kit.components.filter((c) => c.root === true)
    expect(
      roots.map((c) => c.type),
      'a kit declares exactly one root, and it is the type emptyRoot() produces',
    ).toEqual([emptyRoot().type])

    const offered = groupKit(kit).flatMap((g) => g.components.map((c) => c.type))
    expect(offered, 'the root must not be draggable out of the palette').not.toContain(
      emptyRoot().type,
    )
  })

  it('builds a palette index without collisions', () => {
    expect(indexKit(kit).size).toBe(kit.components.length)
  })
})

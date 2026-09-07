/**
 * @vitest-environment jsdom
 */

/**
 * The kit contract, as an executable spec.
 *
 * Every rule here is run against every kit in the repo. That is the point of
 * having a second one: until `@willowforms/kit-html` existed, "adding a kit is a
 * new package, not a rewrite" was a claim in a design document, and the contract
 * it rests on was whatever `@willowforms/kit-mui` happened to do.
 *
 * A third kit should be added to KITS below and nothing else. If it passes, it
 * works in the designer; if it fails, the message says which obligation it
 * missed.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactElement } from 'react'
import { useState } from 'react'
import { applyChange, prop } from '@willowforms/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IconName } from '@willowforms/core'
import type {
  ComponentDef,
  ComponentNode,
  FormData,
  FormDocument,
  JsonValue,
  Kit,
  PropValue,
} from '@willowforms/core'
import { emptyRoot, groupKit, indexKit, instantiate } from '@willowforms/core'
import { FormRenderer } from '@willowforms/renderer'
import type { RendererKit } from '@willowforms/renderer'
import { htmlKit, htmlRendererKit } from '@willowforms/kit-html'
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'
import { Icon } from '../packages/designer/src/Icon.js'

const KITS: { name: string; kit: Kit; renderers: RendererKit }[] = [
  { name: '@willowforms/kit-mui', kit: muiKit, renderers: muiRendererKit },
  { name: '@willowforms/kit-html', kit: htmlKit, renderers: htmlRendererKit },
]

/**
 * Every error the renderer's boundary caught during the test that just ran.
 *
 * This file could not fail on a kit that throws. Two of its rules read
 * `data-fs-key`, `data-fs-type` and `data-fs-scope` off the rendered element to
 * prove a kit spreads `nodeProps` -- and the boundary's fallback emits all three,
 * so a kit renderer replaced by `throw new Error()` satisfied both. A third
 * asserted `expect(render).not.toThrow()`, which a boundary guarantees by
 * existing. Three contract rules, green since before the boundary was written,
 * checking nothing.
 *
 * The boundary is right and stays. What was missing is that nothing in this file
 * ever asked whether it had fired.
 */
const caught: { key: string; error: Error }[] = []

beforeEach(() => {
  caught.length = 0
})

afterEach(() => {
  if (caught.length === 0) return
  /*
   * Thrown rather than asserted, for two reasons. `expect` outside a test block
   * is what `vitest/no-standalone-expect` exists to stop, and it is right to:
   * this runs after the test, so an assertion here reads as belonging to a test
   * that has finished. And the message matters more than the matcher -- naming
   * the component and what it threw is the difference between a report and
   * `1 !== 0`.
   */
  throw new Error(
    'The renderer caught an error, so a kit renderer did not render. Whatever this test ' +
      'asserted about the DOM, it was reading the fallback. ' +
      caught.map((failure) => failure.key + ': ' + failure.error.message).join('; '),
  )
})

/**
 * `FormRenderer` with the trap already wired.
 *
 * Every render in this file goes through this rather than `FormRenderer`, and
 * that is the mechanism: a new rule written here inherits the check instead of
 * having to remember it. Wiring `onError` per test is what would rot, because
 * the rule that needs it most is the one somebody adds in a hurry.
 *
 * A caller's own `onError` is still called. One test passes a spy and asserts it
 * was not called, which is the same claim from the other end.
 */
function FormUnderTest(props: ComponentProps<typeof FormRenderer>): ReactElement {
  const { onError, ...rest } = props
  return (
    <FormRenderer
      {...rest}
      onError={(error, key) => {
        caught.push({ key, error })
        onError?.(error, key)
      }}
    />
  )
}

function documentOf(root: ComponentNode): FormDocument {
  return {
    version: '1',
    id: 'contract',
    name: 'Contract',
    root,
    actions: {},
    // `en-US`, which is what `createDocument` produces. A dialect-free
    // fixture makes a bundle keyed by tag and one keyed by bare code the
    // same string, which is Trap 5 in the write-tests skill and the shape
    // that made the language filter green here and broken for real
    // documents.
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  }
}

function EditableRepeater({ renderers }: { renderers: RendererKit }): ReactElement {
  const [data, setData] = useState<FormData>({ guests: [{}] })
  const repeater: ComponentNode = {
    key: 'guests',
    dataKey: 'guests',
    type: 'Repeater',
    props: { label: prop('Guest'), gap: prop(8) },
    schema: {
      type: 'array',
      validations: [
        { key: 'minItems', value: 1 },
        { key: 'maxItems', value: 2 },
      ],
    },
    children: [
      {
        key: 'guest-name',
        dataKey: 'name',
        type: 'TextField',
        props: { label: prop('Name') },
        schema: { type: 'string' },
      },
    ],
  }

  return (
    <FormUnderTest
      document={documentOf(repeater)}
      kit={renderers}
      data={data}
      onChange={(address, value) => setData((current) => applyChange(current, address, value))}
    />
  )
}

function BranchingSteps({ renderers }: { renderers: RendererKit }): ReactElement {
  const [step, setStep] = useState('step_one')
  const stepWhen = (key: string): NonNullable<ComponentNode['renderWhen']> => ({
    kind: 'condition',
    condition: {
      op: 'eq',
      left: { kind: 'context', path: 'step' },
      right: { kind: 'literal', value: key },
    },
  })
  const root: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'introduction',
        type: 'Text',
        props: { text: prop('Introduction to the first page') },
        renderWhen: stepWhen('step_one'),
      },
      {
        key: 'step_one',
        type: 'Step',
        props: { gap: prop(8) },
        renderWhen: stepWhen('step_one'),
        children: [{ key: 'first_copy', type: 'Text', props: { text: prop('First step') } }],
      },
      {
        key: 'step_two',
        type: 'Step',
        props: { gap: prop(8) },
        renderWhen: {
          kind: 'condition',
          condition: {
            op: 'and',
            conditions: [
              {
                op: 'eq',
                left: { kind: 'context', path: 'step' },
                right: { kind: 'literal', value: 'step_two' },
              },
              {
                op: 'eq',
                left: { kind: 'ref', dataKey: 'country' },
                right: { kind: 'literal', value: 'GB' },
              },
            ],
          },
        },
        children: [{ key: 'second_copy', type: 'Text', props: { text: prop('Second step') } }],
      },
      {
        key: 'step_three',
        type: 'Step',
        props: { gap: prop(8) },
        renderWhen: stepWhen('step_three'),
        children: [{ key: 'third_copy', type: 'Text', props: { text: prop('Third step') } }],
      },
      {
        key: 'closing_note',
        type: 'Text',
        props: { text: prop('Closing note on the last page') },
        renderWhen: stepWhen('step_three'),
      },
    ],
  }

  return (
    <FormUnderTest
      document={documentOf(root)}
      kit={renderers}
      data={{ country: 'US' }}
      context={{ step }}
      navigation={{
        onNavigate: (value) => {
          if (typeof value === 'string') setStep(value)
        },
      }}
      onChange={() => undefined}
    />
  )
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
/**
 * Where the two kits deliberately, or at least knowingly, do not agree.
 *
 * `Button.variant` offers contained/outlined/text in MUI and solid/outline/plain
 * in the HTML kit, so a document authored against one carries a variant the
 * other has never heard of. That is a real gap in the claim that a document
 * travels between kits, it is bigger than a test, and it is written up in the
 * run's `found.md` rather than papered over here.
 *
 * Named so the comparison stays strict everywhere else, and checked below so an
 * entry cannot outlive the divergence it excuses.
 */
const DIVERGENT_VOCABULARY = new Set(['Button.variant'])

/**
 * The component types this file's rules are written against.
 *
 * Four rules here used to open with a bare `return` when the kit did not offer
 * the component they drive, and two `it.each` tables were built by filtering a
 * hard-coded type list against what the kits declare -- and vitest 2.1.9
 * implements `each` as `cases.forEach(...)`, with no guard for an empty array.
 * So renaming `Select` in both kits, or narrowing `Text.variant` to one option,
 * turned obligations off rather than failing them, and the file reported green
 * having registered fewer tests than it has rules.
 *
 * That is the pattern this suite already rejects for `RadioGroup` in its own
 * words: "this used to return quietly ... which is the one thing a contract
 * suite must never let a kit do". The list is here so the turning-off is a
 * failure with a name, in one place, rather than four quiet exits.
 */
/*
 * Types alone were not enough. A rule drives a component *through a property*,
 * and a renamed property turns the rule off as quietly as a renamed type did:
 * the fixture still sets `variant` on the node, because a node's props are free
 * form, and the kit simply stops reading it. So each entry names the properties
 * its rules depend on, and both halves are asserted together.
 */
const DRIVEN: Record<string, readonly string[]> = {
  Alert: ['severity'],
  Breadcrumbs: ['label'],
  NumberField: [],
  RadioGroup: ['options'],
  Select: ['options'],
  Stack: ['gap'],
  Text: ['text', 'variant'],
  TextArea: [],
  TextField: [],
}

/**
 * Ask before driving a component, and fail rather than skip when it is missing.
 *
 * Returns whether the kit offers it, so a caller can stop before producing a
 * second, more confusing failure out of the same cause.
 */
function requires(kit: Kit, type: string): boolean {
  const offered = kit.components.some((def) => def.type === type)
  expect(
    offered,
    type + ' is a component this suite drives: dropping it must fail a rule, not silence one',
  ).toBe(true)
  return offered
}

/**
 * `instantiate`, narrowed. It answers `undefined` for a definition with no
 * usable `type`, which no fixture here supplies.
 */
const made = (def: ComponentDef, root: ComponentNode): ComponentNode => {
  const node = instantiate(def, root)
  if (!node) throw new Error('instantiate refused a definition this test expects it to accept')
  return node
}

/**
 * The properties whose values are CSS pixels in both kits.
 *
 * Read by two describes: the pixels rule inside the per-kit block derives its
 * rows from these, and `a length means the same number of pixels in both kits`
 * compares the defaults. Declared here, above both, rather than beside the
 * second one. It used to sit below the first, which worked only because this
 * runner invokes a `describe` callback after the module has finished
 * evaluating; a runner that invokes it during evaluation would have hit the
 * temporal dead zone and failed to load the file at all.
 *
 * The agreement rules leave `defaultProps` alone, on the ground that a kit is
 * entitled to its own sensible default. That is true of a prop nobody sees in
 * the document and false of a length: `02-kit-contract.md` says a length in a
 * document is CSS pixels, and a kit built on a design system with its own
 * spacing scale "converts at its edge".
 *
 * So the defaults rule is equality, not merely agreement about the unit. A
 * `defaultProps` value is written into every node the designer creates, before
 * any renderer fallback is consulted, so it leaves with the document -- and the
 * catalogue's promise is that a document authored against one kit renders
 * against the other. A kit that wants a roomier form changes what it renders,
 * not the number it writes into somebody else's document.
 *
 * Named rather than inferred from the editor, because `columns`, `index` and
 * `maxLength` are numbers too and none of them is a length.
 */
const LENGTHS = ['gap', 'padding', 'radius', 'maxWidth', 'width', 'minColumnWidth', 'inputWidth']

describe('the two kits in this repository agree', () => {
  const html = new Map(htmlKit.components.map((c) => [c.type, c]))
  const mui = new Map(muiKit.components.map((c) => [c.type, c]))

  it.each(KITS)('$name offers every component this suite drives', ({ kit }) => {
    const offered = new Set(kit.components.map((def) => def.type))
    expect(Object.keys(DRIVEN).filter((type) => !offered.has(type))).toEqual([])
  })

  it.each(KITS)('$name still declares every property this suite drives through', ({ kit }) => {
    const missing = Object.entries(DRIVEN).flatMap(([type, names]) => {
      const declared = new Set(
        kit.components.find((def) => def.type === type)?.props.map((p) => p.name),
      )
      return names.filter((name) => !declared.has(name)).map((name) => type + '.' + name)
    })

    expect(
      missing,
      'a property this suite drives through was renamed or dropped: that turns a rule off rather ' +
        'than failing it, because a node carries whatever props a fixture sets',
    ).toEqual([])
  })

  it.each([...DIVERGENT_VOCABULARY])(
    '%s still diverges, so the exemption still earns its place',
    (entry) => {
      const [type, name] = entry.split('.')
      const a = html.get(type ?? '')?.props.find((prop) => prop.name === name)
      const b = mui.get(type ?? '')?.props.find((prop) => prop.name === name)

      expect(a, entry + ' is not a property either kit has').toBeDefined()
      expect(b, entry + ' is not a property either kit has').toBeDefined()
      expect(
        a?.options,
        entry + ' agrees now: delete the exemption rather than keeping a hole open',
      ).not.toEqual(b?.options)
    },
  )

  it('offers the same component types', () => {
    expect([...html.keys()].sort()).toEqual([...mui.keys()].sort())
  })

  it.each([...new Set([...html.keys(), ...mui.keys()])].sort())(
    '%s is described identically by both',
    (type) => {
      const a = html.get(type)
      const b = mui.get(type)
      expect(a, type + ' is missing from @willowforms/kit-html').toBeDefined()
      expect(b, type + ' is missing from @willowforms/kit-mui').toBeDefined()
      if (!a || !b) return

      // Everything a form author sees or a document stores. Not defaultProps
      // wholesale -- a kit is entitled to a different sensible default -- but
      // the lengths among them are checked separately below, because their
      // unit belongs to the contract rather than to the kit.
      expect(a.label).toBe(b.label)
      expect(a.icon).toBe(b.icon)
      expect(a.group).toBe(b.group)
      expect(a.container ?? false).toBe(b.container ?? false)
      expect(a.root ?? false).toBe(b.root ?? false)
      expect(a.dataBound ?? false).toBe(b.dataBound ?? false)
      expect(a.dataType).toBe(b.dataType)
      /*
       * Every field of a property, not just its name and editor.
       *
       * `localizable` is what decides whether an author can bind a label to a
       * translation at all, `conditional` whether they can bind it to a
       * condition, and `section` which tab the row appears on. Two kits could
       * disagree about all six and this said they were described identically --
       * a document authored against one kit would then offer bindings the other
       * refuses, which is the drift the whole describe exists to catch.
       */
      const described = (def: ComponentDef): unknown[] =>
        def.props.map((prop) => ({
          name: prop.name,
          label: prop.label,
          editor: prop.editor,
          options: DIVERGENT_VOCABULARY.has(type + '.' + prop.name)
            ? 'a divergence named below'
            : (prop.options ?? null),
          hint: prop.hint ?? null,
          computable: prop.computable ?? true,
          localizable: prop.localizable ?? false,
          conditional: prop.conditional ?? false,
          section: prop.section ?? 'main',
        }))

      expect(described(a)).toEqual(described(b))
      expect([...a.events].sort()).toEqual([...b.events].sort())
    },
  )
})

/**
 * A length authored once means the same number of pixels in every kit.
 *
 * This is the divergence the `Grid` comment two functions above `Box` was
 * written to prevent, sitting undetected below it. `borderRadius` in an MUI `sx`
 * block is multiplied by `theme.shape.borderRadius`, which defaults to 4, while
 * the kit divided by 8: an authored `radius: 24` rendered 12px in MUI against
 * 24px in the HTML kit. Nothing caught it because no test rendered one document
 * through both kits and compared what came out.
 *
 * The declarations are read out of what each kit emitted rather than out of
 * `getComputedStyle`. jsdom has no cascade worth trusting and no layout engine,
 * so the question here is deliberately the narrower one it can answer: what CSS
 * did this kit write.
 */
describe('a length means the same thing in both kits', () => {
  const box = (): ComponentNode => ({
    key: 'target',
    type: 'Box',
    props: { padding: prop(8), radius: prop(24), background: prop('') },
    children: [],
  })

  function formOf(renderers: RendererKit): ReactElement {
    return (
      <FormUnderTest
        document={documentOf(box())}
        kit={renderers}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />
    )
  }

  /** The declarations one kit wrote for the Box, whichever sink it used. */
  function declarationsFor(renderers: RendererKit): string {
    /*
     * Nothing is cleared between renders, deliberately. Emotion caches by
     * content hash and will not re-insert a rule it believes is already on the
     * page, so removing its style tags makes the *next* render emit nothing and
     * the reading come back empty. The sheets are matched by the element's own
     * class instead, which is exact and does not care what else is mounted.
     */
    const { container } = render(formOf(renderers))

    const el = container.querySelector('[data-fs-key="target"]')
    if (!el) throw new Error('the Box did not render')

    // The HTML kit writes a style attribute; the MUI kit writes an emotion rule
    // for the class it put on the element.
    const inline = el.getAttribute('style') ?? ''
    const classes = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => c.startsWith('css-'))
    const sheets = Array.from(document.querySelectorAll('style'))
      .map((tag) => tag.textContent ?? '')
      .filter((text) => classes.some((c) => text.includes('.' + c)))
      .join('')

    return (inline + ';' + sheets).replace(/\s+/g, '')
  }

  /** One declaration's value, normalised, or nothing if the kit did not write it. */
  function valueOfDeclaration(css: string, name: string): string | undefined {
    return new RegExp('[;{]' + name + ':([^;}]+)').exec(';' + css)?.[1]
  }

  it('renders an authored radius as the same pixels through both kits', () => {
    const mui = declarationsFor(muiRendererKit)
    const html = declarationsFor(htmlRendererKit)

    expect(valueOfDeclaration(html, 'border-radius')).toBe('24px')
    expect(valueOfDeclaration(mui, 'border-radius')).toBe(valueOfDeclaration(html, 'border-radius'))
  })

  it('renders an authored padding as the same pixels through both kits', () => {
    const mui = declarationsFor(muiRendererKit)
    const html = declarationsFor(htmlRendererKit)

    expect(valueOfDeclaration(html, 'padding')).toBe('8px')
    expect(valueOfDeclaration(mui, 'padding')).toBe(valueOfDeclaration(html, 'padding'))
  })
})

/**
 * A list of options is a document's list, and a document is data.
 *
 * Every kit maps over `props.options` and reads `.value` off each entry. A
 * `null` in that array threw during render — and core has `optionValue`
 * precisely because these entries cannot be trusted, so the guard existed one
 * layer down and was not used here.
 *
 * The error boundary added for theme 3 keeps a throw inside its own node now, so
 * this is a lost control rather than a lost page. A lost control is still the
 * question the form was asking.
 */
/**
 * A list of options is a document's list, and a document is data.
 *
 * Every kit mapped over `props.options` and read `.value` off each entry, so a
 * `null` in that array threw during render — in four places across two kits.
 * Core has `optionValue` precisely because these entries cannot be trusted, so
 * the guarded read existed one layer down and was not the one the controls used
 * to draw. They share `optionEntry` now, which is `optionValue`'s inverse.
 *
 * The error boundary added for theme 3 keeps a throw inside its own node, so
 * this is a lost control rather than a lost page. A lost control is still the
 * question the form was asking.
 */
/**
 * A document's string does not become a class name, a variant, or a URL.
 *
 * Every one of these is a value a kit interpolated or trusted because its own
 * `defaultProps` only ever holds sensible ones. A document is data, and the same
 * file already narrows some of them — `Text.align` has a comment saying exactly
 * why — so what is here is the ones that were missed rather than a new rule.
 */
/**
 * Three obligations every kit already had, that nothing ran.
 */
describe('what a data-bound control has to say about itself', () => {
  /*
   * Data-bound and not a container. A repeater is data-bound — its value is the
   * list of rows — but it is not a control anybody types into, and marking a
   * container invalid or required says nothing a screen reader can use.
   */
  function bound(kit: Kit): { type: string; def: ComponentDef }[] {
    return kit.components
      .filter((def) => def.dataBound && !def.container)
      .map((def) => ({ type: def.type, def }))
  }

  function drawField(
    renderers: RendererKit,
    def: ComponentDef,
    extra: Partial<ComponentNode>,
  ): HTMLElement {
    const node: ComponentNode = {
      ...made(def, { key: 'r', type: 'r', props: {} }),
      key: 'target',
      ...extra,
    }

    const { container } = render(
      <FormUnderTest
        document={documentOf(node)}
        kit={renderers}
        data={{}}
        revealHidden
        errors={extra.schema ? { target: 'Something is wrong.' } : {}}
        onChange={() => undefined}
      />,
    )
    const element = container.querySelector<HTMLElement>('[data-fs-key="target"]')
    if (!element) throw new Error(def.type + ' did not render')
    return element
  }

  /**
   * The control inside a component, whatever element the kit chose for it.
   *
   * The ARIA widget roles are here because a kit is not obliged to use a native
   * element: a combobox built from a `div` is a control, and looking only for
   * `input, select, textarea` would find nothing and hand it to the fallback
   * below, which used to pass it. Every role listed supports `aria-invalid` and
   * `aria-required`.
   */
  const WIDGET =
    'input, select, textarea, [role="combobox"], [role="textbox"], [role="listbox"],' +
    ' [role="spinbutton"], [role="checkbox"], [role="radiogroup"], [role="switch"], [role="slider"]'

  function control(element: HTMLElement): HTMLElement | null {
    return element.matches(WIDGET) ? element : element.querySelector<HTMLElement>(WIDGET)
  }

  it.each(KITS)('$name marks a failing control invalid', ({ kit, renderers }) => {
    /*
     * A stated obligation of the contract, and one the contract test
     * deliberately did not cover — so three MUI components never set it while
     * the HTML kit set it on all three. A control that looks wrong and does not
     * say so is announced to a screen reader as fine.
     */
    const missing = bound(kit)
      .filter(({ def }) => {
        const element = drawField(renderers, def, {
          schema: { type: def.dataType ?? 'string', validations: [] },
        })
        const target = control(element)

        /*
         * A data-bound, non-container component with no widget in it at all.
         *
         * This used to be satisfied by finding any `role="alert"` inside the
         * component -- which every data-bound component is separately required
         * to have, a few rules down, so the obligation was discharged by
         * something already mandatory elsewhere. A kit whose control is a
         * `div[role="combobox"]` passed without ever setting `aria-invalid`.
         *
         * The roles are part of `WIDGET` now, so a non-native control is found
         * and held to the same rule, and reaching here means the component
         * collects an answer through nothing a screen reader can be told about.
         * That is reported, not excused.
         */
        if (!target) return true

        return (
          target.getAttribute('aria-invalid') !== 'true' &&
          element.getAttribute('aria-invalid') !== 'true'
        )
      })
      .map(({ type }) => type)

    expect(missing).toEqual([])
  })

  it.each(KITS)('$name marks a required control required', ({ kit, renderers }) => {
    /*
     * WCAG 3.3.2. `node` is on `NodeRendererProps` and no renderer read it, in
     * either kit — so a required field was required in `validateForm` and
     * ordinary in the accessibility tree, and the first anybody heard of it was
     * a rejected submit.
     */
    const missing = bound(kit)
      .filter(({ def }) => {
        const element = drawField(renderers, def, {
          schema: { type: def.dataType ?? 'string', validations: [{ key: 'required' }] },
        })
        const target = control(element)
        return (
          target?.getAttribute('aria-required') !== 'true' &&
          target?.hasAttribute('required') !== true &&
          element.getAttribute('aria-required') !== 'true'
        )
      })
      .map(({ type }) => type)

    expect(missing).toEqual([])
  })

  it.each(KITS)('$name leaves an unrequired control unmarked', ({ kit, renderers }) => {
    // The control. Marking everything required would pass the test above and
    // announce every field as mandatory.
    const wrong = bound(kit)
      .filter(({ def }) => {
        const element = drawField(renderers, def, {
          schema: { type: def.dataType ?? 'string', validations: [] },
        })
        const target = control(element)
        return target?.getAttribute('aria-required') === 'true' || target?.hasAttribute('required')
      })
      .map(({ type }) => type)

    expect(wrong).toEqual([])
  })
})

/**
 * Whether a kit hands the answer back at all.
 *
 * Everything above this asks how a kit *draws*. Nothing asked whether it
 * *collects*, and the gap was total: this file imported `fireEvent` once and
 * used it once, for a radio click, while `onChange={() => undefined}` appeared
 * eighteen times. Replacing every real `onChange` in a kit with a no-op left the
 * whole suite green bar one rule. A kit that draws every control, labels it,
 * announces its errors and drops every keystroke was a conforming kit.
 *
 * The rules below drive each data-bound control the way a person would and
 * assert the value reached `onChange`. Two things keep them honest. Every driver
 * throws when it cannot find something to drive, because a driver that silently
 * does nothing turns this into eighteen more tests that pass on silence. And the
 * last rule runs the same code against a deliberately deaf kit and requires it to
 * report nothing, so the failure path these rules exist for runs on every suite
 * rather than having been checked once by whoever wrote them.
 */
describe('a data-bound control hands back what the person entered', () => {
  const OPTIONS: JsonValue = [
    { label: 'One', value: 1 },
    // A number, not a string. The value a kit reports has to survive the round
    // trip through `optionValue`, and a string-valued fixture cannot tell the
    // declared value apart from the DOM string that stands in for it.
    { label: 'Two', value: 2 },
  ]

  /*
   * The element a driver is about to act on, or a loud failure.
   *
   * Answers `HTMLElement` rather than a type the caller names. The first version
   * took a generic and ended in `as unknown as T`, which is a claim rather than
   * a check: `'input, textarea'` was asked for as an `HTMLInputElement` and
   * answers a `<textarea>` for both kits' `TextArea`. `fireEvent` takes an
   * `Element`, so nothing here needed the narrower type and the cast bought only
   * the chance to be wrong about it.
   */
  function must(element: HTMLElement, selector: string, what: string): HTMLElement {
    const hit = element.matches(selector) ? element : element.querySelector<HTMLElement>(selector)
    if (!hit) {
      throw new Error(
        'no ' +
          what +
          ' to drive. The driver did nothing, so the rule would have passed on silence.',
      )
    }
    return hit
  }

  const enterText =
    (text: string) =>
    (element: HTMLElement): void => {
      fireEvent.change(must(element, 'input, textarea', 'text control'), {
        target: { value: text },
      })
    }

  const toggle = (element: HTMLElement): void => {
    fireEvent.click(must(element, 'input[type="checkbox"]', 'checkbox'))
  }

  /* Native `select` in one kit, a combobox opening a listbox in the other. */
  const chooseTwo = (element: HTMLElement): void => {
    const native = element.querySelector<HTMLSelectElement>('select')
    if (native) {
      const option = [...native.options].find((o) => o.textContent === 'Two')
      if (!option) throw new Error('the select never offered the option this drives')
      fireEvent.change(native, { target: { value: option.value } })
      return
    }
    fireEvent.mouseDown(must(element, '[role="combobox"]', 'select control'))
    const listed = screen.getAllByRole('option').find((o) => o.textContent === 'Two')
    if (!listed) throw new Error('the listbox never opened, so nothing was chosen')
    fireEvent.click(listed)
  }

  const pickTwo = (): void => {
    fireEvent.click(screen.getByLabelText('Two'))
  }

  type Entry = {
    props?: Record<string, JsonValue>
    enter: (el: HTMLElement) => void
    is: JsonValue
  }

  const ENTERED: Record<string, Entry> = {
    TextField: { enter: enterText('typed'), is: 'typed' },
    TextArea: { enter: enterText('typed'), is: 'typed' },
    NumberField: { enter: enterText('42'), is: 42 },
    DatePicker: { enter: enterText('2026-09-02'), is: '2026-09-02' },
    Checkbox: { enter: toggle, is: true },
    Switch: { enter: toggle, is: true },
    Select: { props: { options: OPTIONS }, enter: chooseTwo, is: 2 },
    RadioGroup: { props: { options: OPTIONS }, enter: pickTwo, is: 2 },
  }

  /** Every value the kit reported for `target`, in order. */
  function reported(renderers: RendererKit, def: ComponentDef, entry: Entry): JsonValue[] {
    const base = made(def, { key: 'r', type: 'r', props: {} })
    const node: ComponentNode = {
      ...base,
      key: 'target',
      props: {
        ...base.props,
        ...Object.fromEntries(
          Object.entries(entry.props ?? {}).map(([name, value]) => [name, prop(value)]),
        ),
      },
    }
    const seen: JsonValue[] = []
    const { container } = render(
      <FormUnderTest
        document={documentOf(node)}
        kit={renderers}
        data={{}}
        onChange={(address, value) => {
          if (address === 'target') seen.push(value)
        }}
      />,
    )
    const element = container.querySelector<HTMLElement>('[data-fs-key="target"]')
    if (!element) throw new Error(def.type + ' did not render')
    entry.enter(element)
    return seen
  }

  /*
   * Data-bound, and answered by a person rather than assembled by the form.
   *
   * The aria rules above filter on `dataBound && !container`, which is right for
   * them and wrong here. `RadioGroup` is a container, because it holds
   * `RadioItem`s, and it is also the control somebody picks an answer in, so
   * that filter would drop the one component whose collection this file already
   * half-covered: the single `fireEvent` call in the whole suite before this
   * describe existed was a radio click.
   *
   * `Repeater` is the genuine exclusion. It is data-bound because its value is
   * the list of rows, and nobody enters that value; the form builds it from the
   * rows beneath. Anything else data-bound needs a driver, and the rule below
   * fails until it has one, so a tenth control cannot join by being forgotten.
   */
  const NOT_ENTERED = new Set(['Repeater'])
  const answered = (kit: Kit): ComponentDef[] =>
    kit.components.filter((def) => def.dataBound && !NOT_ENTERED.has(def.type))

  const ENTERED_CASES = KITS.flatMap(({ name, kit, renderers }) =>
    answered(kit).map((def) => ({ name, type: def.type, def, renderers })),
  )

  it.each(KITS)('$name has a driver for every control this rule covers', ({ kit }) => {
    const undriven = answered(kit)
      .map((def) => def.type)
      .filter((type) => !(type in ENTERED))

    expect(
      undriven,
      'a data-bound control with no driver here is one this rule silently skips: teach it how to be ' +
        'driven, or exclude it in NOT_ENTERED with a reason, rather than letting it opt out quietly',
    ).toEqual([])
  })

  it.each(ENTERED_CASES)(
    '$name reports what was entered into $type',
    ({ type, def, renderers }) => {
      const entry = ENTERED[type]
      if (!entry) throw new Error(type + ' has no driver, which the rule above exists to catch')

      expect(
        reported(renderers, def, entry),
        type + ' never told the form what was entered',
      ).toEqual([entry.is])
    },
  )

  it('reports nothing for a kit that drops the answer, which is what the rules above rest on', () => {
    /*
     * The proof, checked in rather than performed once. This is the exact kit
     * the eighteen `onChange={() => undefined}` renders could not tell from a
     * working one: it draws the control and never calls `onChange`. The rules
     * above run this same function and require a value; this one requires
     * silence, so both directions of the check execute on every run.
     */
    const deaf: RendererKit = {
      ...htmlRendererKit,
      renderers: {
        ...htmlRendererKit.renderers,
        TextField: ({ nodeProps }) => <input {...nodeProps} defaultValue="" />,
      },
    }
    const def = htmlKit.components.find((c) => c.type === 'TextField')
    if (!def) throw new Error('the HTML kit stopped offering a TextField')
    const entry = ENTERED['TextField']
    if (!entry) throw new Error('TextField lost its driver')

    expect(reported(deaf, def, entry)).toEqual([])
    expect(reported(htmlRendererKit, def, entry)).toEqual([entry.is])
  })
})

/**
 * A value a host seeded, shown in the control that holds it.
 *
 * `str(value)` answers `''` for anything that is not a string, so a host
 * restoring `{age: 30}` saw an empty field whose data was not empty: `required`
 * passed, the field looked unanswered, and the first keystroke overwrote an
 * answer nobody had seen. `jsonToString` is what the rest of each kit uses.
 */
describe('a control holding a value that is not a string', () => {
  const holding = (type: string, dataType: string): ComponentNode => ({
    key: 'target',
    type,
    props: {},
    schema: { type: dataType as 'string', validations: [] },
  })

  /*
   * Not `DatePicker`: a `type="date"` input refuses a value that is not a date
   * and clears itself, whatever the kit hands it, so the assertion would be
   * about the browser rather than about the kit. It reads its value the same
   * way as its neighbours; there is just no way to see that here.
   */
  const TEXTUAL = ['TextField', 'TextArea', 'NumberField']

  const VALUE_CASES = KITS.flatMap(({ name, kit, renderers }) =>
    TEXTUAL.filter((type) => kit.components.some((def) => def.type === type)).map(
      (type) => [name + ' ' + type, renderers, type] as const,
    ),
  )

  it('drives every value-holding control in every kit', () => {
    // As above: an empty table is a green file that ran no rule at all.
    expect(VALUE_CASES).toHaveLength(KITS.length * TEXTUAL.length)
  })

  it.each(VALUE_CASES)('%s shows it', (_what, renderers, type) => {
    const { container } = render(
      <FormUnderTest
        document={documentOf(holding(type, 'string'))}
        kit={renderers}
        data={{ target: 30 }}
        revealHidden
        onChange={() => undefined}
      />,
    )

    const element = container.querySelector<HTMLElement>('[data-fs-key="target"]')
    const field = element?.querySelector('input, textarea') ?? element
    expect((field as HTMLInputElement | null)?.value).toBe('30')
  })
})

describe('a document value a kit puts somewhere structural', () => {
  function nodeWith(type: string, props: Record<string, unknown>): ComponentNode {
    return {
      key: 'target',
      type,
      props: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, prop(v as never)])),
    }
  }

  function draw(renderers: RendererKit, node: ComponentNode): HTMLElement {
    const { container } = render(
      <FormUnderTest
        document={documentOf(node)}
        kit={renderers}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )
    const element = container.querySelector<HTMLElement>('[data-fs-key="target"]')
    if (!element) throw new Error('the component did not render')
    return element
  }

  /**
   * An element's markup with the per-render scope replaced by a fixed token.
   *
   * `data-fs-scope` is a `useId` value, so it differs between any two renders,
   * and every `id` and `aria-*` attribute built from it differs with it. That
   * makes raw `outerHTML` unequal for two renders of the *same* component, which
   * is why the variant control below could not fail.
   */
  function withoutScope(element: HTMLElement): string {
    const scope = element.getAttribute('data-fs-scope')
    if (!scope) throw new Error('no data-fs-scope to normalise: the seam this relies on has moved')
    return element.outerHTML.split(scope).join('«scope»')
  }

  it.each(KITS)('$name does not let a Text variant add classes of its own', ({ renderers }) => {
    /*
     * `'fsh-text fsh-text--' + variant` with an unnarrowed variant. React
     * escapes the attribute, so this is not XSS — but on a host using a utility
     * CSS framework, `variant: "body fixed inset-0 z-50"` is an element covering
     * the viewport, over the real form.
     */
    const element = draw(
      renderers,
      nodeWith('Text', { text: 'hello', variant: 'body fixed inset-0 z-50' }),
    )

    expect(element.className).not.toContain('inset-0')
  })

  it.each(KITS)('$name still tells its own variants apart', ({ kit, renderers }) => {
    /*
     * The control. Narrowing to nothing would collapse every variant to the
     * default and pass the test above. Two declared variants have to produce
     * two different results — which is checkable without knowing how a kit
     * spells them, and MUI spells them as its own class names rather than as
     * the authored word.
     */
    const declared = (
      kit.components.find((def) => def.type === 'Text')?.props.find((p) => p.name === 'variant')
        ?.options ?? []
    ).map((option) => (typeof option.value === 'string' ? option.value : ''))

    /*
     * Two, not one. With a single declared variant this rule used to return
     * quietly, and the narrowing test it is the control for would then pass
     * because every variant collapses to the default and there is nowhere else
     * to collapse to. `supplies options for every select prop` only asks for
     * one, so nothing else here would notice.
     */
    expect(
      declared.length,
      'Text.variant needs two declared options, or telling variants apart proves nothing',
    ).toBeGreaterThan(1)

    const [first, second] = declared as [string, string]
    const a = draw(renderers, nodeWith('Text', { text: 'hello', variant: first }))
    const b = draw(renderers, nodeWith('Text', { text: 'hello', variant: second }))

    /*
     * Compared with the scope taken out, because comparing raw `outerHTML` made
     * this control unable to fail. `data-fs-scope` is a `useId` value
     * (`renderer/index.tsx`), so two renders never agree on it and the
     * inequality below held whatever the kit drew. Measured by collapsing
     * `kit-html`'s `Text` variant to the default: both this rule and the
     * narrowing rule it is the control for stayed green.
     *
     * The scope also appears inside `id` and the `aria-*` attributes built from
     * it, so replacing the value everywhere is what makes the two comparable
     * rather than deleting the one attribute.
     */
    expect(withoutScope(a), 'two declared variants drew the same thing').not.toBe(withoutScope(b))
  })

  it.each(KITS)('$name gives an unrecognised Alert severity a role anyway', ({ renderers }) => {
    /*
     * An unnarrowed severity also withheld `role="alert"`, because the check is
     * `severity === 'error'`. So a document with a typo in the severity of its
     * error banner drew the banner and announced nothing.
     */
    const element = draw(
      renderers,
      nodeWith('Alert', { text: 'Something failed', severity: 'eror' }),
    )

    // Either it is treated as the default severity, or it is announced. What it
    // must not do is silently become a class name of its own.
    expect(element.className).not.toContain('eror')
    /*
     * And the role, which is the thing this rule is named after and never
     * checked. Its only expectation was the class-name spelling above, so a kit
     * that narrowed the severity and then announced nothing passed.
     *
     * `note` rather than `alert`, and that is the point: an unrecognised
     * severity narrows to `info`, and only an error interrupts. Asserting the
     * exact role rather than "some role" is what tells a narrowed alert from a
     * kit that gave up and announced everything.
     */
    expect(element.getAttribute('role')).toBe('note')
  })

  it.each(KITS)('$name still announces an Alert that really is an error', ({ renderers }) => {
    /*
     * The control for the rule above. A kit that answered `note` for everything
     * would pass it, and a form whose error banner does not interrupt is the
     * failure both rules exist to stop.
     */
    const element = draw(
      renderers,
      nodeWith('Alert', { text: 'Something failed', severity: 'error' }),
    )

    expect(element.getAttribute('role')).toBe('alert')
  })

  it.each(KITS)('$name does not put an arbitrary scheme in an image src', ({ renderers }) => {
    /*
     * `LinkNode` runs `href` through `safeHref`; `Image` put `src` straight
     * into the DOM. Not script execution, but an outbound request with a
     * referrer on every render, to an address the document chose.
     *
     * Every scheme `safeHref` refuses, not just `javascript:`. The assertion
     * was `not.toContain('javascript:')`, which is a denylist of one string in
     * a rule whose name says "arbitrary scheme" -- a kit that stripped that one
     * word and passed `data:text/html,...` through would have satisfied it.
     */
    const refused = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.example.com/a.png',
    ]

    const kept = refused.filter((src) => {
      const element = draw(renderers, nodeWith('Image', { src, alt: 'x' }))
      const img = element.tagName === 'IMG' ? element : element.querySelector('img')
      const drawn = img?.getAttribute('src') ?? ''
      return drawn !== '' && src.startsWith(drawn.slice(0, 6))
    })

    expect(kept).toEqual([])
  })

  it.each(KITS)('$name still shows an image with an ordinary address', ({ renderers }) => {
    const element = draw(
      renderers,
      nodeWith('Image', { src: 'https://example.com/a.png', alt: 'x' }),
    )
    const img = element.tagName === 'IMG' ? element : element.querySelector('img')

    expect(img?.getAttribute('src')).toBe('https://example.com/a.png')
  })

  it.each(KITS)('$name falls back when a text prop is cleared to empty', ({ renderers }) => {
    /*
     * `str(v, fallback)` returns `''` when the value *is* `''`, so every "safe
     * default" was bypassed by an emptied field — a button with no text, a link
     * with no text, a label with nothing in it. Clearing a label in the panel is
     * the most natural way to try to remove it.
     */
    const element = draw(renderers, nodeWith('Button', { text: '' }))

    expect(element.textContent?.trim()).not.toBe('')
  })
})

describe('a component whose options a document got wrong', () => {
  /** Everything a hand-edited document has plausibly been seen to hold. */
  const RUBBISH: unknown[] = [null, undefined, 'a bare string', 42, [], { label: 'fine', value: 7 }]

  function listNode(type: string, propName: string): ComponentNode {
    return {
      key: 'target',
      type,
      props: { [propName]: prop(RUBBISH as never), label: prop('Pick one') },
      schema: { type: 'string', validations: [] },
    }
  }

  /** The type each kit gives its list to, and the prop that list arrives on. */
  const LISTY: [string, string][] = [
    ['Select', 'options'],
    ['RadioGroup', 'options'],
    ['Breadcrumbs', 'items'],
  ]

  const LIST_CASES = KITS.flatMap(({ name, kit, renderers }) =>
    LISTY.filter(([type]) => kit.components.some((def) => def.type === type)).map(
      ([type, propName]) => [name + ' ' + type, renderers, type, propName] as const,
    ),
  )

  it('drives every listy component in every kit', () => {
    // An `it.each` over an empty table registers no tests and reports green, so
    // the table's size is asserted rather than assumed. See `DRIVEN`.
    expect(LIST_CASES).toHaveLength(KITS.length * LISTY.length)
  })

  it.each(LIST_CASES)('%s renders anyway', (_what, renderers, type, propName) => {
    const onError = vi.fn()

    const { container } = render(
      <FormUnderTest
        document={documentOf(listNode(type, propName))}
        kit={renderers}
        data={{}}
        revealHidden
        onError={onError}
        onChange={() => undefined}
      />,
    )

    // Not merely "the page survived" — the boundary would give us that. The
    // component itself has to still be the component.
    expect(onError).not.toHaveBeenCalled()
    expect(container.querySelector('[data-fs-key="target"]')?.getAttribute('role')).not.toBe(
      'alert',
    )
  })

  it.each(KITS)('$name still shows an option it can read', ({ kit, renderers }) => {
    /*
     * The control. Dropping every entry would pass the test above and leave a
     * select with nothing in it, which is the same lost question by a quieter
     * route.
     */
    if (!requires(kit, 'Select')) return

    const { container } = render(
      <FormUnderTest
        document={documentOf(listNode('Select', 'options'))}
        kit={renderers}
        data={{ target: 7 }}
        revealHidden
        onChange={() => undefined}
      />,
    )

    expect(chosenText(container)).toContain('fine')
  })
})

/**
 * The chosen option, however this kit chooses to draw one.
 *
 * The HTML kit renders a native `<select>`, whose options are in the document
 * and whose selection is `selectedOptions`. MUI renders a combobox and keeps
 * its options in a menu that is not open, so the only thing on the page is the
 * label of whatever is selected. Reading `container.textContent` finds the
 * options in one kit and nothing in the other, which is how a cross-kit
 * assertion ends up measuring two different things.
 */
function chosenText(container: HTMLElement): string {
  const combobox = container.querySelector('[role="combobox"]')
  if (combobox) return combobox.textContent ?? ''

  const select = container.querySelector('select')
  return select?.selectedOptions[0]?.textContent ?? ''
}

/**
 * A numeric option value survives being chosen.
 *
 * `str()` answers `''` for a number, so a select whose stored answer was `2`
 * rendered as nothing selected: the user picks an option, the data holds it,
 * the control shows blank, and the choice can never be made to stick.
 * `optionValue` in core exists so a numeric value survives the round trip, and
 * this was the one end that dropped it — the radio group in the same kit
 * already had it right, which is how one control drifts from its neighbour.
 */
describe('a select holding a number', () => {
  function numeric(): ComponentNode {
    return {
      key: 'target',
      type: 'Select',
      props: {
        label: prop('Quantity'),
        options: prop([
          { label: 'One', value: 1 },
          { label: 'Two', value: 2 },
        ]),
      },
      schema: { type: 'number', validations: [] },
    }
  }

  it.each(KITS)('$name shows the option the data names', ({ kit, renderers }) => {
    if (!requires(kit, 'Select')) return

    const { container } = render(
      <FormUnderTest
        document={documentOf(numeric())}
        kit={renderers}
        data={{ target: 2 }}
        revealHidden
        onChange={() => undefined}
      />,
    )

    expect(chosenText(container)).toBe('Two')
  })

  it.each(KITS)('$name shows nothing when the data names no option', ({ kit, renderers }) => {
    // The control: "shows Two" must not be something it would say regardless.
    if (!requires(kit, 'Select')) return

    const { container } = render(
      <FormUnderTest
        document={documentOf(numeric())}
        kit={renderers}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )

    expect(chosenText(container)).not.toContain('Two')
  })
})

describe.each(KITS)('$name', ({ kit, renderers }) => {
  /**
   * Three things a kit was doing to the accessibility tree.
   *
   * All three passed the contract suite, which is the point: it looks for an
   * attribute *somewhere inside* the component, and none of these is about whether
   * the attribute exists. They are about whether it reaches anybody.
   */

  const drawn = (node: ComponentNode): HTMLElement => {
    const { container } = render(
      <FormUnderTest
        document={documentOf(node)}
        kit={renderers}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )
    const element = container.querySelector<HTMLElement>('[data-fs-key="target"]')
    if (!element) throw new Error('nothing rendered')
    return element
  }

  it('puts a radio group role on the element carrying its group state', () => {
    /*
     * A `<fieldset>` maps to `group`, which supports neither `aria-invalid` nor
     * `aria-required` -- so both were set on an element that has no such state
     * and neither reached a screen reader. `kit-html`'s comment claimed
     * `role="radiogroup"` was implicit here. It is not.
     */
    const element = drawn({
      key: 'target',
      type: 'RadioGroup',
      props: {},
      schema: { type: 'string', validations: [{ key: 'required' }] },
      children: [],
    })

    const group =
      element.getAttribute('role') === 'radiogroup'
        ? element
        : element.querySelector('[role="radiogroup"]')

    expect(group, 'no element in this component has role="radiogroup"').not.toBeNull()
    expect(group?.getAttribute('aria-required')).toBe('true')
  })

  it('marks a required select on an element a screen reader reads', () => {
    /*
     * MUI's `select` renders a hidden native input plus a `div[role=button]`,
     * and the required marking landed on the hidden one -- which is
     * `aria-hidden`, so it reached nobody. The contract rule passed because it
     * asked whether the attribute was anywhere in the component.
     */
    const element = drawn({
      key: 'target',
      type: 'Select',
      props: {},
      schema: { type: 'string', validations: [{ key: 'required' }] },
    })

    const marked = [...element.querySelectorAll('[aria-required="true"]')].filter(
      (node) => node.closest('[aria-hidden="true"]') === null,
    )

    expect(
      marked.length,
      'every aria-required on this Select is inside aria-hidden',
    ).toBeGreaterThan(0)
  })

  it('does not report a progress value that is not a number', () => {
    /*
     * `NaN` is a number, and `JsonValue` admits one, so a bare
     * `typeof raw === 'number'` let it through as a determinate value and the
     * bar reported `aria-valuenow="NaN"`.
     */
    const element = drawn({
      key: 'target',
      type: 'Progress',
      props: { value: prop(Number.NaN) },
    })

    const bar =
      element.getAttribute('role') === 'progressbar'
        ? element
        : element.querySelector('[role="progressbar"]')

    expect(bar).not.toBeNull()
    expect(bar?.getAttribute('aria-valuenow')).not.toBe('NaN')
  })

  it('still reports a progress value that is one', () => {
    // The control. A bar that never reported a value would pass the row above.
    const element = drawn({ key: 'target', type: 'Progress', props: { value: prop(40) } })
    const bar =
      element.getAttribute('role') === 'progressbar'
        ? element
        : element.querySelector('[role="progressbar"]')

    expect(bar?.getAttribute('aria-valuenow')).toBe('40')
  })

  /**
   * What unit a length-valued prop carries.
   *
   * The contract says a document authored against one kit renders against the
   * other, and it never said what a number means. So `gap` was CSS pixels in
   * `@willowforms/kit-html` and multiples of `theme.spacing` in
   * `@willowforms/kit-mui` -- eight times apart for the same document -- and pixels
   * again on `kit-mui`'s own `Grid`, so that kit disagreed with itself as well.
   * Neither kit was wrong, because nothing had decided.
   *
   * `docs/spec/02-kit-contract.md` decides: **a length-valued prop is CSS
   * pixels.** This is the rule, run against every kit.
   *
   * `getComputedStyle` rather than a measured rectangle, deliberately. Nothing
   * here asks the browser to lay anything out -- `gap` is not computed from
   * layout, and what is read back is the declaration the kit emitted, resolved
   * through the cascade. jsdom does that part faithfully, which the probe that
   * found this defect confirmed: 32px against 4px for the same authored 4.
   */

  const drawWith = (type: string, props: Record<string, JsonValue>): HTMLElement => {
    const node: ComponentNode = {
      key: 'target',
      type,
      props: Object.fromEntries(Object.entries(props).map(([name, value]) => [name, prop(value)])),
      children: [],
    }
    const { container } = render(
      <FormUnderTest
        document={documentOf(node)}
        kit={renderers}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )
    const element = container.querySelector<HTMLElement>('[data-fs-key="target"]')
    if (!element) throw new Error(type + ' drew nothing')
    return element
  }

  const has = (type: string, name: string): boolean =>
    kit.components.some((def) => def.type === type && def.props.some((p) => p.name === name))

  /*
   * One row per length-valued prop either kit declares, found by reading the
   * definitions rather than by remembering. A kit that does not have one skips
   * its row rather than failing, because which components a kit ships is its own
   * business; what a number means is not.
   */
  /*
   * The CSS property each length-valued prop has to read back as.
   *
   * The rows below used to be hand-written, and a hand-written list of
   * obligations is a list of the ones somebody remembered. It carried a
   * `Container` row for a type neither kit ships, so `has()` answered false, the
   * body returned, and vitest reported a passing test that asserted nothing --
   * twice, once per kit. It also missed `Screen.maxWidth`, `Screen.gap`,
   * `Step.gap`, `Repeater.gap` and `Image.width`, which escaped by not being
   * listed rather than by any decision.
   *
   * So the rows are derived from what the kit declares, and this map is the only
   * thing maintained by hand. A length-valued prop that is neither mapped here
   * nor excluded below fails the completeness rule, which is the point: a new one
   * cannot join by being forgotten.
   */
  const PIXEL_PROPERTY: Record<string, string> = {
    gap: 'gap',
    padding: 'padding-top',
    radius: 'border-radius',
    maxWidth: 'max-width',
    width: 'width',
  }

  // Grid tracks contain these lengths; browser geometry tests cover their rendered widths.
  const NOT_A_PROPERTY = new Set(['minColumnWidth', 'inputWidth'])

  const declaredLengths = kit.components.flatMap((def) =>
    def.props
      .filter((p) => LENGTHS.includes(p.name))
      .map((p) => ({ type: def.type, name: p.name })),
  )

  it('maps every length-valued prop the kit declares, or excludes it with a reason', () => {
    const unmapped = declaredLengths
      .filter(({ name }) => !(name in PIXEL_PROPERTY) && !NOT_A_PROPERTY.has(name))
      .map(({ type, name }) => type + '.' + name)

    expect(
      unmapped,
      'a length-valued prop with no CSS property here is one this rule skips: map it, or put it in ' +
        'NOT_A_PROPERTY with a reason',
    ).toEqual([])
  })

  const PIXEL_CASES = declaredLengths
    .filter(({ name }) => name in PIXEL_PROPERTY)
    .map(({ type, name }, index) => ({
      what: type + '.' + name,
      type,
      name,
      css: PIXEL_PROPERTY[name] as string,
      // A different number per row, so a kit hardcoding one cannot satisfy two.
      value: 4 + index * 3,
    }))

  it.each(PIXEL_CASES)('$what is in CSS pixels', ({ what, type, name, css, value }) => {
    const element = drawWith(type, { [name]: value })

    /*
     * Anywhere in the component, not on the keyed element specifically. The
     * obligation is that the number means CSS pixels, and a kit is free to put
     * the property on whatever element it composes the component from:
     * `kit-html`'s `Repeater` sets `gap` on an inner stack and `kit-mui`'s
     * `Screen` on the layout it wraps, both correctly in pixels. Requiring the
     * keyed element would have failed both for a divergence in structure, which
     * a different rule owns.
     *
     * Still a strong claim, because each row uses a different number: a kit
     * hardcoding one cannot answer two, and a spacing-scale multiplier reads
     * back as 8x the number rather than the number.
     */
    const wanted = String(value) + 'px'
    const carries = (node: Element): boolean =>
      getComputedStyle(node).getPropertyValue(css) === wanted
    const found = carries(element) || [...element.querySelectorAll('*')].some(carries)

    expect(found, what + ' is not ' + wanted + ' anywhere in what the kit drew').toBe(true)
  })

  it('found lengths to drive at all', () => {
    /*
     * The rows are derived now, so an empty derivation would report a clean
     * sweep having rendered nothing. This is the same guard the sibling describe
     * carries for its own table.
     *
     * `> 0`, matching what this rule and its row in `02-kit-contract.md` both
     * claim. An earlier `> 4` was a floor nobody had stated, so it would have
     * failed a kit that legitimately declares fewer lengths for a reason the
     * message does not mention. The narrower question, whether the derivation
     * still sees everything the kit declares, is the completeness rule above,
     * and that one fails on a single missed prop rather than on a count.
     */
    expect(PIXEL_CASES.length, 'no length-valued props were found to drive').toBeGreaterThan(0)
  })

  it('reads a different number differently, so the rows above are not a fixed value', () => {
    // The control. A kit hardcoding 4px would pass a `Stack.gap` row exactly.
    expect(has('Stack', 'gap'), 'Stack.gap is the control for the rows above').toBe(true)

    expect(getComputedStyle(drawWith('Stack', { gap: 24 })).gap).toBe('24px')
  })

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
      ? made(container, { key: 'seed', type: container.type, props: {} })
      : undefined

    it.each(kit.components.map((c) => [c.type, c] as const))(
      '%s spreads nodeProps onto a real element',
      (type, def) => {
        const node = made(def, root ?? { key: 'r', type: 'r', props: {} })
        node.key = 'target'

        /*
         * `revealHidden`, because this asks whether the renderer spreads
         * nodeProps, which has nothing to do with whether a condition shows the
         * node. A kit may ship a component that is conditional the moment it is
         * dropped — `Step` is one, hidden until `context.step` names it — and
         * without this the contract would be unsatisfiable for that whole class
         * of component rather than merely unmet.
         */
        const { container: dom } = render(
          <FormUnderTest
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            revealHidden
            onChange={() => undefined}
          />,
        )

        const element = dom.querySelector('[data-fs-key="target"]')
        expect(
          element,
          `${type} does not put data-fs-key in the DOM, so the designer cannot select it. ` +
            'Spread nodeProps onto the outermost element.',
        ).not.toBeNull()
        /*
         * And it has to be the kit's element rather than the boundary's.
         *
         * The fallback emits `data-fs-key` and `data-fs-type` too, deliberately,
         * so a component that broke stays selectable. That made this rule
         * unfailable: a renderer replaced by `throw new Error()` satisfied both
         * assertions above from the fallback. The `afterEach` at the top of this
         * file now catches that for every rule at once; this says it here as
         * well, because a rule that can only fail through a file-wide net is one
         * somebody will move to another file.
         */
        expect(
          element?.hasAttribute('data-fs-failed'),
          `${type} threw, and the boundary's fallback answered for it`,
        ).toBe(false)
        expect(element?.getAttribute('data-fs-type')).toBe(type)
      },
    )

    it.each(kit.components.map((c) => [c.type, c] as const))(
      '%s carries the scope of the form it was rendered in',
      (type, def) => {
        /*
         * Separate from the nodeProps check above, because it fails separately:
         * a kit that picks the attributes out by name instead of spreading gets
         * `data-fs-key` right, passes that test, and silently drops this one.
         * The cost is two forms on a page sharing each other's styling.
         */
        const node = made(def, root ?? { key: 'r', type: 'r', props: {} })
        node.key = 'target'

        const { container: dom } = render(
          <FormUnderTest
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            revealHidden
            onChange={() => undefined}
          />,
        )

        const element = dom.querySelector('[data-fs-key="target"]')
        // The boundary's fallback carries `data-fs-scope` as well, so reading it
        // off whatever is in the DOM proved nothing about the kit.
        expect(
          element?.hasAttribute('data-fs-failed'),
          `${type} threw, and the boundary's fallback answered for it`,
        ).toBe(false)
        expect(
          element?.getAttribute('data-fs-scope'),
          `${type} does not put data-fs-scope in the DOM, so its per-component CSS is not ` +
            'confined to one form. Spread all of nodeProps rather than picking attributes out.',
        ).toBeTruthy()
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
          <FormUnderTest
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
      /*
       * A freshly dropped field has no data yet. Any renderer that assumes one
       * takes the whole canvas down the moment it is added.
       *
       * This was `expect(render).not.toThrow()`, which the boundary guarantees by
       * existing: it catches, so `render` returns normally whatever the kit did.
       * The rule had no way to fail. What it actually means is that the kit drew
       * the component, so that is what it asks now -- the boundary did not fire,
       * and the element in the DOM is the kit's rather than the fallback's.
       */
      for (const def of kit.components.filter((c) => c.dataBound)) {
        const node = made(def, { key: 'r', type: 'r', props: {} })
        node.key = 'target'

        const { container: dom } = render(
          <FormUnderTest
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            revealHidden
            onChange={() => undefined}
          />,
        )

        const element = dom.querySelector('[data-fs-key="target"]')
        expect(element, `${def.type} rendered nothing at all with no value`).not.toBeNull()
        expect(
          element?.hasAttribute('data-fs-failed'),
          `${def.type} threw on an absent value, so a freshly dropped field breaks the canvas`,
        ).toBe(false)
      }
    })

    it('shows an error message when one is passed', () => {
      const bound = kit.components.filter((c) => c.dataBound)
      expect(bound.length).toBeGreaterThan(0)

      for (const def of bound) {
        const node = made(def, { key: 'r', type: 'r', props: {} })
        node.key = 'field'

        const { container: dom } = render(
          <FormUnderTest
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
     * anything ran them, and @willowforms/kit-mui had never satisfied either.
     * A contract nothing executes is a wish.
     */

    it('marks the message as an alert when it holds an error', () => {
      for (const def of kit.components.filter((c) => c.dataBound)) {
        const node = made(def, { key: 'r', type: 'r', props: {} })
        node.key = 'field'

        const { container: dom } = render(
          <FormUnderTest
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
        const node = made(def, { key: 'r', type: 'r', props: {} })
        node.key = 'field'

        // No error. The element still has to be there, or the description is
        // attached only at the moment it changes and is announced twice or not
        // at all depending on the screen reader.
        const { container: dom } = render(
          <FormUnderTest
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            onChange={() => undefined}
          />,
        )

        /*
         * Every element that describes itself, not the first one found. A
         * component can hold more than one control -- a radio group is a list of
         * inputs, a file upload is an input beside a summary -- and checking the
         * first meant the rest could point anywhere at all.
         */
        const host = dom.querySelector('[data-fs-key="field"]')
        const describers = [
          ...(host?.matches('[aria-describedby]') ? [host] : []),
          ...(host?.querySelectorAll('[aria-describedby]') ?? []),
        ]

        expect(
          describers.length,
          `${def.type} has no control carrying aria-describedby`,
        ).toBeGreaterThan(0)

        for (const described of describers) {
          for (const id of (described.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
            expect(
              dom.querySelector('[id="' + id + '"]'),
              `${def.type} points aria-describedby at #${id}, which is not in the DOM`,
            ).not.toBeNull()
          }
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

  it('lets a RadioItem child take part in its group', () => {
    /*
     * 03-components.md says a RadioGroup "also accepts RadioItem children, for
     * the case where an option needs its own layout". Both kits shipped that
     * child wired to nothing, so it looked exactly like an option and did
     * nothing when clicked, which is the failure this project treats as worst.
     */
    const group = kit.components.find((c) => c.type === 'RadioGroup')
    const item = kit.components.find((c) => c.type === 'RadioItem')

    /*
     * A kit need not offer a radio group at all, and this used to return
     * quietly whenever either piece was missing -- so deleting `RadioItem`
     * turned the obligation off instead of failing it, which is the one thing a
     * contract suite must never let a kit do.
     *
     * Offering the group is the commitment. Offering the child without the
     * group is a palette entry with nothing to join, which is worth failing on
     * its own.
     */
    expect(
      { group: Boolean(group), item: Boolean(item) },
      'a RadioGroup and its RadioItem ship together or not at all',
    ).toEqual({ group: Boolean(group), item: Boolean(group) })
    if (!group || !item) return

    const node: ComponentNode = {
      key: 'choice',
      type: 'RadioGroup',
      props: {
        label: { kind: 'static', value: 'Pick one' },
        options: { kind: 'static', value: [] },
      },
      schema: { type: 'string', validations: [] },
      children: [
        {
          key: 'custom',
          type: 'RadioItem',
          props: {
            label: { kind: 'static', value: 'The custom one' },
            value: { kind: 'static', value: 'custom' },
          },
        },
      ],
    }

    const onChange = vi.fn()
    render(
      <FormUnderTest document={documentOf(node)} kit={renderers} data={{}} onChange={onChange} />,
    )

    fireEvent.click(screen.getByLabelText('The custom one'))

    expect(
      onChange,
      'clicking a RadioItem did not reach the group it is inside',
    ).toHaveBeenCalledWith('choice', 'custom')
  })

  it('builds a palette index without collisions', () => {
    expect(indexKit(kit).size).toBe(kit.components.length)
  })
})

describe('a default copied between kits', () => {
  /*
   * There is no general rule here to check: MUI's `gap` is a spacing-scale
   * multiplier and the HTML kit's is pixels, so 16 is right in one and 128
   * pixels in the other, and MUI's `Grid` legitimately uses pixels because its
   * renderer converts them.
   *
   * What is checkable is narrower and is the mistake that actually happened.
   * `Step` renders as a `Stack` in both kits — same element, same pass-through
   * of `gap` — so the two must agree within a kit. `Step` arrived carrying the
   * HTML kit's 16 into MUI, where it is 128 pixels.
   */
  it.each(KITS)('$name gives Step the same gap as the Stack it renders as', ({ kit }) => {
    const gapOf = (type: string): unknown =>
      kit.components.find((def) => def.type === type)?.defaultProps['gap']

    expect(gapOf('Step'), 'Step has no gap default').toBeTypeOf('number')
    expect(gapOf('Step')).toBe(gapOf('Stack'))
  })
})

// Heading rank must agree across kits, including documents that omit it.
describe('a heading whose document names no rank', () => {
  it.each(KITS)('$name renders it at the same rank as the other kit', ({ renderers }) => {
    const node: ComponentNode = { key: 'target', type: 'Heading', props: { text: prop('Title') } }

    const { container } = render(
      <FormUnderTest
        document={documentOf(node)}
        kit={renderers}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )

    const element = container.querySelector('[data-fs-key="target"]')
    const heading = element?.matches('h1, h2, h3, h4, h5, h6')
      ? element
      : element?.querySelector('h1, h2, h3, h4, h5, h6')

    expect(heading?.tagName.toLowerCase(), 'no heading element was rendered').toBe('h2')
  })
})

/**
 * Every icon a kit declares reaches a glyph the designer can draw.
 *
 * The vocabulary is a union in core and `GLYPHS` is a `Record<IconName, …>`, so
 * a missing glyph is a compile error and a kit's `icon:` field is type-checked
 * against the same union. What neither of those can say is that the glyph
 * *draws* -- an entry mapped to an empty fragment satisfies both -- and the
 * designer cannot check it against a kit, because invariant 2 forbids it from
 * importing one. This file imports both.
 */
describe('the icons the kits ask for', () => {
  it.each(KITS)('$name declares only icons that draw something', ({ kit }) => {
    const declared = [...new Set(kit.components.map((def) => def.icon).filter(Boolean))]
    expect(declared.length, 'no icons were declared, so this checked nothing').toBeGreaterThan(5)

    const blank = declared.filter((name) => {
      const { container } = render(<Icon name={name as IconName} />)
      const svg = container.querySelector('svg')
      return !svg || svg.children.length === 0
    })

    expect(blank).toEqual([])
  })
})

describe('a length means the same number of pixels in both kits', () => {
  /*
   * `kit-mui` defaulted `gap` to 2 on `Screen`, `Stack`, `Step` and `Repeater`
   * while `kit-html` defaulted it to 16, and `Grid` in the same MUI file said
   * 16 -- so the kit disagreed with itself as well as with the other one. The
   * numbers were MUI spacing units left behind when `renderers.tsx` moved gaps
   * to pixels: `theme.spacing` is 8, so every new layout component the designer
   * created came out eight times tighter than the same document on `kit-html`.
   *
   * The rule above could not see it. It compares what a form author is shown
   * and skips `defaultProps` on the stated ground that a kit may choose its own
   * -- true of the number and false of the unit, which is the distinction this
   * describe adds. `docs/spec/02-kit-contract.md` claimed the defaults were
   * unchanged and "a form that never set a gap looks identical", which was true
   * of the renderer's fallback and false of the kit, because `defaultProps` is
   * written into every node before the fallback is ever consulted.
   */
  const html = new Map(htmlKit.components.map((c) => [c.type, c]))
  const mui = new Map(muiKit.components.map((c) => [c.type, c]))
  const shared = [...html.keys()].filter((type) => mui.has(type)).sort()

  const lengthsOf = (def: ComponentDef | undefined): Record<string, JsonValue> => {
    const defaults = def?.defaultProps ?? {}
    const found: Record<string, JsonValue> = {}
    for (const name of LENGTHS) {
      const value = defaults[name]
      if (value !== undefined) found[name] = value
    }
    return found
  }

  it('found lengths to compare at all', () => {
    /*
     * Without this the `it.each` below could compare `{}` to `{}` for every
     * component -- a renamed prop, a `defaultProps` that stopped being read --
     * and report success having looked at nothing. This is the shape the rest
     * of this file already refuses.
     */
    const counted = shared.reduce(
      (total, type) => total + Object.keys(lengthsOf(html.get(type))).length,
      0,
    )
    expect(
      counted,
      'no component defaults any length, so nothing below compares anything',
    ).toBeGreaterThan(4)

    // And `gap` specifically, since it is the one that drifted.
    expect(shared.filter((type) => 'gap' in lengthsOf(mui.get(type))).length).toBeGreaterThan(3)
  })

  it.each(shared)('%s defaults its lengths identically', (type) => {
    expect(lengthsOf(mui.get(type)), 'kit-mui').toEqual(lengthsOf(html.get(type)))
  })

  it.each(shared)('%s defaults no length to a spacing-scale number', (type) => {
    /*
     * The failure with its own name. Agreement alone would be satisfied by both
     * kits saying 2, which is 2px and not what either author meant. Anything
     * under 4px is a spacing unit that escaped a conversion rather than a
     * deliberate hairline: nothing in either kit wants a 2px gap between form
     * fields.
     *
     * Both kits, which is the point and which this checked in one of them --
     * the case the comment above describes, both kits saying 2, is exactly the
     * one a `kit-mui`-only loop cannot see. It is reachable: the two kits are
     * separate packages and a spacing unit escaping a conversion is a mistake
     * either author can make on their own.
     *
     * And the type first. `02-kit-contract.md` says a length-valued default is
     * a number of CSS pixels, so `'8px'` or `'1rem'` is a contract violation on
     * its own -- and it slipped through this rule silently, because a string is
     * not `< 4`. A value that cannot be judged has to fail rather than pass.
     */
    for (const [kit, def] of [
      ['kit-mui', mui.get(type)],
      ['kit-html', html.get(type)],
    ] as const) {
      for (const [name, value] of Object.entries(lengthsOf(def))) {
        const where = kit + ' ' + type + '.' + name

        expect(typeof value, where + ' is a length, which the contract says is a number').toBe(
          'number',
        )
        expect(
          typeof value === 'number' && value > 0 && value < 4,
          where + ' is on the spacing scale rather than in pixels',
        ).toBe(false)
      }
    }
  })
})

/**
 * Every kit crossed with the field components whose seam element is checked.
 *
 * Named, like `LIST_CASES` and `VALUE_CASES`, rather than built inline: the
 * counter in `test/docs.test.ts` recognises a per-kit rule by
 * `it.each(KITS)` or `it.each(SOMETHING_CASES)`, so a rule written as
 * `it.each(KITS.flatMap(...))` is an obligation the spec's own table never
 * counts. That is the gap the counter's docblock is about.
 */
const SEAM_CASES = KITS.flatMap(({ name, kit, renderers }) =>
  [
    'TextField',
    'NumberField',
    'Select',
    'TextArea',
    'Checkbox',
    'Switch',
    'DatePicker',
    'RadioGroup',
  ].map((type) => ({
    name,
    kit,
    renderers,
    type,
  })),
)

describe('the seam a document is addressed through', () => {
  /*
   * `nodeProps` is how everything outside a kit finds a component: the
   * designer's canvas selection, the per-node stylesheet the renderer emits
   * against `data-fs-key`, and every end-to-end selector. A kit's one
   * obligation is to spread it onto a root element -- and `kit-html` had two
   * answers to what that element is. Seven of its nine field renderers spread it
   * onto an unclassed wrapper `<div>` with `.fsh-field` one level in, while
   * `SwitchNode` and `RadioGroupNode` spread it onto `.fsh-field` itself.
   *
   * The visible cost was `min-width: 0` in `kit-html.css`, written on
   * `.fsh-field` and inert for the seven, because the flex item was the wrapper
   * and the rule was on its child. The deeper cost is that a rule anybody writes
   * against the seam has two shapes to cover in one kit.
   *
   * Pinned as a shape rather than as a class name, so it holds for a kit that
   * names its classes anything: the element carrying `data-fs-key` must be the
   * element the kit styles, which means it carries a class of its own.
   */
  it.each(SEAM_CASES)(
    '$name puts $type on one element, not on a wrapper around it',
    ({ kit, renderers, type }) => {
      if (!requires(kit, type)) return

      const def = kit.components.find((each) => each.type === type)
      if (!def) return

      const root = emptyRoot()
      const node = made(def, root)
      const { container } = render(
        <FormRenderer
          document={documentOf({ ...root, children: [node] })}
          kit={renderers}
          data={{}}
          onChange={() => undefined}
        />,
      )

      const seam = container.querySelector('[data-fs-key="' + node.key + '"]')
      expect(seam, type + ' rendered nothing carrying data-fs-key').not.toBeNull()

      /*
       * The seam element is the kit's own element. A bare wrapper -- an element
       * with the seam attributes, no class of its own and exactly one child that
       * carries all the styling -- is the shape this rules out.
       */
      const bare =
        (seam?.getAttribute('class') ?? '') === '' &&
        seam?.children.length === 1 &&
        (seam.children[0]?.getAttribute('class') ?? '') !== ''

      expect(bare, type + ' spreads nodeProps onto an unclassed wrapper').toBe(false)
    },
  )
})

describe.each(KITS)('$name editable repeaters', ({ kit, renderers }) => {
  it('adds and removes rows without crossing authored bounds', () => {
    if (!requires(kit, 'Repeater') || !requires(kit, 'TextField')) return

    render(<EditableRepeater renderers={renderers} />)

    const add = screen.getByRole('button', { name: 'Add Guest' })
    const firstRemove = screen.getByRole('button', { name: 'Remove Guest item 1' })
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(1)
    expect(firstRemove.hasAttribute('disabled')).toBe(true)
    expect(add.hasAttribute('disabled')).toBe(false)

    fireEvent.click(add)

    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(2)
    expect(add.hasAttribute('disabled')).toBe(true)
    expect(firstRemove.hasAttribute('disabled')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Guest item 2' }))

    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(1)
    expect(firstRemove.hasAttribute('disabled')).toBe(true)
    expect(add.hasAttribute('disabled')).toBe(false)
  })
})

describe.each(KITS)('$name controlled step navigation', ({ kit, renderers }) => {
  it('counts shared page content once and navigates through reachable branches', () => {
    if (!requires(kit, 'Step') || !requires(kit, 'Text')) return

    render(<BranchingSteps renderers={renderers} />)

    const back = screen.getByRole('button', { name: 'Back' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(screen.getByText('First step')).toBeTruthy()
    expect(screen.getByText('Step 1')).toBeTruthy()
    expect(back.hasAttribute('disabled')).toBe(true)
    expect(next.hasAttribute('disabled')).toBe(false)

    fireEvent.click(next)

    expect(screen.queryByText('First step')).toBeNull()
    expect(screen.queryByText('Second step')).toBeNull()
    expect(screen.getByText('Third step')).toBeTruthy()
    expect(screen.getByText('Step 2')).toBeTruthy()
    const lastBack = screen.getByRole('button', { name: 'Back' })
    const lastNext = screen.getByRole('button', { name: 'Next' })
    expect(lastBack.hasAttribute('disabled')).toBe(false)
    expect(lastNext.hasAttribute('disabled')).toBe(true)

    fireEvent.click(lastBack)
    expect(screen.getByText('First step')).toBeTruthy()
  })
})

describe.each(KITS)('$name action events', ({ kit, renderers }) => {
  it('dispatches a button click as a validated effect batch', () => {
    if (!requires(kit, 'Button')) return
    const onEffects = vi.fn()
    const button: ComponentNode = {
      key: 'submit',
      type: 'Button',
      props: { text: prop('Submit') },
      events: {
        onClick: [{ type: 'builtin', name: 'announce', params: { message: 'Submitting' } }],
      },
    }

    render(
      <FormUnderTest
        document={documentOf(button)}
        kit={renderers}
        data={{}}
        onChange={() => undefined}
        onEffects={onEffects}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onEffects).toHaveBeenCalledTimes(1)
    expect(onEffects.mock.calls[0]).toEqual([
      [{ kind: 'announce', message: 'Submitting' }],
      { nodeKey: 'submit', event: 'onClick', address: 'submit' },
    ])
  })

  it('raises a field event once alongside its ordinary data change', () => {
    if (!requires(kit, 'TextField')) return
    const onChange = vi.fn()
    const onEffects = vi.fn()
    const field: ComponentNode = {
      key: 'name',
      type: 'TextField',
      props: { label: prop('Name') },
      schema: { type: 'string' },
      events: {
        onChange: [{ type: 'builtin', name: 'announce', params: { message: 'Changed' } }],
      },
    }

    render(
      <FormUnderTest
        document={documentOf(field)}
        kit={renderers}
        data={{}}
        onChange={onChange}
        onEffects={onEffects}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Ada' },
    })

    expect(onChange).toHaveBeenCalledWith('name', 'Ada')
    expect(onEffects).toHaveBeenCalledOnce()
  })

  it('runs code actions only through the supplied action evaluator', () => {
    if (!requires(kit, 'Button')) return
    const evaluateAction = vi.fn((): JsonValue => [{ kind: 'announce', message: 'Prepared' }])
    const onEffects = vi.fn()
    const button: ComponentNode = {
      key: 'prepare',
      type: 'Button',
      props: { text: prop('Prepare') },
      events: { onClick: [{ type: 'code', name: 'prepare' }] },
    }
    const document = documentOf(button)
    document.actions['prepare'] = {
      name: 'prepare',
      body: 'return effects',
      params: { target: 'status' },
    }

    render(
      <FormUnderTest
        document={document}
        kit={renderers}
        data={{}}
        onChange={() => undefined}
        evaluateAction={evaluateAction}
        onEffects={onEffects}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Prepare' }))

    expect(evaluateAction).toHaveBeenCalledOnce()
    expect(onEffects).toHaveBeenCalledWith([{ kind: 'announce', message: 'Prepared' }], {
      nodeKey: 'prepare',
      event: 'onClick',
      address: 'prepare',
    })
  })
})

describe('a breadcrumb landmark in the form language', () => {
  /*
   * `kit-html`'s `BreadcrumbsNode` read `props['label']` for the landmark's
   * accessible name, with a comment saying the English word "Breadcrumb" on a
   * component whose every other string is translatable was the defect being
   * fixed. Neither kit *declared* a `label` property, so `Properties.tsx` --
   * which builds the panel from `def?.props ?? []` -- rendered no editor for
   * it, and with no declared property there was no i18n binding mode either.
   * The fix was unreachable from the designer, and `kit-mui` still hard-coded
   * the English word.
   *
   * Three things had to move together: both kits' definitions, `kit-mui`'s
   * renderer, and `03-components.md`'s table, which `test/docs.test.ts` checks
   * against what the kits declare.
   */
  const crumbs = (label: PropValue | undefined): ComponentNode => ({
    key: 'trail',
    type: 'Breadcrumbs',
    props: {
      items: prop([{ label: 'Accueil', href: 'https://example.com' }, { label: 'Profil' }]),
      ...(label === undefined ? {} : { label }),
    },
  })

  const landmarkIn = (renderers: RendererKit, node: ComponentNode, root: ComponentNode): string => {
    const { container } = render(
      <FormRenderer
        document={documentOf({ ...root, children: [node] })}
        kit={renderers}
        data={{}}
        onChange={() => undefined}
      />,
    )
    const nav = container.querySelector('[data-fs-key="trail"]')
    expect(nav, 'no breadcrumbs rendered').not.toBeNull()
    return nav?.getAttribute('aria-label') ?? ''
  }

  it.each(KITS)('$name declares the property its renderer reads', ({ kit }) => {
    const def = kit.components.find((each) => each.type === 'Breadcrumbs')
    expect(def, 'this kit has no Breadcrumbs').toBeDefined()

    const label = def?.props.find((each) => each.name === 'label')
    expect(label, 'the renderer reads a label the kit does not declare').toBeDefined()
    // Localizable, or the translation the whole finding is about is impossible.
    expect(label?.localizable).toBe(true)
  })

  it.each(KITS)('$name names the landmark from the document', ({ renderers }) => {
    const root = emptyRoot()
    expect(landmarkIn(renderers, crumbs(prop("Fil d'Ariane")), root)).toBe("Fil d'Ariane")
  })

  it.each(KITS)('$name falls back when the document says nothing', ({ renderers }) => {
    // The control: reading the prop must not cost the default, which is what a
    // form that never sets one still needs.
    const root = emptyRoot()
    expect(landmarkIn(renderers, crumbs(undefined), root)).toBe('Breadcrumb')
  })
})

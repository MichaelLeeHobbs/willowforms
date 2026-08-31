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

import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactElement } from 'react'
import { prop } from '@formsmith/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentDef, ComponentNode, FormDocument, JsonValue, Kit } from '@formsmith/core'
import { emptyRoot, groupKit, indexKit, instantiate } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

const KITS: { name: string; kit: Kit; renderers: RendererKit }[] = [
  { name: '@formsmith/kit-mui', kit: muiKit, renderers: muiRendererKit },
  { name: '@formsmith/kit-html', kit: htmlKit, renderers: htmlRendererKit },
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

describe('the two kits in this repository agree', () => {
  const html = new Map(htmlKit.components.map((c) => [c.type, c]))
  const mui = new Map(muiKit.components.map((c) => [c.type, c]))

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
      ...instantiate(def, { key: 'r', type: 'r', props: {} }),
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

  /** The control inside a component, whatever element the kit chose for it. */
  function control(element: HTMLElement): HTMLElement | null {
    return element.matches('input, select, textarea')
      ? element
      : element.querySelector('input, select, textarea')
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
         * A component with no control of its own cannot carry `aria-invalid` --
         * it is supported on widget roles and inert on a container, which is
         * what a `Repeater` is. Both kits set it there anyway and this rule
         * found it and passed, which is a guard reporting a hole as a fix. Such
         * a component satisfies the obligation by announcing instead: a message
         * with `role="alert"`, which is what a screen reader will actually read.
         */
        if (!target) {
          return element.querySelector('[role="alert"]') === null
        }

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

  it.each(
    KITS.flatMap(({ name, kit, renderers }) =>
      /*
       * Not `DatePicker`: a `type="date"` input refuses a value that is not a
       * date and clears itself, whatever the kit hands it, so the assertion
       * would be about the browser rather than about the kit. It reads its value
       * the same way as its neighbours; there is just no way to see that here.
       */
      ['TextField', 'TextArea', 'NumberField']
        .filter((type) => kit.components.some((def) => def.type === type))
        .map((type) => [name + ' ' + type, renderers, type] as const),
    ),
  )('%s shows it', (_what, renderers, type) => {
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
    if (declared.length < 2) return

    const [first, second] = declared as [string, string]
    const a = draw(renderers, nodeWith('Text', { text: 'hello', variant: first }))
    const b = draw(renderers, nodeWith('Text', { text: 'hello', variant: second }))

    expect(a.outerHTML).not.toBe(b.outerHTML)
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
    // `LinkNode` runs `href` through `safeHref`; `Image` put `src` straight into
    // the DOM. Not script execution, but an outbound request with a referrer on
    // every render, to an address the document chose.
    const element = draw(renderers, nodeWith('Image', { src: 'javascript:alert(1)', alt: 'x' }))
    const img = element.tagName === 'IMG' ? element : element.querySelector('img')

    expect(img?.getAttribute('src') ?? '').not.toContain('javascript:')
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

  it.each(
    KITS.flatMap(({ name, kit, renderers }) =>
      LISTY.filter(([type]) => kit.components.some((def) => def.type === type)).map(
        ([type, propName]) => [name + ' ' + type, renderers, type, propName] as const,
      ),
    ),
  )('%s renders anyway', (_what, renderers, type, propName) => {
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
    if (!kit.components.some((def) => def.type === 'Select')) return

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
    if (!kit.components.some((def) => def.type === 'Select')) return

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
    if (!kit.components.some((def) => def.type === 'Select')) return

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
   * What unit a length-valued prop carries.
   *
   * The contract says a document authored against one kit renders against the
   * other, and it never said what a number means. So `gap` was CSS pixels in
   * `@formsmith/kit-html` and multiples of `theme.spacing` in
   * `@formsmith/kit-mui` -- eight times apart for the same document -- and pixels
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
  const LENGTHS: { type: string; name: string; css: string; value: number }[] = [
    { type: 'Stack', name: 'gap', css: 'gap', value: 4 },
    { type: 'Container', name: 'gap', css: 'gap', value: 6 },
    { type: 'Grid', name: 'gap', css: 'gap', value: 12 },
    { type: 'Box', name: 'padding', css: 'padding-top', value: 9 },
    { type: 'Box', name: 'radius', css: 'border-radius', value: 7 },
  ]

  it.each(LENGTHS.map((length) => [length.type + '.' + length.name, length] as const))(
    '%s is in CSS pixels',
    (_what, length) => {
      if (!has(length.type, length.name)) return

      const element = drawWith(length.type, { [length.name]: length.value })
      const read = getComputedStyle(element).getPropertyValue(length.css)

      expect(read, length.type + '.' + length.name + ' is not in CSS pixels').toBe(
        String(length.value) + 'px',
      )
    },
  )

  it('reads a different number differently, so the rows above are not a fixed value', () => {
    // The control. A kit hardcoding 4px would pass the `Stack.gap` row exactly.
    if (!has('Stack', 'gap')) return

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
      ? instantiate(container, { key: 'seed', type: container.type, props: {} })
      : undefined

    it.each(kit.components.map((c) => [c.type, c] as const))(
      '%s spreads nodeProps onto a real element',
      (type, def) => {
        const node = instantiate(def, root ?? { key: 'r', type: 'r', props: {} })
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
        const node = instantiate(def, root ?? { key: 'r', type: 'r', props: {} })
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
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
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
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
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
     * anything ran them, and @formsmith/kit-mui had never satisfied either.
     * A contract nothing executes is a wish.
     */

    it('marks the message as an alert when it holds an error', () => {
      for (const def of kit.components.filter((c) => c.dataBound)) {
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
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
        const node = instantiate(def, { key: 'r', type: 'r', props: {} })
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

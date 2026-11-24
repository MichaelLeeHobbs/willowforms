/**
 * @vitest-environment jsdom
 */

/** The kit contract. A new kit is added to KITS below and nothing else. */

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
 * Errors the renderer's boundary caught. Its fallback also emits `data-fs-key`,
 * `data-fs-type` and `data-fs-scope`, so without this a kit that throws passes
 * the rules that read them.
 */
const caught: { key: string; error: Error }[] = []

beforeEach(() => {
  caught.length = 0
})

afterEach(() => {
  if (caught.length === 0) return
  // Thrown, not asserted: `vitest/no-standalone-expect`, and the message names
  // what threw.
  throw new Error(
    'The renderer caught an error, so a kit renderer did not render. Whatever this test ' +
      'asserted about the DOM, it was reading the fallback. ' +
      caught.map((failure) => failure.key + ': ' + failure.error.message).join('; '),
  )
})

/**
 * Render through this, not `FormRenderer`, so a new rule inherits the boundary
 * check. A caller's own `onError` is still called.
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
    // `en-US` as `createDocument` makes it: without a dialect, a bundle keyed by
    // tag and one keyed by bare code look the same.
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
 * The two kits here share component types so a document moves between them
 * (`03-components.md`: "Built means both kits implement it"). The contract does
 * not ask that of a third-party kit.
 */
/**
 * Known gaps in that agreement, named so the comparison stays strict everywhere
 * else.
 */
const DIVERGENT_VOCABULARY = new Set(['Button.variant'])

/**
 * Components this suite drives, and the props it drives them through. A renamed
 * type or prop would turn a rule off rather than fail it, so both are asserted.
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
 * Returns whether the kit offers it, so a caller can stop before a second
 * failure from the same cause.
 */
function requires(kit: Kit, type: string): boolean {
  const offered = kit.components.some((def) => def.type === type)
  expect(
    offered,
    type + ' is a component this suite drives: dropping it must fail a rule, not silence one',
  ).toBe(true)
  return offered
}

const made = (def: ComponentDef, root: ComponentNode): ComponentNode => {
  const node = instantiate(def, root)
  if (!node) throw new Error('instantiate refused a definition this test expects it to accept')
  return node
}

/**
 * Props whose values are CSS pixels (`02-kit-contract.md`). Their defaults must
 * be equal across kits, not just agree on the unit: `defaultProps` is written
 * into every node the designer creates and leaves with the document. Named
 * rather than inferred from the editor, because `columns`, `index` and
 * `maxLength` are numbers too.
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

      // Not `defaultProps`: a kit may pick its own defaults, except lengths,
      // which are checked below.
      expect(a.label).toBe(b.label)
      expect(a.icon).toBe(b.icon)
      expect(a.group).toBe(b.group)
      expect(a.container ?? false).toBe(b.container ?? false)
      expect(a.root ?? false).toBe(b.root ?? false)
      expect(a.dataBound ?? false).toBe(b.dataBound ?? false)
      expect(a.dataType).toBe(b.dataType)
      // Every field of a property: `localizable`, `conditional` and `section`
      // decide which bindings and which tab an author gets.
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
 * MUI multiplies a numeric `sx` `borderRadius` by `theme.shape.borderRadius`.
 * Reads the CSS each kit wrote, not `getComputedStyle`: jsdom has no layout.
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

  function declarationsFor(renderers: RendererKit): string {
    /*
     * Style tags are not cleared between renders: emotion does not re-insert a
     * rule it has seen, so the next render would emit nothing. Sheets are
     * matched by the element's own class instead.
     */
    const { container } = render(formOf(renderers))

    const el = container.querySelector('[data-fs-key="target"]')
    if (!el) throw new Error('the Box did not render')

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

describe('what a data-bound control has to say about itself', () => {
  // Not containers: a repeater is data-bound, but marking a container invalid
  // or required says nothing a screen reader can use.
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
   * ARIA widget roles too, because a kit need not use a native element. Every role
   * listed supports `aria-invalid`, and all but `slider` support `aria-required`.
   */
  const WIDGET =
    'input, select, textarea, [role="combobox"], [role="textbox"], [role="listbox"],' +
    ' [role="spinbutton"], [role="checkbox"], [role="radiogroup"], [role="switch"], [role="slider"]'

  function control(element: HTMLElement): HTMLElement | null {
    return element.matches(WIDGET) ? element : element.querySelector<HTMLElement>(WIDGET)
  }

  it.each(KITS)('$name marks a failing control invalid', ({ kit, renderers }) => {
    const missing = bound(kit)
      .filter(({ def }) => {
        const element = drawField(renderers, def, {
          schema: { type: def.dataType ?? 'string', validations: [] },
        })
        const target = control(element)

        // No widget at all: nothing can tell a screen reader it is invalid.
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
    // WCAG 3.3.2.
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
 * A driver must throw when it finds nothing to drive, or its rule passes on
 * silence. The last rule runs the drivers against a kit that drops the answer.
 */
describe('a data-bound control hands back what the person entered', () => {
  const OPTIONS: JsonValue = [
    { label: 'One', value: 1 },
    // A number, so a kit reporting the DOM string instead of the declared value
    // fails.
    { label: 'Two', value: 2 },
  ]

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
   * Containers count here, unlike in the aria rules: `RadioGroup` holds
   * `RadioItem`s and is still answered. `Repeater` is out because the form
   * builds its value from its rows.
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
 * A value a host seeded, shown in the control that holds it. Drawn as empty, a number
 * would pass `required` while looking unanswered, and the first keystroke would
 * overwrite it.
 */
describe('a control holding a value that is not a string', () => {
  const holding = (type: string, dataType: string): ComponentNode => ({
    key: 'target',
    type,
    props: {},
    schema: { type: dataType as 'string', validations: [] },
  })

  // Not `DatePicker`: a `type="date"` input clears a value that is not a date,
  // whatever the kit hands it.
  const TEXTUAL = ['TextField', 'TextArea', 'NumberField']

  const VALUE_CASES = KITS.flatMap(({ name, kit, renderers }) =>
    TEXTUAL.filter((type) => kit.components.some((def) => def.type === type)).map(
      (type) => [name + ' ' + type, renderers, type] as const,
    ),
  )

  it('drives every value-holding control in every kit', () => {
    // An `it.each` over an empty table registers no tests and passes.
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
   * `data-fs-scope` is a `useId` value, so it and every `id` and `aria-*` built
   * from it differ between two renders of the same component.
   */
  function withoutScope(element: HTMLElement): string {
    const scope = element.getAttribute('data-fs-scope')
    if (!scope) throw new Error('no data-fs-scope to normalise: the seam this relies on has moved')
    return element.outerHTML.split(scope).join('«scope»')
  }

  it.each(KITS)('$name does not let a Text variant add classes of its own', ({ renderers }) => {
    // React escapes the attribute, but under a utility CSS framework these
    // classes cover the viewport.
    const element = draw(
      renderers,
      nodeWith('Text', { text: 'hello', variant: 'body fixed inset-0 z-50' }),
    )

    expect(element.className).not.toContain('inset-0')
  })

  it.each(KITS)('$name still tells its own variants apart', ({ kit, renderers }) => {
    // Compares output, not class names: MUI spells variants as its own classes.
    const declared = (
      kit.components.find((def) => def.type === 'Text')?.props.find((p) => p.name === 'variant')
        ?.options ?? []
    ).map((option) => (typeof option.value === 'string' ? option.value : ''))

    expect(
      declared.length,
      'Text.variant needs two declared options, or telling variants apart proves nothing',
    ).toBeGreaterThan(1)

    const [first, second] = declared as [string, string]
    const a = draw(renderers, nodeWith('Text', { text: 'hello', variant: first }))
    const b = draw(renderers, nodeWith('Text', { text: 'hello', variant: second }))

    expect(withoutScope(a), 'two declared variants drew the same thing').not.toBe(withoutScope(b))
  })

  it.each(KITS)('$name gives an unrecognised Alert severity a role anyway', ({ renderers }) => {
    const element = draw(
      renderers,
      nodeWith('Alert', { text: 'Something failed', severity: 'eror' }),
    )

    expect(element.className).not.toContain('eror')
    // An unrecognised severity narrows to `info`, and only an error interrupts.
    expect(element.getAttribute('role')).toBe('note')
  })

  it.each(KITS)('$name still announces an Alert that really is an error', ({ renderers }) => {
    const element = draw(
      renderers,
      nodeWith('Alert', { text: 'Something failed', severity: 'error' }),
    )

    expect(element.getAttribute('role')).toBe('alert')
  })

  it.each(KITS)('$name does not put an arbitrary scheme in an image src', ({ renderers }) => {
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
    // Clearing a label in the panel is the most natural way to try to remove it, and a
    // control with no text has no name.
    const element = draw(renderers, nodeWith('Button', { text: '' }))

    expect(element.textContent?.trim()).not.toBe('')
  })
})

describe('a component whose options a document got wrong', () => {
  const RUBBISH: unknown[] = [null, undefined, 'a bare string', 42, [], { label: 'fine', value: 7 }]

  function listNode(type: string, propName: string): ComponentNode {
    return {
      key: 'target',
      type,
      props: { [propName]: prop(RUBBISH as never), label: prop('Pick one') },
      schema: { type: 'string', validations: [] },
    }
  }

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
    // An `it.each` over an empty table registers no tests and passes.
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

    // The boundary alone keeps the page alive; the component itself must render.
    expect(onError).not.toHaveBeenCalled()
    expect(container.querySelector('[data-fs-key="target"]')?.getAttribute('role')).not.toBe(
      'alert',
    )
  })

  it.each(KITS)('$name still shows an option it can read', ({ kit, renderers }) => {
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
 * Not `container.textContent`: a native `<select>` holds every option, while
 * MUI keeps them in a closed menu and shows only the selected label.
 */
function chosenText(container: HTMLElement): string {
  const combobox = container.querySelector('[role="combobox"]')
  if (combobox) return combobox.textContent ?? ''

  const select = container.querySelector('select')
  return select?.selectedOptions[0]?.textContent ?? ''
}

/**
 * A numeric option value survives being chosen. Drawn as nothing selected, the data
 * would hold the choice while the control showed blank.
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
    // A `<fieldset>` maps to `group`, which does not support `aria-required`.
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
    // MUI's select renders an `aria-hidden` native input beside the control a
    // screen reader reads.
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
    // `NaN` is a number, so a bare `typeof` check lets it through.
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
    const element = drawn({ key: 'target', type: 'Progress', props: { value: prop(40) } })
    const bar =
      element.getAttribute('role') === 'progressbar'
        ? element
        : element.querySelector('[role="progressbar"]')

    expect(bar?.getAttribute('aria-valuenow')).toBe('40')
  })

  /*
   * `docs/spec/02-kit-contract.md`: a length-valued prop is CSS pixels. Read
   * with `getComputedStyle`, which resolves the declaration without layout.
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

  // Rows come from what the kit declares: which components a kit ships is its
  // own business, but what a number means is not.
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

    // Anywhere in the component: a kit may put the property on any element it
    // composes the component from.
    const wanted = String(value) + 'px'
    const carries = (node: Element): boolean =>
      getComputedStyle(node).getPropertyValue(css) === wanted
    const found = carries(element) || [...element.querySelectorAll('*')].some(carries)

    expect(found, what + ' is not ' + wanted + ' anywhere in what the kit drew').toBe(true)
  })

  it('found lengths to drive at all', () => {
    expect(PIXEL_CASES.length, 'no length-valued props were found to drive').toBeGreaterThan(0)
  })

  it('reads a different number differently, so the rows above are not a fixed value', () => {
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

        // `revealHidden`: a component such as `Step` is hidden by a condition the
        // moment it is dropped.
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
        // A kit that picks attributes by name instead of spreading passes the
        // check above and fails this one.
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

        // No error yet: the description has to be attached before its text changes.
        const { container: dom } = render(
          <FormUnderTest
            document={documentOf(node)}
            kit={renderers}
            data={{}}
            onChange={() => undefined}
          />,
        )

        // Every describer, not the first: a component can hold several controls.
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
    // `ComponentDef.icon` is optional, but the kits here are what a kit author
    // copies, so they carry one.
    const bare = kit.components.filter((c) => !c.icon).map((c) => c.type)
    expect(bare).toEqual([])
  })

  it('declares exactly one root component and keeps it out of the palette', () => {
    // The root exists in every document; offering it would let a screen be
    // dropped inside a screen.
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
    // `03-components.md`: a RadioGroup "also accepts RadioItem children".
    const group = kit.components.find((c) => c.type === 'RadioGroup')
    const item = kit.components.find((c) => c.type === 'RadioItem')

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
  // `Step` renders as a `Stack` in both kits, with the same pass-through of `gap`, so
  // the two defaults must agree within a kit.
  it.each(KITS)('$name gives Step the same gap as the Stack it renders as', ({ kit }) => {
    const gapOf = (type: string): unknown =>
      kit.components.find((def) => def.type === type)?.defaultProps['gap']

    expect(gapOf('Step'), 'Step has no gap default').toBeTypeOf('number')
    expect(gapOf('Step')).toBe(gapOf('Stack'))
  })
})

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
 * Types make a glyph exist for every icon name, not draw something. Checked here
 * because the designer may not import a kit (invariant 2).
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
    // Otherwise the `it.each` below could compare `{}` to `{}` for every type.
    const counted = shared.reduce(
      (total, type) => total + Object.keys(lengthsOf(html.get(type))).length,
      0,
    )
    expect(
      counted,
      'no component defaults any length, so nothing below compares anything',
    ).toBeGreaterThan(4)

    expect(shared.filter((type) => 'gap' in lengthsOf(mui.get(type))).length).toBeGreaterThan(3)
  })

  it.each(shared)('%s defaults its lengths identically', (type) => {
    expect(lengthsOf(mui.get(type)), 'kit-mui').toEqual(lengthsOf(html.get(type)))
  })

  it.each(shared)('%s defaults no length to a spacing-scale number', (type) => {
    /*
     * Under 4px is a spacing unit that escaped a conversion, not a hairline. The
     * type is checked first: a string breaks `02-kit-contract.md` and is never
     * `< 4`.
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
 * Named `*_CASES`, not built inline: `test/docs.test.ts` counts a per-kit rule
 * only as `it.each(KITS)` or `it.each(SOMETHING_CASES)`.
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
   * The element carrying `data-fs-key` must be the one the kit styles, so CSS
   * written against the seam has one shape. Pinned as a shape, not a class name,
   * so it holds whatever a kit calls its classes.
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
    // Localizable, or the landmark name cannot be translated.
    expect(label?.localizable).toBe(true)
  })

  it.each(KITS)('$name names the landmark from the document', ({ renderers }) => {
    const root = emptyRoot()
    expect(landmarkIn(renderers, crumbs(prop("Fil d'Ariane")), root)).toBe("Fil d'Ariane")
  })

  it.each(KITS)('$name falls back when the document says nothing', ({ renderers }) => {
    const root = emptyRoot()
    expect(landmarkIn(renderers, crumbs(undefined), root)).toBe('Breadcrumb')
  })
})

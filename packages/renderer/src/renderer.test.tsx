/**
 * @vitest-environment jsdom
 */

/**
 * How the renderer addresses a form's data.
 *
 * A node has two names and they answer different questions. `key` is identity:
 * unique, the link from a DOM element back to a node, and what an error is
 * reported against. `dataKey` is what the payload calls the answer, and it may
 * repeat. Reading one where the other was meant is the kind of mistake that
 * looks correct from both ends, so it is pinned here.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormContext, FormData, FormDocument, PropValue } from '@formsmith/core'
import { MAX_ROWS, applyChange } from '@formsmith/core'

import { FormRenderer, resolveProp } from './index.js'
import type { NodeRendererProps, RendererKit } from './index.js'

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

function Field({ nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
  return (
    <div {...nodeProps}>
      <input
        aria-label={nodeProps['data-fs-key']}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <span data-testid={nodeProps['data-fs-key'] + '-error'}>{error ?? ''}</span>
    </div>
  )
}

const kit: RendererKit = { id: 'fake', renderers: { Screen: Screen_, Field } }

function documentOf(children: ComponentNode[]): FormDocument {
  return {
    version: '1',
    id: 'doc',
    name: 'Contact',
    root: { key: 'root', type: 'Screen', props: {}, children },
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

const field = (key: string, dataKey?: string): ComponentNode => ({
  key,
  ...(dataKey ? { dataKey } : {}),
  type: 'Field',
  props: {},
  schema: { type: 'string', validations: [] },
})

describe('data keys in the renderer', () => {
  it('reads a value under the data key', () => {
    render(
      <FormRenderer
        document={documentOf([field('emailField', 'email')])}
        kit={kit}
        data={{ email: 'a@b.com' }}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByLabelText('emailField')).toHaveProperty('value', 'a@b.com')
  })

  it('reports a change under the data key', () => {
    const onChange = vi.fn()
    render(
      <FormRenderer
        document={documentOf([field('emailField', 'email')])}
        kit={kit}
        data={{}}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('emailField'), { target: { value: 'a@b.com' } })
    // The host stores answers by the name the author chose, not by node key.
    expect(onChange).toHaveBeenCalledWith('email', 'a@b.com')
  })

  it('shows an error addressed to the node key', () => {
    render(
      <FormRenderer
        document={documentOf([field('emailField', 'email')])}
        kit={kit}
        data={{}}
        errors={{ emailField: 'Required.' }}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByTestId('emailField-error').textContent).toBe('Required.')
  })

  it('gives two components sharing a data key the same value and separate errors', () => {
    render(
      <FormRenderer
        document={documentOf([field('personal', 'email'), field('work', 'email')])}
        kit={kit}
        data={{ email: 'a@b.com' }}
        errors={{ work: 'Use a work address.' }}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByLabelText('personal')).toHaveProperty('value', 'a@b.com')
    expect(screen.getByLabelText('work')).toHaveProperty('value', 'a@b.com')
    expect(screen.getByTestId('personal-error').textContent).toBe('')
    expect(screen.getByTestId('work-error').textContent).toBe('Use a work address.')
  })

  it('keeps data-fs-key as the node key, because the canvas hit-tests on it', () => {
    const { container } = render(
      <FormRenderer
        document={documentOf([field('emailField', 'email')])}
        kit={kit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="emailField"]')).not.toBeNull()
    expect(container.querySelector('[data-fs-key="email"]')).toBeNull()
  })
})

describe('two forms on one page', () => {
  /*
   * Keys identify a node inside its document and nowhere else, so two forms
   * rendered together both have a `root` and, in practice, an `email`. Styling
   * is selected by key, so an unscoped stylesheet from the first form reaches
   * into the second and there is nothing in the document that says it should
   * not.
   */
  const styled = (): FormDocument => {
    const doc = documentOf([field('email')])
    doc.root.children![0]!.css = { any: 'color: rgb(1, 2, 3)' }
    return doc
  }

  it('gives each rendered form its own scope', () => {
    const { container } = render(
      <>
        <FormRenderer document={styled()} kit={kit} data={{}} onChange={() => undefined} />
        <FormRenderer document={styled()} kit={kit} data={{}} onChange={() => undefined} />
      </>,
    )

    const scopes = [...container.querySelectorAll('[data-fs-key="email"]')].map((el) =>
      el.getAttribute('data-fs-scope'),
    )

    expect(scopes).toHaveLength(2)
    expect(scopes[0]).toBeTruthy()
    expect(scopes[0]).not.toBe(scopes[1])
  })

  it('confines each stylesheet to the form that owns it', () => {
    const { container } = render(
      <>
        <FormRenderer document={styled()} kit={kit} data={{}} onChange={() => undefined} />
        <FormRenderer document={styled()} kit={kit} data={{}} onChange={() => undefined} />
      </>,
    )

    const sheets = [...container.querySelectorAll('style')].map((el) => el.textContent ?? '')
    expect(sheets).toHaveLength(2)

    // Every rule names a scope, and the two sheets do not name the same one.
    for (const sheet of sheets) expect(sheet).toContain('[data-fs-scope=')
    expect(sheets[0]).not.toBe(sheets[1])
  })

  it('puts the scope on the root as well, which a descendant selector would miss', () => {
    const doc = documentOf([field('email')])
    doc.root.css = { any: 'color: rgb(4, 5, 6)' }

    const { container } = render(
      <FormRenderer document={doc} kit={kit} data={{}} onChange={() => undefined} />,
    )

    const scope = container.querySelector('[data-fs-key="root"]')?.getAttribute('data-fs-scope')
    expect(scope).toBeTruthy()

    const sheet = container.querySelector('style')?.textContent ?? ''
    expect(sheet).toContain('][data-fs-key="root"]')
    expect(sheet).not.toContain('] [data-fs-key="root"]')
  })
})

describe('the host context', () => {
  const gated = (key: string): ComponentNode => ({
    ...field(key),
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'user.role' },
        right: { kind: 'literal', value: 'admin' },
      },
    },
  })

  // Typed as the prop is, with no cast. A helper that widens to `unknown` and
  // forces it through would let a non-JSON value into a test for the rule that
  // context must be JSON, and the test would still pass.
  const renderWith = (context?: FormContext): void => {
    render(
      <FormRenderer
        document={documentOf([field('always'), gated('adminOnly')])}
        kit={kit}
        data={{}}
        {...(context ? { context } : {})}
        onChange={() => undefined}
      />,
    )
  }

  it('shows a component whose rule the context satisfies', () => {
    renderWith({ user: { role: 'admin' } })
    expect(screen.getByLabelText('adminOnly')).toBeTruthy()
  })

  it('hides it when the context says otherwise', () => {
    renderWith({ user: { role: 'viewer' } })
    expect(screen.queryByLabelText('adminOnly')).toBeNull()
    expect(screen.getByLabelText('always')).toBeTruthy()
  })

  it('hides it when no context was supplied at all', () => {
    // The wiring failure, seen from the renderer. Nothing here can tell it
    // apart from a role that is genuinely not admin, which is what
    // missingContext is for.
    renderWith()
    expect(screen.queryByLabelText('adminOnly')).toBeNull()
  })

  it('hands the context to a computed binding as well', () => {
    const evaluate = vi.fn().mockReturnValue('from the host')
    render(
      <FormRenderer
        document={documentOf([
          {
            ...field('a'),
            props: { label: { kind: 'computed', expression: 'ctx.user.role' } },
          },
        ])}
        kit={kit}
        data={{}}
        context={{ user: { role: 'admin' } }}
        evaluate={evaluate}
        onChange={() => undefined}
      />,
    )

    expect(evaluate).toHaveBeenCalledWith('ctx.user.role', {}, { user: { role: 'admin' } })
  })
})

describe('revealing what a condition hides', () => {
  /*
   * An authoring surface has to show a component a user would not see, or it
   * cannot be arranged. The runtime must not, which is why this is a prop and
   * not a default.
   */
  const conditional = (): FormDocument =>
    documentOf([
      field('always'),
      {
        ...field('sometimes'),
        renderWhen: {
          kind: 'condition',
          condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'consent' } },
        },
      },
    ])

  it('leaves it out by default, which is what a person filling in the form gets', () => {
    render(<FormRenderer document={conditional()} kit={kit} data={{}} onChange={() => undefined} />)

    expect(screen.getByLabelText('always')).toBeTruthy()
    expect(screen.queryByLabelText('sometimes')).toBeNull()
  })

  it('draws it when asked, marked so the surface can tell it apart', () => {
    const { container } = render(
      <FormRenderer
        document={conditional()}
        kit={kit}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )

    expect(screen.getByLabelText('sometimes')).toBeTruthy()
    expect(
      container.querySelector('[data-fs-key="sometimes"]')?.getAttribute('data-fs-hidden'),
    ).toBe('true')
  })

  it('does not mark a component the condition actually shows', () => {
    // Without this the attribute would say "hidden" for everything and the
    // surface could not tell the two apart, which is the whole point of it.
    const { container } = render(
      <FormRenderer
        document={conditional()}
        kit={kit}
        data={{ consent: true }}
        revealHidden
        onChange={() => undefined}
      />,
    )

    expect(
      container.querySelector('[data-fs-key="sometimes"]')?.hasAttribute('data-fs-hidden'),
    ).toBe(false)
    expect(container.querySelector('[data-fs-key="always"]')?.hasAttribute('data-fs-hidden')).toBe(
      false,
    )
  })

  it('reveals a hidden container and everything under it', () => {
    // Hiding a container hides its subtree, so revealing one has to reveal the
    // subtree too or a conditional Stack is still an unreachable hole.
    const doc = documentOf([
      {
        key: 'box',
        type: 'Screen',
        props: {},
        renderWhen: { kind: 'static', value: false },
        children: [field('buried')],
      },
    ])

    render(
      <FormRenderer document={doc} kit={kit} data={{}} revealHidden onChange={() => undefined} />,
    )

    expect(screen.getByLabelText('buried')).toBeTruthy()
  })
})

describe('a repeater', () => {
  /*
   * `addressList` holding `addresses`, with `street` holding `line1`.
   *
   * Both names differ from their answer, deliberately. This fixture set `key`
   * and `dataKey` to the same string, so the row-addressing design and its
   * opposite produced byte-identical output and a patched build of the wrong one
   * stayed green -- Trap 11 in the write-tests skill, which names this file as
   * one of the three that had to change and left this describe behind.
   *
   * Read it as: the component is `street`, the answer is `line1`, the row
   * coordinate is built from answers and the DOM key from components.
   */
  const repeating = (): FormDocument =>
    documentOf([
      field('email'),
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Screen',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [field('street', 'line1')],
      },
    ])

  const twoRows = { email: 'a@b.co', addresses: [{ line1: 'one' }, { line1: 'two' }] }

  it('draws its children once per row, with each row holding its own answer', () => {
    render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )

    const inputs = screen.getAllByLabelText('street')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveProperty('value', 'one')
    expect(inputs[1]).toHaveProperty('value', 'two')
  })

  it('draws nothing for a value that is not a list', () => {
    // Rows come out of the data, and a document is data, so a repeater whose
    // value is a string has no rows rather than throwing at the person filling
    // in the form.
    render(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={{ addresses: 'nonsense' }}
        onChange={() => undefined}
      />,
    )
    expect(screen.queryByLabelText('street')).toBeNull()
  })

  it('marks which row an element is in', () => {
    const { container } = render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )

    /*
     * Keyed by the component and coordinated by the answer, which is the whole
     * distinction: `data-fs-key` says `street`, `data-fs-row` says `addresses`.
     * With one name for both, either half could have been wrong.
     */
    const rows = [...container.querySelectorAll('[data-fs-key="street"]')].map((el) =>
      el.getAttribute('data-fs-row'),
    )
    expect(rows).toEqual(['addresses[0]', 'addresses[1]'])
    expect(container.querySelectorAll('[data-fs-key="line1"]')).toHaveLength(0)
    expect(container.querySelector('[data-fs-key="addressList"]')).toBeTruthy()
    // Absent outside a repeater, so every existing selector is unchanged.
    expect(container.querySelector('[data-fs-key="email"]')?.hasAttribute('data-fs-row')).toBe(
      false,
    )
  })

  it('reports a change at an address naming the row', () => {
    /*
     * The one real migration. Outside a repeater the address is the data key,
     * byte-identical, so nothing breaks until a repeater exists — and then a
     * bare `{...d, [key]: v}` writes a literal 'addresses[1].line1' property,
     * which is visible in the first submit rather than silent.
     */
    const onChange = vi.fn()
    render(<FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={onChange} />)

    fireEvent.change(screen.getAllByLabelText('street')[1] as HTMLElement, {
      target: { value: 'edited' },
    })

    expect(onChange).toHaveBeenCalledWith('addresses[1].line1', 'edited')
  })

  it('gives each row its own error', () => {
    const { container } = render(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={twoRows}
        // Row coordinate from the answer, leaf from the component: two fields
        // may share a data key and still fail for different reasons, so an
        // error is addressed by node key inside the row it is in.
        errors={{ 'addresses[1].street': 'Wrong.' }}
        onChange={() => undefined}
      />,
    )

    const messages = [...container.querySelectorAll('[data-testid="street-error"]')].map(
      (el) => el.textContent,
    )
    expect(messages).toEqual(['', 'Wrong.'])
  })
})

describe('a repeater on an authoring surface', () => {
  const empty = (): FormDocument =>
    documentOf([
      {
        key: 'addresses',
        type: 'Screen',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [field('line1')],
      },
    ])

  it('draws nothing for a person filling in the form', () => {
    render(<FormRenderer document={empty()} kit={kit} data={{}} onChange={() => undefined} />)
    expect(screen.queryByLabelText('line1')).toBeNull()
  })

  it('draws one row while editing, so the subtree can be reached', () => {
    /*
     * The canvas renders with empty data, so without this a repeater's children
     * never render: the authored subtree would be invisible and nothing could
     * be dropped into it. Exactly the hole `revealHidden` closed for a
     * conditional component, so it is the same flag.
     */
    render(
      <FormRenderer
        document={empty()}
        kit={kit}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )
    expect(screen.getAllByLabelText('line1')).toHaveLength(1)
  })

  it('does not invent a row when there is real data to draw', () => {
    render(
      <FormRenderer
        document={empty()}
        kit={kit}
        data={{ addresses: [{ line1: 'a' }, { line1: 'b' }] }}
        revealHidden
        onChange={() => undefined}
      />,
    )
    expect(screen.getAllByLabelText('line1')).toHaveLength(2)
  })
})

/**
 * A malformed `translations` does not take the root down.
 *
 * The gate is the first answer and this is the second. They are not the same
 * answer: `validateDocument` is something a host has to remember to call, the
 * designer renders a document the moment it is pasted, and an unguarded
 * `document.translations[tag]` on a document that skipped the gate throws
 * during render — which in React 19 unmounts the whole tree, not one node.
 */
/**
 * The translation path, in the renderer's own suite.
 *
 * There were tests for a `translations` field that is not a bundle and for a key
 * that collides with `Object.prototype`, and none at all for the ordinary case:
 * a label bound to a key, resolved through the document, in the language the
 * host asked for. That path is the reason the panel writes bundles at all, and
 * the failure it has -- writing under a bare code and reading under a tag -- puts
 * the raw key on screen where the label should be.
 */
describe('an i18n binding', () => {
  const translated = (): FormDocument => ({
    ...documentOf([
      {
        key: 'greeting',
        type: 'Field',
        props: { label: { kind: 'i18n', key: 'greeting_label' } },
        schema: { type: 'string', validations: [] },
      },
    ]),
    languages: [
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ],
    defaultLanguage: 'en-US',
    translations: {
      'en-US': { greeting_label: 'Your name' },
      fr: { greeting_label: 'Votre nom' },
    },
  })

  const labelOf = (container: HTMLElement): string | null =>
    container.querySelector('[data-testid="greeting-label"]')?.textContent ?? null

  const labellingKit: RendererKit = {
    id: 'labelling',
    renderers: {
      Screen: Screen_,
      Field: ({ nodeProps, props }: NodeRendererProps): ReactNode => (
        <div {...nodeProps}>
          <span data-testid={nodeProps['data-fs-key'] + '-label'}>
            {typeof props['label'] === 'string' ? props['label'] : ''}
          </span>
        </div>
      ),
    },
  }

  it('resolves the label through the default language bundle', () => {
    const { container } = render(
      <FormRenderer
        document={translated()}
        kit={labellingKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(labelOf(container)).toBe('Your name')
  })

  it('follows the language the host asked for', () => {
    const { container } = render(
      <FormRenderer
        document={translated()}
        kit={labellingKit}
        data={{}}
        language="fr"
        onChange={() => undefined}
      />,
    )

    expect(labelOf(container)).toBe('Votre nom')
  })

  it('reads the bundle by tag, not by bare code', () => {
    /*
     * `en-US` is what `createDocument` ships and what the panel writes. A
     * renderer looking the bundle up under `en` finds nothing and falls back to
     * the key, so the canvas shows `greeting_label` -- which is the failure the
     * fallback exists to make visible rather than silent.
     */
    const document_ = translated()
    const { container } = render(
      <FormRenderer
        document={document_}
        kit={labellingKit}
        data={{}}
        language="en"
        onChange={() => undefined}
      />,
    )

    expect(labelOf(container)).toBe('greeting_label')
  })

  it('falls back to the key when the language has no such translation', () => {
    const bare = translated()
    const { container } = render(
      <FormRenderer
        document={{ ...bare, translations: { 'en-US': {} } }}
        kit={labellingKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    // Showing the key is deliberate: an empty label looks like a design choice,
    // a raw key looks like the missing translation it is.
    expect(labelOf(container)).toBe('greeting_label')
  })
})

describe('a document whose translations are not a bundle', () => {
  const brokenDocument = (translations: unknown): FormDocument =>
    ({
      ...documentOf([
        { key: 'greeting', type: 'Field', props: { label: { kind: 'i18n', key: 'hello' } } },
      ]),
      translations,
    }) as unknown as FormDocument

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an array', []],
  ])('still renders the form when translations are %s', (_what, translations) => {
    render(
      <FormRenderer
        document={brokenDocument(translations)}
        kit={kit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    // The component is on the page, which is the claim: the render completed
    // rather than the root being torn down.
    expect(screen.getByLabelText('greeting')).toBeTruthy()
  })

  /*
   * A kit that draws the label, which the one above does not.
   *
   * The test below asserted `textContent` did *not* contain `not-a-bundle`, and
   * could not fail for two independent reasons: a negative assertion passes when
   * an element renders nothing at all, and the `Field` renderer in this file
   * draws an `<input aria-label>` and an error span, never the label prop. So
   * the string it looked for could not have been there whatever `resolveProp`
   * did.
   *
   * The claim is positive now: the label falls back to the translation key.
   */
  function Labelled({ nodeProps, props }: NodeRendererProps): ReactNode {
    return (
      <div {...nodeProps}>
        <span data-testid="label">{typeof props['label'] === 'string' ? props['label'] : ''}</span>
      </div>
    )
  }

  const labelKit: RendererKit = { id: 'labelled', renderers: { Screen: Screen_, Field: Labelled } }

  it('falls back to the key when the bundle for the language is not one', () => {
    const { container } = render(
      <FormRenderer
        document={brokenDocument({ en: 'not-a-bundle' })}
        kit={labelKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    // `hello` is the i18n key the document asks for. An unresolvable bundle
    // resolves to the key, which is the readable answer and the documented one.
    expect(container.querySelector('[data-testid="label"]')?.textContent).toBe('hello')
  })

  it('uses the translation when the bundle is one', () => {
    // The control. A renderer that always drew the key would pass the row above
    // and never translate anything.
    const { container } = render(
      <FormRenderer
        document={brokenDocument({ 'en-US': { hello: 'Hello there' } })}
        kit={labelKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-testid="label"]')?.textContent).toBe('Hello there')
  })
})

/**
 * A repeater drawn and written when its two names differ.
 *
 * The read path already descended with `dataKeyOf`; the write path built the
 * row coordinate from `node.key`. So the address the renderer emitted named a
 * list the data does not hold, and `applyChange` — which is where the
 * coordinate is dereferenced, and dereferenced as data — returned the input
 * unchanged. Every keystroke in every row of such a repeater was discarded, in
 * silence.
 */
describe('a repeater whose two names differ', () => {
  const repeating = (): FormDocument =>
    documentOf([
      field('email'),
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Screen',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [field('street', 'line1')],
      },
    ])

  const twoRows: FormData = {
    email: 'a@b.co',
    addresses: [{ line1: 'one' }, { line1: 'two' }],
  }

  it('reads each row under the answer name', () => {
    render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )

    const inputs = screen.getAllByLabelText('street')
    expect(inputs.map((input) => (input as HTMLInputElement).value)).toEqual(['one', 'two'])
  })

  it('marks the row with the answer name', () => {
    const { container } = render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )

    const rows = [...container.querySelectorAll('[data-fs-key="street"]')].map((el) =>
      el.getAttribute('data-fs-row'),
    )
    expect(rows).toEqual(['addresses[0]', 'addresses[1]'])
  })

  it('lands a keystroke, rather than reporting one nothing can place', () => {
    /*
     * The assertion that matters, and the reason it goes through `applyChange`
     * rather than stopping at the emitted string: an address is only correct if
     * the writer the host is promised can dereference it. Asserting the string
     * alone would let a plausible-looking wrong address pass.
     */
    const onChange = vi.fn()
    render(<FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={onChange} />)

    fireEvent.change(screen.getAllByLabelText('street')[1] as HTMLElement, {
      target: { value: 'edited' },
    })

    const [address, value] = onChange.mock.calls[0] as [string, string]
    const next = applyChange(twoRows, address, value)

    expect(next).not.toBe(twoRows)
    expect((next['addresses'] as FormData[])[1]).toEqual({ line1: 'edited' })
  })

  it('does not write a row edit into an unrelated list that shares the node key', () => {
    /*
     * Worse than losing the keystroke. `addressList` here is a real top-level
     * answer belonging to something else, and a coordinate built from the node
     * key writes the row edit straight into it — the exact opposite of what the
     * "a write that cannot be placed returns the input unchanged" comment
     * promises.
     */
    const shared: FormData = { ...twoRows, addressList: [{ line1: 'not this one' }] }
    const onChange = vi.fn()
    render(<FormRenderer document={repeating()} kit={kit} data={shared} onChange={onChange} />)

    fireEvent.change(screen.getAllByLabelText('street')[0] as HTMLElement, {
      target: { value: 'edited' },
    })

    const [address, value] = onChange.mock.calls[0] as [string, string]
    const next = applyChange(shared, address, value)

    expect(next['addressList']).toEqual([{ line1: 'not this one' }])
    expect((next['addresses'] as FormData[])[0]).toEqual({ line1: 'edited' })
  })

  it('keys an error by the row answer name and the node own key', () => {
    const { container } = render(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={twoRows}
        errors={{ 'addresses[1].street': 'Wrong.' }}
        onChange={() => undefined}
      />,
    )

    const messages = [...container.querySelectorAll('[data-testid="street-error"]')].map(
      (el) => el.textContent,
    )
    expect(messages).toEqual(['', 'Wrong.'])
  })
})

/**
 * A property binding whose kind this code cannot read.
 *
 * The fourth switch of the same theme. `resolveProp` was exhaustive over
 * `PropValue` with no tail, so a mistyped kind fell off it and the kit was
 * handed `undefined` for a prop that every other branch resolves to a JSON
 * value. `validateDocument` refuses such a document now; this is the render
 * that never went through it.
 */
describe('a property binding this code cannot read', () => {
  it('resolves to null rather than to nothing at all', () => {
    const typo = { kind: 'statc', value: 'hello' } as unknown as PropValue

    expect(resolveProp(typo, {}, {})).toBeNull()
  })

  it('still renders the component the prop is on', () => {
    const node: ComponentNode = {
      key: 'greeting',
      type: 'Field',
      props: { label: { kind: 'statc', value: 'hello' } as unknown as PropValue },
      schema: { type: 'string', validations: [] },
    }

    render(
      <FormRenderer document={documentOf([node])} kit={kit} data={{}} onChange={() => undefined} />,
    )

    expect(screen.getByLabelText('greeting')).toBeTruthy()
  })
})

/**
 * A component that throws does not take the page with it.
 *
 * The gate is the first answer and it cannot be the only one. A kit is
 * third-party code, a host's evaluator is arbitrary JavaScript, and a throw
 * during render in React 19 unmounts the whole tree rather than the one node —
 * so a single bad component blanks whatever page the form was embedded in.
 * There was no error boundary anywhere in the repository.
 *
 * The boundary is per node rather than around the form. A form-level one keeps
 * the host's page and still loses every answer already typed, and on the canvas
 * it would make the broken component unselectable — which is the one thing an
 * author needs in order to delete it.
 */
describe('a component that throws while rendering', () => {
  function Boom(): ReactNode {
    throw new Error('kit exploded')
  }

  const boomKit: RendererKit = { id: 'boom', renderers: { Screen: Screen_, Field, Boom } }

  const documentWithBoom = (): FormDocument =>
    documentOf([
      { key: 'before', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      { key: 'boom', type: 'Boom', props: {} },
      { key: 'after', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ])

  /** React logs a caught error itself; the test is not interested in the noise. */
  function quietly<T>(fn: () => T): T {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      return fn()
    } finally {
      spy.mockRestore()
    }
  }

  it('keeps the rest of the form on the page', () => {
    quietly(() =>
      render(
        <FormRenderer
          document={documentWithBoom()}
          kit={boomKit}
          data={{ before: 'kept', after: 'also kept' }}
          onChange={() => undefined}
        />,
      ),
    )

    // Both siblings render, and the answers already in them are still there.
    expect(screen.getByLabelText('before')).toHaveProperty('value', 'kept')
    expect(screen.getByLabelText('after')).toHaveProperty('value', 'also kept')
  })

  it('says so where the component would have been', () => {
    const { container } = quietly(() =>
      render(
        <FormRenderer
          document={documentWithBoom()}
          kit={boomKit}
          data={{}}
          onChange={() => undefined}
        />,
      ),
    )

    const fallback = container.querySelector('[data-fs-key="boom"]')
    expect(fallback).toBeTruthy()
    // Announced, because a component vanishing silently is how a form asks a
    // question nobody can answer.
    expect(fallback?.getAttribute('role')).toBe('alert')
  })

  it('keeps the node selectable, which is how an author removes it', () => {
    const { container } = quietly(() =>
      render(
        <FormRenderer
          document={documentWithBoom()}
          kit={boomKit}
          data={{}}
          revealHidden
          onChange={() => undefined}
        />,
      ),
    )

    // The canvas hit-tests with `closest('[data-fs-key]')` and there is nothing
    // else in the DOM that identifies a node, so the fallback has to carry it.
    const fallback = container.querySelector('[data-fs-key="boom"]')
    expect(fallback?.getAttribute('data-fs-type')).toBe('Boom')
  })

  it('hands the error to the host rather than swallowing it', () => {
    const onError = vi.fn()
    quietly(() =>
      render(
        <FormRenderer
          document={documentWithBoom()}
          kit={boomKit}
          data={{}}
          onError={onError}
          onChange={() => undefined}
        />,
      ),
    )

    expect(onError).toHaveBeenCalledTimes(1)
    const [error, key] = onError.mock.calls[0] as [Error, string]
    expect(error.message).toBe('kit exploded')
    expect(key).toBe('boom')
  })

  it('does nothing at all when nothing throws', () => {
    // The control. A boundary that renders its fallback unconditionally would
    // pass every test above.
    const onError = vi.fn()
    render(
      <FormRenderer
        document={documentOf([field('email')])}
        kit={kit}
        data={{ email: 'a@b.co' }}
        onError={onError}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByLabelText('email')).toHaveProperty('value', 'a@b.co')
    expect(onError).not.toHaveBeenCalled()
  })
})

/**
 * Four things the renderer read without asking what it was reading.
 *
 * Each of these needs a kit that *reports* what it was handed rather than one
 * that draws it. A function rendered as a React child produces no text at all,
 * so a test asserting on `textContent` passes whether the renderer handed the
 * component a message or `Object.prototype.constructor` — which is how three of
 * these first went green while still being wrong.
 */
describe('the renderer over an untrusted document', () => {
  /** A kit that writes down what it received, including the types. */
  function Reporting({ nodeProps, props, error }: NodeRendererProps): ReactNode {
    return (
      <div {...nodeProps}>
        <span data-testid={nodeProps['data-fs-key'] + '-label-type'}>{typeof props['label']}</span>
        <span data-testid={nodeProps['data-fs-key'] + '-error-type'}>{typeof error}</span>
        <span data-testid={nodeProps['data-fs-key'] + '-error'}>
          {typeof error === 'string' ? error : ''}
        </span>
      </div>
    )
  }

  const reportingKit: RendererKit = {
    id: 'reporting',
    renderers: { Screen: Screen_, Field: Reporting },
  }

  const typeOf = (container: HTMLElement, id: string): string | null =>
    container.querySelector('[data-testid="' + id + '"]')?.textContent ?? null

  it('resolves a condition-bound prop inside the row it is in', () => {
    /*
     * `resolveProp`'s condition case dropped `options.row`, so a prop bound to a
     * condition could not read its own row while `renderWhen` could. That makes
     * `rowScopeProblems`' advice — "set the test to read this row" — work for
     * one and silently do nothing for the other.
     */
    const node: ComponentNode = {
      key: 'addressList',
      dataKey: 'addresses',
      type: 'Screen',
      props: {},
      schema: { type: 'array', validations: [] },
      children: [
        {
          key: 'street',
          dataKey: 'line1',
          type: 'Field',
          props: {
            disabled: {
              kind: 'condition',
              condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'locked', scope: 'row' } },
            },
          },
          schema: { type: 'string', validations: [] },
        },
      ],
    }

    const seen: unknown[] = []
    function Watching({ nodeProps, props }: NodeRendererProps): ReactNode {
      seen.push(props['disabled'])
      return <div {...nodeProps} />
    }

    render(
      <FormRenderer
        document={documentOf([node])}
        kit={{ id: 'watching', renderers: { Screen: Screen_, Field: Watching } }}
        data={{ addresses: [{ locked: true }, { locked: false }] }}
        onChange={() => undefined}
      />,
    )

    // One row locked and one not. Dropping the row makes both read the top
    // level, find nothing, and resolve false — which is the same answer twice.
    expect(seen).toEqual([true, false])
  })

  it('renders a node whose props are not an object', () => {
    const node = { key: 'broken', type: 'Field', props: 'nope' } as unknown as ComponentNode
    const onError = vi.fn()

    const { container } = render(
      <FormRenderer
        document={documentOf([node])}
        kit={reportingKit}
        data={{}}
        onError={onError}
        onChange={() => undefined}
      />,
    )

    // The boundary would keep the page; this is about the component surviving.
    expect(onError).not.toHaveBeenCalled()
    expect(container.querySelector('[data-fs-key="broken"]')).toBeTruthy()
  })

  it('does not find a translation on Object.prototype', () => {
    const node: ComponentNode = {
      key: 'greeting',
      type: 'Field',
      props: { label: { kind: 'i18n', key: 'toString' } },
      schema: { type: 'string', validations: [] },
    }

    const { container } = render(
      <FormRenderer
        document={documentOf([node])}
        kit={reportingKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    // A string — the key itself, which is what an untranslated key resolves to.
    // It was a function, and a function rendered as a child draws nothing, so
    // the label silently disappeared instead.
    expect(typeOf(container, 'greeting-label-type')).toBe('string')
  })

  it('does not read an error off Object.prototype', () => {
    /*
     * A node keyed `constructor` made `errors['constructor']` a function, so
     * `error` was truthy: the kit put the field in an error state and drew a
     * message that renders as nothing. A red field nobody can clear.
     */
    const node: ComponentNode = {
      key: 'constructor',
      type: 'Field',
      props: {},
      schema: { type: 'string', validations: [] },
    }

    const { container } = render(
      <FormRenderer
        document={documentOf([node])}
        kit={reportingKit}
        data={{}}
        errors={{}}
        onChange={() => undefined}
      />,
    )

    expect(typeOf(container, 'constructor-error-type')).toBe('undefined')
  })

  it('shows the error on a component whose type no kit has', () => {
    /*
     * `validateForm` validates a node whatever its type, so a document naming a
     * type this kit does not have still produces errors for it. The fallback
     * drew the type and the key and dropped the message: a blocking required
     * error with nothing on screen saying so.
     */
    const node: ComponentNode = {
      key: 'mystery',
      type: 'NotInThisKit',
      props: {},
      schema: { type: 'string', validations: [{ key: 'required' }] },
    }

    const { container } = render(
      <FormRenderer
        document={documentOf([node])}
        kit={kit}
        data={{}}
        errors={{ mystery: 'This field is required.' }}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="mystery"]')?.textContent).toContain(
      'This field is required.',
    )
  })
})

/**
 * What the boundary actually covers.
 *
 * Its doc comment calls itself "one node's blast radius" and says React 19
 * unmounts the whole tree when nothing catches a throw. It wrapped `<Component>`
 * and nothing else, so everything `RenderNode` does before that line -- the kit
 * lookup, `isVisible`, `resolveProps`, the row mapping -- was outside it. And
 * the root is rendered as `<RenderNode node={document.root} />` with nothing
 * above it, so the document root had no boundary at all: a throw there took the
 * host's page down, which is the one outcome the class exists to prevent.
 *
 * A kit is third-party code, which is the premise the comment argues from, so
 * these throw from the kit lookup rather than from a renderer.
 */
describe('a throw from RenderNode before it reaches the kit component', () => {
  /** A kit whose renderer lookup throws for one type, the way arbitrary code can. */
  const kitThrowingOn = (type: string): RendererKit => ({
    id: 'hostile',
    renderers: new Proxy(
      { Screen: Screen_, Field },
      {
        get: (target, name) => {
          if (name === type) throw new Error('the kit blew up looking up ' + type)
          return target[name as keyof typeof target]
        },
      },
    ) as RendererKit['renderers'],
  })

  const field = (key: string): ComponentNode => ({
    key,
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  it('draws the fallback for the node that threw', () => {
    const onError = vi.fn()
    const { container } = render(
      <FormRenderer
        document={documentOf([field('broken')])}
        kit={kitThrowingOn('Field')}
        data={{}}
        onError={onError}
        onChange={() => undefined}
      />,
    )

    const element = container.querySelector('[data-fs-key="broken"]')
    expect(element, 'the node vanished instead of falling back').not.toBeNull()
    expect(element?.hasAttribute('data-fs-failed')).toBe(true)
    expect(onError).toHaveBeenCalled()
  })

  it('keeps the rest of the form, which is what per-node means', () => {
    /*
     * The whole argument for a boundary per node rather than one around the
     * form: a form-level boundary saves the host's page and throws away every
     * answer already typed into the fields that were fine.
     */
    const { container } = render(
      <FormRenderer
        document={documentOf([field('broken'), { key: 'ok', type: 'Screen', props: {} }])}
        kit={kitThrowingOn('Field')}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="ok"]')?.hasAttribute('data-fs-failed')).toBe(
      false,
    )
  })

  it('draws a fallback when the document root itself throws, rather than a blank tree', () => {
    /*
     * The root had nothing above it. React 19 unmounts the whole tree on an
     * uncaught throw, so this was a blank page in whatever host embedded the
     * form -- the exact outcome the class was written to stop, at the one node
     * it did not cover.
     */
    const onError = vi.fn()
    const { container } = render(
      <FormRenderer
        document={documentOf([])}
        kit={kitThrowingOn('Screen')}
        data={{}}
        onError={onError}
        onChange={() => undefined}
      />,
    )

    const element = container.querySelector('[data-fs-key="root"]')
    expect(element, 'the whole tree was unmounted').not.toBeNull()
    expect(element?.hasAttribute('data-fs-failed')).toBe(true)
    expect(onError).toHaveBeenCalled()
  })

  it('still renders an ordinary document, with no fallback anywhere', () => {
    // The control. A boundary that always fell back would pass every assertion
    // above.
    const { container } = render(
      <FormRenderer
        document={documentOf([field('email')])}
        kit={kit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelectorAll('[data-fs-failed]')).toHaveLength(0)
    expect(container.querySelector('[data-fs-key="email"]')).not.toBeNull()
  })
})

/**
 * A host evaluator that throws while resolving a prop.
 *
 * Every other render-time evaluator call site in this project wraps this.
 * `visibility.ts` wraps it and says why; `validation.ts`'s two sites were
 * wrapped in item 8. This one was bare, so an expression that throws took the
 * form down through a path the boundary did not cover either.
 *
 * It answers `null`, which is what the line's own comment already promised for
 * a host that supplied no evaluator at all: "No sandbox means no evaluation.
 * Render the field rather than crash the form." A single bad prop expression is
 * not a reason to replace a working component with an error box.
 */
describe('an evaluator that throws while resolving a prop', () => {
  const boom = (): never => {
    throw new Error('the host evaluator blew up')
  }

  const computed: ComponentNode = {
    key: 'greeting',
    type: 'Field',
    props: { label: { kind: 'computed', expression: 'boom()' } },
    schema: { type: 'string', validations: [] },
  }

  it('does not take the form down', () => {
    expect(() =>
      render(
        <FormRenderer
          document={documentOf([computed])}
          kit={kit}
          data={{}}
          evaluate={boom}
          onChange={() => undefined}
        />,
      ),
    ).not.toThrow()
  })

  it('renders the component rather than the boundary fallback', () => {
    const { container } = render(
      <FormRenderer
        document={documentOf([computed])}
        kit={kit}
        data={{}}
        evaluate={boom}
        onChange={() => undefined}
      />,
    )

    const element = container.querySelector('[data-fs-key="greeting"]')
    expect(element).not.toBeNull()
    expect(element?.hasAttribute('data-fs-failed')).toBe(false)
  })

  it('still evaluates an expression that works', () => {
    // The control, so "renders the component" is not satisfied by an evaluator
    // that is never called.
    const { container } = render(
      <FormRenderer
        document={documentOf([computed])}
        kit={kit}
        data={{}}
        evaluate={() => 'Hello'}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="greeting"]')).not.toBeNull()
    expect(
      resolveProp({ kind: 'computed', expression: 'x' }, {}, {}, { evaluate: () => 'Hello' }),
    ).toBe('Hello')
  })
})

/**
 * What the renderer does with a document nobody gated.
 *
 * `resolveProp`'s docblock says it is total over an untrusted document, and
 * `RenderNode` walks `children` the way core does everywhere else. Both claims
 * had a hole, and both holes end in a throw during render -- which React 19
 * answers by unmounting the tree.
 */
describe('a document shaped in ways the type forbids', () => {
  const asDocument = (root: unknown): FormDocument =>
    documentOf([]) && {
      ...documentOf([]),
      root: root as ComponentNode,
    }

  it.each([
    ['a string', 'not-a-binding'],
    ['null', null],
    ['a list', []],
    ['a number', 7],
  ])('renders a prop holding %s rather than throwing', (_what, prop_) => {
    const { container } = render(
      <FormRenderer
        document={asDocument({
          key: 'root',
          type: 'Screen',
          props: {},
          children: [{ key: 'field', type: 'Field', props: { label: prop_ } }],
        })}
        kit={kit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="field"]')).not.toBeNull()
    expect(container.querySelector('[data-fs-failed]')).toBeNull()
  })

  it('renders a node whose children are not a list', () => {
    // Core guards this shape in `rows.ts`, `context.ts` and `tree.ts`. The
    // renderer called `.map` on it.
    const { container } = render(
      <FormRenderer
        document={asDocument({
          key: 'root',
          type: 'Screen',
          props: {},
          children: 'nope',
        })}
        kit={kit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="root"]')).not.toBeNull()
    expect(container.querySelector('[data-fs-failed]')).toBeNull()
  })

  it('draws no more rows than validation will check', () => {
    /*
     * `validateForm` refuses a repeater past `MAX_ROWS` rather than checking a
     * prefix. The renderer had no cap, so a body with far more rows drew every
     * one of them -- the browser tab rather than the server, from the same
     * request.
     */
    const rows = Array.from({ length: MAX_ROWS + 25 }, () => ({ line1: 'x' }))
    const { container } = render(
      <FormRenderer
        document={asDocument({
          key: 'root',
          type: 'Screen',
          props: {},
          children: [
            {
              key: 'addressList',
              dataKey: 'addresses',
              type: 'Screen',
              props: {},
              schema: { type: 'array', validations: [] },
              children: [
                {
                  key: 'street',
                  dataKey: 'line1',
                  type: 'Field',
                  props: {},
                  schema: { type: 'string', validations: [] },
                },
              ],
            },
          ],
        })}
        kit={kit}
        data={{ addresses: rows }}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelectorAll('[data-fs-key="street"]')).toHaveLength(MAX_ROWS)
  })
})

/**
 * A component that threw once and then stopped throwing.
 *
 * `failed` was never cleared, so the error box outlived the cause for the life
 * of the mount. On the canvas that is the ordinary case: an author writes a
 * property value that breaks a renderer, fixes it, and the box stays -- with
 * nothing to click that would bring the component back, because the box is what
 * replaced it.
 */
describe('a boundary after the cause has gone', () => {
  it('draws the component again when the node it wraps changes', () => {
    const throwing: RendererKit = {
      id: 'sometimes',
      renderers: {
        Screen: Screen_,
        Field,
        Broken: () => {
          throw new Error('this type never renders')
        },
      },
    }

    const { container, rerender } = render(
      <FormRenderer
        document={documentOf([{ key: 'thing', type: 'Broken', props: {} }])}
        kit={throwing}
        data={{}}
        onChange={() => undefined}
      />,
    )
    expect(container.querySelector('[data-fs-failed]')).not.toBeNull()

    // The author fixes the type. Same key, a renderer that works.
    rerender(
      <FormRenderer
        document={documentOf([{ key: 'thing', type: 'Field', props: {} }])}
        kit={throwing}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-failed]')).toBeNull()
    expect(container.querySelector('[data-fs-key="thing"]')).not.toBeNull()
  })

  it('keeps the fallback while the cause is still there', () => {
    // The control. Clearing on every render would retry forever when the cause
    // has not gone away.
    const throwing: RendererKit = {
      id: 'always',
      renderers: {
        Screen: Screen_,
        Broken: () => {
          throw new Error('this type never renders')
        },
      },
    }

    const { container, rerender } = render(
      <FormRenderer
        document={documentOf([{ key: 'thing', type: 'Broken', props: {} }])}
        kit={throwing}
        data={{}}
        onChange={() => undefined}
      />,
    )
    rerender(
      <FormRenderer
        document={documentOf([{ key: 'thing', type: 'Broken', props: {} }])}
        kit={throwing}
        data={{ anything: 'else' }}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-failed]')).not.toBeNull()
  })
})

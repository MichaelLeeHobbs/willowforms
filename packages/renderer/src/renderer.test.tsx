/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { expectCaughtError } from '../../../test/caught-error.js'
import type { ReactNode } from 'react'
import type {
  ComponentNode,
  FormContext,
  FormData,
  FormDocument,
  PropValue,
} from '@willowforms/core'
import { MAX_ROWS, applyChange } from '@willowforms/core'

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
    // With a dialect, as `createDocument` makes: without one a bundle keyed by
    // tag and one keyed by bare code are the same string (Trap 5, write-tests).
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

describe('action lifecycle events', () => {
  it('dispatches onMount after the node is mounted', () => {
    const doc = documentOf([])
    doc.root.events = {
      onMount: [{ type: 'builtin', name: 'announce', params: { message: 'Mounted' } }],
    }
    const onEffects = vi.fn()

    render(
      <FormRenderer
        document={doc}
        kit={kit}
        data={{}}
        onChange={() => undefined}
        onEffects={onEffects}
      />,
    )

    expect(onEffects.mock.calls).toEqual([
      [
        [{ kind: 'announce', message: 'Mounted' }],
        { nodeKey: 'root', event: 'onMount', address: 'root' },
      ],
    ])
  })

  it('dispatches onUnmount with the latest configured handler', () => {
    const doc = documentOf([])
    doc.root.events = {
      onUnmount: [{ type: 'builtin', name: 'announce', params: { message: 'Unmounted' } }],
    }
    const onEffects = vi.fn()
    const view = render(
      <FormRenderer
        document={doc}
        kit={kit}
        data={{}}
        onChange={() => undefined}
        onEffects={onEffects}
      />,
    )

    view.unmount()

    expect(onEffects.mock.calls).toEqual([
      [
        [{ kind: 'announce', message: 'Unmounted' }],
        { nodeKey: 'root', event: 'onUnmount', address: 'root' },
      ],
    ])
  })
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

    for (const sheet of sheets) expect(sheet).toContain('[data-fs-scope=')
    expect(sheets[0]).not.toBe(sheets[1])
  })

  it('carries the nonce a CSP host gave it onto the style element', () => {
    const doc = documentOf([field('email')])
    doc.root.css = { any: 'color: rgb(4, 5, 6)' }

    const { container } = render(
      <FormRenderer document={doc} kit={kit} data={{}} nonce="abc123" onChange={() => undefined} />,
    )

    expect(container.querySelector('style')?.getAttribute('nonce')).toBe('abc123')
  })

  it('emits no nonce attribute when the host gave none', () => {
    // An empty `nonce=""` is not absent: a browser treats it as a nonce that
    // matches nothing.
    const doc = documentOf([field('email')])
    doc.root.css = { any: 'color: rgb(4, 5, 6)' }

    const { container } = render(
      <FormRenderer document={doc} kit={kit} data={{}} onChange={() => undefined} />,
    )

    const style = container.querySelector('style')
    expect(style).not.toBeNull()
    expect(style?.hasAttribute('nonce')).toBe(false)
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
    // Indistinguishable here from a role that is not admin; `missingContext`
    // is the check for this.
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
   * Every key differs from its data key on purpose: row coordinates come from
   * answers and DOM keys from components, and equal names would hide a mix-up
   * (Trap 11, write-tests).
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

  it('follows the rows when the data gains and loses one', () => {
    const { rerender } = render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )
    expect(screen.getAllByLabelText('street')).toHaveLength(2)

    rerender(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={{ ...twoRows, addresses: [{ line1: 'one' }, { line1: 'two' }, { line1: 'three' }] }}
        onChange={() => undefined}
      />,
    )
    expect(
      screen.getAllByLabelText('street').map((input) => (input as HTMLInputElement).value),
    ).toEqual(['one', 'two', 'three'])

    rerender(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={{ ...twoRows, addresses: [{ line1: 'two' }] }}
        onChange={() => undefined}
      />,
    )
    expect(
      screen.getAllByLabelText('street').map((input) => (input as HTMLInputElement).value),
    ).toEqual(['two'])
  })

  it('re-addresses the rows that are left after one is removed', () => {
    const { container, rerender } = render(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={{ ...twoRows, addresses: [{ line1: 'one' }, { line1: 'two' }, { line1: 'three' }] }}
        onChange={() => undefined}
      />,
    )

    rerender(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={{ ...twoRows, addresses: [{ line1: 'two' }, { line1: 'three' }] }}
        onChange={() => undefined}
      />,
    )

    expect(
      [...container.querySelectorAll('[data-fs-key="street"]')].map((element) =>
        element.getAttribute('data-fs-row'),
      ),
    ).toEqual(['addresses[0]', 'addresses[1]'])
  })

  it('keeps the element in place when the row under it changes, which is the cost of index keys', () => {
    // A row has no identity to key on, so state the browser owns (a file input's contents, an
    // IME composition, the selection) stays with the position.
    const { container, rerender } = render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )

    const first = container.querySelectorAll('[data-fs-key="street"] input')[0]
    expect(first).toBeTruthy()

    rerender(
      <FormRenderer
        document={repeating()}
        kit={kit}
        data={{ ...twoRows, addresses: [{ line1: 'two' }] }}
        onChange={() => undefined}
      />,
    )

    const remaining = container.querySelectorAll('[data-fs-key="street"] input')[0]
    expect(remaining, 'the row element was replaced rather than reused').toBe(first)
    expect((remaining as HTMLInputElement).value).toBe('two')
  })

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

    const rows = [...container.querySelectorAll('[data-fs-key="street"]')].map((el) =>
      el.getAttribute('data-fs-row'),
    )
    expect(rows).toEqual(['addresses[0]', 'addresses[1]'])
    expect(container.querySelectorAll('[data-fs-key="line1"]')).toHaveLength(0)
    expect(container.querySelector('[data-fs-key="addressList"]')).toBeTruthy()
    expect(container.querySelector('[data-fs-key="email"]')?.hasAttribute('data-fs-row')).toBe(
      false,
    )
  })

  it('reports a change at an address naming the row', () => {
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

    // Deliberate: an empty label looks like a design choice.
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

    expect(screen.getByLabelText('greeting')).toBeTruthy()
  })

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

    expect(container.querySelector('[data-testid="label"]')?.textContent).toBe('hello')
  })

  it('uses the translation when the bundle is one', () => {
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

  /** React logs a caught error itself. */
  const expectBoom = (): void => expectCaughtError('Boom', /kit exploded/)

  it('keeps the rest of the form on the page', () => {
    expectBoom()
    render(
      <FormRenderer
        document={documentWithBoom()}
        kit={boomKit}
        data={{ before: 'kept', after: 'also kept' }}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByLabelText('before')).toHaveProperty('value', 'kept')
    expect(screen.getByLabelText('after')).toHaveProperty('value', 'also kept')
  })

  it('keeps the row coordinate on the fallback, so the right row stays selectable', () => {
    expectBoom()
    const doc = documentOf([
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Screen',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [{ key: 'boom', type: 'Boom', props: {} }],
      },
    ])

    const { container } = render(
      <FormRenderer
        document={doc}
        kit={boomKit}
        data={{ addresses: [{}, {}] }}
        onChange={() => undefined}
      />,
    )

    const fallbacks = [...container.querySelectorAll('[data-fs-key="boom"]')]
    expect(fallbacks).toHaveLength(2)
    expect(fallbacks.map((element) => element.getAttribute('data-fs-row'))).toEqual([
      'addresses[0]',
      'addresses[1]',
    ])
  })

  it('marks a revealed component that failed as revealed', () => {
    expectBoom()
    const doc = documentOf([
      {
        key: 'boom',
        type: 'Boom',
        props: {},
        renderWhen: { kind: 'static', value: false },
      },
    ])

    const { container } = render(
      <FormRenderer
        document={doc}
        kit={boomKit}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )

    const fallback = container.querySelector('[data-fs-key="boom"]')
    expect(fallback?.getAttribute('data-fs-hidden')).toBe('true')
  })

  it('leaves the mark off a failed component the form really asks for', () => {
    expectBoom()
    const { container } = render(
      <FormRenderer
        document={documentWithBoom()}
        kit={boomKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="boom"]')?.hasAttribute('data-fs-hidden')).toBe(
      false,
    )
  })

  it('says so where the component would have been', () => {
    expectBoom()
    const { container } = render(
      <FormRenderer
        document={documentWithBoom()}
        kit={boomKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    const fallback = container.querySelector('[data-fs-key="boom"]')
    expect(fallback).toBeTruthy()
    expect(fallback?.getAttribute('role')).toBe('alert')
  })

  it('keeps the node selectable, which is how an author removes it', () => {
    expectBoom()
    const { container } = render(
      <FormRenderer
        document={documentWithBoom()}
        kit={boomKit}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )

    const fallback = container.querySelector('[data-fs-key="boom"]')
    expect(fallback?.getAttribute('data-fs-type')).toBe('Boom')
  })

  it('hands the error to the host rather than swallowing it', () => {
    expectBoom()
    const onError = vi.fn()
    render(
      <FormRenderer
        document={documentWithBoom()}
        kit={boomKit}
        data={{}}
        onError={onError}
        onChange={() => undefined}
      />,
    )

    expect(onError).toHaveBeenCalledTimes(1)
    const [error, key] = onError.mock.calls[0] as [Error, string]
    expect(error.message).toBe('kit exploded')
    expect(key).toBe('boom')
  })

  it('does nothing at all when nothing throws', () => {
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
 * A kit that reports the types it was handed: a function rendered as a React
 * child draws no text, so `textContent` cannot tell a message from
 * `Object.prototype.constructor`.
 */
describe('the renderer over an untrusted document', () => {
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

    // One row locked, one not: without the row both resolve false.
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

    expect(typeOf(container, 'greeting-label-type')).toBe('string')
  })

  it('does not read an error off Object.prototype', () => {
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

describe('a throw from RenderNode before it reaches the kit component', () => {
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
    expectCaughtError('RenderNodeBody', /the kit blew up looking up Field/)
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
    expectCaughtError('RenderNodeBody', /the kit blew up looking up Field/)
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
    expectCaughtError('RenderNodeBody', /the kit blew up looking up Screen/)
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
    const { container } = render(
      <FormRenderer
        document={documentOf([computed])}
        kit={kit}
        data={{}}
        evaluate={boom}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="greeting"]')).not.toBeNull()
    expect(container.querySelector('[data-fs-failed]'), 'a boundary caught it').toBeNull()
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

describe('a document shaped in ways the type forbids', () => {
  const asDocument = (root: unknown): FormDocument => ({
    ...documentOf([]),
    root: root as ComponentNode,
  })

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

describe('a boundary after the cause has gone', () => {
  it('draws the component again when the node it wraps changes', () => {
    expectCaughtError('Broken', /this type never renders/)
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
    expectCaughtError('Broken', /this type never renders/)
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

describe('a translation that is not text', () => {
  const translated = (value: unknown): FormDocument => {
    const doc = documentOf([
      { key: 'email', type: 'Field', props: { label: { kind: 'i18n', key: 'email_label' } } },
    ])
    return { ...doc, translations: { 'en-US': { email_label: value } } } as FormDocument
  }

  const labelOf = (document: FormDocument): unknown => {
    let seen: unknown
    const watching: RendererKit = {
      id: 'watching',
      renderers: {
        Screen: Screen_,
        Field: ({ nodeProps, props }: NodeRendererProps): ReactNode => {
          seen = props['label']
          return <div {...nodeProps} />
        },
      },
    }

    render(<FormRenderer document={document} kit={watching} data={{}} onChange={() => undefined} />)
    return seen
  }

  it.each([
    ['an object', { a: 1 }],
    ['a list', ['a']],
    ['a number', 42],
    ['null', null],
  ])('falls back to the key when the translation is %s', (_what, value) => {
    expect(labelOf(translated(value))).toBe('email_label')
  })

  it('still uses a translation that is text', () => {
    expect(labelOf(translated('Courriel'))).toBe('Courriel')
  })
})

describe('a computed prop inside a repeater', () => {
  const labelled = (): FormDocument =>
    documentOf([
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
            props: { label: { kind: 'computed', expression: 'line1' } },
            schema: { type: 'string', validations: [] },
          },
        ],
      },
    ])

  // A real evaluator: a stub returning a constant answers the same for every
  // row whether or not the row scope reached it.
  const evaluate = (expression: string, data: FormData): string =>
    typeof data[expression] === 'string' ? data[expression] : '(none)'

  function Labelled({ nodeProps, props }: NodeRendererProps): ReactNode {
    return <div {...nodeProps}>{typeof props['label'] === 'string' ? props['label'] : ''}</div>
  }

  const labelKit: RendererKit = { id: 'fake', renderers: { Screen: Screen_, Field: Labelled } }

  it('reads the row it is in, not the top of the form', () => {
    const { container } = render(
      <FormRenderer
        document={labelled()}
        kit={labelKit}
        data={{ addresses: [{ line1: 'one' }, { line1: 'two' }] }}
        evaluate={evaluate}
        onChange={() => undefined}
      />,
    )

    const drawn = [...container.querySelectorAll('[data-fs-key="street"]')].map(
      (each) => each.textContent,
    )

    expect(drawn, 'the repeater drew the wrong number of rows').toHaveLength(2)
    expect(drawn).toEqual(['one', 'two'])
  })

  it('still reads the form when there is no row around it', () => {
    const { container } = render(
      <FormRenderer
        document={documentOf([
          {
            key: 'greeting',
            type: 'Field',
            props: { label: { kind: 'computed', expression: 'name' } },
            schema: { type: 'string', validations: [] },
          },
        ])}
        kit={labelKit}
        data={{ name: 'Ada' }}
        evaluate={evaluate}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="greeting"]')?.textContent).toBe('Ada')
  })

  it('lets the row shadow a form answer of the same name', () => {
    const { container } = render(
      <FormRenderer
        document={labelled()}
        kit={labelKit}
        data={{ line1: 'the form answer', addresses: [{ line1: 'the row answer' }] }}
        evaluate={evaluate}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="street"]')?.textContent).toBe('the row answer')
  })
})

describe('the node boundary letting go', () => {
  function Fussy({ nodeProps, props }: NodeRendererProps): ReactNode {
    if (props['label'] === 'boom') throw new Error('the kit refused this label')
    return <div {...nodeProps}>{typeof props['label'] === 'string' ? props['label'] : ''}</div>
  }

  const fussyKit: RendererKit = { id: 'fake', renderers: { Screen: Screen_, Field: Fussy } }

  const withLabel = (label: string): FormDocument =>
    documentOf([
      {
        key: 'one',
        type: 'Field',
        props: { label: { kind: 'static', value: label } },
        schema: { type: 'string', validations: [] },
      },
    ])

  it('comes back when the prop that broke it is repaired', () => {
    expectCaughtError('Fussy', /the kit refused this label/)
    const { container, rerender } = render(
      <FormRenderer
        document={withLabel('boom')}
        kit={fussyKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(
      container.querySelector('[data-fs-failed]'),
      'the kit did not throw, so nothing below this proves anything',
    ).not.toBeNull()

    rerender(
      <FormRenderer
        document={withLabel('fine')}
        kit={fussyKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-failed]')).toBeNull()
    expect(container.querySelector('[data-fs-key="one"]')?.textContent).toBe('fine')
  })

  it('stays down while the prop is still broken', () => {
    expectCaughtError('Fussy', /the kit refused this label/)
    // A fresh but equal document, as from a host that rebuilds it each render:
    // a retry keyed on identity rather than content would loop forever.
    const { container, rerender } = render(
      <FormRenderer
        document={withLabel('boom')}
        kit={fussyKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    rerender(
      <FormRenderer
        document={withLabel('boom')}
        kit={fussyKit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-failed]')).not.toBeNull()
  })

  it('recovers when the renderer kit changes', () => {
    expectCaughtError('Field', /the first kit failed/)
    const document = withLabel('fine')
    const data = {}
    const onChange = (): void => undefined
    const brokenKit: RendererKit = {
      id: 'same-id',
      renderers: {
        Screen: Screen_,
        Field: () => {
          throw new Error('the first kit failed')
        },
      },
    }
    const workingKit: RendererKit = {
      id: 'same-id',
      renderers: { Screen: Screen_, Field: Fussy },
    }
    const { container, rerender } = render(
      <FormRenderer document={document} kit={brokenKit} data={data} onChange={onChange} />,
    )
    expect(container.querySelector('[data-fs-failed]')).not.toBeNull()

    rerender(<FormRenderer document={document} kit={workingKit} data={data} onChange={onChange} />)

    expect(container.querySelector('[data-fs-failed]')).toBeNull()
    expect(container.querySelector('[data-fs-key="one"]')?.textContent).toBe('fine')
  })

  it('recovers when the field data changes', () => {
    expectCaughtError('ValueFussy', /the value failed/)
    const ValueFussy = ({ nodeProps, value }: NodeRendererProps): ReactNode => {
      if (value === 'boom') throw new Error('the value failed')
      return <div {...nodeProps}>{typeof value === 'string' ? value : ''}</div>
    }
    const kit: RendererKit = {
      id: 'value-sensitive',
      renderers: { Screen: Screen_, Field: ValueFussy },
    }
    const document = withLabel('fine')
    const onChange = (): void => undefined
    const { container, rerender } = render(
      <FormRenderer document={document} kit={kit} data={{ one: 'boom' }} onChange={onChange} />,
    )
    expect(container.querySelector('[data-fs-failed]')).not.toBeNull()

    rerender(
      <FormRenderer document={document} kit={kit} data={{ one: 'fine' }} onChange={onChange} />,
    )

    expect(container.querySelector('[data-fs-failed]')).toBeNull()
    expect(container.querySelector('[data-fs-key="one"]')?.textContent).toBe('fine')
  })
})

describe('a document with no root', () => {
  const rootless = (root: unknown): FormDocument =>
    ({ ...documentOf([]), root }) as unknown as FormDocument

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'root'],
    ['an object with no key', { type: 'Screen' }],
  ])('renders a message rather than throwing when the root is %s', (_name, root) => {
    // Asserts on a host sibling: `render` not throwing would miss an unmount.
    const { container } = render(
      <div>
        <span data-testid="host">still here</span>
        <FormRenderer document={rootless(root)} kit={kit} data={{}} onChange={() => undefined} />
      </div>,
    )

    expect(screen.getByTestId('host').textContent).toBe('still here')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('no root component')
  })

  it('renders the form normally when there is a root', () => {
    render(
      <FormRenderer
        document={documentOf([field('email')])}
        kit={kit}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByLabelText('email')).toBeTruthy()
  })
})

describe('children that are not nodes', () => {
  it('costs the junk entry and nothing else', () => {
    const withJunk = documentOf([field('first'), null as unknown as ComponentNode, field('second')])

    const { container } = render(
      <FormRenderer document={withJunk} kit={kit} data={{}} onChange={() => undefined} />,
    )

    expect(screen.getByLabelText('first')).toBeTruthy()
    expect(screen.getByLabelText('second')).toBeTruthy()
    expect(container.querySelector('[data-fs-failed]'), 'a boundary caught something').toBeNull()
  })
})

describe('a repeater inside a repeater', () => {
  const nested = (): FormDocument =>
    documentOf([
      {
        key: 'orderList',
        dataKey: 'orders',
        type: 'Screen',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          field('reference', 'ref'),
          {
            key: 'lineList',
            dataKey: 'lines',
            type: 'Screen',
            props: {},
            schema: { type: 'array', validations: [] },
            children: [field('description', 'text')],
          },
        ],
      },
    ])

  // Different line counts per order, so reading the wrong index cannot still
  // land on something.
  const twoOrders = {
    orders: [
      { ref: 'A', lines: [{ text: 'first' }, { text: 'second' }] },
      { ref: 'B', lines: [{ text: 'third' }] },
    ],
  }

  it('draws every inner row of every outer row', () => {
    render(
      <FormRenderer document={nested()} kit={kit} data={twoOrders} onChange={() => undefined} />,
    )

    expect(screen.getAllByLabelText('reference')).toHaveLength(2)
    expect(screen.getAllByLabelText('description')).toHaveLength(3)
  })

  it('gives an inner field the whole coordinate, not just its own row', () => {
    const { container } = render(
      <FormRenderer document={nested()} kit={kit} data={twoOrders} onChange={() => undefined} />,
    )

    const rows = [...container.querySelectorAll('[data-fs-key="description"]')].map((each) =>
      each.getAttribute('data-fs-row'),
    )

    expect(rows, 'the inner repeater drew the wrong number of rows').toHaveLength(3)
    expect(new Set(rows).size, 'two inner fields share a row coordinate').toBe(3)
    for (const row of rows) expect(row).toContain('orders')
  })

  it('writes an inner answer to the address the outer row names', () => {
    const changes: [string, string][] = []
    render(
      <FormRenderer
        document={nested()}
        kit={kit}
        data={twoOrders}
        onChange={(address, value) => changes.push([address, value as string])}
      />,
    )

    const inputs = screen.getAllByLabelText('description')
    fireEvent.change(inputs[inputs.length - 1] as HTMLElement, { target: { value: 'edited' } })

    expect(changes, 'the kit never called onChange').toHaveLength(1)
    const [address, value] = changes[0] as [string, string]

    const after = applyChange(twoOrders, address, value)
    const orders = after['orders'] as { ref: string; lines: { text: string }[] }[]

    expect(orders[1]?.lines[0]?.text, 'the edit landed outside order B').toBe('edited')
    expect(orders[0]?.lines[0]?.text, 'order A was disturbed').toBe('first')
    expect(orders[0]?.lines[1]?.text).toBe('second')
  })
})

describe("a kit's own fallback renderer", () => {
  function Placeholder({ nodeProps, node }: NodeRendererProps): ReactNode {
    return <div {...nodeProps}>the kit does not draw {node.type}</div>
  }

  const withFallback: RendererKit = {
    id: 'fake',
    renderers: { Screen: Screen_ },
    fallback: Placeholder,
  }

  const unknownType = (): FormDocument => documentOf([{ key: 'odd', type: 'Sparkline', props: {} }])

  it('draws in place of a type the kit has no renderer for', () => {
    const { container } = render(
      <FormRenderer
        document={unknownType()}
        kit={withFallback}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="odd"]')?.textContent).toBe(
      'the kit does not draw Sparkline',
    )
  })

  it('is preferred to the built-in one', () => {
    const { container } = render(
      <FormRenderer
        document={unknownType()}
        kit={withFallback}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="odd"]')?.textContent).not.toContain(
      'No renderer for component type',
    )
  })

  it('leaves a type the kit does draw alone', () => {
    const { container } = render(
      <FormRenderer
        document={documentOf([])}
        kit={withFallback}
        data={{}}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('[data-fs-key="root"]')?.textContent).not.toContain(
      'does not draw',
    )
  })
})

describe('the device the styles are written for', () => {
  const styled = (): FormDocument =>
    documentOf([
      {
        key: 'banner',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [] },
        css: { any: 'color: red', mobile: 'color: blue' },
      },
    ])

  const sheetOf = (container: HTMLElement): string =>
    container.querySelector('style')?.textContent ?? ''

  it('writes the mobile rule flat when mobile is the device', () => {
    const { container } = render(
      <FormRenderer
        document={styled()}
        kit={kit}
        data={{}}
        device="mobile"
        onChange={() => undefined}
      />,
    )

    const sheet = sheetOf(container)
    expect(sheet, 'no stylesheet was emitted at all').toContain('color: blue')
    expect(sheet).not.toContain('@media')
  })

  it('writes it as a media query when no device is simulated', () => {
    const { container } = render(
      <FormRenderer document={styled()} kit={kit} data={{}} onChange={() => undefined} />,
    )

    const sheet = sheetOf(container)
    expect(sheet).toContain('@media')
    expect(sheet).toContain('color: blue')
  })

  it('leaves out a rule for a device that is not the one being simulated', () => {
    const { container } = render(
      <FormRenderer
        document={styled()}
        kit={kit}
        data={{}}
        device="desktop"
        onChange={() => undefined}
      />,
    )

    expect(sheetOf(container)).not.toContain('color: blue')
  })
})

describe('rows that move rather than arrive or leave', () => {
  const listing = (): FormDocument =>
    documentOf([
      {
        key: 'addressList',
        dataKey: 'addresses',
        type: 'Screen',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [field('street', 'line1')],
      },
    ])

  const streets = (): string[] =>
    screen.getAllByLabelText('street').map((each) => (each as HTMLInputElement).value)

  it('redraws the rows in their new order', () => {
    const { rerender } = render(
      <FormRenderer
        document={listing()}
        kit={kit}
        data={{ addresses: [{ line1: 'one' }, { line1: 'two' }, { line1: 'three' }] }}
        onChange={() => undefined}
      />,
    )
    expect(streets()).toEqual(['one', 'two', 'three'])

    rerender(
      <FormRenderer
        document={listing()}
        kit={kit}
        data={{ addresses: [{ line1: 'three' }, { line1: 'one' }, { line1: 'two' }] }}
        onChange={() => undefined}
      />,
    )

    expect(streets()).toEqual(['three', 'one', 'two'])
  })

  it('addresses the moved row by where it now is', () => {
    const changes: string[] = []
    const { rerender } = render(
      <FormRenderer
        document={listing()}
        kit={kit}
        data={{ addresses: [{ line1: 'one' }, { line1: 'two' }] }}
        onChange={(address) => changes.push(address)}
      />,
    )

    rerender(
      <FormRenderer
        document={listing()}
        kit={kit}
        data={{ addresses: [{ line1: 'two' }, { line1: 'one' }] }}
        onChange={(address) => changes.push(address)}
      />,
    )

    const inputs = screen.getAllByLabelText('street')
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: 'edited' } })

    expect(changes, 'the kit never called onChange').toHaveLength(1)
    const after = applyChange(
      { addresses: [{ line1: 'two' }, { line1: 'one' }] },
      changes[0] as string,
      'edited',
    )
    const rows = after['addresses'] as { line1: string }[]

    expect(rows[0]?.line1, 'the edit landed on the row that moved away').toBe('edited')
    expect(rows[1]?.line1).toBe('one')
  })
})

describe('an answer under a condition that flips back', () => {
  const gated = (): FormDocument =>
    documentOf([
      field('trigger'),
      {
        key: 'detail',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [] },
        renderWhen: {
          kind: 'condition',
          condition: {
            op: 'eq',
            left: { kind: 'ref', dataKey: 'trigger' },
            right: { kind: 'literal', value: 'yes' },
          },
        },
      } as unknown as ComponentNode,
    ])

  const valueOfInput = (label: string): string => {
    const element = screen.getByLabelText(label)
    return 'value' in element && typeof element.value === 'string' ? element.value : ''
  }

  const draw = (data: FormData, reveal: boolean): ReturnType<typeof render> =>
    render(
      <FormRenderer
        document={gated()}
        kit={kit}
        data={data}
        revealHidden={reveal}
        onChange={() => undefined}
      />,
    )

  it('is still there when the condition turns true again', () => {
    const view = draw({ trigger: 'yes', detail: 'typed earlier' }, false)
    expect(valueOfInput('detail')).toBe('typed earlier')

    view.rerender(
      <FormRenderer
        document={gated()}
        kit={kit}
        data={{ trigger: 'no', detail: 'typed earlier' }}
        onChange={() => undefined}
      />,
    )
    expect(screen.queryByLabelText('detail'), 'the condition never hid it').toBeNull()

    view.rerender(
      <FormRenderer
        document={gated()}
        kit={kit}
        data={{ trigger: 'yes', detail: 'typed earlier' }}
        onChange={() => undefined}
      />,
    )

    expect(valueOfInput('detail')).toBe('typed earlier')
  })

  it('keeps drawing the answer while the canvas reveals what is hidden', () => {
    const view = draw({ trigger: 'no', detail: 'typed earlier' }, true)

    expect(valueOfInput('detail')).toBe('typed earlier')
    expect(
      view.container.querySelector('[data-fs-key="detail"]')?.getAttribute('data-fs-hidden'),
      'the fixture is not actually hidden, so this proves nothing',
    ).toBe('true')
  })
})

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
import type { ComponentNode, FormContext, FormDocument } from '@formsmith/core'

import { FormRenderer } from './index.js'
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
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
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
  const repeating = (): FormDocument =>
    documentOf([
      field('email'),
      {
        key: 'addresses',
        type: 'Screen',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [field('line1')],
      },
    ])

  const twoRows = { email: 'a@b.co', addresses: [{ line1: 'one' }, { line1: 'two' }] }

  it('draws its children once per row, with each row holding its own answer', () => {
    render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )

    const inputs = screen.getAllByLabelText('line1')
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
    expect(screen.queryByLabelText('line1')).toBeNull()
  })

  it('marks which row an element is in', () => {
    const { container } = render(
      <FormRenderer document={repeating()} kit={kit} data={twoRows} onChange={() => undefined} />,
    )

    const rows = [...container.querySelectorAll('[data-fs-key="line1"]')].map((el) =>
      el.getAttribute('data-fs-row'),
    )
    expect(rows).toEqual(['addresses[0]', 'addresses[1]'])
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

    fireEvent.change(screen.getAllByLabelText('line1')[1] as HTMLElement, {
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
        errors={{ 'addresses[1].line1': 'Wrong.' }}
        onChange={() => undefined}
      />,
    )

    const messages = [...container.querySelectorAll('[data-testid="line1-error"]')].map(
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

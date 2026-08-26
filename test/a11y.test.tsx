/**
 * @vitest-environment jsdom
 */

/**
 * Automated accessibility audit.
 *
 * axe-core over the whole designer, in each of its states. It lives here rather
 * than in the designer package because it pairs the designer with a real kit,
 * and the designer is forbidden from importing one.
 *
 * Everything else in this repo's accessibility coverage is hand-written, which means it only checks
 * what somebody thought to check; axe brings the rules nobody remembered.
 *
 * What it cannot do here is anything needing layout. jsdom has no rendering
 * engine, so colour-contrast and target-size rules would report nothing useful
 * and are disabled by name rather than left to fail silently. Contrast is
 * covered properly in `test/contrast.test.ts`, which reads the stylesheets and
 * computes the ratios.
 *
 * This is a floor, not a certificate. No automated tool catches a confusing
 * reading order or a label that is technically present and useless.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeAll, describe, expect, it } from 'vitest'
import type { FormDocument } from '@formsmith/core'
import { Designer } from '@formsmith/designer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'

/** Rules that need a layout engine, which jsdom does not have. */
const NEEDS_LAYOUT = ['color-contrast', 'target-size', 'scrollable-region-focusable']

function makeDocument(): FormDocument {
  return {
    version: '1',
    id: 'doc',
    name: 'Contact request',
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'heading', type: 'Heading', props: { text: { kind: 'static', value: 'Contact' } } },
        {
          key: 'name',
          type: 'Stack',
          props: { direction: { kind: 'static', value: 'row' } },
          children: [
            {
              key: 'firstName',
              type: 'TextField',
              props: { label: { kind: 'static', value: 'First name' } },
              schema: { type: 'string', validations: [{ key: 'required' }] },
            },
          ],
        },
        {
          key: 'email',
          type: 'TextField',
          props: { label: { kind: 'static', value: 'Email' } },
          schema: { type: 'string', validations: [{ key: 'required' }, { key: 'email' }] },
        },
        {
          key: 'subscribe',
          type: 'Checkbox',
          props: { label: { kind: 'static', value: 'Subscribe' } },
          schema: { type: 'boolean', validations: [] },
        },
        {
          key: 'topic',
          type: 'Select',
          props: {
            label: { kind: 'static', value: 'Topic' },
            options: { kind: 'static', value: [{ label: 'Sales', value: 'sales' }] },
          },
          schema: { type: 'string', validations: [] },
        },
        { key: 'submit', type: 'Button', props: { text: { kind: 'static', value: 'Send' } } },
      ],
    },
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

interface Violation {
  id: string
  impact: string | null | undefined
  help: string
  nodes: string[]
}

async function audit(element: HTMLElement): Promise<Violation[]> {
  const results = await axe.run(element, {
    // Only the rules an accessible result actually depends on. Best-practice
    // rules are excluded so a failure here always means a real barrier.
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: Object.fromEntries(NEEDS_LAYOUT.map((id) => [id, { enabled: false }])),
  })

  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.html),
  }))
}

function renderDesigner(): HTMLElement {
  const { container } = render(
    <Designer
      initialDocument={makeDocument()}
      kit={htmlKit}
      rendererKit={htmlRendererKit}
      onChange={() => undefined}
    />,
  )
  return container
}

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as {
    showModal?: () => void
    close?: () => void
  }
  proto.showModal ??= function showModal(this: HTMLDialogElement): void {
    this.open = true
  }
  proto.close ??= function close(this: HTMLDialogElement): void {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})

describe('axe audit of the designer', () => {
  it('has no violations at rest', async () => {
    expect(await audit(renderDesigner())).toEqual([])
  }, 20000)

  it('has none with a component selected and its properties shown', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    const row = container.querySelector<HTMLElement>('[data-fs-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)

    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none on the Rules tab', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    const row = container.querySelector<HTMLElement>('[data-fs-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)
    await user.click(screen.getByRole('tab', { name: 'Rules' }))

    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none on the Form tab', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('tab', { name: 'Form' }))

    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none in preview, where the kit owns the markup', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    // Validated, so every required field is showing an error. Error wiring is
    // exactly where form accessibility usually breaks.
    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none with both panes collapsed', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    // A collapsed pane is hidden, and hiding a region that still contains the
    // focused element is one of the ways this goes wrong quietly.
    await user.click(screen.getByRole('button', { name: /Hide Components and structure/ }))
    await user.click(screen.getByRole('button', { name: /Hide Component properties/ }))

    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none with the JSON dialog open', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('button', { name: 'JSON' }))

    expect(await audit(container)).toEqual([])
  }, 20000)
})

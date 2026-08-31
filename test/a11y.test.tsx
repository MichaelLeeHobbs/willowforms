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
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

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
    // `en-US`, which is what `createDocument` produces. A dialect-free
    // fixture makes a bundle keyed by tag and one keyed by bare code the
    // same string, which is Trap 5 in the write-tests skill and the shape
    // that made the language filter green here and broken for real
    // documents.
    /*
     * Two languages, because the toolbar hides its language select below two --
     * so with one the audited states never contained it, and the control most
     * likely to be a bare unlabelled `<select>` was the one axe never saw.
     */
    languages: [
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ],
    defaultLanguage: 'en-US',
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

function renderDesigner(kit = htmlKit, rendererKit = htmlRendererKit): HTMLElement {
  const { container } = render(
    <Designer
      initialDocument={makeDocument()}
      kit={kit}
      rendererKit={rendererKit}
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

/**
 * The state a case says it reached, before the state is audited.
 *
 * Four of these cases clicked a tab and then asserted only that axe found no
 * violations. `getByRole('tab', ...)` throws when the *tab* is missing and says
 * nothing about whether the panel rendered, so a regression that left a panel
 * unmounted would have re-audited the previous DOM under the new test's name
 * and reported it clean. An audit of the wrong tree is worse than no audit: it
 * is a green tick against a state nobody looked at.
 *
 * Each anchor is an element only that panel draws.
 */
function showing(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error('the panel never rendered: no #' + id)

  const panel = element.closest('[role="tabpanel"], dialog')
  if (!panel) throw new Error('#' + id + ' is not inside the panel it belongs to')
  return element
}

describe('axe audit of the designer', () => {
  it('has no violations at rest', async () => {
    expect(await audit(renderDesigner())).toEqual([])
  }, 20000)

  it('has none with a component selected and its properties shown', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = container.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)

    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none on the Rules tab', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = container.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)
    await user.click(screen.getByRole('tab', { name: 'Rules' }))

    // The Rules panel, not the Properties panel it replaced.
    showing('fs-field-type')
    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none on the Settings tab', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('tab', { name: 'Settings' }))

    showing('fs-form-name')
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

  it('has none on the Style tab', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = container.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)
    await user.click(screen.getByRole('tab', { name: 'Style' }))

    /*
     * One of the two most ARIA-dense panels in the designer and neither was
     * audited: seven inputs, a colour swatch paired with a text box, a
     * disclosure holding more of the same, and a warning that turns into
     * `aria-invalid`. Every state axe knows how to fail lives here.
     */
    showing('fs-style-device')
    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none with a condition being edited', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = container.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)
    await user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    /*
     * The other one. No audited state ever set a condition, so the editor's
     * hidden labels, its operator selects and its nested Remove buttons were
     * never seen by axe -- in the panel where a control is most likely to end
     * up with no accessible name of its own, which is a defect this repository
     * has already had twice.
     */
    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none with the JSON dialog open', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('button', { name: 'JSON' }))

    /*
     * The dialog is open and holds a tabpanel of its own.
     *
     * Open, not modal: the `beforeAll` polyfill above defines `showModal()` as
     * `this.open = true`, because jsdom has none. There is no top layer, no
     * inert background and no `::backdrop` here, so what
     * `docs/accessibility.md` credits to the browser -- focus trapping, Escape,
     * the background going inert -- is not what this audit is looking at.
     * `e2e/dialog.spec.ts` is where that is checked, in a browser that has it.
     */
    const dialog = document.querySelector('dialog')
    expect(dialog?.open, 'the JSON dialog never opened').toBe(true)
    expect(dialog?.querySelector('[role="tabpanel"]')).not.toBeNull()

    expect(await audit(container)).toEqual([])
  }, 20000)
})

/**
 * The same audit with the MUI kit drawing the form.
 *
 * `renderDesigner()` hard-coded the HTML kit, and nothing else in the repository
 * renders a MUI form under axe -- so the kit most consumers will actually use
 * was covered only by the hand-written rules in `test/kit-contract.test.tsx`,
 * which are by definition the ones somebody thought of. `02-kit-contract.md`
 * records that `kit-mui` had failed both of its written accessibility
 * obligations for as long as that file existed, which is the argument for not
 * taking this kit on trust.
 *
 * Two states rather than all nine: the designer's own chrome is identical
 * whichever kit is mounted, so what these add is the kit's markup at rest and
 * the kit's markup with every error showing. Error wiring is where form
 * accessibility usually breaks, and it is the state a kit has most of its own
 * say in.
 */
describe('axe audit with the MUI kit on the canvas', () => {
  it('has no violations at rest', async () => {
    expect(await audit(renderDesigner(muiKit, muiRendererKit))).toEqual([])
  }, 20000)

  it('has none in preview with every field failing', async () => {
    const user = userEvent.setup()
    const container = renderDesigner(muiKit, muiRendererKit)

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    // The state that proves the kit is drawing, not merely that axe ran: an
    // empty canvas has no violations either.
    expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0)
    expect(await audit(container)).toEqual([])
  }, 20000)
})

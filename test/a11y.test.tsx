/**
 * @vitest-environment jsdom
 */

/**
 * Lives here, not in the designer package, because it pairs the designer with a
 * real kit and the designer may not import one. Contrast is checked in
 * `test/contrast.test.ts`.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import type { FormDocument } from '@willowforms/core'
import { Designer } from '@willowforms/designer'
import { htmlKit, htmlRendererKit } from '@willowforms/kit-html'
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'

/** Rules that need what jsdom lacks: layout, or a canvas to measure text on. */
const NEEDS_BROWSER = [
  'color-contrast',
  'target-size',
  'scrollable-region-focusable',
  'label-content-name-mismatch',
]

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
    // Two, so the toolbar shows its language select. `en-US` as `createDocument`
    // makes it: without a dialect, a bundle keyed by tag and one keyed by bare
    // code look the same.
    languages: [
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  }
}

interface Finding {
  id: string
  impact: string | null | undefined
  help: string
  nodes: string[]
}

async function audit(element: HTMLElement): Promise<Finding[]> {
  // axe reports no violations for an empty subtree, so the checks below insist
  // something was there and some rule ran.
  const results = await axe.run(element, {
    // Best-practice rules are excluded so a failure always means a real barrier.
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: Object.fromEntries(NEEDS_BROWSER.map((id) => [id, { enabled: false }])),
  })

  if (element.querySelectorAll('*').length < 10) {
    throw new Error('the audited subtree is too small to be the designer')
  }
  if (results.passes.length + results.violations.length === 0) {
    throw new Error('axe applied no rule to this subtree')
  }

  const finding = (result: axe.Result, help: string): Finding => ({
    id: result.id,
    impact: result.impact,
    help,
    nodes: result.nodes.map((node) => node.html),
  })
  return [
    ...results.violations.map((result) => finding(result, result.help)),
    // Not a pass: axe could not tell, or its rule threw.
    ...results.incomplete.map((result) => finding(result, 'undecided: ' + result.help)),
  ]
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

/**
 * Clicking a tab proves the tab exists, not that its panel rendered. Each id is
 * an element only that panel draws.
 */
function showing(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[id$="${id}"]`)
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

    expect(screen.getByRole('textbox', { name: 'Key' })).toBeTruthy()
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

    showing('fs-field-type')
    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none on the Actions tab', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = container.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)
    await user.click(screen.getByRole('tab', { name: 'Actions' }))

    expect(screen.getByRole('combobox', { name: 'Action for onChange' })).toBeTruthy()
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

    // Validated, so every required field shows an error.
    expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0)
    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none with both panes collapsed', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('button', { name: /Hide Components and structure/ }))
    await user.click(screen.getByRole('button', { name: /Hide Component properties/ }))

    expect(screen.getByRole('button', { name: /Show Components and structure/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Show Component properties/ })).toBeTruthy()
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

    // The operator, which only the condition editor draws.
    showing('-op')
    expect(await audit(container)).toEqual([])
  }, 20000)

  it('has none with the JSON dialog open', async () => {
    const user = userEvent.setup()
    const container = renderDesigner()

    await user.click(screen.getByRole('button', { name: 'JSON' }))

    /*
     * The dialog is open and holds a tabpanel of its own.
     *
     * Open, not modal: `test/setup.ts` defines `showModal()` as
     * `this.open = true`, because jsdom has none. There is no top layer, no
     * inert background and no `::backdrop` here, so what
     * `docs/accessibility.md` credits to the browser -- focus trapping, Escape,
     * the background going inert -- is not what this audit is looking at.
     * `e2e/document.spec.ts` is where that is checked, in a browser that has it.
     */
    const dialog = document.querySelector('dialog')
    expect(dialog?.open, 'the JSON dialog never opened').toBe(true)
    expect(dialog?.querySelector('[role="tabpanel"]')).not.toBeNull()

    expect(await audit(container)).toEqual([])
  }, 20000)
})

describe('a rule axe could not decide', () => {
  it('is reported rather than counted as clean', async () => {
    const { container } = render(
      <form>
        {['One', 'Two', 'Three', 'Four', 'Five'].map((name) => (
          <label key={name}>
            {name}
            <input />
          </label>
        ))}
        {/* axe asks for a review when the described element is not on the page. */}
        <button type="button" aria-describedby="nowhere">
          Send
        </button>
      </form>,
    )

    const found = await audit(container)

    expect(found.map((each) => each.id)).toEqual(['aria-valid-attr-value'])
    expect(found[0]?.help).toMatch(/^undecided: /)
  }, 20000)
})

/**
 * Two states, not all of them: the designer chrome is the same whichever kit is
 * mounted, so only the kit's markup at rest and with errors adds coverage.
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

    // Proves the kit drew: an empty canvas has no violations either.
    expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0)
    expect(await audit(container)).toEqual([])
  }, 20000)
})

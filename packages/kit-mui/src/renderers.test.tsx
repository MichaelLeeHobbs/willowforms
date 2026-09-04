/**
 * @vitest-environment jsdom
 */

/**
 * A length the document authored is not the host theme's to rescale.
 *
 * MUI's `sx` reads a bare number as a multiple of a theme value: `padding` goes
 * through `theme.spacing` and `borderRadius` through `theme.shape.borderRadius`.
 * So the kit divided by the scale to get back to pixels — and the point of MUI
 * is that a host replaces its theme, which makes that conversion round-trip only
 * under the defaults it was written against. One of the two divisions was
 * against the wrong default and was wrong even there: `borderRadius` divided by
 * 8 where MUI multiplies by 4, so an authored `radius: 24` drew at 12px.
 *
 * The cross-kit half of this is in `test/kit-contract.test.tsx`, which cannot
 * live here because it needs both kits, and the theme half cannot live there
 * because only this package depends on MUI.
 */

import { fireEvent, render } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'
import type { ComponentNode, FormDocument } from '@formsmith/core'
import { prop } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'

import { muiRendererKit } from './renderers.js'

function documentOf(root: ComponentNode): FormDocument {
  return {
    version: '1',
    id: 'scale',
    name: 'Scale',
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

const box: ComponentNode = {
  key: 'target',
  type: 'Box',
  props: { padding: prop(8), radius: prop(24), background: prop('') },
  children: [],
}

/**
 * Does this stylesheet carry a rule for exactly this class?
 *
 * `text.includes('.' + name)` is the substring trap the write-tests skill
 * names. Emotion class names are hashes and one is freely a prefix of another,
 * so `.css-1ab` matches the rule written for `.css-1abc` and the assertion
 * reads a rule belonging to some other element on the page. Every test below
 * renders several styled components into one document and reads one of them,
 * which is the arrangement where that goes wrong quietly.
 *
 * The name has to end where the selector ends: anything but another name
 * character after it.
 */
function carriesRule(text: string, className: string): boolean {
  const needle = '.' + className
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const next = text.charAt(at + needle.length)
    if (next === '' || !/[\w-]/.test(next)) return true
  }
  return false
}

/** The emotion rule this render emitted for the Box, whitespace removed. */
function ruleFor(theme: ReturnType<typeof createTheme> | undefined): string {
  const form = (
    <FormRenderer
      document={documentOf(box)}
      kit={muiRendererKit}
      data={{}}
      revealHidden
      onChange={() => undefined}
    />
  )
  const { container } = render(theme ? <ThemeProvider theme={theme}>{form}</ThemeProvider> : form)

  const el = container.querySelector('[data-fs-key="target"]')
  if (!el) throw new Error('the Box did not render')

  const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.startsWith('css-'))
  expect(classes.length, 'the Box carries no emotion class').toBeGreaterThan(0)

  /*
   * Matched by the element's own class rather than by clearing the page first.
   * Emotion caches by content hash and will not re-insert a rule it believes is
   * already there, so removing its style tags makes the next render emit
   * nothing and the reading come back empty.
   */
  return Array.from(document.querySelectorAll('style'))
    .map((tag) => tag.textContent ?? '')
    .filter((text) => classes.some((c) => carriesRule(text, c)))
    .join('')
    .replace(/\s+/g, '')
}

/** Whatever the emotion rules for this element say, whitespace removed. */
function rulesFor(container: HTMLElement, key: string): string {
  const el = container.querySelector('[data-fs-key="' + key + '"]')
  if (!el) throw new Error('no element rendered for ' + key)

  const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.startsWith('css-'))
  expect(classes.length, key + ' carries no emotion class').toBeGreaterThan(0)

  return Array.from(document.querySelectorAll('style'))
    .map((tag) => tag.textContent ?? '')
    .filter((text) => classes.some((c) => carriesRule(text, c)))
    .join('')
    .replace(/\s+/g, '')
}

function draw(root: ComponentNode, theme?: ReturnType<typeof createTheme>): HTMLElement {
  const form = (
    <FormRenderer
      document={documentOf(root)}
      kit={muiRendererKit}
      data={{}}
      revealHidden
      onChange={() => undefined}
    />
  )
  return render(theme ? <ThemeProvider theme={theme}>{form}</ThemeProvider> : form).container
}

describe('the screen surface', () => {
  const screenNode: ComponentNode = {
    key: 'screen',
    type: 'Screen',
    props: {},
    children: [],
  }

  it.each([
    ['light', '#fff'],
    ['dark', '#121212'],
  ] as const)('owns its %s theme background', (mode, background) => {
    const container = draw(screenNode, createTheme({ palette: { mode } }))

    expect(rulesFor(container, 'screen')).toContain('background-color:' + background)
  })
})

describe('an unanswered radio group', () => {
  /*
   * Every `RadioItem` child rendered pre-checked, and all of them at once.
   *
   * `RadioItem` ships with `value: ''` from the palette, an unanswered group's
   * value is `''`, and MUI's `Radio` reads `useRadioGroup()` from context and
   * compares the two -- so `'' === ''` checked every item. `kit-html` fixed
   * exactly this and its comment says so; the comment here claimed the item was
   * "deliberately not wired to the group's value", which was false and is
   * plausibly why the guard was never written.
   *
   * The contract suite's "A RadioItem child can be selected in its group" rule
   * did not catch it: selecting one works either way, and nothing asked what
   * the group looked like before anybody selected anything.
   */
  const group = (values: string[]): ComponentNode => ({
    key: 'colour',
    type: 'RadioGroup',
    props: { label: prop('Colour') },
    schema: { type: 'string', validations: [] },
    children: values.map((value, index) => ({
      key: 'item' + String(index),
      type: 'RadioItem',
      props: { value: prop(value), label: prop(value || 'unset') },
    })),
  })

  const checkedIn = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('input[type="radio"]')]
      .filter((input) => 'checked' in input && input.checked)
      .map((input) => ('value' in input && typeof input.value === 'string' ? input.value : ''))

  it('has nothing checked when no item carries a value', () => {
    const container = draw(group(['', '']))

    expect(
      container.querySelectorAll('input[type="radio"]').length,
      'the group drew no radios, so this proves nothing',
    ).toBe(2)
    expect(checkedIn(container)).toEqual([])
  })

  it('lets an item outside a group be checked, because nothing forbids one', () => {
    /*
     * The guard's other edge. Fixing the pre-checked group by writing
     * `checked={group ? ... : false}` made a `RadioItem` with no group above it
     * a controlled input whose value never moves: permanently unchecked, and a
     * click does nothing.
     *
     * Reachable, because `ComponentDef` has no way to say a type may only
     * appear under another -- the palette will drop a `RadioItem` anywhere, so
     * that document is one somebody can author. Uncontrolled is the honest
     * answer when there is no group to hold the answer.
     */
    const container = draw({
      key: 'lonely',
      type: 'RadioItem',
      props: { value: prop('yes'), label: prop('Yes') },
    })

    const radio = container.querySelector<HTMLInputElement>('input[type="radio"]')
    expect(radio, 'no radio was drawn, so this proves nothing').toBeTruthy()
    expect(radio?.checked, 'it started checked').toBe(false)

    fireEvent.click(radio as HTMLInputElement)

    expect(radio?.checked, 'a radio outside a group could not be checked').toBe(true)
  })

  it('has nothing checked when the items do carry values', () => {
    // The ordinary case, and the control: an unanswered group is unanswered
    // whatever its options are called.
    const container = draw(group(['red', 'green']))

    expect(checkedIn(container)).toEqual([])
  })

  it('checks the one item whose value the group holds', () => {
    /*
     * And the guard has to leave selection working. Refusing every item would
     * satisfy both tests above and break the component, which is the failure
     * mode a "nothing is checked" assertion invites.
     */
    const root = group(['red', 'green'])
    const form = (
      <FormRenderer
        document={documentOf(root)}
        kit={muiRendererKit}
        data={{ colour: 'green' }}
        revealHidden
        onChange={() => undefined}
      />
    )
    const { container } = render(form)

    expect(checkedIn(container)).toEqual(['green'])
  })
})

describe('a length the host theme must not rescale', () => {
  /*
   * `Screen.maxWidth` was the one length in the kit that skipped `px()`, and
   * MUI's sizing transform reads a bare number at or below 1 as a *percentage*
   * -- which `ImageNode`'s own comment already documents as the reason `width`
   * converts. So `maxWidth: 1` was 100% here and 1px on `kit-html`: one
   * document, two layouts, from the value a slider lands on at its floor.
   */
  const screen = (maxWidth: number): ComponentNode => ({
    key: 'screen',
    type: 'Screen',
    props: { maxWidth: prop(maxWidth), gap: prop(16) },
    children: [],
  })

  it.each([
    [1, 'max-width:1px'],
    [0.5, 'max-width:0.5px'],
    [640, 'max-width:640px'],
  ])('renders maxWidth %s as pixels', (authored, expected) => {
    expect(rulesFor(draw(screen(authored)), 'screen')).toContain(expected)
  })

  it('does not read a small number as a percentage', () => {
    // The failure with its own name, so a regression says what it was.
    expect(rulesFor(draw(screen(1)), 'screen')).not.toContain('max-width:100%')
  })

  it('keeps a button group gap out of the theme spacing scale', () => {
    /*
     * `ButtonGroup` passed `gap={1}`, a bare number, which MUI resolves
     * through `theme.spacing`. A host that set spacing to 3 got a 3px gap
     * where the default theme drew 8px, from a document that said nothing at
     * all. This file's stated rule was tested on `Box.padding` and
     * `Box.radius` only, and this is the length it missed.
     */
    const buttons: ComponentNode = {
      key: 'actions',
      type: 'ButtonGroup',
      props: {},
      children: [{ key: 'ok', type: 'Button', props: { text: prop('OK') } }],
    }

    const plain = rulesFor(draw(buttons), 'actions')
    const themed = rulesFor(draw(buttons, createTheme({ spacing: 3 })), 'actions')

    expect(plain, 'no gap was emitted at all').toContain('gap:8px')
    expect(themed).toContain('gap:8px')
  })
})

/*
 * `ImageNode`'s refused `src` is deliberately not tested here, and that is a
 * gap rather than an oversight.
 *
 * The finding was that `src={safeHref(props['src']) ?? ''}` renders
 * `<img src="">`, a request for the current page in several browsers, while
 * `LinkNode` reads the same allowlist and degrades a refusal to plain text.
 * Building the test showed the DOM outcome does not happen: React refuses an
 * empty `src` and leaves the attribute off, so `hasAttribute('src')` is `false`
 * whichever way the line is written and every assertion about the markup passes
 * against the defect.
 *
 * React does warn -- "An empty string ("") was passed to the src attribute" --
 * and asserting on that was the second attempt. It fires when the whole file
 * runs and not when the test runs alone, so a gate built on it would be a gate
 * that depends on what else is in the suite. That is worse than no gate.
 *
 * The line is still written to omit the attribute, because that is what it
 * means and it is what stops the warning. It is unguarded, and
 * `docs/build-out/found.md` records it beside the two other checks this run
 * could not make fail.
 */

describe('the file field telling somebody a file was dropped', () => {
  /*
   * The "too large" notice could never be announced. The message was produced
   * only when `error` was undefined, and `role="alert"` added only when `error`
   * was set -- two conditions that cannot both hold. The comment at the call
   * site said "And somebody is told", and nobody was.
   *
   * Driven through the input rather than asserted on internals, because the
   * whole claim is about what a listener gets.
   */
  const upload: ComponentNode = {
    key: 'attachment',
    type: 'FileUpload',
    props: { label: prop('Attachment'), maxSize: prop(1) },
    schema: { type: 'string', validations: [] },
  }

  const overLimit = (): File =>
    new File([new Uint8Array(4096)], 'large.pdf', { type: 'application/pdf' })

  it('announces the refusal', () => {
    const container = draw(upload)
    const input = container.querySelector('input[type="file"]')
    expect(input, 'the file field did not render').not.toBeNull()

    Object.defineProperty(input, 'files', { value: [overLimit()], configurable: true })
    fireEvent.change(input as Element)

    const alert = container.querySelector('[role="alert"]')
    expect(alert, 'the notice was produced but never announced').not.toBeNull()
    expect(alert?.textContent).toContain('too large')
  })

  it('says nothing while nothing has been refused', () => {
    // The control, so the alert cannot pass by being permanent.
    const container = draw(upload)

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('a Box under a host theme', () => {
  it('draws the authored radius under the default theme', () => {
    // The defect. Divided by 8 and multiplied by 4, an authored 24 drew at 12.
    expect(ruleFor(undefined)).toContain('border-radius:24px')
  })

  it.each([
    ['a wider spacing scale', createTheme({ spacing: 3 })],
    ['a rounder shape', createTheme({ shape: { borderRadius: 10 } })],
    ['both at once', createTheme({ spacing: 3, shape: { borderRadius: 10 } })],
  ])('draws the same pixels under %s', (_what, theme) => {
    const rule = ruleFor(theme)

    expect(rule).toContain('border-radius:24px')
    expect(rule).toContain('padding:8px')
  })
})

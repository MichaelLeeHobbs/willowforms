/**
 * @vitest-environment jsdom
 */

/*
 * MUI's `sx` multiplies a bare number by a theme value (`padding` by
 * `theme.spacing`, `borderRadius` by `theme.shape.borderRadius`), so an
 * authored length must reach it as pixels. The cross-kit half is in
 * `test/kit-contract.test.tsx`.
 */

import { fireEvent, render } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'
import type { ComponentNode, FormDocument } from '@willowforms/core'
import { prop } from '@willowforms/core'
import { FormRenderer } from '@willowforms/renderer'

import { muiRendererKit } from './renderers.js'

function documentOf(root: ComponentNode): FormDocument {
  return {
    version: '1',
    id: 'scale',
    name: 'Scale',
    root,
    actions: {},
    // `en-US`, as `createDocument` produces: without a dialect, a bundle keyed
    // by tag and one keyed by bare code are the same string.
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
 * Not `text.includes('.' + name)`: one Emotion class name can prefix another
 * (`.css-1ab`, `.css-1abc`), so the name must end where the selector ends.
 */
function carriesRule(text: string, className: string): boolean {
  const needle = '.' + className
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const next = text.charAt(at + needle.length)
    if (next === '' || !/[\w-]/.test(next)) return true
  }
  return false
}

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

  // Matched by the element's own class, not by clearing style tags first:
  // Emotion will not re-insert a rule it has cached.
  return Array.from(document.querySelectorAll('style'))
    .map((tag) => tag.textContent ?? '')
    .filter((text) => classes.some((c) => carriesRule(text, c)))
    .join('')
    .replace(/\s+/g, '')
}

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
    const container = draw(group(['red', 'green']))

    expect(checkedIn(container)).toEqual([])
  })

  it('checks the one item whose value the group holds', () => {
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
  // MUI's sizing transform reads a bare number at or below 1 as a percentage.
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
    expect(rulesFor(draw(screen(1)), 'screen')).not.toContain('max-width:100%')
  })

  it('keeps a button group gap out of the theme spacing scale', () => {
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

describe('a Box under a host theme', () => {
  it('draws the authored radius under the default theme', () => {
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

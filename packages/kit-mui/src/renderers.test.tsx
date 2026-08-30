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

import { render } from '@testing-library/react'
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
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
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
    .filter((text) => classes.some((c) => text.includes('.' + c)))
    .join('')
    .replace(/\s+/g, '')
}

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

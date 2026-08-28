import { describe, expect, it } from 'vitest'

import { safeDeclarations, styleSheetFor } from './css.js'
import type { ComponentNode } from './types.js'

const node = (key: string, css: ComponentNode['css']): ComponentNode => ({
  key,
  type: 'Box',
  props: {},
  ...(css ? { css } : {}),
})

const root = (children: ComponentNode[]): ComponentNode => ({
  key: 'root',
  type: 'Screen',
  props: {},
  children,
})

describe('safeDeclarations', () => {
  it('keeps ordinary declarations', () => {
    expect(safeDeclarations('padding: 8px; color: red')).toBe('padding: 8px; color: red')
    expect(safeDeclarations('  margin: 0  ')).toBe('margin: 0')
  })

  it('refuses text that could close the block and start a new rule', () => {
    /*
     * This is the whole reason the function exists. A document is data, so an
     * author can write anything here, and `}` is how one component's styling
     * reaches the entire page.
     */
    expect(safeDeclarations('color: red } body { display: none')).toBeUndefined()
    expect(safeDeclarations('a { color: red }')).toBeUndefined()
  })

  it('refuses text that could leave CSS altogether', () => {
    // The text is placed inside a <style> element, and </style> closes it.
    expect(safeDeclarations('color: red</style><script>alert(1)</script>')).toBeUndefined()
  })

  it('refuses at-rules', () => {
    expect(safeDeclarations('@import url(https://evil.example)')).toBeUndefined()
    expect(safeDeclarations('color: red; @media print { a { color: blue } }')).toBeUndefined()
  })

  it('treats nothing, and nothing but space, as no declarations', () => {
    expect(safeDeclarations(undefined)).toBeUndefined()
    expect(safeDeclarations('')).toBeUndefined()
    expect(safeDeclarations('   \n  ')).toBeUndefined()
  })
})

describe('styleSheetFor', () => {
  it('scopes every rule to the node that carries it', () => {
    const sheet = styleSheetFor(root([node('card', { any: 'padding: 8px' })]))
    expect(sheet).toBe('[data-fs-key="card"]{padding: 8px}')
  })

  it('emits nothing for a tree with no styling', () => {
    expect(styleSheetFor(root([node('card', undefined)]))).toBe('')
  })

  it('turns each device into its own media query when none is simulated', () => {
    const sheet = styleSheetFor(
      root([node('card', { any: 'padding: 8px', mobile: 'padding: 4px' })]),
    )

    expect(sheet).toContain('[data-fs-key="card"]{padding: 8px}')
    expect(sheet).toContain('@media (max-width: 767px){[data-fs-key="card"]{padding: 4px}}')
  })

  it('puts the base layer before the queries, so a device overrides it', () => {
    const sheet = styleSheetFor(
      root([node('card', { any: 'padding: 8px', mobile: 'padding: 4px' })]),
    )
    expect(sheet.indexOf('padding: 8px')).toBeLessThan(sheet.indexOf('@media'))
  })

  it('emits only the simulated device, flat, with no query', () => {
    /*
     * The canvas simulates a device by sizing a frame, so a media query would
     * answer about the browser window and the frame would be ignored.
     */
    const css = { any: 'padding: 8px', mobile: 'padding: 4px', tablet: 'padding: 6px' }
    const sheet = styleSheetFor(root([node('card', css)]), 'mobile')

    expect(sheet).not.toContain('@media')
    expect(sheet).toContain('padding: 4px')
    expect(sheet).not.toContain('padding: 6px')
    expect(sheet.indexOf('padding: 8px')).toBeLessThan(sheet.indexOf('padding: 4px'))
  })

  it('emits only the base when the simulated device has no rules of its own', () => {
    const sheet = styleSheetFor(
      root([node('card', { any: 'padding: 8px', mobile: 'padding: 4px' })]),
      'desktop',
    )
    expect(sheet).toBe('[data-fs-key="card"]{padding: 8px}')
  })

  it('leaves out a declaration it refused rather than emitting a broken rule', () => {
    const sheet = styleSheetFor(root([node('card', { any: 'color: red } body { display: none' })]))
    expect(sheet).toBe('')
  })

  it('escapes a key that would otherwise break out of the selector', () => {
    // Keys are author-controlled, so one holding a quote must not end the
    // attribute selector and start a different one.
    const sheet = styleSheetFor(root([node('a"] , body [x="', { any: 'color: red' })]))
    expect(sheet).toBe('[data-fs-key="a\\"] , body [x=\\""]{color: red}')
  })

  it('reaches components nested anywhere in the tree', () => {
    const inner = node('inner', { any: 'color: red' })
    const outer: ComponentNode = { key: 'outer', type: 'Box', props: {}, children: [inner] }
    expect(styleSheetFor(root([outer]))).toContain('[data-fs-key="inner"]')
  })
})

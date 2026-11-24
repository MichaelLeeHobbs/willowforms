/**
 * @vitest-environment jsdom
 */

/**
 * kit-mui puts a style value in `sx`, which emotion concatenates into
 * stylesheet text, so a `}` ends the class block. kit-html puts it in a `style`
 * object, which React's server renderer writes verbatim. So MUI is checked on
 * the emitted stylesheet and HTML on server markup. Neither goes through CSSOM:
 * jsdom's CSS parser rejects values a browser accepts.
 */

import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ComponentNode, FormDocument } from '@willowforms/core'
import { prop } from '@willowforms/core'
import { FormRenderer } from '@willowforms/renderer'
import type { RendererKit } from '@willowforms/renderer'
import { htmlKit, htmlRendererKit } from '@willowforms/kit-html'
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'

const INJECTION = 'red}html{display:none}.x{'

/** A value that makes the browser fetch. */
const EXFILTRATION = 'url(https://evil.example/p.png)'

function documentOf(root: ComponentNode): FormDocument {
  return {
    version: '1',
    id: 'injection',
    name: 'Injection',
    root,
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

const boxWith = (background: string, padding = 2): ComponentNode => ({
  key: 'target',
  type: 'Box',
  props: { padding: prop(padding), background: prop(background), radius: prop(0) },
  children: [],
})

function formOf(kit: RendererKit, background: string, padding = 2): ReactElement {
  return (
    <FormRenderer
      document={documentOf(boxWith(background, padding))}
      kit={kit}
      data={{}}
      revealHidden
      onChange={() => undefined}
    />
  )
}

/** A brace-depth walk, not CSSOM, for the reason in the file comment. */
function rulesIn(sheet: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = []
  let depth = 0
  let start = 0
  let open = -1
  for (let i = 0; i < sheet.length; i += 1) {
    if (sheet[i] === '{') {
      if (depth === 0) open = i
      depth += 1
    } else if (sheet[i] === '}') {
      depth -= 1
      if (depth === 0 && open >= 0) {
        rules.push({
          selector: sheet.slice(start, open).trim(),
          body: sheet.slice(open + 1, i).trim(),
        })
        start = i + 1
        open = -1
      }
    }
  }
  const tail = sheet.slice(start).trim()
  // An unterminated `.x{` is the payload's third fragment and has to be visible.
  if (tail) rules.push({ selector: tail, body: '' })
  return rules
}

/**
 * Give each case its own `padding`: emotion does not re-insert a rule with a
 * content hash it has seen, and both hostile backgrounds sanitise to the same
 * bytes.
 */
function emittedRules(background: string, padding = 2): { selector: string; body: string }[] {
  render(formOf(muiRendererKit, background, padding))
  return Array.from(document.querySelectorAll('style')).flatMap((tag) =>
    rulesIn(tag.textContent ?? ''),
  )
}

/**
 * Requires a `padding` declaration first: callers assert with `not`, which an
 * empty string passes.
 */
function serverStyleAttribute(kit: RendererKit, background: string): string {
  const markup = renderToStaticMarkup(formOf(kit, background))
  const at = markup.indexOf('data-fs-key="target"')
  expect(at, 'the Box did not render').toBeGreaterThanOrEqual(0)
  const style = /style="([^"]*)"/.exec(markup.slice(at))?.[1] ?? ''
  expect(style, 'the Box rendered no style attribute to inspect').toContain('padding')
  return style
}

// Image sources use their own allowlist and inline-style path, covered in e2e/image-backgrounds.spec.ts.
const CONSTRAINED = new Set(['number', 'select', 'boolean', 'image'])

function freeStyleValues(kit: {
  components: readonly {
    type: string
    props: readonly { name: string; editor: string; section?: string }[]
  }[]
}): string[] {
  return kit.components.flatMap((component) =>
    component.props
      .filter((entry) => entry.section === 'style' && !CONSTRAINED.has(entry.editor))
      .map((entry) => component.type + '.' + entry.name),
  )
}

describe('a document CSS value cannot author a rule', () => {
  it('has one free-text style value per kit, which is the one the rest of this file uses', () => {
    expect(freeStyleValues(muiKit), '@willowforms/kit-mui').toEqual(['Box.background'])
    expect(freeStyleValues(htmlKit), '@willowforms/kit-html').toEqual(['Box.background'])
  })

  it.each([muiKit, htmlKit])(
    '$id declares only the image style sinks exercised in the browser',
    (kit) => {
      const images = kit.components
        .flatMap((component) =>
          component.props
            .filter((entry) => entry.section === 'style' && entry.editor === 'image')
            .map((entry) => component.type + '.' + entry.name),
        )
        .sort()
      expect(images).toEqual(
        ['Box', 'Card', 'Grid', 'Repeater', 'Screen', 'Stack', 'Step'].map(
          (type) => type + '.backgroundImage',
        ),
      )
    },
  )

  beforeEach(() => {
    // A stale tag from an earlier case would count as this case's output.
    for (const tag of Array.from(document.querySelectorAll('style'))) tag.remove()
  })

  describe('@willowforms/kit-mui', () => {
    it('emits one rule for a Box, not two', () => {
      const rules = emittedRules(INJECTION, 2)
      expect(rules.map((rule) => rule.selector)).not.toContain('html')
      expect(rules).toHaveLength(1)
      expect(rules[0]?.selector).toMatch(/^\.css-/)
    })

    it('keeps a legitimate colour', () => {
      expect(
        emittedRules('#ff0000', 3)
          .map((rule) => rule.body)
          .join(''),
      ).toContain('#ff0000')
    })

    it('refuses a value that fetches', () => {
      const rules = emittedRules(EXFILTRATION, 4)

      // Without these, "sanitised" and "nothing was emitted" look the same.
      expect(rules).toHaveLength(1)
      expect(rules[0]?.body).toContain('padding')
      expect(rules.map((rule) => rule.body).join('')).not.toContain('evil.example')
    })
  })

  describe('@willowforms/kit-html', () => {
    it('server-renders one declaration list, not a rule of its own', () => {
      const style = serverStyleAttribute(htmlRendererKit, INJECTION)
      expect(style).not.toMatch(/[{}<@]/)
      expect(style).not.toContain('display:none')
    })

    it('keeps a legitimate colour', () => {
      expect(serverStyleAttribute(htmlRendererKit, '#ff0000')).toContain('#ff0000')
    })

    it('refuses a value that fetches', () => {
      expect(serverStyleAttribute(htmlRendererKit, EXFILTRATION)).not.toContain('evil.example')
    })
  })
})

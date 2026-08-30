/**
 * @vitest-environment jsdom
 */

/**
 * A document's style value cannot author a rule, in either kit.
 *
 * `background` on `Box` is the only string-typed style value either kit has,
 * and a document is data. The two kits reach the page by different routes, so
 * the obligation is one sentence with two sinks:
 *
 * - `@formsmith/kit-mui` puts the value in `sx`, which emotion concatenates
 *   into stylesheet text. A `}` there ends the class block and everything after
 *   it is a new top-level rule against the whole page.
 * - `@formsmith/kit-html` puts it in a React `style` object. On the client CSSOM
 *   drops a malformed value, which is why this kit was reported safe. It is not:
 *   React's server renderer does no CSS validation at all and writes the string
 *   into the attribute verbatim, and MUI's dominant deployment is Next.js.
 *
 * So the MUI half is asserted against the emitted stylesheet and the HTML half
 * against server-rendered markup. Neither reads CSSOM, deliberately: jsdom's CSS
 * parser is a subset of a browser's and rejects values Chromium accepts, so an
 * assertion routed through it agrees with the right answer for the wrong reason.
 */

import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ComponentNode, FormDocument } from '@formsmith/core'
import { prop } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'
import { htmlRendererKit } from '@formsmith/kit-html'
import { muiRendererKit } from '@formsmith/kit-mui'

/** The payload from the report, which emitted a second top-level rule. */
const INJECTION = 'red}html{display:none}.x{'

/**
 * A value that fetches. The rendering shape does not stop this one in either
 * kit — measured with request interception, the outbound request fires
 * identically from an inline attribute and from an emotion class — and on a
 * page collecting answers a fetch keyed off a field is exfiltration.
 */
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

const boxWith = (background: string): ComponentNode => ({
  key: 'target',
  type: 'Box',
  props: { padding: prop(2), background: prop(background), radius: prop(0) },
  children: [],
})

function formOf(kit: RendererKit, background: string): ReactElement {
  return (
    <FormRenderer
      document={documentOf(boxWith(background))}
      kit={kit}
      data={{}}
      revealHidden
      onChange={() => undefined}
    />
  )
}

/**
 * Top-level blocks in a stylesheet, as selector and body.
 *
 * A brace-depth walk rather than CSSOM, for the reason in the file comment: the
 * question is what text this kit put on the page, not what jsdom will parse.
 */
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

/** Every rule emotion emitted for this render, in document order. */
function emittedRules(background: string): { selector: string; body: string }[] {
  render(formOf(muiRendererKit, background))
  return Array.from(document.querySelectorAll('style')).flatMap((tag) =>
    rulesIn(tag.textContent ?? ''),
  )
}

/** The `style` attribute the server renderer wrote onto the Box. */
function serverStyleAttribute(kit: RendererKit, background: string): string {
  const markup = renderToStaticMarkup(formOf(kit, background))
  const at = markup.indexOf('data-fs-key="target"')
  expect(at, 'the Box did not render').toBeGreaterThanOrEqual(0)
  return /style="([^"]*)"/.exec(markup.slice(at))?.[1] ?? ''
}

describe('a document CSS value cannot author a rule', () => {
  beforeEach(() => {
    // Emotion caches by content hash across renders in one file, and a stale
    // tag from an earlier case would be counted as this case's output.
    for (const tag of Array.from(document.querySelectorAll('style'))) tag.remove()
  })

  describe('@formsmith/kit-mui', () => {
    it('emits one rule for a Box, not two', () => {
      const rules = emittedRules(INJECTION)
      expect(rules.map((rule) => rule.selector)).not.toContain('html')
      expect(rules).toHaveLength(1)
      expect(rules[0]?.selector).toMatch(/^\.css-/)
    })

    it('keeps a legitimate colour', () => {
      expect(
        emittedRules('#ff0000')
          .map((rule) => rule.body)
          .join(''),
      ).toContain('#ff0000')
    })

    it('refuses a value that fetches', () => {
      expect(
        emittedRules(EXFILTRATION)
          .map((rule) => rule.body)
          .join(''),
      ).not.toContain('evil.example')
    })
  })

  describe('@formsmith/kit-html', () => {
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

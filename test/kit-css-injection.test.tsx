/**
 * @vitest-environment jsdom
 */

/**
 * A document's style value cannot author a rule, in either kit.
 *
 * `background` on `Box` is the only string-typed style value either kit has,
 * and a document is data. That sentence is checked rather than remembered --
 * see the first test below, which reads it back off `kit.components`. The two kits reach the page by different routes, so
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
 *
 * Which is also why each kit is checked on one path rather than both. The other
 * path for `kit-html` is the client, where React writes the value through
 * `el.style` and jsdom's parser decides what survives -- the browser's decision,
 * not this kit's. The other path for MUI is the server, where the stylesheet
 * does not exist in the markup at all: emotion hands it to a host-side extractor
 * this suite does not run. Both would be assertions about somebody else's code.
 */

import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ComponentNode, FormDocument } from '@formsmith/core'
import { prop } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

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

/**
 * Every rule emotion emitted for this render, in document order.
 *
 * `padding` is per case and it is not decoration. Emotion caches by content
 * hash and will not re-insert a rule it believes is already on the page, and
 * `safeStyleValue` refuses both hostile backgrounds identically -- so the
 * sanitised `sx` for the injection case and the exfiltration case were the same
 * bytes, the second render inserted nothing, and `beforeEach` had already
 * removed the tag the first one left. The exfiltration assertion then read an
 * empty string and passed having seen no CSS at all, which is exactly the shape
 * of guard this file exists to catch.
 *
 * A different padding gives each case its own hash, so every case produces its
 * own rule and the assertions below can insist on finding one.
 */
function emittedRules(background: string, padding = 2): { selector: string; body: string }[] {
  render(formOf(muiRendererKit, background, padding))
  return Array.from(document.querySelectorAll('style')).flatMap((tag) =>
    rulesIn(tag.textContent ?? ''),
  )
}

/**
 * The `style` attribute the server renderer wrote onto the Box.
 *
 * With the floor its MUI sibling already had. Every assertion downstream is a
 * `not`, and `''` satisfies all of them: an attribute that never rendered, a
 * regex that stopped matching, a renamed key -- each of those would have turned
 * this whole describe green while reading nothing. So the read has to prove it
 * found something first, and `padding` is the declaration that is always there
 * and never the thing under test.
 */
function serverStyleAttribute(kit: RendererKit, background: string): string {
  const markup = renderToStaticMarkup(formOf(kit, background))
  const at = markup.indexOf('data-fs-key="target"')
  expect(at, 'the Box did not render').toBeGreaterThanOrEqual(0)
  const style = /style="([^"]*)"/.exec(markup.slice(at))?.[1] ?? ''
  expect(style, 'the Box rendered no style attribute to inspect').toContain('padding')
  return style
}

/**
 * Editors whose value a document cannot choose freely.
 *
 * `number` and `boolean` are not strings by the time they reach the page, and
 * `select` is a closed list the designer offers. What is left in a `style`
 * section is a free string that becomes CSS, and that is the sink this file is
 * about.
 */
const CONSTRAINED = new Set(['number', 'select', 'boolean'])

/** Every style prop in a kit whose value a document writes as it likes. */
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
  /**
   * The file's premise, read off the kits rather than remembered.
   *
   * Everything below tests one property on one component, on the strength of a
   * sentence at the top of this file saying that is the only one there is. A
   * sentence cannot notice a kit gaining a second. This can: add a `string` or
   * `color` prop in a `style` section and this fails, naming it, before the new
   * sink has been anywhere near a page.
   */
  it('has one free-text style value per kit, which is the one the rest of this file uses', () => {
    expect(freeStyleValues(muiKit), '@formsmith/kit-mui').toEqual(['Box.background'])
    expect(freeStyleValues(htmlKit), '@formsmith/kit-html').toEqual(['Box.background'])
  })

  beforeEach(() => {
    // Emotion caches by content hash across renders in one file, and a stale
    // tag from an earlier case would be counted as this case's output.
    for (const tag of Array.from(document.querySelectorAll('style'))) tag.remove()
  })

  describe('@formsmith/kit-mui', () => {
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

      // The floor its sibling above has and this one did not. Without it,
      // "sanitised" and "nothing was emitted" are the same green.
      expect(rules).toHaveLength(1)
      expect(rules[0]?.body).toContain('padding')
      expect(rules.map((rule) => rule.body).join('')).not.toContain('evil.example')
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

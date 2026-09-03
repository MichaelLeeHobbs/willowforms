/**
 * @vitest-environment jsdom
 */

/**
 * A refusal that has to read differently from the refusal before it.
 *
 * `FileUpload` drops files over `maxSize` and says so in a `role="alert"`. A
 * live region announces on mutation, so a second identical refusal renders the
 * same sentence and is read out zero times -- which looks exactly like the
 * picker having stopped working. The notice carries a zero-width space keyed to
 * a counter so the string changes even when the count does not.
 *
 * That counter shipped with no test at all, and the first reader of it found
 * the bug: it counted every choice rather than every refusal, so a clean
 * selection between two identical refusals moved the parity twice and handed
 * the second refusal the first one's exact string.
 *
 * The kit-wide half of this component's contract lives in
 * `test/kit-contract.test.tsx`. This file is here for the parts only this kit
 * has: `kit-html` draws the notice as its own element, and `kit-mui` folds the
 * same sentence into a `TextField`'s helper text.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ComponentNode, FormDocument } from '@formsmith/core'
import { prop } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'

import { htmlRendererKit } from './renderers.js'

function documentOf(root: ComponentNode): FormDocument {
  return {
    version: '1',
    id: 'upload',
    name: 'Upload',
    root,
    actions: {},
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  }
}

/** One kilobyte is the limit, so a two-kilobyte file is refused and a byte is not. */
const upload: ComponentNode = {
  key: 'attachment',
  type: 'FileUpload',
  props: { label: prop('Attachment'), maxSize: prop(1) },
  children: [],
}

const fileOf = (name: string, bytes: number): File =>
  new File(['x'.repeat(bytes)], name, { type: 'text/plain' })

const tooBig = (name: string): File => fileOf(name, 2048)
const smallEnough = (name: string): File => fileOf(name, 8)

describe('the FileUpload refusal notice', () => {
  /**
   * Renders the field and hands back the two things the test needs: a way to
   * choose files, and the notice's text at this moment.
   */
  function field(): { choose: (files: File[]) => void; notice: () => string | null } {
    const { container } = render(
      <FormRenderer
        document={documentOf(upload)}
        kit={htmlRendererKit}
        data={{}}
        revealHidden
        onChange={() => undefined}
      />,
    )

    const input = container.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('the file input did not render')

    return {
      choose: (files) => {
        fireEvent.change(input, { target: { files } })
      },
      // The refusal element only, not the helper line and not the held-files
      // line, both of which sit in the same field and would make an assertion
      // about "the text on screen" pass for the wrong reason.
      notice: () => container.querySelector('[id$="-refused"]')?.textContent ?? null,
    }
  }

  it('says which refusal happened, and says nothing when nothing was refused', () => {
    const { choose, notice } = field()

    expect(notice(), 'a notice before anything was chosen').toBeNull()

    choose([tooBig('big.txt')])
    expect(notice()).toContain('One file was too large')

    choose([tooBig('a.txt'), tooBig('b.txt')])
    expect(notice()).toContain('2 files were too large')

    choose([smallEnough('ok.txt')])
    expect(notice(), 'a refusal notice after a choice that refused nothing').toBeNull()
  })

  it('reads differently on a repeat of the same refusal', () => {
    const { choose, notice } = field()

    choose([tooBig('big.txt')])
    const first = notice()

    choose([tooBig('big.txt')])
    const second = notice()

    expect(first).not.toBeNull()
    expect(second).not.toBe(first)
  })

  /**
   * The case the counter got wrong. Counting choices rather than refusals put
   * the clean selection's increment between these two, which returned the
   * parity to where it started and made both strings identical.
   */
  it('reads differently on a repeat separated by a choice that was accepted', () => {
    const { choose, notice } = field()

    choose([tooBig('big.txt')])
    const first = notice()

    choose([smallEnough('ok.txt')])
    expect(notice(), 'the clean choice left a refusal on screen').toBeNull()

    choose([tooBig('big.txt')])
    const second = notice()

    expect(first).not.toBeNull()
    expect(second).not.toBe(first)
  })
})

/**
 * Every class this kit renders, against the stylesheet that has to style it.
 *
 * `FileUploadNode` drew its two notices as `fsh-field__hint` and
 * `fsh-field__error`, and neither name existed in `kit-html.css`. So the one
 * message the component writes when it silently drops a file rendered at body
 * size in body colour, carrying the user agent's `1em` block margins inside a
 * container whose gap is 4px. It read as prose, not as an error, and nothing
 * failed: a class nobody declares is not a syntax error in either file.
 *
 * The other direction, a declared class nobody renders, is dead style rather
 * than a broken control, so it is not checked here.
 */
describe('the classes this kit renders', () => {
  const read = (name: string): string =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

  const source = read('./renderers.tsx')

  /*
   * Comments stripped before anything is read out of the stylesheet.
   *
   * `declared` is a scan for `.fsh-…`, and a comment explaining a rule names
   * the class it explains -- the forced-colours block below mentions
   * `.fsh-progress` in its own prose. Counting those would mean a class could
   * satisfy this guard by being *described* rather than styled, which is the
   * failure mode the guard exists to catch, one level up. The same strip is
   * what `designer.css.test.ts` does for the same reason.
   */
  const css = read('./kit-html.css').replace(/\/\*[\s\S]*?\*\//g, '')

  const declared = new Set([...css.matchAll(/\.(fsh-[a-z0-9_-]+)/g)].map((m) => m[1] as string))
  const emitted = [...new Set([...source.matchAll(/fsh-[a-z0-9_-]+/g)].map((m) => m[0]))]

  /*
   * A name ending in `--` is a prefix the renderer completes at runtime, as in
   * `'fsh-text fsh-text--' + variant`. The value comes from a document, so the
   * full name is not in the source to compare. What is checkable is that the
   * family exists at all: a prefix with no modifier declared anywhere means
   * every variant of that component is unstyled.
   */
  const prefixes = emitted.filter((name) => name.endsWith('--'))
  const complete = emitted.filter((name) => !name.endsWith('--'))

  it('found classes on both sides to compare', () => {
    // Neither list may go empty and report a clean sweep of nothing.
    expect(complete.length, 'no classes found in the renderer').toBeGreaterThan(0)
    expect(declared.size, 'no classes found in the stylesheet').toBeGreaterThan(0)
    expect(prefixes.length, 'no modifier prefixes found in the renderer').toBeGreaterThan(0)
  })

  it('declares every complete class name the renderer emits', () => {
    expect(
      complete.filter((name) => !declared.has(name)),
      'the renderer emits a class this stylesheet never styles',
    ).toEqual([])
  })

  it('declares at least one modifier for every prefix the renderer builds', () => {
    const orphans = prefixes.filter(
      (prefix) => ![...declared].some((name) => name.startsWith(prefix) && name !== prefix),
    )

    expect(orphans, 'the renderer builds modifier names from a family with no rules').toEqual([])
  })
})

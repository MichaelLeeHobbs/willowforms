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

import { describe, expect, it } from 'vitest'
import { createDocument, instantiate, loadDocument } from '@willowforms/core'
import type { Kit } from '@willowforms/core'
import { htmlKit } from '@willowforms/kit-html'
import { muiKit } from '@willowforms/kit-mui'

/**
 * A form the designer can build must load again through JSON import and draft
 * restore, which both go through `loadDocument`.
 */
describe.each([htmlKit, muiKit] as Kit[])('a large $id form', (kit) => {
  it('loads after a JSON round trip', () => {
    const definition = kit.components.find((def) => def.type === 'TextField')
    if (!definition) throw new Error('Missing TextField in ' + kit.id)

    const document = createDocument('Large', 'large')
    const children = (document.root.children ??= [])
    for (let index = 0; index < 2_000; index++) {
      const node = instantiate(definition, document.root)
      if (!node) throw new Error('Could not create TextField')
      children.push(node)
    }

    const result = loadDocument(JSON.parse(JSON.stringify(document)))

    expect(result.ok ? [] : result.errors).toEqual([])
    expect(result.ok && result.document.root.children).toHaveLength(2_000)
  })
})

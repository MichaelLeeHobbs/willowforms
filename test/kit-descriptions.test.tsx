/** @vitest-environment jsdom */

import { render, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { expect, it } from 'vitest'
import { createDocument, instantiate } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

for (const [kit, renderer] of [
  [htmlKit, htmlRendererKit],
  [muiKit, muiRendererKit],
] as const) {
  it(kit.id + ' keeps translated repeater help and errors scoped to each form', () => {
    const document = createDocument('Household', 'household')
    const definition = kit.components.find((def) => def.type === 'Repeater')
    if (!definition) throw new Error('Missing Repeater')
    const repeat = instantiate(definition, document.root)
    if (!repeat) throw new Error('Could not create Repeater')
    repeat.key = 'householdList'
    repeat.dataKey = 'people'
    repeat.props['label'] = { kind: 'i18n', key: 'people_label' }
    repeat.props['helperText'] = { kind: 'i18n', key: 'people_help' }
    document.root.children = [repeat]
    document.languages.push({ code: 'fr', dialect: 'CA', name: 'Français canadien', bidi: 'ltr' })
    document.translations['fr-CA'] = {
      people_label: 'Personnes',
      people_help: 'Ajoutez les membres de votre foyer',
    }
    const draw = (invalid: boolean): ReactElement => (
      <>
        {[false, invalid].map((hasError, index) => (
          <section key={index} aria-label={'Form ' + String(index + 1)}>
            <FormRenderer
              document={document}
              kit={renderer}
              language="fr-CA"
              data={{ people: [] }}
              errors={hasError ? { householdList: 'Ajoutez une personne' } : {}}
              onChange={() => undefined}
            />
          </section>
        ))}
      </>
    )
    const { container, rerender } = render(draw(true))
    const forms = within(container).getAllByRole('region')
    const descriptions = forms.map((form) => {
      const group = within(form).getByRole('group', { name: 'Personnes' })
      const id = group.getAttribute('aria-describedby')
      const message = Array.from(form.querySelectorAll('[id]')).find((node) => node.id === id)
      if (!message) throw new Error('Description does not belong to this form')
      return message
    })
    expect(descriptions[0]?.textContent).toBe('Ajoutez les membres de votre foyer')
    expect(descriptions[1]?.textContent).toBe('Ajoutez une personne')
    expect(within(forms[1]!).getByRole('alert')).toBe(descriptions[1])
    const ids = Array.from(container.querySelectorAll('[id]'), (node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    rerender(draw(false))
    expect(descriptions[1]?.textContent).toBe('Ajoutez les membres de votre foyer')
    expect(within(container).queryByRole('alert')).toBeNull()
    expect(definition.props.find((schema) => schema.name === 'helperText')?.localizable).toBe(true)
  })
}

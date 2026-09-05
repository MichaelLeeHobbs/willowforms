/** @vitest-environment jsdom */

import { render, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createDocument, instantiate, prop, validateForm } from '@formsmith/core'
import type { ComponentNode, FormData } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

for (const [kit, renderer] of [
  [htmlKit, htmlRendererKit],
  [muiKit, muiRendererKit],
] as const) {
  describe(kit.id + ' conditional required state', () => {
    it.each(
      kit.components.filter(
        (def) => def.dataBound && (!def.container || def.type === 'RadioGroup'),
      ),
    )('$type follows its row condition and clears the required state on recovery', (def) => {
      const document = createDocument('Required fields', 'required')
      const field = instantiate(def, document.root)
      if (!field) throw new Error('Could not instantiate ' + def.type)
      field.key = 'question'
      field.dataKey = 'answer'
      field.props['label'] = { kind: 'i18n', key: 'question_label' }
      field.props['helperText'] = { kind: 'i18n', key: 'question_help' }
      field.schema = {
        type: def.dataType ?? 'string',
        validations: [
          {
            key: 'required',
            message: 'Réponse obligatoire',
            when: {
              kind: 'condition',
              condition: {
                op: 'truthy',
                value: { kind: 'ref', dataKey: 'needed', scope: 'row' },
              },
            },
          },
        ],
      }
      const repeat: ComponentNode = {
        key: 'questions',
        type: 'Repeater',
        dataKey: 'records',
        props: { label: prop('Questions') },
        schema: { type: 'array' },
        children: [field],
      }
      document.root.children = [repeat]
      document.translations['en-US'] = {
        question_label: 'Votre réponse',
        question_help: 'Instructions pour répondre',
      }
      const draw = (data: FormData): ReactElement => (
        <FormRenderer
          document={document}
          kit={renderer}
          data={data}
          errors={validateForm(document.root, data)}
          onChange={() => undefined}
        />
      )
      const { container, rerender } = render(
        draw({ needed: false, records: [{ needed: true }, { needed: false }] }),
      )
      const fieldAt = (index: number): HTMLElement => {
        const element = container.querySelector<HTMLElement>(
          `[data-fs-key="question"][data-fs-row="records[${index}]"]`,
        )
        if (!element) throw new Error('Missing question in row ' + String(index))
        return element
      }
      const controlAt = (index: number): HTMLElement => {
        const field = fieldAt(index)
        if (field.getAttribute('role') === 'radiogroup') {
          return within(container).getAllByRole('radiogroup', { name: 'Votre réponse' })[index]!
        }
        const query = within(field)
        return def.type === 'RadioGroup'
          ? query.getByRole('radiogroup', { name: 'Votre réponse' })
          : def.type === 'Select'
            ? query.getByRole('combobox', { name: 'Votre réponse' })
            : query.getByLabelText('Votre réponse')
      }
      expect(controlAt(0).getAttribute('aria-required')).toBe('true')
      expect(controlAt(0).getAttribute('aria-invalid')).toBe('true')
      expect(within(fieldAt(0)).getByRole('alert').textContent).toBe('Réponse obligatoire')
      expect(controlAt(1).getAttribute('aria-required')).not.toBe('true')
      const description = controlAt(1).getAttribute('aria-describedby')
      expect(description).toBeTruthy()
      expect(container.ownerDocument.getElementById(description ?? '')?.textContent).toBe(
        'Instructions pour répondre',
      )

      rerender(draw({ needed: true, records: [{ needed: false }, { needed: true }] }))
      expect(controlAt(0).getAttribute('aria-required')).not.toBe('true')
      expect(controlAt(0).getAttribute('aria-invalid')).not.toBe('true')
      expect(within(fieldAt(0)).queryByRole('alert')).toBeNull()
      expect(controlAt(1).getAttribute('aria-required')).toBe('true')
    })
  })
}

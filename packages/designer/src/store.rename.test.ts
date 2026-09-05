// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createDocument, findNode, validateForm } from '@formsmith/core'
import type { ComponentNode, PropValue } from '@formsmith/core'
import { useDesigner } from './store.js'

function reference(dataKey: string, scope: 'form' | 'row' = 'form'): PropValue {
  return {
    kind: 'condition',
    condition: { op: 'notEmpty', value: { kind: 'ref', dataKey, scope } },
  }
}

const field = (key: string, dataKey?: string): ComponentNode => ({
  key,
  type: 'TextField',
  props: {},
  ...(dataKey ? { dataKey } : {}),
  schema: { type: 'string', validations: [] },
})

describe('renaming answer references', () => {
  it('updates property conditions, rule guards, and cross-field rules together', () => {
    const doc = createDocument('Confirm email', 'rename')
    doc.root.children = [
      field('email'),
      {
        ...field('confirmation'),
        props: { disabled: reference('email') },
        schema: {
          type: 'string',
          validations: [
            { key: 'required', when: reference('email') },
            { key: 'matches', field: 'email' },
          ],
        },
      },
    ]
    const { result } = renderHook(() => useDesigner(doc))
    act(() => {
      result.current.renameKey('email', 'contactEmail')
    })
    const root = result.current.document.root
    expect(findNode(root, 'confirmation')?.props['disabled']).toEqual(reference('contactEmail'))
    expect(validateForm(root, { contactEmail: 'same', confirmation: 'same' })).toEqual({})
    expect(validateForm(root, { contactEmail: 'same' })).toHaveProperty('confirmation')
    act(() => {
      result.current.undo()
    })
    expect(result.current.document).toEqual(doc)
  })

  it('keeps form and row references separate when both scopes use the same answer name', () => {
    const doc = createDocument('Scoped answers', 'scopes')
    doc.root.children = [
      field('email'),
      {
        key: 'people',
        dataKey: 'contacts',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [
          field('rowEmail', 'email'),
          {
            ...field('confirmation'),
            props: { formCondition: reference('email'), rowCondition: reference('email', 'row') },
            renderWhen: reference('email', 'row'),
            schema: {
              type: 'string',
              validations: [{ key: 'matches', field: 'email', scope: 'row' }],
            },
          },
        ],
      },
    ]
    const { result } = renderHook(() => useDesigner(doc))
    act(() => {
      result.current.renameKey('email', 'contactEmail')
    })
    const confirmation = findNode(result.current.document.root, 'confirmation')
    expect(confirmation?.props['formCondition']).toEqual(reference('contactEmail'))
    expect(confirmation?.props['rowCondition']).toEqual(reference('email', 'row'))
    expect(confirmation?.renderWhen).toEqual(reference('email', 'row'))
    expect(confirmation?.schema?.validations).toEqual([
      { key: 'matches', field: 'email', scope: 'row' },
    ])
  })

  it('updates references in the renamed field’s row without changing other repeaters', () => {
    const doc = createDocument('Two lists', 'rows')
    doc.root.children = ['first', 'second'].map((key, index) => ({
      key,
      type: 'Repeater',
      props: {},
      schema: { type: 'array', validations: [] },
      children: [
        field(index === 0 ? 'email' : 'otherEmail', index === 0 ? undefined : 'email'),
        {
          ...field(`${key}Confirmation`),
          renderWhen: reference('email', 'row'),
          schema: {
            type: 'string',
            validations: [{ key: 'matches', field: 'email', scope: 'row' }],
          },
        },
      ],
    }))
    const { result } = renderHook(() => useDesigner(doc))
    act(() => {
      result.current.renameKey('email', 'contactEmail')
    })
    expect(findNode(result.current.document.root, 'firstConfirmation')?.renderWhen).toEqual(
      reference('contactEmail', 'row'),
    )
    expect(findNode(result.current.document.root, 'secondConfirmation')?.renderWhen).toEqual(
      reference('email', 'row'),
    )
    expect(
      validateForm(result.current.document.root, {
        first: [{ contactEmail: 'same', firstConfirmation: 'same' }],
        second: [{ email: 'other', secondConfirmation: 'other' }],
      }),
    ).toEqual({})
  })
})

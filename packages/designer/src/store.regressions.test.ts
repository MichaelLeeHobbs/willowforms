/**
 * @vitest-environment jsdom
 */

/**
 * Regressions from the first adversarial review.
 *
 * Every case here is a bug that shipped: each one is written from the reproducer
 * that found it, not from the fix, so it fails against the previous version.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ComponentDef, FormDocument, Language } from '@formsmith/core'
import { validateDocument } from '@formsmith/core'

import { useDesigner } from './store.js'

const field: ComponentDef = {
  type: 'Field',
  label: 'Field',
  group: 'inputs',
  dataBound: true,
  dataType: 'string',
  defaultProps: {},
  props: [],
  events: [],
}

function doc(
  languages: Language[] = [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
): FormDocument {
  return {
    version: '1',
    id: 'd',
    name: 'Doc',
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'email', type: 'Field', props: {} },
        { key: 'phone', type: 'Field', props: {} },
        {
          key: 'group',
          type: 'Stack',
          props: {},
          children: [{ key: 'inner', type: 'Field', props: {} }],
        },
      ],
    },
    actions: {},
    languages,
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  }
}

const rootKeys = (d: FormDocument): string[] => (d.root.children ?? []).map((c) => c.key)

describe('undo coalescing', () => {
  it('folds a run of edits to one property into a single entry', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    for (const value of ['E', 'Em', 'Ema', 'Emai', 'Email']) {
      act(() => {
        result.current.setProp('email', 'label', { kind: 'static', value })
      })
    }
    expect(result.current.document.root.children?.[0]?.props['label']).toEqual({
      kind: 'static',
      value: 'Email',
    })

    act(() => {
      result.current.undo()
    })

    // One undo, not five. Per-keystroke entries also pushed the real edits out
    // of a hundred-deep stack.
    expect(result.current.document.root.children?.[0]?.props['label']).toBeUndefined()
  })

  it('starts a new entry for a different property', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'A' })
    })
    act(() => {
      result.current.setProp('email', 'placeholder', { kind: 'static', value: 'B' })
    })
    act(() => {
      result.current.undo()
    })

    expect(result.current.document.root.children?.[0]?.props['placeholder']).toBeUndefined()
    expect(result.current.document.root.children?.[0]?.props['label']).toEqual({
      kind: 'static',
      value: 'A',
    })
  })

  it('starts a new entry for the same property on a different component', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'A' })
    })
    act(() => {
      result.current.setProp('phone', 'label', { kind: 'static', value: 'B' })
    })
    act(() => {
      result.current.undo()
    })

    expect(result.current.document.root.children?.[1]?.props['label']).toBeUndefined()
    expect(result.current.document.root.children?.[0]?.props['label']).toBeDefined()
  })

  it('does not fold an edit into a version restored by undo', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'A' })
    })
    act(() => {
      result.current.undo()
    })
    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'B' })
    })
    act(() => {
      result.current.undo()
    })

    expect(result.current.document.root.children?.[0]?.props['label']).toBeUndefined()
  })
})

describe('renameKey', () => {
  it('refuses a collision without moving the selection', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    act(() => {
      result.current.select('email')
    })

    let outcome: ReturnType<typeof result.current.renameKey> | undefined
    act(() => {
      outcome = result.current.renameKey('email', 'phone')
    })

    expect(outcome).toEqual({ ok: false, reason: 'phone is already used by another component.' })
    expect(rootKeys(result.current.document)).toEqual(['email', 'phone', 'group'])
    // The selection used to jump to the component that already owned the name,
    // so the panel silently began editing a different node.
    expect(result.current.selectedKey).toBe('email')
  })

  it('refuses an empty key with a reason', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    let outcome: ReturnType<typeof result.current.renameKey> | undefined
    act(() => {
      outcome = result.current.renameKey('email', '   ')
    })
    expect(outcome).toEqual({ ok: false, reason: 'A component key cannot be empty.' })
  })

  it('pushes no history entry for a refused rename', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    act(() => {
      result.current.renameKey('email', 'phone')
    })
    expect(result.current.canUndo).toBe(false)
  })

  it('renames and follows the selection when the key is free', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    act(() => {
      result.current.select('email')
    })
    act(() => {
      expect(result.current.renameKey('email', 'contact')).toEqual({ ok: true })
    })
    expect(rootKeys(result.current.document)).toEqual(['contact', 'phone', 'group'])
    expect(result.current.selectedKey).toBe('contact')
  })
})

describe('refused moves', () => {
  it('does not grow the undo stack when a move is illegal', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    // A container cannot be dropped inside its own child.
    act(() => {
      result.current.moveComponent('group', 'inner')
    })

    expect(rootKeys(result.current.document)).toEqual(['email', 'phone', 'group'])
    // The stack used to grow with a state identical to the present, so the next
    // undo visibly did nothing.
    expect(result.current.canUndo).toBe(false)
  })

  it('does not grow the undo stack when removing a key that is not there', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    act(() => {
      result.current.removeComponent('ghost')
    })
    expect(result.current.canUndo).toBe(false)
  })
})

describe('language identity', () => {
  it('keeps the default language when another is added', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setLanguages([
        ...result.current.document.languages,
        { code: 'fr', name: 'French', bidi: 'ltr' },
      ])
    })

    // Comparing the tag `en-US` against the bare code `en` decided the default
    // was missing and silently rewrote it.
    expect(result.current.document.defaultLanguage).toBe('en-US')
  })

  it('leaves a document that still validates against its own rules', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    act(() => {
      result.current.setLanguages([
        ...result.current.document.languages,
        { code: 'fr', name: 'French', bidi: 'ltr' },
      ])
    })
    expect(validateDocument(result.current.document)).toEqual([])
  })

  it('moves the default only when the language it names is removed', () => {
    const { result } = renderHook(() =>
      useDesigner(
        doc([
          { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
          { code: 'fr', name: 'French', bidi: 'ltr' },
        ]),
      ),
    )

    act(() => {
      result.current.setLanguages([{ code: 'fr', name: 'French', bidi: 'ltr' }])
    })

    expect(result.current.document.defaultLanguage).toBe('fr')
  })
})

describe('adding a component', () => {
  it('selects the component it added', async () => {
    const { result } = renderHook(() => useDesigner(doc()))

    await act(async () => {
      result.current.addComponent(field, 'root')
      await Promise.resolve()
    })

    expect(result.current.selectedKey).toBeDefined()
    expect(result.current.selectedNode?.type).toBe('Field')
  })
})

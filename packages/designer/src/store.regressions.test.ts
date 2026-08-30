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

  it('refuses a key the grammar does not allow, with the reason', () => {
    /*
     * The same rule `validateDocument` applies to a pasted document, so the
     * panel cannot create a key a paste would be told off for. A hyphen is the
     * one an author will actually try, and it is refused because a `computed`
     * expression is JavaScript, where `first-name` is a subtraction.
     */
    const { result } = renderHook(() => useDesigner(doc()))
    let outcome: ReturnType<typeof result.current.renameKey> | undefined
    act(() => {
      outcome = result.current.renameKey('email', 'first-name')
    })

    expect(outcome?.ok).toBe(false)
    expect(outcome?.ok === false && outcome.reason).toContain('subtraction')
    // Refused means unchanged, not silently renamed to something legal.
    expect(result.current.document.root.children?.some((c) => c.key === 'email')).toBe(true)
  })

  it('refuses __proto__, which passes the grammar and still must not be used', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    let outcome: ReturnType<typeof result.current.renameKey> | undefined
    act(() => {
      outcome = result.current.renameKey('email', '__proto__')
    })

    expect(outcome?.ok).toBe(false)
  })

  it('refuses an empty key with a reason', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    let outcome: ReturnType<typeof result.current.renameKey> | undefined
    act(() => {
      outcome = result.current.renameKey('email', '   ')
    })
    expect(outcome).toEqual({ ok: false, reason: 'A key cannot be empty.' })
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

/**
 * Adding a component to something that cannot hold one.
 *
 * `insertNode` gives `children` to any node it is pointed at, so nesting a
 * component inside a leaf produces a subtree no renderer draws — while
 * `validateForm` and `toJsonSchema` still walk it, so it contributes a required
 * field nobody can fill in. Every other insertion path checks: `dnd.ts` refuses
 * a non-container drop target and `keyboard.ts` refuses to move right into one.
 * The palette's own click did not.
 *
 * Whether a node can hold children is asked of the node, not of a kit. A
 * container is instantiated with `children: []` and a leaf is not, which is the
 * same "recognise it from the node" rule `isRowScope` follows — and it means the
 * store needs no kit to answer.
 */
describe('where an added component lands', () => {
  it('goes into the selected container', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.addComponent(field, 'group')
    })

    const group = result.current.document.root.children?.[2]
    expect(group?.children?.map((c) => c.key)).toEqual(['inner', 'field'])
  })

  it('goes beside a leaf rather than inside it', () => {
    /*
     * Not refused, which would be a dead control — clicking a palette entry and
     * having nothing happen is the failure this project treats as worst. The
     * nearest ancestor that can hold children is what the author meant.
     */
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.addComponent(field, 'inner')
    })

    const group = result.current.document.root.children?.[2]
    expect(group?.children?.map((c) => c.key)).toEqual(['inner', 'field'])
    // And not inside the leaf, which is the shape that renders as nothing.
    expect(group?.children?.[0]?.children).toBeUndefined()
  })

  it('falls back to the root when the selection is not in the document', () => {
    // Undo restores the document and not the selection, so `selectedKey` naming
    // a node that no longer exists is an ordinary state rather than a rare one.
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.addComponent(field, 'gone')
    })

    expect(rootKeys(result.current.document)).toEqual(['email', 'phone', 'group', 'field'])
  })

  it('selects what it added, and only after it is in the document', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.addComponent(field, 'group')
    })

    expect(result.current.selectedKey).toBe('field')
    expect(result.current.selectedNode?.key).toBe('field')
  })
})

/**
 * A translation written into a document that has no bundles.
 *
 * `doc.translations[language]` was read before the `?? {}` that was supposed to
 * defend it, so a pasted document missing the key threw — inside a React state
 * updater, which takes the designer and its whole undo history down with it.
 * `validateDocument` refuses such a document now; the panel is still where
 * somebody goes to repair one, so it is the last place that can afford to fall
 * over on it.
 */
describe('writing a translation', () => {
  const withoutBundles = (): FormDocument => {
    const base = doc()
    return { ...base, translations: undefined as unknown as FormDocument['translations'] }
  }

  it('survives a document with no translations at all', () => {
    const { result } = renderHook(() => useDesigner(withoutBundles()))

    act(() => {
      result.current.setTranslation('fr', 'greeting', 'Bonjour')
    })

    expect(result.current.document.translations).toEqual({ fr: { greeting: 'Bonjour' } })
  })

  it('survives a language whose bundle is not an object', () => {
    const base = doc()
    const broken = {
      ...base,
      translations: { fr: 'nope' } as unknown as FormDocument['translations'],
    }
    const { result } = renderHook(() => useDesigner(broken))

    act(() => {
      result.current.setTranslation('fr', 'greeting', 'Bonjour')
    })

    expect(result.current.document.translations['fr']).toEqual({ greeting: 'Bonjour' })
  })

  it('still writes into the bundle that is there', () => {
    // The control. Replacing the bundle unconditionally would pass both tests
    // above and quietly discard every translation already written.
    const base = doc()
    const { result } = renderHook(() =>
      useDesigner({ ...base, translations: { fr: { existing: 'Salut' } } }),
    )

    act(() => {
      result.current.setTranslation('fr', 'greeting', 'Bonjour')
    })

    expect(result.current.document.translations['fr']).toEqual({
      existing: 'Salut',
      greeting: 'Bonjour',
    })
  })
})

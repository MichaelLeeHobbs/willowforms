/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentDef, FormDocument, Language } from '@willowforms/core'
import {
  collectKeys as collect,
  emptyRoot,
  findNode,
  prop,
  validateDocument,
} from '@willowforms/core'

import { historyOps, useDesigner } from './store.js'

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
    expect(result.current.selectedKey).toBe('email')
  })

  it('refuses a key the grammar does not allow, with the reason', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    let outcome: ReturnType<typeof result.current.renameKey> | undefined
    act(() => {
      outcome = result.current.renameKey('email', 'first-name')
    })

    expect(outcome?.ok).toBe(false)
    expect(outcome?.ok === false && outcome.reason).toContain('subtraction')
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

    // The default is the tag `en-US` while the list holds the bare code `en`.
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

  it('makes the language the caller names the default', () => {
    const languages: Language[] = [
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ]
    const { result } = renderHook(() => useDesigner(doc(languages)))

    act(() => {
      result.current.setLanguages(languages, 'fr')
    })

    expect(result.current.document.defaultLanguage).toBe('fr')
    expect(validateDocument(result.current.document)).toEqual([])
  })

  it('refuses a default the list does not offer, rather than storing it', () => {
    // A default outside the language list fails `validateDocument`.
    const languages: Language[] = [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }]
    const { result } = renderHook(() => useDesigner(doc(languages)))

    act(() => {
      result.current.setLanguages(languages, 'de')
    })

    expect(result.current.document.defaultLanguage).toBe('en-US')
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
    // Not refused: a palette click that does nothing is a dead control.
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.addComponent(field, 'inner')
    })

    const group = result.current.document.root.children?.[2]
    expect(group?.children?.map((c) => c.key)).toEqual(['inner', 'field'])
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
 * `validateDocument` refuses these documents, but a host's document skips that
 * gate and the designer is where it gets repaired.
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

describe('the store and edits that changed nothing', () => {
  it('takes no undo slot for a property set to what it already was', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'Email' })
    })
    const after = result.current.document

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'Email' })
    })

    expect(result.current.document).toBe(after)
  })

  it('never gives two duplicates the same key, however they are batched', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.duplicateComponent('email')
      result.current.duplicateComponent('email')
    })

    const keys = collect(result.current.document.root)
    expect(new Set(keys).size, 'two components share a key: ' + keys.join(', ')).toBe(keys.length)
    expect(validateDocument(result.current.document)).toEqual([])
  })

  it('still duplicates twice when the two are a tick apart', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.duplicateComponent('email')
    })
    act(() => {
      result.current.duplicateComponent('email')
    })

    const keys = collect(result.current.document.root)
    expect(keys.filter((key) => key.startsWith('email'))).toHaveLength(3)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('still records an edit that changes something', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'Email' })
    })
    const after = result.current.document

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'Address' })
    })

    expect(result.current.document).not.toBe(after)
  })

  it('does not leave the selection on a node an undo removed', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.addComponent(field, 'root')
    })
    const added = result.current.selectedKey

    act(() => {
      result.current.undo()
    })

    expect(added).toBeDefined()
    expect(result.current.selectedKey).not.toBe(added)
    expect(result.current.selectedNode).toBeUndefined()
  })

  it('clears the selection when a container holding it is removed', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.select('inner')
    })
    act(() => {
      result.current.removeComponent('group')
    })

    expect(result.current.selectedKey).toBeUndefined()
  })

  it('refuses to rename a key that is not in the document', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    const before = result.current.document

    let outcome: { ok: boolean } | undefined
    act(() => {
      outcome = result.current.renameKey('nowhere', 'somewhere')
    })

    expect(outcome?.ok).toBe(false)
    expect(result.current.document).toBe(before)
    expect(result.current.selectedKey).not.toBe('somewhere')
  })

  it('re-points a condition that named the key being renamed', () => {
    // A Step's default condition compares `context.step` with its own key.
    const stepped: FormDocument = {
      ...doc(),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'step1',
            type: 'Stack',
            props: {},
            children: [],
            renderWhen: {
              kind: 'condition',
              condition: {
                op: 'eq',
                left: { kind: 'context', path: 'step' },
                right: { kind: 'literal', value: 'step1' },
              },
            },
          },
        ],
      },
    }

    const { result } = renderHook(() => useDesigner(stepped))
    act(() => {
      result.current.renameKey('step1', 'details')
    })

    const when = result.current.document.root.children?.[0]?.renderWhen
    const right =
      when?.kind === 'condition' && 'right' in when.condition ? when.condition.right : undefined
    expect(right).toEqual({ kind: 'literal', value: 'details' })
  })

  it('hands back the same api object when nothing has changed', () => {
    const { result, rerender } = renderHook(() => useDesigner(doc()))
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('hands back a different one when the document changes', () => {
    const { result } = renderHook(() => useDesigner(doc()))
    const first = result.current

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'Changed' })
    })

    expect(result.current).not.toBe(first)
  })

  it('says so when a host hands it a document that does not validate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const duplicated: FormDocument = {
      ...doc(),
      root: {
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          { key: 'same', type: 'Field', props: {} },
          { key: 'same', type: 'Field', props: {} },
        ],
      },
    }

    renderHook(() => useDesigner(duplicated))

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0])).toContain('same')
    warn.mockRestore()
  })

  it('says nothing about a document that is fine', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderHook(() => useDesigner(doc()))

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

const propOf = (document: FormDocument, key: string): unknown => {
  const held = findNode(document.root, key)?.props['label']
  if (held !== null && typeof held === 'object' && 'kind' in held) {
    return (held as { kind: string; value?: unknown }).kind === 'static'
      ? (held as { value?: unknown }).value
      : (held as { kind: string }).kind
  }
  return held
}

describe('an undo label that folded two different gestures into one slot', () => {
  /*
   * `Properties.tsx` sends typing, clearing and binding-mode changes through one
   * `onChange`, so the undo label must tell them apart or one undo takes both.
   */
  it('keeps the typed value when the binding mode changes right after', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', prop('Email address'))
    })
    act(() => {
      result.current.setProp('email', 'label', { kind: 'computed', expression: '' })
    })
    act(() => {
      result.current.undo()
    })

    expect(
      propOf(result.current.document, 'email'),
      'the typed value was destroyed rather than stacked on',
    ).toBe('Email address')
  })

  it('keeps the typed value when the property is cleared right after', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', prop('Email address'))
    })
    act(() => {
      result.current.setProp('email', 'label', undefined)
    })
    act(() => {
      result.current.undo()
    })

    expect(propOf(result.current.document, 'email')).toBe('Email address')
  })

  it('still folds a run of typing into one step', () => {
    // Putting the value in the label would make every keystroke its own undo entry.
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', prop('E'))
    })
    act(() => {
      result.current.setProp('email', 'label', prop('Em'))
    })
    act(() => {
      result.current.setProp('email', 'label', prop('Ema'))
    })
    act(() => {
      result.current.undo()
    })

    // The fixture's `email` has no label, so one undo of the whole run lands on undefined.
    expect(propOf(result.current.document, 'email')).toBeUndefined()
  })

  it('keeps a raw CSS block when the box is cleared right after typing', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setNodeCss('email', 'any', 'color:red')
    })
    act(() => {
      result.current.setNodeCss('email', 'any', '')
    })
    act(() => {
      result.current.undo()
    })

    const node = findNode(result.current.document.root, 'email')
    expect(node?.css?.['any']).toBe('color:red')
  })
})

describe('invariant 4 on the half of the history a caller can see', () => {
  it('undo and redo leave the arrays they read alone', () => {
    // On `historyOps`, not the hook: `useDesigner` never exposes the history, so
    // a mutating `undo` looks identical through it.
    const first = doc()
    const second = { ...first, name: 'second' }
    const third = { ...first, name: 'third' }

    const history = { past: [first], present: second, future: [third] }
    const past = history.past
    const future = history.future

    const stepped = historyOps.undo(history)

    // New arrays, not the ones handed in: a `History` React already rendered
    // from must not change underneath it.
    expect(stepped.past).not.toBe(past)
    expect(stepped.future).not.toBe(future)
    expect(past).toEqual([first])
    expect(future).toEqual([third])
    // The step itself happened, or the assertions above are about a no-op.
    expect(stepped.present).toBe(first)
    expect(stepped.future).toEqual([second, third])

    const back = historyOps.redo(stepped)

    expect(back.past).not.toBe(stepped.past)
    expect(back.future).not.toBe(stepped.future)
    expect(stepped.past).toEqual([])
    expect(stepped.future).toEqual([second, third])
    expect(back.present).toBe(second)
  })

  it('refuses to step off the end without touching anything', () => {
    // Returning the same object is correct at the ends: there is nothing to move to.
    const only = doc()
    const empty = { past: [] as FormDocument[], present: only, future: [] as FormDocument[] }

    expect(historyOps.undo(empty)).toBe(empty)
    expect(historyOps.redo(empty)).toBe(empty)
    expect(empty.past).toEqual([])
    expect(empty.future).toEqual([])
  })

  it('redo returns exactly the document undo stepped off', () => {
    /*
     * Round-tripped rather than asserted against a literal, because the point
     * is that neither direction rebuilt or edited the stored document.
     */
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', prop('one'))
    })
    const after = JSON.stringify(result.current.document)

    act(() => {
      result.current.undo()
    })
    act(() => {
      result.current.redo()
    })

    expect(JSON.stringify(result.current.document)).toBe(after)
  })
})

describe('a rename that moves the answer name with it', () => {
  /*
   * A node without a `dataKey` answers under its key, so a rename must re-point
   * every ref to that answer or those conditions read a name nothing writes.
   */
  const reading = (dataKey: string): FormDocument => ({
    ...doc(),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'email', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
        {
          key: 'note',
          type: 'Paragraph',
          props: {},
          renderWhen: {
            kind: 'condition',
            condition: {
              op: 'eq',
              left: { kind: 'ref', dataKey },
              right: { kind: 'literal', value: 'yes' },
            },
          },
        },
      ],
    },
  })

  const refOf = (document: FormDocument, key: string): string | undefined => {
    const when = findNode(document.root, key)?.renderWhen
    if (!when || when.kind !== 'condition') return undefined
    const left = (when.condition as { left?: { kind: string; dataKey?: string } }).left
    return left?.kind === 'ref' ? left.dataKey : undefined
  }

  it('carries every condition that reads the renamed answer', () => {
    const { result } = renderHook(() => useDesigner(reading('email')))

    act(() => {
      result.current.renameKey('email', 'emailAddress')
    })

    expect(refOf(result.current.document, 'note')).toBe('emailAddress')
  })

  it('leaves refs alone when another component still writes that answer', () => {
    // Two writers of one answer is supported; the name still resolves through
    // the other writer, so re-pointing would break the refs.
    const shared: FormDocument = {
      ...reading('email'),
      root: {
        ...reading('email').root,
        children: [
          ...(reading('email').root.children ?? []),
          {
            key: 'emailAgain',
            type: 'Field',
            props: {},
            dataKey: 'email',
            schema: { type: 'string', validations: [] },
          },
        ],
      },
    }

    const { result } = renderHook(() => useDesigner(shared))

    act(() => {
      result.current.renameKey('email', 'emailAddress')
    })

    expect(refOf(result.current.document, 'note')).toBe('email')
  })

  it('leaves refs alone when the node answers under an explicit data key', () => {
    // With its own `dataKey`, the key is identity only and the answer does not move.
    const explicit: FormDocument = {
      ...reading('answers'),
      root: {
        ...reading('answers').root,
        children: (reading('answers').root.children ?? []).map((child) =>
          child.key === 'email' ? { ...child, dataKey: 'answers' } : child,
        ),
      },
    }

    const { result } = renderHook(() => useDesigner(explicit))

    act(() => {
      result.current.renameKey('email', 'emailAddress')
    })

    expect(findNode(result.current.document.root, 'emailAddress')?.dataKey).toBe('answers')
    expect(refOf(result.current.document, 'note')).toBe('answers')
  })

  it('leaves refs alone when the explicit dataKey happens to equal the key', () => {
    // An explicit `dataKey` equal to the key still pins the answer name. A
    // host's JSON and the key editor both produce this shape.
    const pinned: FormDocument = {
      ...reading('email'),
      root: {
        ...reading('email').root,
        children: (reading('email').root.children ?? []).map((child) =>
          child.key === 'email' ? { ...child, dataKey: 'email' } : child,
        ),
      },
    }

    const { result } = renderHook(() => useDesigner(pinned))

    act(() => {
      result.current.renameKey('email', 'emailAddress')
    })

    expect(findNode(result.current.document.root, 'emailAddress')?.dataKey).toBe('email')
    expect(refOf(result.current.document, 'note')).toBe('email')
  })

  it('leaves refs alone when the renamed node writes no answer', () => {
    // A node with no `schema` writes no answer, so there is nothing for a ref to follow.
    const container: FormDocument = {
      ...reading('email'),
      root: {
        ...reading('email').root,
        children: (reading('email').root.children ?? []).map((child) => {
          if (child.key !== 'email') return child
          const { schema: _schema, ...rest } = child
          return { ...rest, type: 'Box' }
        }),
      },
    }

    const { result } = renderHook(() => useDesigner(container))

    act(() => {
      result.current.renameKey('email', 'emailAddress')
    })

    expect(refOf(result.current.document, 'note')).toBe('email')
  })

  it('still renames the node itself', () => {
    const { result } = renderHook(() => useDesigner(reading('email')))

    act(() => {
      result.current.renameKey('email', 'emailAddress')
    })

    expect(findNode(result.current.document.root, 'emailAddress')).toBeDefined()
    expect(findNode(result.current.document.root, 'email')).toBeUndefined()
  })
})

describe('a refusal that used to be announced as a success', () => {
  const def: ComponentDef = {
    type: 'Field',
    label: 'Field',
    icon: 'text',
    group: 'inputs',
    defaultProps: {},
    props: [],
    events: [],
  }

  it('says no when the kit definition has no usable type', () => {
    // An unknown `parentKey` is not a refusal: `containerFor` falls back to the root.
    const { result } = renderHook(() => useDesigner(doc()))
    const broken = { ...def, type: '' }

    let landed: boolean | undefined
    act(() => {
      landed = result.current.addComponent(broken, 'root')
    })

    expect(landed).toBe(false)
  })

  it('lands both of two inserts batched into one tick', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    let first: boolean | undefined
    let second: boolean | undefined
    act(() => {
      first = result.current.addComponent(def, 'root')
      second = result.current.addComponent(def, 'root')
    })

    expect(first).toBe(true)
    expect(second, 'the second insert in a tick was refused').toBe(true)

    const children = result.current.document.root.children ?? []
    const started = doc().root.children?.length ?? 0
    expect(children.length - started, 'both inserts did not land').toBe(2)
    expect(new Set(children.map((child) => child.key)).size, 'two nodes share a key').toBe(
      children.length,
    )
  })

  it('inserts into the replacement rather than the document it replaced', () => {
    /*
     * The refusal that is still real, and the one the guard in `commitDecided`
     * is for: a writer that does not go through it. `replaceDocument` sets the
     * history directly, so an insert decided against the document before it is
     * decided against a tree that no longer exists -- and its index means
     * something else there.
     */
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.replaceDocument({ ...doc(), id: 'replaced' })
    })

    expect(result.current.document.id, 'the replacement did not happen').toBe('replaced')

    let landed: boolean | undefined
    act(() => {
      landed = result.current.addComponent(def, 'root')
    })

    // `replaceDocument` advances the ref, so the insert is decided against the
    // replacement.
    expect(landed).toBe(true)
    expect(result.current.document.id).toBe('replaced')
  })

  it('says yes when it lands, and moves the selection', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    let landed: boolean | undefined
    act(() => {
      landed = result.current.addComponent(def, 'root')
    })

    expect(landed).toBe(true)
    expect(result.current.selectedKey).toBeDefined()
  })

  it('does not move the selection when nothing landed', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.select('email')
    })
    act(() => {
      result.current.addComponent({ ...def, type: '' }, 'root')
    })

    expect(result.current.selectedKey).toBe('email')
  })

  it('says no when a move is illegal', () => {
    // `moveNode` refuses to give a leaf children, and returns the identical
    // root for it.
    const { result } = renderHook(() => useDesigner(doc()))

    let moved: boolean | undefined
    act(() => {
      moved = result.current.moveComponent('phone', 'email')
    })

    expect(moved).toBe(false)
  })

  it('says yes when a move is legal', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    let moved: boolean | undefined
    act(() => {
      moved = result.current.moveComponent('phone', 'group')
    })

    expect(moved).toBe(true)
  })
})

describe('the document a host hands in, checked once', () => {
  /*
   * A host using `initialDocument={form} onChange={setForm}` hands over a new
   * object on every edit, and the hook only reads the first one.
   */
  const broken = (): FormDocument => ({
    ...doc(),
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'same', type: 'Field', props: {} },
        { key: 'same', type: 'Field', props: {} },
      ],
    },
  })

  it('warns once about a document that does not validate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const { rerender } = renderHook((document: FormDocument) => useDesigner(document), {
        initialProps: broken(),
      })

      expect(warn.mock.calls.length, 'the fixture validates, so this proves nothing').toBe(1)

      rerender(broken())
      rerender(broken())

      expect(warn.mock.calls.length, 'the check re-ran for a document already discarded').toBe(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('says nothing about a document that validates', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      renderHook(() => useDesigner(doc()))

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('two different writers in one tick', () => {
  const started = (doc().root.children ?? []).length

  const def: ComponentDef = {
    type: 'Field',
    label: 'Field',
    icon: 'text',
    group: 'inputs',
    defaultProps: {},
    props: [],
    events: [],
  }

  it('keeps an edit made just before an insert', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    let landed: boolean | undefined
    act(() => {
      result.current.setProp('email', 'label', prop('after'))
      landed = result.current.addComponent(def, 'root')
    })

    expect(landed, 'the insert was refused').toBe(true)

    expect(propOf(result.current.document, 'email')).toBe('after')
    expect((result.current.document.root.children ?? []).length - started).toBe(1)
  })

  it('keeps an insert made just before an edit', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.addComponent(def, 'root')
      result.current.setProp('email', 'label', prop('after'))
    })

    expect(propOf(result.current.document, 'email')).toBe('after')
    expect((result.current.document.root.children ?? []).length - started).toBe(1)
  })

  it('inserts into the replacement when a document is replaced in the same tick', () => {
    // Both in one `act`: in separate ones the effect catches the ref up in
    // between and this proves nothing.
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.replaceDocument({ ...doc(), id: 'replaced', root: emptyRoot() })
      result.current.addComponent(def, 'root')
    })

    expect(result.current.document.id, 'the replacement was lost').toBe('replaced')
    expect(
      result.current.document.root.children ?? [],
      'the insert went somewhere else',
    ).toHaveLength(1)
  })

  it('keeps an edit made just before a duplicate, and gives the copy its own key', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    let first: string | undefined
    let second: string | undefined
    act(() => {
      result.current.setProp('email', 'label', prop('after'))
      first = result.current.duplicateComponent('email')
      second = result.current.duplicateComponent('email')
    })

    expect(propOf(result.current.document, 'email')).toBe('after')
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(second, 'two duplications produced one key').not.toBe(first)

    const keys = (result.current.document.root.children ?? []).map((child) => child.key)
    expect(new Set(keys).size, 'two nodes share a key').toBe(keys.length)
  })
})

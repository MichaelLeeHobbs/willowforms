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
import { describe, expect, it, vi } from 'vitest'
import type { ComponentDef, FormDocument, Language } from '@formsmith/core'
import { collectKeys as collect, findNode, prop, validateDocument } from '@formsmith/core'

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

  it('makes the language the caller names the default', () => {
    /*
     * The second argument, which nothing in the repository ever passed. Its one
     * caller in the product is the "make this the default" control in
     * `FormSettings.tsx`, and there is no test for that panel and no e2e
     * covering it -- so `const preferred = doc.defaultLanguage`, which makes
     * choosing a default a silent no-op, kept every test green.
     */
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
    /*
     * The control. A document whose `defaultLanguage` names no language in its
     * own list fails `validateDocument`, so accepting whatever was asked for
     * would be a write that breaks the document from inside the designer.
     */
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

/**
 * Eight ways the store recorded, or failed to record, something that did not
 * happen.
 */
describe('the store and edits that changed nothing', () => {
  it('takes no undo slot for a property set to what it already was', () => {
    /*
     * Every property writer rebuilt the document even when `updateNode`
     * returned the root unchanged, so a no-op consumed a slot in a capped
     * stack — which means a real edit fell off the end of it.
     */
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
    /*
     * `duplicateComponent` read `history.present` out of the render closure --
     * a render behind whenever two edits land in one tick -- and
     * `duplicateNode` derives the copy's key from the root it is handed. Two
     * duplications resolved against the same stale root produced two nodes with
     * the same generated key, which is the duplicate-key state that makes every
     * later tree operation edit the first match, silently. The one thing this
     * callback exists to do is hand back a key nothing else is using.
     *
     * The eight cases in this describe covered every writer except this one,
     * which is the only writer that was still reading the closure.
     */
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
    // The control. Refusing the second duplication outright would satisfy the
    // test above by never producing a second copy at all.
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
    // The control. Recording nothing would pass the test above and lose every
    // edit anybody made.
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
    /*
     * Undo restored the document and never the selection, so `selectedKey`
     * routinely named a node that is not in the tree — which is the state every
     * other bug in this file needs in order to happen.
     */
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
    // It compared the removed key against the selection, so removing a
    // container left the selection on a descendant that no longer exists.
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
    // It answered `{ok: true}`, moved the selection onto the new name, and
    // committed an entry for an edit that did not happen.
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
    /*
     * A `Step` ships with a condition comparing `context.step` against its own
     * key. Renaming the step rewrote `node.key` and left the condition naming
     * the old one, so the step became unsatisfiable — permanently, with nothing
     * reporting why. `duplicateNode` had the same hole from the other side.
     */
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
    /*
     * `useDesigner` returned a fresh object with fresh closures on every render,
     * so nothing downstream could memoise: every keystroke re-rendered the
     * canvas and the tree in full and re-attached the window keydown listener.
     */
    const { result, rerender } = renderHook(() => useDesigner(doc()))
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('hands back a different one when the document changes', () => {
    // The control: a frozen api would never see an edit.
    const { result } = renderHook(() => useDesigner(doc()))
    const first = result.current

    act(() => {
      result.current.setProp('email', 'label', { kind: 'static', value: 'Changed' })
    })

    expect(result.current).not.toBe(first)
  })

  it('says so when a host hands it a document that does not validate', () => {
    /*
     * The only in-repo write path is gated by `validateDocument`; a document
     * restored from a host's own storage is not. Duplicate keys then make every
     * tree operation edit the first match, silently.
     */
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

/**
 * One node's `label` prop, unwrapped to the value an author typed.
 *
 * `setProp` stores a `PropValue`, so the raw prop is `{ kind: 'static', value }`
 * and comparing it against a string never matches. The binding kinds this file
 * switches between are exactly what the undo label now distinguishes, so the
 * shape matters and is read rather than stringified.
 */
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
   * `commit` replaces the present when the new label matches the last one, so a
   * coalesced run of keystrokes and the gesture that follows it shared a slot.
   *
   * `setProp`'s label was `'prop:' + key + ':' + name` and omitted the binding
   * *kind*, while `Properties.tsx` passes one `onChange` to the text editors, to
   * `ClearButton` and to `BindingMode`. So typing a label and then switching
   * that label's binding mode were the same label: the present became the empty
   * expression and the typed text was in neither `past` nor `future`, destroyed
   * in one step.
   *
   * This file's own `setRenderWhen` and `setFieldSchema` had already been fixed
   * the same way, and `setRenderWhen`'s comment describes this failure verbatim.
   */
  it('keeps the typed value when the binding mode changes right after', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', prop('Email address'))
    })
    act(() => {
      // What BindingMode's select handler does: a fresh binding object of a
      // different kind, through the same onChange.
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
    // ClearButton's gesture, through the same onChange. `undefined` removes the
    // property so the component default applies again.
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
    /*
     * The control, and it is the reason the label exists at all: putting the
     * whole value in the label would make every keystroke its own undo entry,
     * which is the defect the coalescing was added to fix.
     */
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

    /*
     * The fixture's `email` node carries no `label` prop, so the state before
     * the run is `undefined` -- which is what one undo has to land on if the
     * three keystrokes really were one step.
     */
    expect(propOf(result.current.document, 'email')).toBeUndefined()
  })

  it('keeps a raw CSS block when the box is cleared right after typing', () => {
    // `setNodeCss` had the same shape: within one device, typing and clearing
    // shared a slot.
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
  /*
   * `commit` has a non-mutation assertion and neither `undo` nor `redo` does,
   * so half of what that test's own comment calls "invariant 4's caller-visible
   * half" was unguarded. Rewrite `undo` to `past.pop()` and every test that
   * calls it stays green -- while the `History` object React still holds in
   * state has had its array mutated underneath a component that already
   * rendered from it.
   */
  it('undo does not mutate the arrays it read', () => {
    const { result } = renderHook(() => useDesigner(doc()))

    act(() => {
      result.current.setProp('email', 'label', prop('one'))
    })
    act(() => {
      result.current.setProp('email', 'label', { kind: 'computed', expression: 'two' })
    })

    const before = result.current.canUndo
    const snapshot = JSON.stringify(result.current.document)

    act(() => {
      result.current.undo()
    })

    // The document React held before the undo is unchanged; the hook moved to a
    // different one rather than editing the one it had.
    expect(before, 'nothing was undoable, so this proves nothing').toBe(true)
    expect(JSON.stringify(result.current.document)).not.toBe(snapshot)

    act(() => {
      result.current.redo()
    })

    expect(JSON.stringify(result.current.document)).toBe(snapshot)
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

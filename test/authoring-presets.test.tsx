// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { collectKeys, createDocument, findNode, flatten, loadDocument, prop } from '@formsmith/core'
import { htmlKit } from '@formsmith/kit-html'
import { muiKit } from '@formsmith/kit-mui'
import { useDesigner } from '../packages/designer/src/store.js'
import { availablePresets } from '../packages/designer/src/presets.js'

for (const kit of [htmlKit, muiKit]) {
  describe(`${kit.id} authoring presets`, () => {
    it('reserves node and answer names across same-tick insertions and undoes whole compositions', () => {
      const initial = createDocument('Presets', 'presets')
      initial.root.children = [
        {
          key: 'existing',
          dataKey: 'numberField',
          type: 'NumberField',
          props: {},
          schema: { type: 'number' },
        },
      ]
      const { result } = renderHook(() => useDesigner(initial))
      act(() => {
        expect(result.current.addPreset('statistics', kit, 'root')).toBe(true)
        expect(result.current.addPreset('statistics', kit, 'root')).toBe(true)
      })
      const inserted = result.current.document
      expect(initial.root.children).toHaveLength(1)
      expect(inserted.root.children).toHaveLength(3)
      const first = inserted.root.children![1]!
      const second = inserted.root.children![2]!
      expect(first.children?.map((child) => child.key)).toEqual([
        'numberField2',
        'numberField3',
        'numberField4',
      ])
      expect(second.children?.map((child) => child.key)).toEqual([
        'numberField5',
        'numberField6',
        'numberField7',
      ])
      expect(result.current.selectedKey).toBe(second.key)
      expect(new Set(collectKeys(inserted.root)).size).toBe(collectKeys(inserted.root).length)
      act(() => result.current.undo())
      expect(result.current.document.root.children).toEqual([initial.root.children[0], first])
      act(() => result.current.redo())
      expect(result.current.document).toEqual(inserted)
    })

    it('keeps preset parts editable and loadable as ordinary versioned JSON', () => {
      const { result } = renderHook(() => useDesigner(createDocument('Presets', 'presets')))
      act(() => {
        for (const preset of availablePresets(kit))
          expect(result.current.addPreset(preset.id, kit, 'root')).toBe(true)
      })
      expect(result.current.document.root.children).toHaveLength(3)
      const nodes = flatten(result.current.document.root).map(({ node }) => node)
      const heading = nodes.find((node) => node.type === 'Heading')!
      const divider = nodes.find((node) => node.type === 'Divider')!
      act(() => {
        result.current.setProp(heading.key, 'text', prop('Vitals'))
        result.current.removeComponent(divider.key)
      })
      expect(findNode(result.current.document.root, heading.key)?.props['text']).toEqual(
        prop('Vitals'),
      )
      expect(findNode(result.current.document.root, divider.key)).toBeUndefined()
      const loaded = loadDocument(JSON.parse(JSON.stringify(result.current.document)))
      expect(loaded.ok).toBe(true)
      if (!loaded.ok) throw new Error('Preset document did not load')
      expect(loaded.document).toEqual(result.current.document)
      expect(new Set(flatten(loaded.document.root).map(({ node }) => node.type))).toEqual(
        new Set(['Screen', 'Stack', 'Heading', 'TextField', 'Grid', 'NumberField', 'Repeater']),
      )
    })

    it('omits incompatible presets and leaves history and selection unchanged when refused', () => {
      const partial = { ...kit, components: kit.components.filter((def) => def.type !== 'Grid') }
      expect(availablePresets(partial).map((preset) => preset.id)).toEqual(['section'])
      const nonContainer = {
        ...kit,
        components: kit.components.map((def) =>
          def.type === 'Stack' ? { ...def, container: false } : def,
        ),
      }
      expect(availablePresets(nonContainer).map((preset) => preset.id)).toEqual([
        'statistics',
        'entry',
      ])
      const initial = createDocument('Presets', 'presets')
      const { result } = renderHook(() => useDesigner(initial))
      act(() => result.current.select('root'))
      act(() => expect(result.current.addPreset('statistics', partial, 'root')).toBe(false))
      expect(result.current.document).toBe(initial)
      expect(result.current.selectedKey).toBe('root')
      expect(result.current.canUndo).toBe(false)
    })
  })
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ComponentNode, Kit } from '@formsmith/core'
import { indexKit } from '@formsmith/core'

import { resolveTreeDrop } from '../dnd.js'
import type { TreeDropTarget, TreeRow } from '../dnd.js'
import type { DragController } from '../drag.js'
import { originOf } from '../geometry.js'
import type { Origin } from '../geometry.js'

export interface TreeProps {
  root: ComponentNode
  kit: Kit
  selectedKey: string | undefined
  onSelect: (key: string) => void
  onRemove: (key: string) => void
  drag: DragController
}

/** Row positions frozen when a drag begins, so render stays pure. */
interface Snapshot {
  /** Which drag this was measured for. A mismatch means it is stale. */
  dragId: number
  rows: TreeRow[]
  origin: Origin
}

/**
 * The structure panel, and the second place a drop can land.
 *
 * The canvas resolves a drop by finding the innermost container under the
 * pointer, which works because a container's box encloses its children. Tree
 * rows do not nest that way: a row covers only itself, and its children are
 * separate rows below it. So the tree resolves drops on its own terms, with the
 * shared arithmetic living in `dnd.ts`.
 */
export function Tree({ root, kit, selectedKey, onSelect, onRemove, drag }: TreeProps): ReactNode {
  const listRef = useRef<HTMLUListElement>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(undefined)

  const { state: dragState, begin, registerZone, consumeClick } = drag

  /**
   * Read every row's position off the DOM.
   *
   * Only ever called from an event handler, never from an effect or from render.
   * That is what keeps the drop indicator below derivable during render as a
   * pure function of state.
   */
  const measureNow = useCallback(
    (dragId: number): Snapshot | undefined => {
      const list = listRef.current
      if (!list) return undefined

      const defs = indexKit(kit)
      const origin = originOf(list)
      const rows: TreeRow[] = []

      const visit = (node: ComponentNode, parentKey: string | undefined, index: number): void => {
        const element = list.querySelector<HTMLElement>(`[data-fs-row="${CSS.escape(node.key)}"]`)
        if (element) {
          const box = element.getBoundingClientRect()
          rows.push({
            key: node.key,
            parentKey,
            index,
            container: defs.get(node.type)?.container === true,
            rect: {
              top: box.top - origin.y,
              left: box.left - origin.x,
              width: box.width,
              height: box.height,
            },
          })
        }
        node.children?.forEach((child, i) => visit(child, node.key, i))
      }

      visit(root, undefined, 0)
      return { dragId, rows, origin }
    },
    [kit, root],
  )

  const takeSnapshot = useCallback(
    (dragId: number) => {
      const next = measureNow(dragId)
      if (next) setSnapshot(next)
    },
    [measureNow],
  )

  const onRowPointerDown = useCallback(
    (node: ComponentNode, event: ReactPointerEvent) => {
      if (node.key === root.key) return
      begin({ kind: 'move', key: node.key, label: node.key }, event)
    },
    [begin, root.key],
  )

  /*
   * Derived during render, not set from an effect. The pointer moves many times
   * a second, and state-set-from-effect would render twice for every move.
   */
  const target = useMemo<TreeDropTarget | undefined>(() => {
    if (!dragState || snapshot?.dragId !== dragState.id) return undefined

    const x = dragState.x - snapshot.origin.x
    const y = dragState.y - snapshot.origin.y

    // Only claim the drop while the pointer is over the tree, or the canvas and
    // the tree would both try to handle the same release.
    const width = snapshot.rows[0]?.rect.width ?? 0
    if (x < 0 || x > width) return undefined

    const dragged = dragState.source.kind === 'move' ? dragState.source.key : undefined
    return resolveTreeDrop(snapshot.rows, y, dragged)
  }, [dragState, snapshot])

  /*
   * Asked by the controller when the pointer is released, measuring afresh
   * rather than trusting the snapshot the indicator is drawn from. See the same
   * note on the canvas: that snapshot is always one pointer event behind, and a
   * quick release would otherwise be silently dropped.
   */
  const resolveRelease = useCallback(
    (clientX: number, clientY: number) => {
      const snap = measureNow(0)
      if (!snap) return undefined

      const x = clientX - snap.origin.x
      const width = snap.rows[0]?.rect.width ?? 0
      if (x < 0 || x > width) return undefined

      const dragged = dragState?.source.kind === 'move' ? dragState.source.key : undefined
      const resolved = resolveTreeDrop(snap.rows, clientY - snap.origin.y, dragged)
      return resolved ? { parentKey: resolved.parentKey, index: resolved.index } : undefined
    },
    [dragState, measureNow],
  )

  useEffect(() => registerZone('tree', resolveRelease), [registerZone, resolveRelease])

  return (
    <section className="fs-tree">
      <h2 className="fs-panel__heading">Structure</h2>
      <ul
        role="tree"
        aria-label="Form structure"
        className="fs-tree__list"
        ref={listRef}
        onPointerMove={() => {
          // Measured on the first move of each drag that reaches the tree,
          // including one that started in the palette or on the canvas.
          if (dragState && snapshot?.dragId !== dragState.id) takeSnapshot(dragState.id)
        }}
      >
        <TreeItem
          node={root}
          depth={0}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onRemove={onRemove}
          onRowPointerDown={onRowPointerDown}
          consumeClick={consumeClick}
          target={target}
          isRoot
        />
      </ul>
    </section>
  )
}

interface TreeItemProps {
  node: ComponentNode
  depth: number
  selectedKey: string | undefined
  onSelect: (key: string) => void
  onRemove: (key: string) => void
  onRowPointerDown: (node: ComponentNode, event: ReactPointerEvent) => void
  consumeClick: () => boolean
  target: TreeDropTarget | undefined
  isRoot?: boolean
}

function TreeItem({
  node,
  depth,
  selectedKey,
  onSelect,
  onRemove,
  onRowPointerDown,
  consumeClick,
  target,
  isRoot = false,
}: TreeItemProps): ReactNode {
  const selected = node.key === selectedKey
  const children = node.children ?? []
  const drop = target?.rowKey === node.key ? target.mode : undefined

  return (
    <li role="none">
      <div
        role="treeitem"
        data-fs-row={node.key}
        aria-selected={selected}
        aria-level={depth + 1}
        aria-expanded={children.length > 0 ? true : undefined}
        tabIndex={selected ? 0 : -1}
        className={
          'fs-tree__row' + (selected ? ' is-selected' : '') + (drop ? ' is-drop-' + drop : '')
        }
        style={{ paddingInlineStart: 8 + depth * 12 }}
        onPointerDown={(e) => onRowPointerDown(node, e)}
        onClick={() => {
          if (consumeClick()) return
          onSelect(node.key)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(node.key)
          }
        }}
      >
        <span className="fs-tree__key">{node.key}</span>
        <span className="fs-tree__type">{node.type}</span>
        {!isRoot && (
          <button
            type="button"
            className="fs-tree__remove"
            aria-label={'Remove ' + node.key}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onRemove(node.key)
            }}
          >
            &times;
          </button>
        )}
      </div>

      {children.length > 0 && (
        <ul role="group" className="fs-tree__list">
          {children.map((child) => (
            <TreeItem
              key={child.key}
              node={child}
              depth={depth + 1}
              selectedKey={selectedKey}
              onSelect={onSelect}
              onRemove={onRemove}
              onRowPointerDown={onRowPointerDown}
              consumeClick={consumeClick}
              target={target}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

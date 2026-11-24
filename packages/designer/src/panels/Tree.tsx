import { useCallback, useEffect, useMemo, useRef } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type { ComponentNode, Kit } from '@willowforms/core'
import { flatten, indexKit } from '@willowforms/core'

import { resolveTreeDrop } from '../dnd.js'
import type { TreeDropTarget, TreeRow } from '../dnd.js'
import type { DragController } from '../drag.js'
import { originOf } from '../geometry.js'
import type { Origin } from '../geometry.js'
import { describeMove, focusTarget, moveTarget } from '../keyboard.js'
import type { Direction } from '../keyboard.js'
import { useDragSnapshot } from '../snapshot.js'

export interface TreeProps {
  root: ComponentNode
  kit: Kit
  selectedKey: string | undefined
  onSelect: (key: string) => void
  onRemove: (key: string) => void

  onMove: (key: string, parentKey: string, index: number) => boolean
  onDuplicate: (key: string) => string | undefined
  announce: (message: string) => void
  drag: DragController
}

interface Snapshot {
  /** Which drag this was measured for. A mismatch means it is stale. */
  dragId: number
  rows: TreeRow[]
  origin: Origin
}

/**
 * A tree row covers only itself, not its children the way a canvas box does,
 * so the tree resolves drops over a flat row list with `resolveTreeDrop`.
 */
export function Tree({
  root,
  kit,
  selectedKey,
  onSelect,
  onRemove,
  onDuplicate,
  onMove,
  announce,
  drag,
}: TreeProps): ReactNode {
  const listRef = useRef<HTMLUListElement>(null)

  const { state: dragState, begin, registerZone, consumeClick } = drag

  /**
   * Call only from an event handler, never from render or an effect, so the
   * drop indicator stays a pure function of state.
   */
  const measureNow = useCallback(
    (dragId: number): Snapshot | undefined => {
      const list = listRef.current
      if (!list) return undefined

      const defs = indexKit(kit)
      const origin = originOf(list)
      const rows: TreeRow[] = []

      const byKey = new Map<string, HTMLElement>()
      for (const each of list.querySelectorAll<HTMLElement>('[data-fs-tree-row]')) {
        const key = each.getAttribute('data-fs-tree-row')
        if (key !== null && !byKey.has(key)) byKey.set(key, each)
      }

      const visit = (node: ComponentNode, parentKey: string | undefined, index: number): void => {
        const element = byKey.get(node.key)
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

  const { snapshot, takeSnapshot } = useDragSnapshot(measureNow)

  const onRowPointerDown = useCallback(
    (node: ComponentNode, event: ReactPointerEvent) => {
      if (node.key === root.key) return

      if (event.button !== 0) return
      begin({ kind: 'move', key: node.key, label: node.key }, event)
    },
    [begin, root.key],
  )

  const focusRow = useCallback(
    (key: string) => {
      onSelect(key)
      listRef.current
        ?.querySelector<HTMLElement>(`[data-fs-tree-row="${CSS.escape(key)}"]`)
        ?.focus()
    },
    [onSelect],
  )

  const scheduled = useRef(0)
  const focusRowSoon = useCallback(
    (key: string) => {
      cancelAnimationFrame(scheduled.current)
      scheduled.current = requestAnimationFrame(() => focusRow(key))
    },
    [focusRow],
  )

  useEffect(
    () => () => {
      cancelAnimationFrame(scheduled.current)
    },
    [],
  )

  // Alt with an arrow moves the component, the outliner convention: WAI-ARIA has
  // no keyboard pattern for drag and drop.

  const rows = useMemo(() => flatten(root), [root])
  const defs = useMemo(() => indexKit(kit), [kit])

  const onRowKeyDown = useCallback(
    (node: ComponentNode, event: ReactKeyboardEvent<HTMLDivElement>) => {
      const DIRECTIONS: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }
      const direction = DIRECTIONS[event.key]

      if (direction) {
        event.preventDefault()

        if (event.altKey) {
          const target = moveTarget(rows, node.key, direction, (type) => {
            return defs.get(type)?.container === true
          })
          if (!target) {
            announce(node.key + ' cannot move that way.')
            return
          }
          if (!onMove(node.key, target.parentKey, target.index)) {
            announce(node.key + ' cannot move that way.')
            return
          }

          announce(describeMove(node.key, direction))
          focusRowSoon(node.key)
          return
        }

        const next = focusTarget(rows, node.key, direction)
        if (next) focusRow(next)
        return
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        const target = event.key === 'Home' ? rows[0] : rows[rows.length - 1]
        if (target) focusRow(target.node.key)
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(node.key)
        return
      }

      if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
        // The browser's own Ctrl+D adds a bookmark.
        event.preventDefault()
        if (node.key === root.key) {
          announce('The root cannot be duplicated.')
          return
        }
        const copy = onDuplicate(node.key)
        if (!copy) {
          announce(node.key + ' cannot be duplicated.')
          return
        }
        announce(node.key + ' duplicated as ' + copy + '.')
        focusRowSoon(copy)
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && node.key !== root.key) {
        event.preventDefault()
        // The shell also handles Delete; without this one keypress removes the
        // component twice.
        event.stopPropagation()
        /*
         * Focus moves to the next row outside the removed subtree, or the
         * previous row. Found before the removal; `flatten` is depth-first, so
         * the subtree is the run of deeper rows that follows.
         */
        const position = rows.findIndex((r) => r.node.key === node.key)
        const depth = rows[position]?.depth ?? 0
        const beyond = rows.findIndex((r, i) => i > position && r.depth <= depth)
        const after = (beyond === -1 ? undefined : rows[beyond]) ?? rows[position - 1]

        onRemove(node.key)
        announce(node.key + ' removed.')
        if (after) focusRowSoon(after.node.key)
      }
    },
    [announce, defs, focusRow, focusRowSoon, onDuplicate, onMove, onRemove, onSelect, root, rows],
  )

  /*
   * Derived during render, not set from an effect. The pointer moves many times
   * a second, and state-set-from-effect would render twice for every move.
   */
  const target = useMemo<TreeDropTarget | undefined>(() => {
    if (!dragState || snapshot?.dragId !== dragState.id) return undefined

    const x = dragState.x - snapshot.origin.x
    const y = dragState.y - snapshot.origin.y

    const width = Math.max(0, ...snapshot.rows.map((row) => row.rect.width))
    if (width === 0 || x < 0 || x > width) return undefined

    const dragged = dragState.source.kind === 'move' ? dragState.source.key : undefined
    return resolveTreeDrop(snapshot.rows, y, dragged)
  }, [dragState, snapshot])

  /*
   * Measured afresh on release: the indicator's snapshot is one pointer event
   * behind, and a quick release would otherwise be dropped.
   */
  const resolveRelease = useCallback(
    (clientX: number, clientY: number, draggedKey: string | undefined) => {
      // `-1`: an id no drag holds, because this snapshot is used once and discarded.
      const snap = measureNow(-1)
      if (!snap) return undefined

      const x = clientX - snap.origin.x
      // `width === 0`: a tree with no rows has no drop to claim.
      const width = Math.max(0, ...snap.rows.map((row) => row.rect.width))
      if (width === 0 || x < 0 || x > width) return undefined

      const resolved = resolveTreeDrop(snap.rows, clientY - snap.origin.y, draggedKey)
      return resolved ? { parentKey: resolved.parentKey, index: resolved.index } : undefined
    },
    [measureNow],
  )

  useEffect(() => registerZone('tree', resolveRelease), [registerZone, resolveRelease])

  // One tab stop for the whole tree, so a long form does not bury the rest of
  // the page behind its rows.
  const tabStop =
    selectedKey && rows.some((r) => r.node.key === selectedKey) ? selectedKey : root.key

  return (
    <section className="fs-tree">
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
          onRowKeyDown={onRowKeyDown}
          tabStop={tabStop}
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
  onRowKeyDown: (node: ComponentNode, event: ReactKeyboardEvent<HTMLDivElement>) => void
  tabStop: string
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
  onRowKeyDown,
  tabStop,
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
        data-fs-tree-row={node.key}
        aria-selected={selected}
        aria-level={depth + 1}
        // Always `true` for a parent: nothing collapses, and `keyboard.ts`
        // relies on every child being in the flattened list.
        aria-expanded={children.length > 0 ? true : undefined}
        tabIndex={tabStop === node.key ? 0 : -1}
        className={
          'fs-tree__row' + (selected ? ' is-selected' : '') + (drop ? ' is-drop-' + drop : '')
        }
        style={{ paddingInlineStart: 8 + depth * 12 }}
        onPointerDown={(e) => onRowPointerDown(node, e)}
        onClick={() => {
          if (consumeClick()) return
          onSelect(node.key)
        }}
        onKeyDown={(e) => onRowKeyDown(node, e)}
      >
        <span className="fs-tree__key">{node.key}</span>
        <span className="fs-tree__type">{node.type}</span>
        {!isRoot && (
          <button
            type="button"
            className="fs-tree__remove"

            tabIndex={-1}
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
              onRowKeyDown={onRowKeyDown}
              tabStop={tabStop}
              consumeClick={consumeClick}
              target={target}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

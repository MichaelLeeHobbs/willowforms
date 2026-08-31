import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type { ComponentNode, Kit } from '@formsmith/core'
import { flatten, indexKit } from '@formsmith/core'

import { resolveTreeDrop } from '../dnd.js'
import type { TreeDropTarget, TreeRow } from '../dnd.js'
import type { DragController } from '../drag.js'
import { originOf } from '../geometry.js'
import type { Origin } from '../geometry.js'
import { describeMove, focusTarget, moveTarget } from '../keyboard.js'
import type { Direction } from '../keyboard.js'

export interface TreeProps {
  root: ComponentNode
  kit: Kit
  selectedKey: string | undefined
  onSelect: (key: string) => void
  onRemove: (key: string) => void
  onMove: (key: string, parentKey: string, index: number) => void
  /** Copy a component in beside itself. Returns the new key, or nothing if refused. */
  onDuplicate: (key: string) => string | undefined
  /** Text for the live region, so a keyboard move is not silent. */
  announce: (message: string) => void
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
        const element = list.querySelector<HTMLElement>(
          `[data-fs-tree-row="${CSS.escape(node.key)}"]`,
        )
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
      /*
       * The primary button only, which `Canvas.tsx` and `Palette.tsx` both check
       * and both explain. This was the third `begin` call site and the one
       * without the guard: a right-press and four pixels reparented the
       * component under its own context menu -- the menu opens, the component
       * has already moved, and nothing about the gesture said it would.
       */
      if (event.button !== 0) return
      begin({ kind: 'move', key: node.key, label: node.key }, event)
    },
    [begin, root.key],
  )

  /** Move focus to a row and select it, since selection follows focus here. */
  const focusRow = useCallback(
    (key: string) => {
      onSelect(key)
      listRef.current
        ?.querySelector<HTMLElement>(`[data-fs-tree-row="${CSS.escape(key)}"]`)
        ?.focus()
    },
    [onSelect],
  )

  /**
   * A focus move scheduled for after the tree has redrawn, cancellable.
   *
   * Three places move focus a frame late, because the row they want does not
   * exist until the document they just changed has rendered. None of them kept
   * the handle, so a frame scheduled just before the pane was switched away
   * still ran -- pulling focus back into a tree the user had left, from a
   * component that had unmounted. One handle, replaced each time, cancelled on
   * the way out.
   */
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

  /*
   * Arrows move focus; the same arrows with Alt move the component.
   *
   * Drag and drop is a pointer gesture with no keyboard equivalent, which would
   * otherwise make every rearrangement in this builder impossible without a
   * mouse. WAI-ARIA has no standard pattern for that, so this follows the
   * outliner convention people already know from editors and file trees.
   */
  const onRowKeyDown = useCallback(
    (node: ComponentNode, event: ReactKeyboardEvent<HTMLDivElement>) => {
      const rows = flatten(root)
      const defs = indexKit(kit)

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
          onMove(node.key, target.parentKey, target.index)
          announce(describeMove(node.key, direction))
          // The row is re-rendered in its new place; put focus back on it.
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
        // The browser's own Ctrl+D is a bookmark, and this is the only place a
        // component can be duplicated without a pointer.
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
        // The shell also listens for Delete on the window. Without this the same
        // keypress removed the component twice, pushing two undo entries and
        // needing two undos to get it back.
        event.stopPropagation()
        /*
         * Where focus goes, which nothing decided. The move and duplicate paths
         * both restore it and this one did not, so deleting from the keyboard
         * dropped focus onto `document.body` — every subsequent arrow key went
         * nowhere and the tree had to be tabbed back into.
         *
         * The next row *outside the subtree being removed*, or the previous one
         * when there is none. The row is measured before the removal, because
         * afterwards it is gone -- and `rows[position + 1]` is a child of the
         * node being deleted whenever the node has children, so deleting a
         * container focused something that went with it and left focus on the
         * body after all. `flatten` is depth-first, so the subtree is the
         * contiguous run of deeper rows that follows.
         */
        // The same `rows` the handler opened with, not a second identical
        // `flatten`: an inner one that shadows the outer reads as though it
        // were measuring something the outer could not see.
        const position = rows.findIndex((r) => r.node.key === node.key)
        const depth = rows[position]?.depth ?? 0
        const beyond = rows.findIndex((r, i) => i > position && r.depth <= depth)
        const after = (beyond === -1 ? undefined : rows[beyond]) ?? rows[position - 1]

        onRemove(node.key)
        announce(node.key + ' removed.')
        if (after) focusRowSoon(after.node.key)
      }
    },
    [announce, focusRow, focusRowSoon, kit, onDuplicate, onMove, onRemove, onSelect, root],
  )

  /*
   * Derived during render, not set from an effect. The pointer moves many times
   * a second, and state-set-from-effect would render twice for every move.
   */
  const target = useMemo<TreeDropTarget | undefined>(() => {
    if (!dragState || snapshot?.dragId !== dragState.id) return undefined

    const x = dragState.x - snapshot.origin.x
    const y = dragState.y - snapshot.origin.y

    /*
     * Only claim the drop while the pointer is over the tree, or the canvas and
     * the tree would both try to handle the same release.
     *
     * The widest row rather than the first, and no drop at all when there are no
     * rows. `rows[0]?.rect.width ?? 0` silently rejected every drop whenever the
     * first row was missing -- which is what a filtered or empty tree is -- and
     * a zone that answers "not mine" to everything is indistinguishable from one
     * that is broken.
     */
    const width = Math.max(0, ...snapshot.rows.map((row) => row.rect.width))
    if (width === 0 || x < 0 || x > width) return undefined

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
    (clientX: number, clientY: number, draggedKey: string | undefined) => {
      /*
       * `-1`, a snapshot no drag can be holding, for the reason the canvas
       * gives at its own call site: this one is measured for this release and
       * thrown away, and `0` claims to be drag zero's.
       */
      const snap = measureNow(-1)
      if (!snap) return undefined

      const x = clientX - snap.origin.x
      // The widest row, for the reason the indicator's copy above gives --
      // including the `width === 0` half, which this copy was missing: a tree
      // with no rows has no drop to claim, and `x <= 0` would have claimed one.
      const width = Math.max(0, ...snap.rows.map((row) => row.rect.width))
      if (width === 0 || x < 0 || x > width) return undefined

      const resolved = resolveTreeDrop(snap.rows, clientY - snap.origin.y, draggedKey)
      return resolved ? { parentKey: resolved.parentKey, index: resolved.index } : undefined
    },
    [measureNow],
  )

  useEffect(() => registerZone('tree', resolveRelease), [registerZone, resolveRelease])

  /*
   * One tab stop for the whole tree: the selection if it is still in the
   * document, and the root otherwise. Without this every row is a tab stop and
   * a long form buries the rest of the page behind dozens of them.
   */
  const tabStop =
    selectedKey && flatten(root).some((r) => r.node.key === selectedKey) ? selectedKey : root.key

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
  /** Key of the one row that holds the tab stop. */
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
        /*
         * Always `true` for a row that has children, because every node is
         * expanded and there is no way to collapse one. That is a real state
         * rather than a placeholder -- a tree with no collapse affordance is a
         * tree whose branches are all open -- and `keyboard.ts` relies on it:
         * Right steps to the first child, which has to be in the flattened list
         * for focus to reach it.
         */
        aria-expanded={children.length > 0 ? true : undefined}
        // Roving tabindex: exactly one row is in the tab order, so Tab reaches
        // the tree once and the arrows take over inside it.
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
            /*
             * Out of the tab order, like the row it sits in. The tree is one tab
             * stop with arrow keys inside it, which is what the roving tabindex
             * on the rows is for — and every row's Remove button was a stop of
             * its own, so a forty-component form added thirty-nine of them.
             * Exactly the problem the roving tabindex was added to solve.
             *
             * Reachable without it: Delete on a focused row removes the
             * component, which is the keyboard route the tree already has.
             */
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

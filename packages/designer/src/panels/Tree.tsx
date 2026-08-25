import type { ReactNode } from 'react'
import type { ComponentNode } from '@formsmith/core'

export interface TreeProps {
  root: ComponentNode
  selectedKey: string | undefined
  onSelect: (key: string) => void
  onRemove: (key: string) => void
}

export function Tree({ root, selectedKey, onSelect, onRemove }: TreeProps): ReactNode {
  return (
    <section className="fs-tree">
      <h2 className="fs-panel__heading">Structure</h2>
      <ul role="tree" aria-label="Form structure" className="fs-tree__list">
        <TreeItem
          node={root}
          depth={0}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onRemove={onRemove}
          isRoot
        />
      </ul>
    </section>
  )
}

interface TreeItemProps extends Omit<TreeProps, 'root'> {
  node: ComponentNode
  depth: number
  isRoot?: boolean
}

function TreeItem({
  node,
  depth,
  selectedKey,
  onSelect,
  onRemove,
  isRoot = false,
}: TreeItemProps): ReactNode {
  const selected = node.key === selectedKey
  const children = node.children ?? []

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-selected={selected}
        aria-level={depth + 1}
        aria-expanded={children.length > 0 ? true : undefined}
        tabIndex={selected ? 0 : -1}
        className={'fs-tree__row' + (selected ? ' is-selected' : '')}
        style={{ paddingInlineStart: 8 + depth * 12 }}
        onClick={() => onSelect(node.key)}
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
            />
          ))}
        </ul>
      )}
    </li>
  )
}

import type { ComponentNode } from '@willowforms/core'
import { prop } from '@willowforms/core'
import { node, notes as baseNotes, repeat as baseRepeat, step as baseStep } from './builders.js'

const RECORD_TITLES: Record<string, string> = {
  classes: 'Classes and Hit Dice',
  attacks: 'Attacks',
  features: 'Features and feats',
  resources: 'Limited-use resources',
  inventory: 'Inventory',
  spells: 'Spellbook',
  connections: 'Allies and connections',
  quests: 'Quests',
  sessions: 'Session journal',
}

export function styled(component: ComponentNode, css: string): ComponentNode {
  component.css = { ...component.css, any: (component.css?.any ?? '') + css }
  return component
}

/**
 * The character sheet's grid: a tighter gap and narrower minimum column than the shared builder,
 * and it fills the sheet width.
 */
export function grid(
  key: string,
  children: ComponentNode[],
  columns = 2,
  minimum = 160,
): ComponentNode {
  return node('Grid', key, { columns, minColumnWidth: minimum, gap: 12, fillWidth: true }, children)
}

/**
 * A character-sheet section: a ruled serif heading over a Stack, in place of the shared builder's
 * outlined Card.
 */
export function section(key: string, title: string, children: ComponentNode[]): ComponentNode {
  return styled(
    node('Stack', key, { gap: 12 }, [
      styled(
        node('Heading', key + 'Title', { text: title, level: 'h3' }),
        'font-family:Cambria,Georgia,serif; font-size:20px; font-weight:600; padding-bottom:8px; border-bottom:1px solid var(--sheet-line);',
      ),
      ...children,
    ]),
    'min-width:0;',
  )
}

export function repeat(
  key: string,
  label: string,
  children: ComponentNode[],
  help: string,
): ComponentNode {
  const result = baseRepeat(key, label, children, help)
  result.props['gap'] = prop(12)
  result.children = [node('Stack', key + 'Row', { gap: 12 }, children)]
  return section(key + 'Section', RECORD_TITLES[key] ?? label, [result])
}

export const notes = (key: string, label: string, help = ''): ComponentNode => {
  const result = baseNotes(key, label, help)
  result.props['rows'] = prop(2)
  return result
}

export const wide = (component: ComponentNode): ComponentNode =>
  styled(component, 'grid-column:1 / -1;')

export function step(key: string, title: string, children: ComponentNode[]): ComponentNode {
  const result = baseStep(key, title, children)
  result.props['gap'] = prop(18)
  styled(
    result.children![0]!,
    'font-family:Cambria,Georgia,serif; font-size:22px; font-weight:500;',
  )
  return result
}

export function folioStep(key: string, title: string, children: ComponentNode[]): ComponentNode {
  return step(key, title, [
    styled(
      node(
        'Grid',
        key + 'Columns',
        { columns: 2, minColumnWidth: 480, gap: 28, fillWidth: true },
        children,
      ),
      'align-items:start;',
    ),
  ])
}

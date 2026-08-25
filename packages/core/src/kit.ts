/**
 * The kit registry contract.
 *
 * This is the seam the whole product is built on: the designer knows about
 * ComponentDef metadata and nothing about MUI, shadcn, or any other library.
 * A kit contributes palette entries and property schemas here; it contributes
 * React components in @formsmith/renderer. Keeping the two apart is what lets
 * @formsmith/core run in Node for server-side validation.
 */

import type { EventName, FieldSchema, JsonValue } from './types.js'

export type PaletteGroup =
  | 'inputs'
  | 'selection'
  | 'layout'
  | 'display'
  | 'feedback'
  | 'navigation'
  | 'custom'

/** Which editor the properties panel renders for a prop. */
export type PropEditor =
  | 'string'
  | 'multiline'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'icon'
  | 'code'
  | 'json'

export interface PropOption {
  label: string
  value: JsonValue
}

export interface PropSchema {
  name: string
  label: string
  editor: PropEditor
  /** Required when editor is 'select'. */
  options?: PropOption[]
  /** Shown under the control in the properties panel. */
  hint?: string
  /** May be bound to a JS expression. Defaults to true. */
  computable?: boolean
  /** May be bound to a translation key. Set this on user-facing copy. */
  localizable?: boolean
  /** Which properties-panel tab this row belongs to. Defaults to 'main'. */
  section?: 'main' | 'style' | 'advanced'
}

export interface ComponentDef {
  /** Kit-scoped id, matches ComponentNode.type. */
  type: string
  /** Palette display name. */
  label: string
  group: PaletteGroup
  /** Icon id resolved by the kit's renderer. */
  icon?: string
  /** Accepts children. */
  container?: boolean
  /** Participates in form data and therefore gets a schema. */
  dataBound?: boolean
  /** Default FieldSchema type for data-bound components. */
  dataType?: FieldSchema['type']
  defaultProps: Record<string, JsonValue>
  props: PropSchema[]
  events: EventName[]
}

export interface Kit {
  id: string
  label: string
  components: ComponentDef[]
}

/** Index a kit's components by type for O(1) lookup. */
export function indexKit(kit: Kit): ReadonlyMap<string, ComponentDef> {
  return new Map(kit.components.map((c) => [c.type, c]))
}

/** Group a kit's components for palette rendering, preserving declaration order. */
export function groupKit(kit: Kit): Array<{ group: PaletteGroup; components: ComponentDef[] }> {
  const out: Array<{ group: PaletteGroup; components: ComponentDef[] }> = []
  for (const component of kit.components) {
    let bucket = out.find((b) => b.group === component.group)
    if (!bucket) {
      bucket = { group: component.group, components: [] }
      out.push(bucket)
    }
    bucket.components.push(component)
  }
  return out
}

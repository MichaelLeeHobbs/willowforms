import type { EventName, FieldSchema, JsonValue, PropValue } from './types.js'

export type PaletteGroup =
  'inputs' | 'selection' | 'layout' | 'display' | 'feedback' | 'navigation' | 'custom'

export type IconName =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'file'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'switch'
  | 'button'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'link'
  | 'divider'
  | 'stack'
  | 'grid'
  | 'box'
  | 'card'
  | 'screen'
  | 'tablet'
  | 'mobile'
  | 'repeat'
  | 'alert'
  | 'tabs'
  | 'chevron'
  | 'copy'
  | 'plus'
  | 'trash'
  | 'progress'

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
  | 'options'
  | 'image'

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
  hint?: string
  /** Defaults to true. */
  computable?: boolean
  localizable?: boolean
  /** Only for a property that takes a boolean, since a condition resolves to one. */
  conditional?: boolean
  section?: 'main' | 'style' | 'advanced'
}

export interface ComponentDef {
  type: string
  label: string
  group: PaletteGroup
  icon?: IconName
  container?: boolean
  /** A starting value, not a constraint: an author can edit or delete it. */
  defaultRenderWhen?: (key: string) => PropValue
  /**
   * Exactly one component per kit declares this, and it is the type `emptyRoot()` produces.
   * Never offered in the palette: a second one would nest a screen inside a screen.
   */
  root?: boolean
  dataBound?: boolean
  dataType?: FieldSchema['type']
  defaultProps: Record<string, JsonValue>
  /** Creation-only values; omitted properties in saved nodes still use defaultProps. */
  initialProps?: Record<string, JsonValue>
  props: PropSchema[]
  events: EventName[]
}

export interface Kit {
  id: string
  label: string
  components: ComponentDef[]
}

function componentsOf(kit: Kit): ComponentDef[] {
  if (!kit || !Array.isArray(kit.components)) return []
  return kit.components.filter(
    (component): component is ComponentDef =>
      Boolean(component) &&
      typeof component === 'object' &&
      typeof component.type === 'string' &&
      // `instantiate` refuses an empty `type`, so the palette would offer an
      // entry that does nothing when dropped.
      component.type.length > 0,
  )
}

export function indexKit(kit: Kit): ReadonlyMap<string, ComponentDef> {
  const byType = new Map<string, ComponentDef>()
  for (const component of componentsOf(kit)) {
    if (!byType.has(component.type)) byType.set(component.type, component)
  }
  return byType
}

export function groupKit(kit: Kit): Array<{ group: PaletteGroup; components: ComponentDef[] }> {
  const out: Array<{ group: PaletteGroup; components: ComponentDef[] }> = []

  const resolved = indexKit(kit)

  for (const component of componentsOf(kit)) {
    if (component.root === true) continue
    if (resolved.get(component.type) !== component) continue
    let bucket = out.find((b) => b.group === component.group)
    if (!bucket) {
      bucket = { group: component.group, components: [] }
      out.push(bucket)
    }
    bucket.components.push(component)
  }
  return out
}

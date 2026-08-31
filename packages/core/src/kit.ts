/**
 * The kit registry contract.
 *
 * This is the seam the whole product is built on: the designer knows about
 * ComponentDef metadata and nothing about MUI, shadcn, or any other library.
 * A kit contributes palette entries and property schemas here; it contributes
 * React components in @formsmith/renderer. Keeping the two apart is what lets
 * @formsmith/core run in Node for server-side validation.
 */

import type { EventName, FieldSchema, JsonValue, PropValue } from './types.js'

export type PaletteGroup =
  'inputs' | 'selection' | 'layout' | 'display' | 'feedback' | 'navigation' | 'custom'

/**
 * The closed set of icons a kit may ask for.
 *
 * Core names them, the designer draws them, and a kit picks from the list. That
 * ordering is forced: the designer imports no component library and therefore no
 * icon library, so the drawings have to be its own. Making the vocabulary a
 * union rather than a string is what gives two kits the same visual language and
 * turns a typo into a compile error.
 *
 * A kit needing an icon outside this set has to ask for one. That is the cost of
 * the approach and it is deliberate: the alternative, letting a kit supply its
 * own path data, ends with every kit reinventing the same twenty glyphs and the
 * metadata half no longer being plain data.
 */
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

/** Which editor the properties panel renders for a prop. */
export type PropEditor =
  'string' | 'multiline' | 'number' | 'boolean' | 'select' | 'color' | 'icon' | 'code' | 'json'

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
  /**
   * May be bound to a structured condition. Set this on properties that take a
   * boolean, since a condition resolves to one.
   *
   * Opt-in rather than inferred from the editor, because `boolean` covers both
   * "is this disabled" and "did the user tick it", and only the first is worth
   * making conditional.
   */
  conditional?: boolean
  /** Which properties-panel tab this row belongs to. Defaults to 'main'. */
  section?: 'main' | 'style' | 'advanced'
}

export interface ComponentDef {
  /** Kit-scoped id, matches ComponentNode.type. */
  type: string
  /** Palette display name. */
  label: string
  group: PaletteGroup
  /** Palette icon, from the vocabulary core declares. */
  icon?: IconName
  /** Accepts children. */
  container?: boolean
  /**
   * A visibility rule a freshly dropped instance starts with.
   *
   * For a component that only means something under a condition. A `Step` is a
   * container shown when `context.step` equals its own key, and that condition
   * is the entire difference between a step and a box — so a kit states it here
   * rather than asking every author to write it by hand in the picker and get
   * the path right.
   *
   * A starting value, not a constraint. The Rules tab edits it afterwards like
   * any other `renderWhen`, including deleting it.
   */
  defaultRenderWhen?: (key: string) => PropValue
  /**
   * The document root. Exactly one component per kit declares this, and it is
   * the type `emptyRoot()` produces. It is never offered in the palette: the
   * root already exists, and dropping a second one nests a screen inside a
   * screen. It used to appear there, because the palette showed everything.
   */
  root?: boolean
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

/**
 * Index a kit's components by type for O(1) lookup.
 *
 * The **first** declaration of a type wins, and `groupKit` below drops the rest,
 * so the two readings of a kit agree. A `Map` built from the list keeps the
 * last, while the palette listed both -- so a kit declaring `TextField` twice
 * drew two entries, one of which added a node whose renderer was the other
 * definition's. A kit is third-party code and can do this by accident when two
 * files are merged.
 */
export function indexKit(kit: Kit): ReadonlyMap<string, ComponentDef> {
  const byType = new Map<string, ComponentDef>()
  for (const component of kit.components) {
    if (!byType.has(component.type)) byType.set(component.type, component)
  }
  return byType
}

/**
 * Group a kit's components for palette rendering, preserving declaration order.
 *
 * The root component is left out. This is the only place the palette's contents
 * are decided, so excluding it here excludes it from the panel, its search, and
 * every drag source at once.
 */
export function groupKit(kit: Kit): Array<{ group: PaletteGroup; components: ComponentDef[] }> {
  const out: Array<{ group: PaletteGroup; components: ComponentDef[] }> = []
  const seen = new Set<string>()

  for (const component of kit.components) {
    if (component.root === true) continue
    // One entry per type, the first, which is the one `indexKit` resolves to.
    if (seen.has(component.type)) continue
    seen.add(component.type)
    let bucket = out.find((b) => b.group === component.group)
    if (!bucket) {
      bucket = { group: component.group, components: [] }
      out.push(bucket)
    }
    bucket.components.push(component)
  }
  return out
}

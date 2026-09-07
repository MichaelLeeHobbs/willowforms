import { indexKit, instantiate, prop, walk } from '@willowforms/core'
import type { ComponentDef, ComponentNode, IconName, JsonValue, Kit } from '@willowforms/core'

export type PresetId = 'section' | 'statistics' | 'entry'

interface Recipe {
  type: string
  props: Record<string, JsonValue>
  children?: Recipe[]
}

export interface AuthoringPreset {
  id: PresetId
  label: string
  description: string
  icon: IconName
  recipe: Recipe
}

const PRESETS: AuthoringPreset[] = [
  {
    id: 'section',
    label: 'Ruled section',
    description: 'A heading, divider, and starter field.',
    icon: 'heading',
    recipe: {
      type: 'Stack',
      props: { gap: 12 },
      children: [
        { type: 'Heading', props: { text: 'Section title', level: 'h3' } },
        { type: 'Divider', props: {} },
        { type: 'TextField', props: { label: 'Your response' } },
      ],
    },
  },
  {
    id: 'statistics',
    label: 'Statistics row',
    description: 'Three numbers in a compact, responsive grid.',
    icon: 'grid',
    recipe: {
      type: 'Grid',
      props: { columns: 3, minColumnWidth: 120, fillWidth: true, density: 'compact', gap: 12 },
      children: [1, 2, 3].map((n) => ({
        type: 'NumberField',
        props: { label: `Statistic ${String(n)}` },
      })),
    },
  },
  {
    id: 'entry',
    label: 'Repeatable entry',
    description: 'An item and quantity that people can add again.',
    icon: 'repeat',
    recipe: {
      type: 'Repeater',
      props: { label: 'Entry', density: 'compact', gap: 12 },
      children: [
        {
          type: 'Grid',
          props: { columns: 2, minColumnWidth: 180, fillWidth: true, gap: 12 },
          children: [
            { type: 'TextField', props: { label: 'Item' } },
            { type: 'NumberField', props: { label: 'Quantity' } },
          ],
        },
      ],
    },
  },
]

function supports(recipe: Recipe, definitions: ReadonlyMap<string, ComponentDef>): boolean {
  const def = definitions.get(recipe.type)
  const dataTypes: Record<string, string> = {
    TextField: 'string',
    NumberField: 'number',
    Repeater: 'array',
  }
  const dataType = dataTypes[recipe.type]
  return Boolean(
    def &&
    (!recipe.children || def.container) &&
    (!dataType || (def.dataBound && (def.dataType ?? 'string') === dataType)) &&
    Object.keys(recipe.props).every((name) => def.props.some((entry) => entry.name === name)) &&
    (recipe.children ?? []).every((child) => supports(child, definitions)),
  )
}

export function availablePresets(kit: Kit): AuthoringPreset[] {
  const definitions = indexKit(kit)
  return PRESETS.filter((preset) => supports(preset.recipe, definitions))
}

export function buildPreset(
  id: PresetId,
  kit: Kit,
  root: ComponentNode,
): ComponentNode | undefined {
  const preset = availablePresets(kit).find((entry) => entry.id === id)
  if (!preset) return undefined
  const definitions = indexKit(kit)
  const reserved: ComponentNode = { ...root, children: [...(root.children ?? [])] }
  // Answer aliases also reserve names, so a new field cannot overwrite an existing answer.
  walk(root, (node) => {
    if (node.dataKey) reserved.children!.push({ key: node.dataKey, type: node.type, props: {} })
  })
  function build(recipe: Recipe): ComponentNode | undefined {
    const def = definitions.get(recipe.type)
    const node = def && instantiate(def, reserved)
    if (!node) return undefined
    reserved.children!.push(node)
    const children = recipe.children?.map(build)
    if (children?.some((child) => !child)) return undefined
    return {
      ...node,
      props: {
        ...node.props,
        ...Object.fromEntries(
          Object.entries(recipe.props).map(([name, value]) => [name, prop(value)]),
        ),
      },
      ...(children ? { children: children as ComponentNode[] } : {}),
    }
  }
  return build(preset.recipe)
}

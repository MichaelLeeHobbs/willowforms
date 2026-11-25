import type { ComponentDef } from './kit.js'
import type { ComponentNode, FormDocument, JsonValue, PropValue } from './types.js'
import { generateKey } from './tree.js'

export function prop(value: JsonValue): PropValue {
  return { kind: 'static', value }
}

export function emptyRoot(): ComponentNode {
  return { key: 'root', type: 'Screen', props: {}, children: [] }
}

export function createDocument(name: string, id: string): FormDocument {
  return {
    version: '1',
    id,
    name,
    root: emptyRoot(),
    actions: {},
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  }
}

export function instantiate(def: ComponentDef, root: ComponentNode): ComponentNode | undefined {
  const built = Object.create(null) as Record<string, PropValue>

  for (const defaults of [def.defaultProps, def.initialProps]) {
    if (defaults && typeof defaults === 'object' && !Array.isArray(defaults)) {
      for (const [name, value] of Object.entries(defaults)) {
        built[name] = prop(value)
      }
    }
  }

  const props: Record<string, PropValue> = { ...built }

  if (typeof def.type !== 'string' || def.type.length === 0) return undefined

  const node: ComponentNode = {
    key: generateKey(root, def.type),
    type: def.type,
    props,
  }

  if (def.container) node.children = []
  if (def.dataBound) node.schema = { type: def.dataType ?? 'string', validations: [] }

  // A kit supplies this function: one that throws yields a component with no condition rather
  // than taking the designer down on drop.
  if (def.defaultRenderWhen) {
    try {
      node.renderWhen = def.defaultRenderWhen(node.key)
    } catch {
      // Reported by nothing here: core has no logger and the caller sees a
      // component that rendered. A condition that cannot be built is not one.
    }
  }

  return node
}

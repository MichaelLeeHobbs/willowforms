/** Constructors for the common cases, so callers do not hand-assemble literals. */

import type { ComponentDef } from './kit.js'
import type { ComponentNode, FormDocument, JsonValue, PropValue } from './types.js'
import { generateKey } from './tree.js'

/** Shorthand for a static property value. */
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

/**
 * Instantiate a palette entry as a tree node, assigning a free key and seeding
 * props from the definition's defaults.
 */
export function instantiate(def: ComponentDef, root: ComponentNode): ComponentNode {
  const props: Record<string, PropValue> = {}
  for (const [name, value] of Object.entries(def.defaultProps)) {
    props[name] = prop(value)
  }

  const node: ComponentNode = {
    key: generateKey(root, def.type),
    type: def.type,
    props,
  }

  if (def.container) node.children = []
  if (def.dataBound) node.schema = { type: def.dataType ?? 'string', validations: [] }

  // After the key, because a rule that names the node needs one to name.
  if (def.defaultRenderWhen) node.renderWhen = def.defaultRenderWhen(node.key)

  return node
}

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

/**
 * A new, empty document.
 *
 * `en-US` is the default language and there is no parameter for it, on purpose:
 * a document with no language cannot be authored at all -- every translation
 * bundle is keyed by tag -- and asking every caller to choose one before they
 * have a form is a question with no useful answer at that moment. The Settings
 * tab renames, adds and removes languages, including this one.
 */
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
export function instantiate(def: ComponentDef, root: ComponentNode): ComponentNode | undefined {
  const built = Object.create(null) as Record<string, PropValue>

  const defaults: unknown = def.defaultProps
  if (defaults && typeof defaults === 'object' && !Array.isArray(defaults)) {
    for (const [name, value] of Object.entries(defaults as Record<string, JsonValue>)) {
      built[name] = prop(value)
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

  /*
   * After the key, because a rule that names the node needs one to name.
   *
   * And in a `try`, for the same reason as the loop above: this is a function a
   * kit supplies, so "it will not throw" is not a property this can rely on.
   * A kit whose default condition throws gets a component with no condition,
   * which is the shape every other component has, rather than a palette entry
   * that takes the designer down when it is dragged.
   */
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

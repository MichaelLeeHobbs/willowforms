/**
 * Per-component styling, turned into a stylesheet.
 *
 * `ComponentNode.css` is raw CSS text per breakpoint, and it comes from a
 * document, which is data: authored by one person, deployed by another, and
 * hand-editable in between. So the text is **declarations only**, and anything
 * that could leave the block it is placed in is refused rather than escaped.
 *
 * That is the same boundary the rest of the project draws. The designer's own
 * stylesheet is forbidden from reaching into a kit's components by a test that
 * parses it; a Style tab that let an author write `input { padding: 0 }` would
 * hand every author the ability to make that mistake one form at a time.
 */

import type { ComponentNode, Device } from './types.js'
import { walk } from './tree.js'

/**
 * Which widths each device means at runtime.
 *
 * The designer simulates a device by sizing a frame, so on the canvas the
 * device is chosen explicitly and these are not used. In a real page there is
 * no frame and the viewport is the viewport, so the same document has to become
 * media queries. Both paths come from this one table.
 */
export const DEVICE_QUERY: Record<Exclude<Device, 'any'>, string> = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
}

/**
 * Characters that would let a declaration stop being a declaration.
 *
 * `{` and `}` end the block and start a new rule, which is how a component's
 * styling would reach the whole page. `<` is how it would leave CSS entirely,
 * since this text is placed inside a `<style>` element and `</style>` closes
 * it. `@` opens an at-rule, and `@import` fetches from wherever it likes.
 *
 * Refused as a set rather than escaped, because escaping invites an argument
 * about which escape is sufficient and this needs none.
 */
const FORBIDDEN = /[{}<@]/

/**
 * The declarations, or nothing if the text is not only declarations.
 *
 * Returning nothing rather than a cleaned-up version is deliberate: silently
 * changing what an author wrote is how a rule ends up meaning something nobody
 * asked for. The designer says the text was refused; the renderer leaves it out.
 */
export function safeDeclarations(text: string | undefined): string | undefined {
  if (!text) return undefined
  const trimmed = text.trim()
  if (!trimmed) return undefined
  return FORBIDDEN.test(trimmed) ? undefined : trimmed
}

/** A CSS string selector for one node, with the key escaped for the attribute. */
function selectorFor(key: string): string {
  // The key is author-controlled, so it is quoted and its quotes are escaped.
  return '[data-fs-key="' + key.replace(/["\\]/g, '\\$&') + '"]'
}

/**
 * A stylesheet for everything in the tree that carries `css`.
 *
 * `any` is the base layer, applied at every width, and a device entry overrides
 * it at that device's widths. It is not a fourth breakpoint: a component with
 * only `any` looks the same everywhere, which is what an author who never opens
 * the viewport switcher should get.
 *
 * With a `device` argument the rules for that device are emitted flat, with no
 * media query, which is what the designer's canvas needs: it simulates a device
 * by sizing a frame, and a media query would answer about the browser window
 * instead. Without one, every device becomes its query.
 */
export function styleSheetFor(root: ComponentNode, device?: Device): string {
  const base: string[] = []
  const queried: Partial<Record<Exclude<Device, 'any'>, string[]>> = {}

  walk(root, (node) => {
    const css = node.css
    if (!css) return

    const selector = selectorFor(node.key)
    const always = safeDeclarations(css.any)
    if (always) base.push(selector + '{' + always + '}')

    for (const name of ['mobile', 'tablet', 'desktop'] as const) {
      const declarations = safeDeclarations(css[name])
      if (!declarations) continue

      /*
       * A simulated device emits only its own rules, after the base, so the
       * cascade order on the canvas is the order they appear. Two device
       * entries never apply at once, so nothing has to be resolved between
       * them.
       */
      if (device) {
        if (name === device) base.push(selector + '{' + declarations + '}')
        continue
      }
      ;(queried[name] ??= []).push(selector + '{' + declarations + '}')
    }
  })

  const media = (Object.keys(queried) as Exclude<Device, 'any'>[]).map(
    (name) => '@media ' + DEVICE_QUERY[name] + '{' + (queried[name] ?? []).join('') + '}',
  )

  return [...base, ...media].join('')
}

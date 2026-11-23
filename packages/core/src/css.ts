/**
 * `ComponentNode.css` comes from a document, which is data, so it must be
 * declarations only: anything that could leave its block is refused, not
 * escaped. Keys are escaped rather than refused, because refusing one would
 * break a document that already renders.
 */

import type { ComponentNode, Device } from './types.js'
import { walk } from './tree.js'

export interface StyleSheetOptions {
  /** Emit only this device's rules, flat. For a canvas that simulates a width. */
  device?: Device | undefined
  /**
   * Confine every rule to one rendered form.
   *
   * Keys are unique within a document, not within a page. Two forms rendered
   * together share a `root` key and usually more, so the renderer passes a
   * per-instance scope and puts the matching attribute on every node.
   */
  scope?: string | undefined
}

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

/** Tokens that can escape, obscure, or extend the generated declaration block. */
const FORBIDDEN = /[{}<@\\]|\/\*|\*\//

function quotesBalanced(text: string): boolean {
  let single = 0
  let double = 0
  for (let i = 0; i < text.length; i += 1) {
    // Keep this helper correct when called independently of the token check.
    if (text[i] === '\\') {
      i += 1
      continue
    }
    if (text[i] === "'" && double % 2 === 0) single += 1
    if (text[i] === '"' && single % 2 === 0) double += 1
  }
  return single % 2 === 0 && double % 2 === 0
}

/**
 * The declarations, or nothing if the text is not only declarations.
 *
 * Returning nothing rather than a cleaned-up version is deliberate: silently
 * changing what an author wrote is how a rule ends up meaning something nobody
 * asked for. The designer says the text was refused; the renderer leaves it out.
 */
export function safeDeclarations(text: string | undefined): string | undefined {
  if (!text) return undefined
  // Documents are external data; a non-string style is simply unusable.
  if (typeof text !== 'string') return undefined
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (FORBIDDEN.test(trimmed)) return undefined
  if (!quotesBalanced(trimmed)) return undefined
  if (FETCHING.test(trimmed)) return undefined
  return trimmed
}

/**
 * Stricter than `FORBIDDEN` because it judges one value, not a list: `;` would
 * start a second declaration, `!` an unasked `!important`, a control character
 * ends a CSS string, and a backslash can spell `url(` as `\75 rl(`.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_VALUE = /[{}<@;!\\]|\/\*|[\u0000-\u001f\u007f]/

/** Resource-producing CSS functions, matched inside vendor-prefixed spellings too. */
const FETCHING = /(url|image-set|element|cross-fade)\s*\(/i

/**
 * One style value, or nothing if it could be more than one.
 *
 * Called at the sink rather than at document load, because `resolveProp`
 * evaluates a `computed` binding through the host's evaluator at render time, so
 * the string a kit is handed need not appear in the document at all.
 *
 * Nothing rather than a cleaned-up value, for the reason `safeDeclarations`
 * gives: an author who wrote something refusable is better served by the
 * property being absent than by a value they did not write.
 */
export function safeStyleValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  // A host evaluator can hand back any type; a non-string value is unusable.
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (FORBIDDEN_VALUE.test(trimmed) || FETCHING.test(trimmed)) return undefined
  return trimmed
}

function escapeKey(key: string): string {
  return key.replace(
    // Control characters on purpose: a raw newline inside a CSS string ends it.
    // eslint-disable-next-line no-control-regex
    /["\\<]|[\u0000-\u001f\u007f]/g,
    (ch) => '\\' + (ch.codePointAt(0) ?? 0).toString(16).padStart(6, '0') + ' ',
  )
}

/**
 * The scope is a compound, not a descendant, selector so it also matches the
 * root node, which carries both attributes.
 */
function selectorFor(key: string, scope: string | undefined): string {
  const within = scope === undefined ? '' : '[data-fs-scope="' + escapeKey(scope) + '"]'
  return within + '[data-fs-key="' + escapeKey(key) + '"]'
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
export function styleSheetFor(root: ComponentNode, options: StyleSheetOptions = {}): string {
  const { device, scope } = options
  const base: string[] = []
  const queried: Partial<Record<Exclude<Device, 'any'>, string[]>> = {}

  walk(root, (node) => {
    const css = node.css
    if (!css) return

    // Invalid nodes are omitted without suppressing usable rules from siblings.
    if (typeof node.key !== 'string') return

    const selector = selectorFor(node.key, scope)
    const always = safeDeclarations(css.any)
    if (always) base.push(selector + '{' + always + '}')

    for (const name of ['mobile', 'tablet', 'desktop'] as const) {
      const declarations = safeDeclarations(css[name])
      if (!declarations) continue

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

export function parseDeclarations(text: string | undefined): [string, string][] {
  if (!text) return []

  const out: [string, string][] = []
  for (const part of splitTop(text, ';')) {
    const [name, value] = splitTop(part, ':', 1)
    const trimmed = normaliseName(name)
    if (trimmed && value?.trim()) out.push([trimmed, value.trim()])
  }
  return out
}

/**
 * CSS property names are case-insensitive, but custom property names are not:
 * `--brandColor` and `--brandcolor` are different properties.
 */
function normaliseName(name: string | undefined): string {
  const trimmed = name?.trim() ?? ''
  return trimmed.startsWith('--') ? trimmed : trimmed.toLowerCase()
}

/** `limit` caps the number of splits, not pieces, so a value keeps its own `:`. */
function splitTop(text: string, separator: string, limit = Infinity): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quote: string | undefined
  let splits = 0

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== undefined) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = undefined
      continue
    }
    // A backslash escapes the next character anywhere in CSS, not only in strings.
    if (ch === '\\') i += 1
    else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === separator && depth === 0 && splits < limit) {
      parts.push(text.slice(start, i))
      start = i + 1
      splits += 1
    }
  }

  parts.push(text.slice(start))
  return parts
}

/** Declarations back to text, one per line so the raw field stays readable. */
export function printDeclarations(declarations: [string, string][]): string {
  return declarations.map(([name, value]) => name + ': ' + value).join(';\n')
}

export function setDeclaration(
  text: string | undefined,
  name: string,
  value: string | undefined,
): string {
  const wanted = normaliseName(name)
  const declarations = parseDeclarations(text)
  const trimmed = value?.trim()
  const at = declarations.findIndex(([key]) => key === wanted)

  /*
   * In place, which is what this function's docblock already claimed.
   *
   * It filtered the property out and pushed it back on the end, so editing
   * `color` in `color: red; padding: 8px` produced `padding: 8px; color: red` --
   * every structured control in the Style tab reordering the raw text under the
   * author's cursor, and the cascade with it where two properties overlap.
   */
  if (at === -1) {
    if (trimmed) declarations.push([wanted, trimmed])
  } else if (trimmed) {
    declarations[at] = [wanted, trimmed]
  } else {
    declarations.splice(at, 1)
  }

  return printDeclarations(declarations)
}

/** What a property is set to in this text, if anything. */
export function readDeclaration(text: string | undefined, name: string): string {
  const wanted = normaliseName(name)
  return parseDeclarations(text).find(([key]) => key === wanted)?.[1] ?? ''
}

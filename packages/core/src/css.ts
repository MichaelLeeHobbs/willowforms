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
 *
 * Keys are escaped rather than refused, because unlike the declarations they
 * are not something an author is writing here. Refusing one would break a
 * document that already renders, over a character in a name.
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

/**
 * Characters that would let a declaration stop being a declaration.
 *
 * `{` and `}` end the block and start a new rule, which is how a component's
 * styling would reach the whole page. `<` is how it would leave CSS entirely,
 * since this text is placed inside a `<style>` element and `</style>` closes
 * it. `@` opens an at-rule, and `@import` fetches from wherever it likes.
 *
 * A comment belongs here too, and it does not end the block so much as swallow
 * it. One node opens a comment at the end of its declarations and another
 * closes one at the start of its own; the two are concatenated into a single
 * stylesheet, and everything between them disappears inside it. A third node's
 * rule is deleted, and one node's declaration lands under another's selector.
 *
 * That cannot reach outside the form, so it is not the injection
 * `safeStyleValue` is for. What it breaks is the sentence this file opens with:
 * a component's styling affects that component.
 *
 * Refused as a set rather than escaped, and both halves of the pair rather than
 * only the opener, because deciding which comment is safe invites an argument
 * this does not need.
 */
const FORBIDDEN = /[{}<@]|\/\*|\*\//

/**
 * Whether every quote in a declaration block is closed.
 *
 * `FORBIDDEN` refuses a literal `}`, and a `}` inside an unterminated string is
 * not one it can see: `content: "` swallows the closing brace of its own rule
 * and every rule after it until the next quote, so a third component's
 * declarations land under this one's selector. The same breakage the brace check
 * exists to stop, arriving by a route it does not look at.
 *
 * Balance rather than parsing: a declaration block with an odd number of either
 * quote is refused, which is a rule an author can predict and a check that
 * cannot be talked around.
 */
function quotesBalanced(text: string): boolean {
  let single = 0
  let double = 0
  for (let i = 0; i < text.length; i += 1) {
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
  /*
   * A document is data, so `css.mobile` can be a number or an object, and
   * `.trim()` on one throws out of `styleSheetFor` -- which the renderer calls
   * during render, so the whole form goes. Refused rather than coerced: a
   * stylesheet is text, and something that is not text is not a stylesheet.
   */
  if (typeof text !== 'string') return undefined
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (FORBIDDEN.test(trimmed)) return undefined
  if (!quotesBalanced(trimmed)) return undefined
  /*
   * And the raw block may not fetch either.
   *
   * `safeStyleValue` refuses `url(...)` by name, calling it an exfiltration
   * channel: a request keyed off a field, from a page collecting answers, to an
   * address the document chose. The raw Style tab block reached the page through
   * a `<style>` element and was never asked. Two sinks for author-supplied CSS,
   * one of them checked, and the unchecked one is the one that takes arbitrary
   * text.
   */
  if (FETCHING.test(trimmed)) return undefined
  return trimmed
}

/**
 * Characters that would let a single value stop being a single value.
 *
 * A superset of `FORBIDDEN`, and deliberately not the same regex. That one
 * judges a declaration *list*, where `;` separates and a `data:` URI needs one
 * in the middle of it. This one judges one value on one prop, where `;` starts a
 * second declaration the author did not write and nothing legitimate needs it.
 * Two sinks, two grammars.
 *
 * `!` goes with them because `!important` on a value the author did not mark is
 * a document overriding the page, and `/*` because a comment can swallow the
 * rest of the block. Control characters end a CSS string, and a backslash is how
 * `url(` is written as `\75 rl(` without the letters ever appearing.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_VALUE = /[{}<@;!\\]|\/\*|[\u0000-\u001f\u007f]/

/**
 * Value functions that fetch, or that paint something the author did not author.
 *
 * Refused on top of the character set, because a fetch is not an injection and
 * the character set does not catch one. `url(https://…)` is well-formed CSS that
 * both sinks accept, and on a page whose whole purpose is collecting answers,
 * `[data-fs-key="ssn"]{background:url(…)}` is an exfiltration channel rather
 * than a broken rule.
 *
 * These are refused rather than escaped for the same reason the declaration
 * list refuses braces, and the domain agrees: the only string-typed style value
 * either kit exposes is `background`, whose declared editor is `color`, and a
 * URL is not a colour. The Style tab remains the channel for real CSS.
 *
 * Written as substrings so a vendor prefix is covered by the unprefixed name.
 */
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
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (FORBIDDEN_VALUE.test(trimmed) || FETCHING.test(trimmed)) return undefined
  return trimmed
}

/**
 * A key, as a CSS string, safe to place inside a `<style>` element.
 *
 * Keys are validated as non-empty and nothing else, and a document is data, so
 * a key holding `</style>` is a string somebody can type. Quoting the attribute
 * selector stops that breaking the *selector*; it does nothing about breaking
 * out of the style element itself, which is script injection rather than a
 * broken rule. `<` is escaped for that reason rather than for CSS's.
 *
 * Six-digit hex escapes with a space after them, which is what the grammar
 * wants: a CSS parser reads at most six hex digits and then swallows one
 * following whitespace character as the terminator. Without a space of our own
 * it swallowed the author's -- a key of `" b` produced an escape followed by
 * the real space, which parses as `"b`, so the selector named a string the
 * attribute does not hold and the rule matched nothing. Control characters go
 * the same way: a raw newline ends a CSS string.
 */
function escapeKey(key: string): string {
  return key.replace(
    // The control range is the point, not an accident: a raw newline or a NUL
    // inside a CSS string ends it, and a key can hold either.
    // eslint-disable-next-line no-control-regex
    /["\\<]|[\u0000-\u001f\u007f]/g,
    (ch) => '\\' + (ch.codePointAt(0) ?? 0).toString(16).padStart(6, '0') + ' ',
  )
}

/**
 * A selector for one node, optionally confined to one rendered form.
 *
 * A key is unique inside a document and nowhere else. Two forms on one page
 * both have a `root`, and usually an `email`, so with no scope the first form's
 * stylesheet reaches into the second. The scope is a compound rather than a
 * descendant selector so that it also matches the root node, which carries both
 * attributes itself.
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

    const selector = selectorFor(node.key, scope)
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

/**
 * The declarations in a block, in the order they were written.
 *
 * The Style tab offers structured controls and a raw field over one string, so
 * both have to read and write the same text. Storing them separately would be
 * two sources for one value and a merge nobody can specify.
 *
 * Small, but not as small as `text.split(';')`, which was the first version and
 * was wrong. A `;` is only a separator at the top level: inside quotes it is
 * text, and inside parentheses it belongs to the function. `background:
 * url(data:image/svg+xml;base64,…)` is the case that matters, because a data
 * URI has a `;` in the middle of it and splitting there truncates the value.
 *
 * That is worse than a display bug. The Style tab's structured controls rewrite
 * this text every time one of them is touched, so editing the padding would
 * silently destroy a background nobody was editing, and the promise that a
 * control only ever touches its own declaration would be false.
 *
 * A `:` inside a value is the same problem in miniature, which is why the split
 * between name and value walks rather than calling `indexOf`.
 */
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
 * A property name, folded to lower case unless it is a custom property.
 *
 * CSS property names are case-insensitive, so a control looking for `padding`
 * has to find `PADDING` — which is why this folded everything. Custom property
 * names are **not**: `--brandColor` and `--brandcolor` are two different
 * properties. Folding them meant that touching any structured control rewrote
 * the name, and the `var()` that read it stopped matching. Silently, because the
 * declaration is still there and still valid CSS.
 */
function normaliseName(name: string | undefined): string {
  const trimmed = name?.trim() ?? ''
  return trimmed.startsWith('--') ? trimmed : trimmed.toLowerCase()
}

/**
 * Split on a separator, ignoring any that is inside quotes or parentheses.
 *
 * `limit` caps the number of splits, not the number of pieces, so a value
 * holding its own `:` survives: `background: url(a:b)` splits once and the rest
 * stays in the value. Escapes are honoured inside strings, because `"\""` is a
 * quote that does not close the string.
 */
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
    /*
     * Outside a string as well. A backslash escapes the next character wherever
     * it appears in CSS, and this honoured one only inside quotes -- so an
     * escaped separator split a declaration that CSS reads as a single one.
     */
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

/**
 * The text with one property set, replaced, or removed.
 *
 * Order is preserved and unknown declarations are left alone, so a structured
 * control never discards something it does not have a widget for. That is the
 * property that lets the two editors share a string: the raw field can hold
 * anything, and the controls only ever touch their own line.
 */
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

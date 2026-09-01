/**
 * Rule evaluation.
 *
 * Pure and dependency-free, so the same rules run in the browser during preview
 * and in Node on the server. That symmetry is the point: a form's validation
 * should not be reimplemented on the backend and drift.
 *
 * Expression-backed rules ('custom', and any rule with a `when` guard) need a JS
 * evaluator, which core deliberately does not provide. The host injects one. With
 * no evaluator, guarded rules are skipped and 'custom' rules pass, so a missing
 * sandbox degrades to permissive rather than throwing.
 */

import { evaluateCondition } from './condition.js'
import { isEmpty, jsonToString, safeHref, valueOf } from './json.js'
import { NO_ROWS, addressOf, pushRow, rowContext, rowsOf } from './rows.js'
import type { RowContext } from './rows.js'
import { MAX_TREE_DEPTH, dataKeyOf, flatten, validationsOf } from './tree.js'
import { unreadableTag } from './exhaustive.js'
import { isVisible } from './visibility.js'
import type {
  ComponentNode,
  FormContext,
  FormData,
  FormErrors,
  JsonValue,
  PropValue,
  ValidationRule,
} from './types.js'

/**
 * Evaluates a JS expression against the current form data. Host-supplied.
 *
 * `context` is the third argument rather than merged into `data`, because the
 * two have different owners and only one of them is submitted. An evaluator
 * written before context existed ignores it and keeps working.
 */
export type Evaluator = (expression: string, data: FormData, context?: FormContext) => JsonValue

/**
 * Everything the rules need beyond the answers themselves.
 *
 * A bag rather than two more positional arguments, because both are optional
 * and `validateForm(root, data, undefined, context)` is a call nobody should
 * have to write. Both are declared `| undefined` on purpose:
 * `exactOptionalPropertyTypes` is on, and a caller forwarding its own optional
 * prop is the normal case, not a mistake.
 */
export interface EvalOptions {
  evaluate?: Evaluator | undefined
  context?: FormContext | undefined
  /**
   * Which repeater row this evaluation is inside. Absent at the top level.
   *
   * Set by the walk that enters a row, never by a caller: a host passing one
   * would be claiming a position in data it does not control.
   */
  row?: RowContext | undefined
}

export const DEFAULT_MESSAGES: Record<ValidationRule['key'], string> = {
  required: 'This field is required.',
  minLength: 'Too short.',
  maxLength: 'Too long.',
  min: 'Too small.',
  max: 'Too large.',
  pattern: 'Invalid format.',
  email: 'Enter a valid email address.',
  url: 'Enter a valid URL.',
  uuid: 'Enter a valid UUID.',
  custom: 'Invalid value.',
}

/**
 * What a rule this code cannot read reports.
 *
 * Not in `DEFAULT_MESSAGES`, because it is not a rule's message — it is the
 * absence of one. A document holding `{ key: 'requird' }` is malformed and
 * `validateDocument` says so; this is what happens to the document that never
 * went through the gate.
 *
 * It reports rather than passing, and that direction is the whole point. A rule
 * the code cannot apply has not been satisfied, and a submit that goes through
 * because a tag was mistyped is the silent permissive failure this project is
 * organised against. Wrong and loud beats wrong and quiet.
 *
 * (That paragraph is about `UNREADABLE_RULE`, above. It used to sit in a block
 * of its own, stacked on this one, so it documented a comment rather than a
 * declaration and no editor ever showed it.)
 */

/**
 * How many rows of one repeater will be validated.
 *
 * A form asking somebody to fill in more than this many rows is not a form.
 */
export const MAX_ROWS = 5000

/** What a repeater reports when the submitted body asks for more rows than that. */
export const TOO_MANY_ROWS = 'This list has too many rows to check.'

/**
 * What a repeater reports when its answer is not a list at all.
 *
 * `rowsOf` reads anything that is not an array as no rows, which is right for
 * the *projection* -- `submittedData` submits only what was asked and given --
 * and was quietly wrong here. No rows means the rules inside the repeater do not
 * run, so a body sending `"addresses": "nope"` turned every required field
 * inside that repeater optional, on the server, with nothing to see. A test
 * asserted that as correct behaviour.
 *
 * Absent stays absent: `undefined` and `null` are a repeater nobody has filled
 * in, and there is nothing to check inside one. A string, a number or an object
 * is an answer of the wrong shape, and refusing it is the same call
 * `matchesPattern` and `TOO_MANY_ROWS` already make -- what cannot be checked
 * has not been satisfied.
 */
export const NOT_A_LIST = 'This list was not sent as a list.'

/**
 * What the form reports when its own tree is nested deeper than the bound.
 *
 * `validateForm` was the only walk in this package with no depth bound, and it
 * is the one on the submit path: `walk`, `contextKeys`, `objectFor`,
 * `keyScopesFor` and `submittedData` all check `depth > MAX_TREE_DEPTH` and
 * this one did not. A stored document nested a few thousand deep -- nothing on
 * the validate path calls `validateDocument`, as `validateAcross`'s own comment
 * says -- threw `RangeError` on every submit, which is the unhandled 500 the
 * comments in this file repeatedly cite as the failure to avoid.
 *
 * Reported rather than skipped, which is where this differs from
 * `submittedData`'s bound one function down. Returning silently is what that
 * projection should do -- it submits what was asked and given, and past the
 * bound nothing was asked. Here it would mean every field below level 500 goes
 * unchecked and the submit succeeds anyway: a required answer missing, on the
 * server, with nothing to see. That is the permissive failure `TOO_MANY_ROWS`
 * twenty lines up refuses for the identical reason, in the same words -- what
 * cannot be checked has not been satisfied.
 *
 * So the two do now disagree past the bound, loudly and on purpose: the form
 * refuses, so there is no payload for the projection to be wrong about.
 */
export const TOO_DEEP = 'This form is nested too deeply to check.'

/**
 * A node's children, for the two walks a server runs.
 *
 * `node.children ?? []` guards nullish and nothing else, so a truthy non-array
 * -- `children: 5`, `children: {}`, `children: "ab"` -- reached `for...of` and
 * threw `TypeError: node.children is not iterable`, and a `children: [null]`
 * entry reached `isVisible`, which dereferenced it. Both on the submit path,
 * both out of a route handler, both from a document nothing on that path gates.
 *
 * `walk` in `tree.ts` has had exactly this guard for a while, under a comment
 * naming the same incident -- "one node missing `props` used to take the whole
 * form with it". These two walks are the ones that did not borrow it. A node
 * that is not a node contributes nothing, which is what `validateDocument`
 * reports about it.
 */
const childrenOfNode = (node: ComponentNode): ComponentNode[] =>
  Array.isArray(node.children)
    ? node.children.filter(
        (child): child is ComponentNode => Boolean(child) && typeof child === 'object',
      )
    : []

export const UNREADABLE_RULE = 'This field could not be checked. The form has an unreadable rule.'

/*
 * The rule keys that exist, taken from the message table rather than written
 * out again. `DEFAULT_MESSAGES` is typed as a total record over the union, so
 * adding a rule without a message does not compile and this set cannot drift
 * behind it.
 */
const KNOWN_RULES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_MESSAGES))

/**
 * A pattern rule, compiled defensively.
 *
 * The expression is authored one character at a time in the Rules tab, so it is
 * a syntax error for most of the time it is being typed. An uncaught throw here
 * took Preview down in the browser and surfaced as an unhandled 500 on the
 * server. An unfinished pattern matches nothing, which is the same answer the
 * rule would give once the author closes the bracket.
 */

/**
 * The longest answer a pattern is ever run against.
 *
 * A form field's answer is a name, a postcode, a reference number. Nothing a
 * pattern is written for is twenty thousand characters, and matching time grows
 * with the input on every engine — so the input is bounded before the engine
 * sees it. This does not make an exponential pattern safe; it caps every
 * polynomial one.
 */
const PATTERN_INPUT_LIMIT = 4096

/**
 * Whether a quantifier at this position permits unboundedly many repetitions.
 *
 * `*`, `+` and `{n,}`. A bounded one — `{3}`, `{2,5}` — is what real patterns
 * are full of and is not the shape that goes exponential, because there is a
 * fixed amount for the engine to try.
 */
function unboundedAt(source: string, at: number): boolean {
  const ch = source[at]
  if (ch === '*' || ch === '+') return true
  if (ch !== '{') return false
  const close = source.indexOf('}', at)
  return close !== -1 && /^\{\d+,\s*\}$/.test(source.slice(at, close + 1))
}

/**
 * Whether a quantifier at this position permits two or more repetitions.
 *
 * A different question from `unboundedAt`, and the difference is the finding.
 * The bound on the outside is not what makes `(a+){10}` safe: what an engine
 * backtracks over is the ways to split the input *between* the repetitions, and
 * ten non-empty groups over thirty characters is ten million of them. The
 * exponent is the repeat count, which the author chooses.
 *
 * Two is the threshold because one repetition has nothing to split against, and
 * neither does none-or-one. `(a+){1}` and `(a+)?` are left alone.
 *
 * `{n}` repeats n times; `{n,}` is unbounded; `{n,m}` repeats up to m.
 */
function repeatsAt(source: string, at: number): boolean {
  const ch = source[at]
  if (ch === '*' || ch === '+') return true
  if (ch !== '{') return false

  const close = source.indexOf('}', at)
  if (close === -1) return false
  const body = source.slice(at + 1, close)

  // `{n,}` — unbounded, so certainly two or more.
  if (/^\d+,\s*$/.test(body)) return true
  // `{n,m}` — the ceiling decides.
  const range = /^(\d+),\s*(\d+)$/.exec(body)
  if (range) return Number(range[2]) >= 2
  // `{n}` — exactly n.
  if (/^\d+$/.test(body)) return Number(body) >= 2
  return false
}

/**
 * A pattern with an unbounded quantifier inside another one.
 *
 * `(a+)+`, `(a*)*`, `((a+)*)+`. This is the shape that makes a backtracking
 * engine try exponentially many ways to split the same input: matching
 * `^(a+)+$` against thirty-one `a`s and one `X` does not finish, which was
 * measured here by hanging the test run for five minutes.
 *
 * The scan is deliberately structural and deliberately narrow. It skips escapes
 * and character classes, so `\(` and `[+*]` are text rather than syntax, and it
 * asks only whether an unbounded quantifier is applied to a group whose body
 * holds another one. `(\d{3}-)+` — a phone number — passes, because the inner
 * repetition has a fixed length.
 *
 * It is not a decision procedure. `(a|a)*` blows up too and is not caught here,
 * and no cheap syntactic rule separates a dangerous alternation from
 * `(ab|cd)+`. See `docs/build-out/triage.md` for what is left and why closing
 * it needs a different regex engine rather than a better heuristic.
 */
function nestedUnbounded(source: string): 'nested' | 'duplicate-branch' | undefined {
  /**
   * Per open group: whether it holds an unbounded quantifier, and where its
   * top-level alternatives start so a duplicate among them can be seen.
   */
  const stack: { unbounded: boolean; from: number; bars: number[] }[] = []
  let inClass = false

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]

    if (ch === '\\') {
      i += 1
      continue
    }
    if (inClass) {
      if (ch === ']') inClass = false
      continue
    }
    if (ch === '[') {
      inClass = true
      continue
    }
    if (ch === '(') {
      stack.push({ unbounded: false, from: i + 1, bars: [] })
      continue
    }
    if (ch === '|') {
      const group = stack[stack.length - 1]
      if (group) group.bars.push(i)
      continue
    }
    if (ch === ')') {
      const group = stack.pop()
      if (!group) continue

      // `)` may be followed by a quantifier, optionally made lazy with `?`.
      const quantified = unboundedAt(source, i + 1)

      /*
       * Two or more repetitions of a group holding an unbounded quantifier, not
       * only unboundedly many. This asked `unboundedAt` on both sides, so
       * `(a+){10}b` compiled and ran -- and the comment above defending that
       * said a bounded quantifier "is not the shape that goes exponential,
       * because there is a fixed amount for the engine to try", which is true of
       * `a{10}` and false of `(a+){10}`. The code was written to the sentence
       * rather than to the distinction inside it.
       */
      if (repeatsAt(source, i + 1) && group.unbounded) return 'nested'
      if (quantified && group.unbounded) return 'nested'

      /*
       * The alternation half, kept deliberately narrow: a repeated group with
       * two identical alternatives.
       *
       * `(a|a)*` is the shape this function's own docblock names as uncaught,
       * and ~35 characters of input against it wedges the thread. Catching it
       * costs nothing in false positives, because a duplicated alternative is
       * never useful -- `(a|a)` matches exactly what `(a)` matches, so no
       * author writes one on purpose and refusing it takes nothing away.
       *
       * This is not general alternation analysis and does not pretend to be.
       * `(a|ab)*` and `(a+|b)*` still blow up and still pass, and no cheap
       * syntactic rule separates those from `(ab|cd)+` -- overlapping-prefix
       * detection would refuse `(ab|ac)+`, which is perfectly safe, and
       * refusing a pattern an author legitimately wrote is a worse failure than
       * this one. What is left is in the docblock and in
       * `docs/spec/08-validation.md`, stated as a deployment concern rather
       * than as a footnote, because form authors and deployers are different
       * people.
       */
      if (repeatsAt(source, i + 1) && group.bars.length > 0) {
        const edges = [group.from, ...group.bars.map((bar) => bar + 1)]
        const branches = edges.map((from, index) =>
          source.slice(from, index + 1 < edges.length ? (group.bars[index] ?? i) : i),
        )
        if (new Set(branches).size < branches.length) return 'duplicate-branch'
      }

      /*
       * What the enclosing group learns from this one closing.
       *
       * Two things, and only the first was propagated. A quantified group is
       * itself an unbounded repetition as far as any group enclosing it is
       * concerned -- that was here. But a group holding an unbounded quantifier
       * still holds one when it is *not* quantified, and that flag was simply
       * discarded: an unquantified `)` popped the group and threw its finding
       * away.
       *
       * So one plain group was all it took. `(?:(a+))+` and `((a+))+` are
       * one-token rewrites of the shape this function refuses, and both
       * compiled and ran -- traced on `(?:(a+))+`, which returned false. A
       * forty-character answer then hangs the Node event loop for the whole
       * process.
       */
      if (quantified || group.unbounded) {
        const outer = stack[stack.length - 1]
        if (outer) outer.unbounded = true
      }
      continue
    }
    if (unboundedAt(source, i)) {
      const group = stack[stack.length - 1]
      if (group) group.unbounded = true
    }
  }

  return undefined
}

/**
 * Whether the value matches, or `false` for a pattern this will not run.
 *
 * Three reasons not to run one, and all three answer the same way: the rule
 * fails. A pattern that cannot be trusted has not been satisfied, and passing
 * silently is how a constraint stops applying on the server, which is the
 * failure this whole project is organised against.
 *
 * Unanchored, like JSON Schema's `pattern` and unlike `<input pattern>`, which
 * is implicitly wrapped in `^(?:...)$`. That is a trap for an author copying a
 * pattern out of an HTML tutorial -- `\d{5}` accepts `abc12345` here -- and it
 * is still the right way round: `pattern` is exported verbatim into JSON
 * Schema, so anchoring it in the engine would make the form and the schema a
 * server validates against disagree about the same document, silently. The spec
 * says so where an author reads it, and `^...$` is two characters to type.
 */

/**
 * Why this pattern will not be run, or nothing if it will.
 *
 * Exported because the Rules tab has to say the same thing, and saying it twice
 * is how the two come to disagree. A refused pattern makes the rule *fail*, so
 * an author who typed one saw a perfectly ordinary rule in the panel and every
 * answer rejected on the server. This is the sentence the panel shows while it
 * can still be fixed, and it is the same sentence because it is the same
 * function.
 *
 * An empty pattern is not a problem here. It compiles, it matches everything,
 * and it is what a half-typed rule looks like -- reporting it would put an error
 * under the field before anybody had finished the first character.
 */
export function patternProblem(pattern: string): string | undefined {
  /*
   * Two shapes, two sentences. The author is being asked to change the pattern,
   * and "bound the inner one" is not advice about `(a|a)*` -- there is no inner
   * repeat to bound. Telling somebody to fix a thing their pattern does not
   * have is how a refusal becomes a dead end.
   */
  const shape = nestedUnbounded(pattern)
  if (shape === 'nested') {
    return (
      'This pattern has an unbounded repeat inside another one, which can take ' +
      'exponential time to match. Bound the inner one, or rewrite it without the nesting.'
    )
  }
  if (shape === 'duplicate-branch') {
    return (
      'This pattern repeats a group whose alternatives include the same choice twice, ' +
      'which can take exponential time to match. Remove the duplicate.'
    )
  }
  try {
    new RegExp(pattern)
  } catch {
    return 'This is not a valid regular expression.'
  }
  return undefined
}

function matchesPattern(pattern: string, value: string): boolean {
  if (value.length > PATTERN_INPUT_LIMIT) return false
  // One decision, shared with the panel. See `patternProblem`.
  if (patternProblem(pattern)) return false

  return new RegExp(pattern).test(value)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Requiredness is stricter than emptiness, and only for booleans.
 *
 * An unchecked box is a non-answer, not a value of false. "I accept the terms"
 * is the canonical required checkbox and it has to be checked, which is exactly
 * what the platform's own `<input type="checkbox" required>` means. Treating
 * `false` as a supplied value let a required consent box pass while unticked.
 *
 * Every other rule keeps using `isEmpty`, where `false` is a value: requiredness
 * is one rule's job.
 */
function isMissing(value: JsonValue | undefined): boolean {
  return value === false || isEmpty(value)
}

/**
 * How long an answer is, for the two rules that ask.
 *
 * An array counts its items. Without this it went through `jsonToString`, which
 * returns `''` for anything that is not a string, number or boolean — so a
 * multi-select with two options chosen measured zero, `minLength: 2` failed
 * every time and `maxLength` passed every time. Silently: the value was there
 * on screen and the message said it was too short.
 *
 * Counting items is what an author writing "at least two" on a multi-select
 * means. A repeater may still want `minItems` and `maxItems` of its own, which
 * map onto the JSON Schema keywords of those names; this is not that, it is the
 * existing rule no longer being wrong about a value it already receives.
 */
function lengthOf(value: JsonValue | undefined): number {
  return Array.isArray(value) ? value.length : asString(value).length
}

function asString(value: JsonValue | undefined): string {
  return jsonToString(value)
}

function asNumber(value: JsonValue | undefined): number {
  return typeof value === 'number' ? value : Number(value)
}

/**
 * A value the bounds rules can actually compare, or nothing.
 *
 * `Number('not telling')` is `NaN`, and every comparison with `NaN` is false —
 * so `min` and `max` both *passed* on a value that is not a number at all. The
 * exported schema said `{"type":"number","minimum":18}` while the form accepted
 * a sentence, which is the two validators disagreeing in the permissive
 * direction, on the server.
 *
 * A number field's value legitimately arrives as a string from an `<input>`, so
 * this coerces; what it will not do is treat "cannot be compared" as "compares
 * fine".
 *
 * (That paragraph is about `comparableNumber`, further down. It used to sit
 * stacked on this block, so it documented a comment and `isUrl` appeared to
 * carry it.)
 */

/**
 * A URL a `url` rule should accept: parseable, and a scheme this project allows.
 *
 * Both halves are needed and neither is enough. `URL.canParse` answers yes to
 * any well-formed URL including `javascript:` and `data:`, which is what the
 * rule used to accept — telling an author their field holds a link while
 * accepting one that runs code. `safeHref` refuses those, but it also allows a
 * *relative* address, because a link may legitimately be one; an answer to a
 * field labelled "your website" may not.
 */
function isUrl(value: string): boolean {
  return URL.canParse(value) && safeHref(value) !== undefined
}

function comparableNumber(value: JsonValue | undefined): number | undefined {
  const asNum = asNumber(value)
  return Number.isNaN(asNum) ? undefined : asNum
}

/** Is a rule's `when` guard satisfied? Unguarded rules always apply. */
function guardPasses(when: PropValue | undefined, data: FormData, options: EvalOptions): boolean {
  if (!when) return true
  switch (when.kind) {
    case 'static':
      return Boolean(when.value)
    case 'computed':
      // Without a sandbox we cannot know, so skip the rule rather than guess.
      if (!options.evaluate) return false
      /*
       * A throw is not the same as no sandbox, and gets the opposite answer.
       *
       * No evaluator is a host configuration: nothing computed can be evaluated,
       * failing every guarded rule for it would be wrong, and `evaluatorKeys`
       * already reports it at boot. A throw is one broken expression, authored
       * in a document, and it is exactly the case the `default` below already
       * rules on -- a guard this code cannot read has not said no, so the rule
       * applies. The other direction is a required answer quietly becoming
       * optional on the server, over a typo in an expression.
       *
       * `visibility.ts` wraps the same call and says why; this call site and the
       * `custom` rule below were the two that did not.
       */
      try {
        return Boolean(options.evaluate(when.expression, data, options.context))
      } catch {
        return true
      }
    /*
     * A translation key is not a condition, so this reads as "no guard was
     * expressed" and the rule applies -- the same answer `isVisible` gives the
     * same kind, where "no condition expressed" means visible. Both directions
     * are the permissive one: a rule that still runs, and a component that is
     * still shown.
     */
    case 'i18n':
      return true
    // No sandbox needed, so a guarded rule works where an expression would not.
    case 'condition':
      return evaluateCondition(when.condition, data, options.context, options.row)

    /*
     * A guard this code cannot read has not said no, so the rule applies. The
     * other direction skips the rule, which is a required answer quietly
     * becoming optional — on the server, over a mistyped tag.
     */
    default:
      return unreadableTag(when, true)
  }
}

/**
 * Apply one rule. Returns an error message, or undefined when the value passes.
 *
 * Every rule except 'required' passes on an empty value. Requiredness is one
 * rule's job; a 'url' rule reporting "required" on an empty field is the exact
 * bug the prior-art study found in the demo it examined.
 */
export function applyRule(
  rule: ValidationRule,
  value: JsonValue | undefined,
  data: FormData,
  options: EvalOptions = {},
): string | undefined {
  /*
   * The rule is checked before it is read, and it was not.
   *
   * `rule.when` on line one dereferenced whatever arrived, so a document
   * holding `"validations": [null]` threw `TypeError` out of `validateForm` --
   * on the server, per submit. `validationsOf` only checks that the array is an
   * array, and both `isRequired` and `context.ts` read rules with `rule?.`, so
   * nullish entries were already known to be reachable here.
   *
   * Reported rather than skipped, for the reason `UNREADABLE_RULE` exists a few
   * lines down: an entry this code cannot read is not a rule that passed.
   */
  if (!rule || typeof rule !== 'object') return UNREADABLE_RULE

  if (!guardPasses(rule.when, data, options)) return undefined

  /*
   * Before the empty short-circuit below, and that order is the point. "Every
   * rule but `required` passes on an empty value" is a statement about rules,
   * and a tag this code cannot read is not one. The case that matters is a
   * mistyped `required`, and it arrives with an empty value, so checking after
   * the short-circuit would let exactly that one through.
   */
  if (!KNOWN_RULES.has(rule.key)) return UNREADABLE_RULE

  /*
   * `||`, not `??`. An empty string is not nullish, so `message: ""` was kept
   * as the message — and `validateForm` records an error only `if (error)`, so
   * an empty one silently stopped the rule failing. A pasted `"message": ""`
   * turned a required field optional on the server with nothing to see.
   *
   * A message nobody wrote and a message that says nothing are the same thing
   * to a person filling in the form: the default is what both should give them.
   */
  const fail = (): string => rule.message || DEFAULT_MESSAGES[rule.key]

  if (rule.key === 'required') return isMissing(value) ? fail() : undefined
  if (isEmpty(value)) return undefined

  /*
   * A measuring rule with nothing to measure against fails, and it silently
   * passed.
   *
   * `lengthOf(value) < rule.value` and `held < rule.value` are both `false`
   * whenever `rule.value` is `undefined` or a non-number -- every comparison
   * against `undefined` is -- so `{"key":"min"}` left the field completely
   * unconstrained on the server while the Rules tab went on listing the rule.
   * The permissive direction, in a file that hardens against it everywhere
   * else.
   *
   * The `pattern` case a few lines down got exactly this guard, with a comment
   * saying a valueless rule "reaches here from a paste". The same paste reaches
   * these four, and they were left. Same answer, same reason: what cannot be
   * checked has not been satisfied.
   *
   * The parameter is typed `number` and the check is still made, because a
   * document is data: the type describes what a well-formed rule holds, not
   * what arrives. That is the same reasoning `pattern` states one case down for
   * a field its own type calls a string.
   */
  const measurable = (bound: number): boolean => typeof bound === 'number' && Number.isFinite(bound)

  switch (rule.key) {
    case 'minLength':
      if (!measurable(rule.value)) return fail()
      return lengthOf(value) < rule.value ? fail() : undefined
    case 'maxLength':
      if (!measurable(rule.value)) return fail()
      return lengthOf(value) > rule.value ? fail() : undefined
    case 'min': {
      if (!measurable(rule.value)) return fail()
      const held = comparableNumber(value)
      return held === undefined || held < rule.value ? fail() : undefined
    }
    case 'max': {
      if (!measurable(rule.value)) return fail()
      const held = comparableNumber(value)
      return held === undefined || held > rule.value ? fail() : undefined
    }
    case 'pattern':
      /*
       * A pattern with no pattern fails rather than throwing. A document is
       * data, so `{ key: 'pattern' }` with no `value` reaches here from a paste,
       * and `nestedUnbounded(undefined)` reads `.length` off it -- out of
       * `validateForm`, which is a 500 on submit. The same answer a pattern this
       * refuses to run already gets: what cannot be checked has not been
       * satisfied.
       */
      if (typeof rule.value !== 'string') return fail()
      return matchesPattern(rule.value, asString(value)) ? undefined : fail()
    case 'email':
      return EMAIL.test(asString(value)) ? undefined : fail()
    case 'url':
      /*
       * `safeHref`, not `URL.canParse`. That one answers yes to any well-formed
       * URL, scheme included, so a `url` rule accepted `javascript:` and
       * `data:` — and `safeHref` exists in this same package, keeping an
       * allowlist, precisely because those are the schemes that matter. Telling
       * an author their field holds a link and then accepting one that runs
       * code is the two halves of this project disagreeing.
       */
      return isUrl(asString(value)) ? undefined : fail()
    case 'uuid':
      return UUID.test(asString(value)) ? undefined : fail()
    case 'custom':
      if (!options.evaluate) return undefined
      /*
       * A throw fails the rule, which is the answer `matchesPattern` gives a
       * pattern it refuses to run, in this file, for the same reason: a rule
       * that cannot be run has not been satisfied.
       *
       * Not the same as the line above it. No evaluator is a host that declined
       * to supply one, and failing every custom rule for that would make the
       * library unusable without a sandbox; a throw is one expression that is
       * broken, and letting the value through is the silent permissive failure.
       */
      try {
        /*
         * The row's answers when there is a row, like every other read on this
         * path. `validateField` already resolves the *value* from
         * `options.row?.values`, and this handed the expression top-level
         * `FormData` -- so a custom rule inside a repeater checked a key from
         * outside the row, silently, and reported against the row it never read.
         *
         * The row's values win, and the form's show through underneath: the
         * row is spread *last*, so a key the row holds shadows the form's, and
         * an expression can still reach a form-level answer no field in the row
         * writes. (The wording here used to say "row's values first", which is
         * the precedence read as source order and the opposite of what the line
         * below does.)
         */
        const scoped = options.row ? { ...data, ...options.row.values } : data
        return options.evaluate(rule.expression, scoped, options.context) ? undefined : fail()
      } catch {
        return fail()
      }

    /*
     * Unreachable: the `KNOWN_RULES` check above has already answered for a key
     * that is not in the union. It stays because it is what keeps the compiler
     * checking this switch for exhaustiveness — adding a rule key without a
     * case here stops compiling, which the missing tail return used to do and
     * a bare `default` would throw away.
     */
    default:
      return unreadableTag(rule, UNREADABLE_RULE)
  }
}

/**
 * Whether this field is required of everybody, always.
 *
 * For a kit to put in the accessibility tree. WCAG 3.3.2 asks that a required
 * field say so, `node` is on `NodeRendererProps`, and no renderer in either kit
 * read it — so a required field was required in `validateForm` and ordinary to
 * a screen reader, and the first anybody heard of it was a rejected submit.
 *
 * Unguarded only, which is the same rule `toJsonSchema` applies to its
 * `required` list and for the same reason: a rule that applies sometimes cannot
 * be stated as one that always does. A guarded field is left unmarked rather
 * than marked wrongly — announcing a field as mandatory when it is not is its
 * own failure.
 *
 * In core rather than in each kit, so the two cannot answer differently.
 */
export function isRequired(node: ComponentNode): boolean {
  const rules = validationsOf(node)
  return rules.some((rule) => rule?.key === 'required' && !rule.when)
}

/** First failing rule for one field, or undefined when all pass. */
export function validateField(
  node: ComponentNode,
  data: FormData,
  options: EvalOptions = {},
): string | undefined {
  if (!node.schema) return undefined
  // A field inside a row holds its answer in that row, not at the top level.
  const held = valueOf(options.row?.values ?? data, dataKeyOf(node))
  for (const rule of validationsOf(node)) {
    const error = applyRule(rule, held, data, options)
    if (error) return error
  }
  return undefined
}

/**
 * Validate every visible field. An empty object means the form is valid.
 *
 * Hidden components are skipped, and so is everything beneath them: hiding a
 * container hides its children, and a required field the user cannot see must
 * never block a submit. `isVisible` is shared with the renderer so the two
 * cannot disagree about what "hidden" means.
 */
export function validateForm(
  root: ComponentNode,
  data: FormData,
  options: EvalOptions = {},
): FormErrors {
  /*
   * No prototype, for the reason `submittedData` has none. A field keyed
   * `__proto__` is refused by `validateDocument` and reachable anyway, because
   * nothing on the render or validate path calls it — and on an object literal
   * `errors['__proto__'] = message` runs the inherited setter, creates no own
   * property, and hands back a form that reads as valid.
   */
  const errors: FormErrors = Object.create(null) as FormErrors

  const visit = (node: ComponentNode, scope: EvalOptions, depth = 0): void => {
    /*
     * Visibility first, then the bound, and the order is load-bearing.
     *
     * With the bound first, a deeply nested *hidden* subtree produced
     * `TOO_DEEP` and refused the submit -- even though this function's own
     * docblock says hidden components are skipped and so is everything beneath
     * them, and nothing visible needed checking. A form with a collapsed
     * wizard branch nobody is on would have been unsubmittable.
     *
     * Nothing is lost by asking in this order. `isVisible` evaluates one node's
     * `renderWhen` and recurses no further -- `evaluateCondition` carries its
     * own `MAX_CONDITION_DEPTH` -- so calling it at depth costs one frame, and
     * the walk still only reaches level 501 when every ancestor was visible,
     * which is exactly the case the bound exists for.
     */
    if (!isVisible(node, data, scope)) return

    const path = scope.row?.path ?? NO_ROWS

    /*
     * The bound this walk did not have. See `TOO_DEEP`: reported at the address
     * where the walk stopped, not returned silently, because a subtree nobody
     * checked is a subtree whose required fields all passed.
     */
    if (depth > MAX_TREE_DEPTH) {
      const at = addressOf(path, node.key)
      if (!Object.hasOwn(errors, at)) errors[at] = TOO_DEEP
      return
    }
    const error = validateField(node, data, scope)
    if (error) errors[addressOf(path, node.key)] = error

    /*
     * A repeater validates its children once per row, each under that row's
     * own scope, so a required answer missing from row two is reported against
     * row two rather than against the one authored node they share.
     *
     * The rows come out of the data. Nothing asks the browser how many there
     * are, which is the same discipline `validateAcross` follows for steps: a
     * count from the request would let a client submit one row and have the
     * rest go unchecked.
     */
    if (isRowScope(node)) {
      const stored = valueOf(rowData(data, scope), dataKeyOf(node))

      /*
       * An answer of the wrong shape is reported rather than read as no rows.
       * See `NOT_A_LIST`: reading it as empty turned every required field inside
       * the repeater optional.
       */
      if (stored !== undefined && stored !== null && !Array.isArray(stored)) {
        errors[addressOf(path, node.key)] = NOT_A_LIST
        return
      }

      const all = rowsOf(stored)

      /*
       * The row count comes out of the data, which is right: asking the browser
       * how many rows there are would let a client submit one and have the rest
       * go unchecked. But that makes the *request body* the thing deciding how
       * much work happens, with no cap, and rows nest multiplicatively — a
       * couple of hundred kilobytes of JSON is millions of rule evaluations.
       *
       * Over the cap the form fails rather than validating a prefix. A row
       * nobody checked passing silently is the permissive failure this whole
       * project is organised against, and refusing is the only answer that is
       * not one.
       */
      if (all.length > MAX_ROWS) {
        /*
         * Reported without overwriting the repeater's own failure.
         *
         * The rules on the repeater itself are checked a few lines up and write
         * to this same address, so a list that is both `required` and over the
         * cap reported only the cap -- losing the message a person can act on
         * for one about the size of a body they did not choose.
         */
        const at = addressOf(path, node.key)
        if (!Object.hasOwn(errors, at)) errors[at] = TOO_MANY_ROWS
        return
      }

      const rows = all
      rows.forEach((row, index) => {
        const inner: EvalOptions = {
          ...scope,
          row: rowContext(pushRow(path, { key: dataKeyOf(node), index }), row),
        }
        for (const child of childrenOfNode(node)) visit(child, inner, depth + 1)
      })
      return
    }

    for (const child of childrenOfNode(node)) visit(child, scope, depth + 1)
  }

  visit(root, options)
  return errors
}

/**
 * A node whose children are drawn once per row.
 *
 * Recognised from the node rather than from a type string, because component
 * types are kit-scoped and core must not learn the word `Repeater`. A
 * data-bound container holding a list is the only thing that shape can mean.
 */
export function isRowScope(node: ComponentNode): boolean {
  return node.schema?.type === 'array' && node.children !== undefined
}

/** The record a node's own value is read from: a row's object, or the form's data. */
function rowData(data: FormData, scope: EvalOptions): FormData {
  return scope.row?.values ?? data
}

/**
 * The fields that asked to be validated while they are being typed into.
 *
 * `FieldSchema.autoValidate` is a per-field hint, and the host decides what to
 * do with it: Formsmith never owns the form's data, so it cannot own the moment
 * validation runs either. The designer's preview reads this, and a host that
 * wants the same behaviour reads it the same way.
 *
 * It was written by the Rules tab and read by nothing at all for the whole of
 * the tab's life, so the checkbox looked like a setting and was decoration.
 */
export function autoValidateKeys(root: ComponentNode): Set<string> {
  const keys = new Set<string>()
  for (const { node } of flatten(root)) {
    if (node.schema?.autoValidate === true) keys.add(node.key)
  }
  return keys
}

/**
 * The data a form is actually asking for, with answers to hidden questions left out.
 *
 * A value stays in `data` after the field that collected it is hidden. Tick
 * "married", fill in a spouse's name, untick it: `validateForm` correctly stops
 * checking that field, and the answer is still sitting in the payload. The form
 * submits an answer to a question it is no longer asking, and in insurance,
 * medical and legal forms that is a correctness problem rather than a tidiness
 * one.
 *
 * Formsmith cannot clear it unilaterally, because the host owns `data` and
 * hiding is often temporary — an accordion closing must not destroy what
 * someone typed. So this is a projection the host applies when it submits,
 * rather than something done to the value as it is held.
 *
 * Visibility is decided by the same `isVisible` the renderer and `validateForm`
 * use, so all three agree about what is on screen.
 */
export function submittedData(
  root: ComponentNode,
  data: FormData,
  options: EvalOptions = {},
): FormData {
  /*
   * The same `EvalOptions` the renderer and `validateForm` were given, and it has
   * to be: this decides which answers leave, using `isVisible`, so handing it a
   * different context than the renderer had would strip answers to questions the
   * user was actually asked. That is the disagreement `isVisible` exists to
   * prevent, arriving through an argument list instead of a second code path.
   *
   * Built on a null prototype, then copied into a plain object.
   *
   * `kept[key] = value` for a key of `__proto__` does not add a property to an
   * object literal, it runs the setter and changes the object's prototype: the
   * answer vanishes from the payload and the payload acquires whatever it was
   * pointed at. Data keys come out of a document and the grammar for them is
   * still only planned, so this is reachable today.
   *
   * The spread at the end is what makes the result ordinary. Spreading copies
   * properties rather than assigning them, so `__proto__` arrives as a plain
   * key on a plain object, and a host does not receive something surprising
   * back from a function it will hand straight to `JSON.stringify`.
   */
  const collect = (node: ComponentNode, scope: EvalOptions, into: FormData, depth = 0): void => {
    /*
     * The same bounds `validateForm` carries, because this is exported
     * separately and its docblock offers it as the submit-time projection.
     *
     * A host that projects before it validates -- which the signature invites,
     * since neither function needs the other -- did unbounded work on a body
     * somebody else chose the size of. The row cap and the tree bound are the
     * two `validateForm` refuses on.
     *
     * That sentence was false when it was written: `validateForm` carried the
     * row cap and had no tree bound at all, so this comment described a
     * protection its neighbour did not have, in the file where the neighbour is
     * the one that runs on a server. It carries both now, and refuses past the
     * tree bound where this one returns -- see `TOO_DEEP` for why the two
     * answers differ.
     */
    if (depth > MAX_TREE_DEPTH) return
    if (!isVisible(node, data, scope)) return

    const held = scope.row?.values ?? data

    /*
     * A repeater keeps its rows, and each row keeps only the answers that row
     * still asks for. Row order is preserved and no row is dropped: a row the
     * user filled in is not a question the form stopped asking, it is one of
     * several answers to the same one.
     */
    if (isRowScope(node)) {
      const key = dataKeyOf(node)
      const stored = valueOf(held, key)
      const rows = rowsOf(stored)
      const path = scope.row?.path ?? NO_ROWS

      /*
       * No answer stays no answer. `rowsOf` reads anything that is not a list as
       * no rows, so a repeater nobody touched -- and one whose value is a string
       * -- used to leave `key: []` in the payload: an empty list is an answer,
       * and this function's whole job is to submit only what was asked and
       * given. A repeater with a real empty list keeps it.
       */
      if (!Array.isArray(stored)) return

      // Over the cap, the list is not projected at all -- the same answer
      // `validateForm` gives, and for the same reason.
      if (rows.length > MAX_ROWS) return

      into[key] = rows.map((row, index) => {
        const inner: EvalOptions = {
          ...scope,
          row: rowContext(pushRow(path, { key: dataKeyOf(node), index }), row),
        }
        const kept: FormData = Object.create(null) as FormData
        for (const child of childrenOfNode(node)) collect(child, inner, kept, depth + 1)
        return { ...kept }
      })
      return
    }

    if (node.schema) {
      const key = dataKeyOf(node)
      const value = valueOf(held, key)
      if (value !== undefined) into[key] = value
    }
    for (const child of childrenOfNode(node)) collect(child, scope, into, depth + 1)
  }

  const kept: FormData = Object.create(null) as FormData
  collect(root, options, kept)
  return { ...kept }
}

/**
 * The projection a multi-step form submits, taken across every step.
 *
 * `validateAcross` exists because a wizard's steps are hidden from each other
 * and hidden means not validated -- so at submit every step has to be checked,
 * and checking under one environment misses the rest. The projection has exactly
 * the same problem and did not have the same answer: the demo server validated
 * across all scopes and then projected under `scopes[0]`, so every answer given
 * on step two onwards was dropped from the payload. A form that validated a
 * required field and then submitted without it.
 *
 * Merged the way `validateAcross` merges, and for the same reason: steps
 * partition the tree, so a key belongs to at most one of them and there is
 * nothing to resolve. Where scopes overlap the first answer wins, which is the
 * order everywhere else in this file.
 *
 * No scopes is not the same as one empty scope. A document with no steps yields
 * no scopes, and the honest projection across nothing is nothing -- a caller
 * that means the whole form calls `submittedData`, which is what
 * `validateAcross` says about the same case one function below.
 */
export function submittedAcross(
  root: ComponentNode,
  data: FormData,
  scopes: EvalOptions[],
): FormData {
  // No prototype, for the reason `submittedData` has none and `validateAcross`
  // has none: a key from a document is a key an attacker may have chosen.
  const merged: FormData = Object.create(null) as FormData

  for (const scope of scopes) {
    for (const [key, value] of Object.entries(submittedData(root, data, scope))) {
      merged[key] ??= value
    }
  }

  return { ...merged }
}

/**
 * Validate one document under several evaluation environments, merged.
 *
 * A multi-step form needs two different answers from the same rules. While the
 * user is on step two, only step two should be checked, and that is
 * `validateForm(stepNode, data)` — it already takes any node as its root. At
 * submit, every step has to be checked, and `validateForm(root, data)` will not
 * do it: the other steps are hidden, hidden means not validated, and the form is
 * accepted with required answers missing from steps nobody is looking at.
 *
 * That is `isVisible` behaving exactly as specified, and wrong here, because an
 * earlier step is not *unwanted*, it is *already done*. `renderWhen` false means
 * the author excluded this; a step the user is not on means not yet. The two
 * need different treatment and this is where they get it.
 *
 * No new concept: run the existing walk once per environment and merge. Steps
 * partition the tree, so a key appears under at most one of them and the merge
 * has nothing to resolve. Where scopes do overlap the first answer wins, which
 * matches the first-failing-rule order everywhere else.
 *
 * **The server enumerates the environments from the document, never from the
 * request.** A `validateForm` that took a step would let a client name step one
 * and have the rest go unchecked, and unlike a blocked submit that failure is
 * invisible. `contextValues(root, 'step')` reads the flow out of the document,
 * which is the thing both sides already agree on.
 */
export function validateAcross(
  root: ComponentNode,
  data: FormData,
  scopes: EvalOptions[],
): FormErrors {
  /*
   * No prototype, for the reason `validateForm` has none, and this is the
   * function where it mattered more.
   *
   * `validateForm` assigns, so only `__proto__` bit there. This merge
   * *coalesces*: `merged[key] ??= message` reads before it writes, and on an
   * object literal that read finds `Object.prototype.toString` for a field keyed
   * `toString`. Not nullish, so the write never happens, so the message is
   * discarded and `Object.keys(merged)` comes back empty. Empty is what every
   * caller reads as a valid form, and this is the function a server calls at
   * submit. `toString`, `valueOf`, `hasOwnProperty`, `constructor` and
   * `isPrototypeOf` all pass `KEY_PATTERN`, so nothing has to be bypassed.
   *
   * `RESERVED_KEYS` now names them too, but that is the second lock rather than
   * this one: nothing on the render or validate path calls `validateDocument`,
   * so a document carrying such a key reaches here regardless.
   */
  const merged: FormErrors = Object.create(null) as FormErrors

  for (const scope of scopes) {
    for (const [key, message] of Object.entries(validateForm(root, data, scope))) {
      merged[key] ??= message
    }
  }

  return merged
}

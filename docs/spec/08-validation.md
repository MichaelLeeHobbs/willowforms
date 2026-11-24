# Validation

**Status: built.** The rule engine, type enforcement, localized messages, cross-field comparisons, and
the complete Rules tab are implemented and share one runtime between browser and server.

Validation lives in `@willowforms/core`, which imports no React and runs in Node. That is not a
convenience: it means a form's rules are authored once and enforced in both places, rather than
reimplemented on the server and left to drift.

## The two behaviours worth knowing first

Both of these surprise people who have used other builders, and both are deliberate.

### Only `required` fails on an empty value

**Status: built.**

Every other rule passes when the value is empty. A field carrying only a `url` rule stays valid while
blank, because requiredness is one rule's job and folding it into every other rule makes it impossible to
express "optional, but must be a URL if given".

`validation.test.ts` holds this under `every non-required rule passes on an empty value`, which runs the
whole catalogue rather than one case.

One rule key is not in that catalogue: a key the engine does not recognise reports `UNREADABLE_RULE`
whatever the value. That is deliberate rather than an exception mislaid -- an unknown key is a document
from a newer version or a hand edit, and a rule nobody can read is not a rule anybody should be told
passed. Invariant 5 is about the rules this version has.

### Validation and rendering agree about what is visible

**Status: built.**

`validateForm` skips any component `isVisible()` says is hidden, and skips everything beneath a hidden
container. A required field the user cannot see must never be what stops them submitting.

The two used to disagree — the renderer honoured `renderWhen` while validation walked the whole tree —
which produced exactly that failure: a submit blocked by an error with no visible cause. One function
decides now, and both callers use it. See [01-document-model.md](01-document-model.md#renderwhen).

## The rule catalogue

Every rule carries its parameters in the type. A rule set of `{ key, message? }` cannot express
`minLength` without a side channel, which is the shape FormEngine uses.

```ts
type ValidationRule =
  | { key: 'required'; message?: string | PropValue; when?: PropValue }
  | { key: 'minLength'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'maxLength'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'minItems'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'maxItems'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'min'; value: number; message?: string | PropValue; when?: PropValue }
  | { key: 'max'; value: number; message?: string | PropValue; when?: PropValue }
  | {
      key: 'matches' | 'after'
      field: string
      scope?: 'form' | 'row'
      message?: string | PropValue
      when?: PropValue
    }
  | { key: 'pattern'; value: string; message?: string | PropValue; when?: PropValue }
  | { key: 'email'; message?: string | PropValue; when?: PropValue }
  | { key: 'url'; message?: string | PropValue; when?: PropValue }
  | { key: 'uuid'; message?: string | PropValue; when?: PropValue }
  | { key: 'custom'; expression: string; message?: string | PropValue; when?: PropValue }
```

| Rule                      | Parameter          | Applies to   | Fails when                                  |
| ------------------------- | ------------------ | ------------ | ------------------------------------------- |
| `required`                | —                  | anything     | the value is empty                          |
| `minLength` / `maxLength` | `number`           | text, list   | the string or the list is shorter or longer |
| `minItems` / `maxItems`   | `number`           | lists        | the list has fewer or more items            |
| `min` / `max`             | `number`           | numbers      | the number is outside the range             |
| `matches`                 | field and scope    | anything     | the value differs from the referenced value |
| `after`                   | field and scope    | text, number | the value is not later or greater           |
| `pattern`                 | regular expression | text         | the expression does not match               |
| `email`                   | —                  | text         | it is not an email address                  |
| `url`                     | —                  | text         | it is not an http, https, mailto or tel URL |
| `uuid`                    | —                  | text         | it is not a UUID                            |
| `custom`                  | expression         | anything     | the expression returns falsy                |

**Empty** means `undefined`, `null`, a string that is blank once trimmed, an empty array, or an object
with no keys. A `0` is a value, not an absence.

The empty object is there because a payload shape that uses `{}` as a placeholder would otherwise satisfy
a required consent: `{"consent": {}}` was a truthy value with nothing in it, and `required` passed.

`required` is the one rule that is stricter, and only for booleans: **an unchecked box is a non-answer**.
"I accept the terms" is the canonical required checkbox and it has to be checked, which is exactly what
the platform's own `<input type="checkbox" required>` means. Every other rule keeps treating `false` as a
supplied value, because requiredness is one rule's job.

### Field schemas enforce value types

**Status: built.**

A non-empty answer must match its field schema: strings, dates and files are strings; numbers are finite
JSON numbers; booleans are booleans; arrays are arrays; and objects are non-null, non-array objects.
Empty values remain valid unless a `required` rule rejects them, preserving the rule that optional
fields may be blank. Type validation runs before authored rules and uses `INVALID_TYPE` when it fails.

### Every failure degrades rather than throws

**Status: built.**

- A **`pattern` is unanchored**, like JSON Schema's and unlike `<input pattern>`, which browsers wrap in
  `^(?:...)$` for you. So `\d{5}` accepts `abc12345`, and an author copying a pattern out of an HTML
  tutorial gets a weaker rule than the one they copied. It stays this way round because `pattern` is
  exported verbatim into JSON Schema: anchoring it in the engine would make the form and the schema a
  server validates the same submission against disagree, and that disagreement is silent. Write `^` and
  `$` yourself.
- A **`pattern` that will not compile** matches nothing instead of throwing. The expression is authored
  one character at a time, so it is a syntax error for most of the time it is being typed. An uncaught
  throw here took Preview down in the browser and reached the server as an unhandled 500.
- A **`custom` rule with no injected evaluator** passes. So does a rule whose `when` guard needs one.
- **Non-primitive values read as empty text.** `String({})` gives `"[object Object]"`, which would land
  in an input the user then has to clear and could accidentally satisfy a `pattern`.

Three of these degrade towards failing rather than passing, and they are the ones an author will meet:

- A **value longer than 4096 characters never matches a `pattern`**, and a pattern longer than 1024
  characters is refused.
- **Patterns use the RE2 language and a linear-time engine.** Nested repetition and overlapping
  alternatives are safe to evaluate. Backreferences, lookarounds, and unsupported or malformed syntax
  are refused and shown by `patternProblem` in the Rules tab.
- **A pattern whose compiled program exceeds 512 instructions is refused** the same way. Counted repeats
  expand the program, so `^(a|b){999}$` is refused while `^[\p{L} ]{1,200}$` runs; a length rule
  bounds long values instead. Matching cost per character grows with program size, so this limit and
  the input limit bound the work each submitted value can cause. Compiled patterns are cached, so a
  repeater pays compilation once rather than once per row.
- Pattern matching remains unanchored and the accepted subset exports directly to JSON Schema. A host
  that evaluates exported schemas must choose a validator with appropriate resource limits; WillowForms
  controls only its own validation engine.

- A **rule key the engine does not recognise fails with `UNREADABLE_RULE`.** This is the one place a rule
  reports rather than passes on an empty value, and deliberately: an unknown key is a document from a
  newer version or a hand edit, and a rule nobody can read is not a rule anybody should be told passed.

## Messages

**Status: built.** Each rule has a default in `DEFAULT_MESSAGES`. An override may be a legacy plain
string or a `PropValue`. The Rules tab authors custom static text or a translation key and edits every
language beside the rule. Validation receives the active language bundle through `EvalOptions.messages`;
a missing translation shows its key, while an empty or unreadable custom message falls back to the rule
default. Computed messages run only through the host evaluator and otherwise use the default.

## Guards

**Status: built.** `when` is in the model, honoured by the engine, and authored in the Rules tab as
always, never, a structured condition, or an expression.

A guard makes a rule conditional: `required` with `when` applies only when the guard is truthy.

Which guards need an evaluator depends on the kind, and that distinction is the whole point of the
structured condition. A `computed` guard is an expression, so with no evaluator injected there is no way
to know and the rule is skipped. A `condition` guard is data the engine reads itself, so it works
everywhere -- on a server that injects nothing, in the designer, in a worker. A `static` guard is a
boolean. A guard of a kind this code cannot read is treated as "has not said no", so the rule still
applies: the other direction turns a required answer optional over a mistyped tag.

Inside a repeater row, a `computed` guard reads the row's answers as well as the form's, like every other expression. See [07-bindings.md](07-bindings.md#computed).

Guarded rules are the reason `toJsonSchema` reports lossiness — see
[10-interchange.md](10-interchange.md).

## Cross-field rules

**Status: built.**

`matches` compares JSON values structurally, so it covers confirmation fields as well as list or object
answers. `after` compares numbers numerically and strings lexicographically; ISO dates therefore compare
in chronological order. In a repeater, `scope: 'row'` names a sibling answer in the enclosing row while
absent or `form` names a top-level answer. The document validator reports scope mismatches, and the Rules
tab only offers data keys from the applicable scopes. Both rules are reported as lossy by JSON Schema
export because their relationship cannot be represented by a property-local keyword.

## The API

```ts
validateField(node, data, options?): string | undefined
validateForm(root, data, options?): FormErrors          // key -> message
applyRule(rule, value, data, options?): string | undefined

// What a form actually submits: the answers to questions it is still asking.
// A server that stores the raw body stores whatever the browser sent.
submittedData(root, data, options?): FormData

// A form validated once per scope. See Server parity: a wizard needs these
// two, and calling `validateForm`/`submittedData` on one instead is a submit
// that reports success over answers it never looked at.
validateAcross(root, data, scopes): FormErrors
submittedAcross(root, data, scopes): FormData

interface EvalOptions {
  evaluate?: Evaluator      // absent means every `custom` rule and `computed` guard is skipped
  context?: FormContext     // what the host knows: the user, the step, the tenant
  row?: RowContext          // set by the walk that enters a repeater row, never by a caller
}
```

The last argument is a bag, not an evaluator. It was written here as `evaluate?` for long enough to be
worth saying twice: passing a function positionally is a type error in TypeScript and, in JavaScript,
silently drops every `custom` rule and every computed guard -- which is a required answer quietly
becoming optional, on the server.

`validateForm` returns the first failing message per component, not every failure. Showing one problem at
a time per field is what a form does; the full list is available by calling `applyRule` directly.

**A repeater with more rows than `MAX_ROWS` (5000) is refused whole.** The row count comes out of the
submitted body rather than from the client -- asking the browser how many rows there are would let a
client submit one and have the rest go unchecked -- so the body decides how much work happens, and rows
nest multiplicatively. Over the cap, `validateForm` records `TOO_MANY_ROWS` against the repeater and
validates none of its rows, so the response carries one generic message where a server operator might
expect per-field ones. Both constants are exported, so a body-size limit can be sized against the same
number the engine uses.

There are **three** refusals a repeater can report, not two. The third is `NOT_A_LIST`, recorded when a
repeater's submitted value is a non-null value that is not an array. It is exported alongside the other
two and was documented nowhere. Its docblock records why it exists: reading such a body as "no rows"
meant the rules inside the repeater never ran, so `"addresses": "nope"` turned every required field
inside it optional, on the server, with nothing to see.

**A document nested deeper than `MAX_TREE_DEPTH` (500) is refused too**, under `TOO_DEEP`. Nothing on the
validate path calls `validateDocument`, so a stored document of any depth reaches `validateForm`
directly. Past the bound it reports rather than returning, for the same reason as the row cap: a subtree
nobody checked is not a subtree that passed. `submittedData` stops silently at the same bound instead,
which is the one place the two deliberately differ -- the form has already refused, so there is no
payload for the projection to be wrong about.

`FormErrors` is keyed by component key outside a repeater, and by a row address inside one --
`addresses[1].street`, where the prefix is built from the repeater's _data_ key and the leaf is the
component key. A host that looks errors up by `node.key` alone finds none for any field inside a
repeater, and ships a form that displays nothing on a rejected submit.

It stays keyed by component key rather than by data key, and stays that way now `dataKey` exists. Data keys may repeat,
so keying errors by one would let two components collide over a single message. See
[01-document-model.md](01-document-model.md#datakey).

## Authoring: the Rules tab

**Status: built.** See [06-inspector.md](06-inspector.md).

Two things the panel says out loud, because both are invisible otherwise:

- as soon as a field has rules but no `required`, that it stays valid while empty
- on a `custom` rule, that it passes rather than failing when no evaluator is injected

A rule that silently never fires is worse than one that visibly cannot run.

## Server parity

**Status: built**, and demonstrated by `apps/demo-server`, which is five routes over a JSON file whose
only purpose is to prove that a form's rules are one rule set, run in both places.

### The single-scope case

A form with no steps validates once, and this is the whole of it:

```ts
import { missingContext, submittedData, validateForm } from '@willowforms/core'

const context = { user: { role: session.role } }

// Once, at startup. A visibility rule reading a path the server does not supply
// is not a rejected submit, it is an accepted one that skipped a required
// answer -- see The evaluator below.
const missing = missingContext(document.root, context)
if (missing.length) throw new Error('context missing: ' + missing.join(', '))

const errors = validateForm(document.root, submitted, { context })
if (Object.keys(errors).length > 0) return respond(422, { errors })

const payload = submittedData(document.root, submitted, { context })
```

`submittedData` is not optional decoration. It is what drops answers to questions the form did not ask,
and a server that stores `submitted` directly stores whatever the browser sent.

### The wizard case, which is not the same call

This section used to stop at the snippet above and say the demo server was built on it. It is not, and
following it on a wizard document produces a submit that reports success over missing answers.

Every `Step` carries a `renderWhen` comparing `context.step` to its own key. With a context holding no
`step`, every one of those comparisons is false, `isVisible` is false, and `validateForm` skips every
step's subtree — returning `{}` for a submission missing every required answer. Add the boot-time assert
below and the other outcome appears instead: `missingContext` reports `step` and the server refuses to
start.

A multi-step form validates **once per scope**, and the scopes come out of the document:

```ts
import { contextValues, missingContext, submittedAcross, validateAcross } from '@willowforms/core'

const steps = contextValues(document.root, 'step').filter(
  (step): step is string => typeof step === 'string',
)
const scopes = steps.length
  ? steps.map((step) => ({ context: { ...context, step } }))
  : [{ context }]

const errors = validateAcross(document.root, submitted, scopes)
if (Object.keys(errors).length > 0) return respond(422, { errors })

const payload = submittedAcross(document.root, submitted, scopes)
```

Three things in that are load-bearing and each has its own silent failure:

- **The steps come out of the document, never out of the request.** Asking the browser which steps exist
  lets a client name one and have the rest go unchecked, and the submit then succeeds with required
  answers missing.
- **`submittedAcross`, not `submittedData`.** Its own docblock records what the projection did before it
  existed: the demo server validated across all scopes and then projected under `scopes[0]`, so every
  answer given on step two onwards was dropped from the payload. A form that validated a required field
  and then submitted without it.
- **`missingContext` runs per scope, not against the bare session context.** `step` is a path the server
  fills in itself, so against the base context it reads as missing and every wizard is refused.

```ts
const missing = [
  ...new Set(scopes.flatMap((scope) => missingContext(document.root, scope.context))),
]
if (missing.length) throw new Error('context missing: ' + missing.join(', '))
```

### The evaluator

The server must inject the same evaluator as the client for `custom` rules and guards to behave
identically. With none injected they pass, which means **a `custom` rule is not a security control**. A
server that needs one must supply the sandbox.

A `computed` visibility rule is the sharper case, because it fails in the other direction: `isVisible`
reads one as _hidden_ when there is nothing to evaluate it with, so the node and its whole subtree leave
validation entirely. `evaluatorKeys` is the check for it. `apps/demo-server` injects no evaluator
deliberately — there is no `eval` default anywhere in this project — and refuses a document that needs
one rather than validating less of it than the browser did.

Parity's second half fails more quietly than the first. A visibility rule reading `FormContext` decides
whether a field is validated at all, so a server that does not supply the context does not reject the
submit — it accepts one that skipped a required answer.

The context is the server's, never the request's. A payload carrying `user.role` is a claim from the
browser, and the only way it cannot be believed is if the server never reads it from there. See
[12-api.md](12-api.md#state-that-is-not-an-answer).

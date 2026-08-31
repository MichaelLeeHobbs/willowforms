# Validation

**Status: partial.** The rule engine, the catalogue and the Rules tab are built and are what most
readers came for. Two sections below are not: a `when` guard can only be authored through the JSON
editor, and cross-field rules are a design with no code. The status here is the weakest section, which
is the rule this index follows -- see [README.md](README.md).

Validation lives in `@formsmith/core`, which imports no React and runs in Node. That is not a
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
  | { key: 'required'; message?: string; when?: PropValue }
  | { key: 'minLength'; value: number; message?: string; when?: PropValue }
  | { key: 'maxLength'; value: number; message?: string; when?: PropValue }
  | { key: 'min'; value: number; message?: string; when?: PropValue }
  | { key: 'max'; value: number; message?: string; when?: PropValue }
  | { key: 'pattern'; value: string; message?: string; when?: PropValue }
  | { key: 'email'; message?: string; when?: PropValue }
  | { key: 'url'; message?: string; when?: PropValue }
  | { key: 'uuid'; message?: string; when?: PropValue }
  | { key: 'custom'; expression: string; message?: string; when?: PropValue }
```

| Rule                      | Parameter          | Applies to | Fails when                                  |
| ------------------------- | ------------------ | ---------- | ------------------------------------------- |
| `required`                | —                  | anything   | the value is empty                          |
| `minLength` / `maxLength` | `number`           | text, list | the string or the list is shorter or longer |
| `min` / `max`             | `number`           | numbers    | the number is outside the range             |
| `pattern`                 | regular expression | text       | the expression does not match               |
| `email`                   | —                  | text       | it is not an email address                  |
| `url`                     | —                  | text       | it is not an http, https, mailto or tel URL |
| `uuid`                    | —                  | text       | it is not a UUID                            |
| `custom`                  | expression         | anything   | the expression returns falsy                |

**Empty** means `undefined`, `null`, a string that is blank once trimmed, an empty array, or an object
with no keys. A `0` is a value, not an absence.

The empty object is there because a payload shape that uses `{}` as a placeholder would otherwise satisfy
a required consent: `{"consent": {}}` was a truthy value with nothing in it, and `required` passed.

`required` is the one rule that is stricter, and only for booleans: **an unchecked box is a non-answer**.
"I accept the terms" is the canonical required checkbox and it has to be checked, which is exactly what
the platform's own `<input type="checkbox" required>` means. Every other rule keeps treating `false` as a
supplied value, because requiredness is one rule's job.

This rule was written here before it was true anywhere else. The code treated `false` as a supplied
answer, so a consent checkbox passed while unticked, and an existing test asserted that behaviour as
correct. Neither the type checker nor the suite had an opinion, because nothing had ever asked.

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

- A **value longer than 4096 characters never matches a `pattern`.** Matching is linear in the input for a
  well-behaved expression and is not for a hostile one, so the input is bounded before the engine is
  asked. A long answer therefore fails its format rule rather than hanging the page.
- A **pattern with a nested unbounded quantifier matches nothing at all.** `(a+)+` and `(\w+)+@example\.com`
  are the shape whose backtracking is exponential, so they are refused rather than run -- which means every
  value fails that rule, including the ones the author was testing with. The rule editor says so; a host
  calling `applyRule` directly sees only the failure.
- A **rule key the engine does not recognise fails with `UNREADABLE_RULE`.** This is the one place a rule
  reports rather than passes on an empty value, and deliberately: an unknown key is a document from a
  newer version or a hand edit, and a rule nobody can read is not a rule anybody should be told passed.

## Messages

Each rule has a built-in default in `DEFAULT_MESSAGES`. An author can override it per rule; clearing the
override removes the key rather than storing an empty string, so the default comes back rather than the
field failing with no text.

Messages are plain strings today. **Planned:** they should be `PropValue`, so a message can be a
translation key. A localised form with English-only error messages is half localised.

## Guards

**Status: partial.** `when` is in the model and honoured by the engine; there is no UI, so a guarded rule
can only be authored through the JSON editor.

A guard makes a rule conditional: `required` with `when` applies only when the guard is truthy.

Which guards need an evaluator depends on the kind, and that distinction is the whole point of the
structured condition. A `computed` guard is an expression, so with no evaluator injected there is no way
to know and the rule is skipped. A `condition` guard is data the engine reads itself, so it works
everywhere -- on a server that injects nothing, in the designer, in a worker. A `static` guard is a
boolean. A guard of a kind this code cannot read is treated as "has not said no", so the rule still
applies: the other direction turns a required answer optional over a mistyped tag.

Guarded rules are the reason `toJsonSchema` reports lossiness — see
[10-interchange.md](10-interchange.md).

## Cross-field rules

**Status: planned.**

Every rule today sees one value. "Confirm password matches password" and "end date is after start date"
are the two everyone needs, and neither is expressible except through `custom`, which needs a sandbox.

`applyRule` already receives the whole `FormData`, so the engine can support this without a signature
change. What is missing is a declarative rule that does not require the host to have injected an
evaluator, since needing a sandbox for "these two fields must match" is a poor trade.

Sketch, not yet decided:

```ts
| { key: 'matches'; field: string; message?: string; when?: PropValue }
| { key: 'after';   field: string; message?: string; when?: PropValue }
```

## The API

```ts
validateField(node, data, options?): string | undefined
validateForm(root, data, options?): FormErrors          // key -> message
applyRule(rule, value, data, options?): string | undefined

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
only purpose is to prove that `validateForm` is the same function in both places.

```ts
import { missingContext, validateForm } from '@formsmith/core'

const context = { user: { role: session.role } }

const errors = validateForm(document.root, submitted, { context })
if (Object.keys(errors).length > 0) return respond(422, { errors })
```

The server must inject the same evaluator as the client for `custom` rules and guards to behave
identically. With none injected they pass, which means **a `custom` rule is not a security control**. A
server that needs one must supply the sandbox.

Parity now has a second half, and it fails more quietly than the first. A visibility rule reading
`FormContext` decides whether a field is validated at all, so a server that does not supply the context
does not reject the submit, it accepts one that skipped a required answer. Assert once at startup:

```ts
const missing = missingContext(document.root, context)
if (missing.length) throw new Error('context missing: ' + missing.join(', '))
```

The context is the server's, never the request's. A payload carrying `user.role` is a claim from the
browser, and the only way it cannot be believed is if the server never reads it from there. See
[12-api.md](12-api.md#state-that-is-not-an-answer).

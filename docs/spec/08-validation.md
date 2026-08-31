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
| `url`                     | —                  | text       | `URL.canParse` rejects it                   |
| `uuid`                    | —                  | text       | it is not a UUID                            |
| `custom`                  | expression         | anything   | the expression returns falsy                |

**Empty** means `undefined`, `null`, a string that is blank once trimmed, or an empty array. A `0` is a
value, not an absence.

`required` is the one rule that is stricter, and only for booleans: **an unchecked box is a non-answer**.
"I accept the terms" is the canonical required checkbox and it has to be checked, which is exactly what
the platform's own `<input type="checkbox" required>` means. Every other rule keeps treating `false` as a
supplied value, because requiredness is one rule's job.

This rule was written here before it was true anywhere else. The code treated `false` as a supplied
answer, so a consent checkbox passed while unticked, and an existing test asserted that behaviour as
correct. Neither the type checker nor the suite had an opinion, because nothing had ever asked.

### Every failure degrades rather than throws

**Status: built.**

- A **`pattern` that will not compile** matches nothing instead of throwing. The expression is authored
  one character at a time, so it is a syntax error for most of the time it is being typed. An uncaught
  throw here took Preview down in the browser and reached the server as an unhandled 500.
- A **`custom` rule with no injected evaluator** passes. So does a rule whose `when` guard needs one.
- **Non-primitive values read as empty text.** `String({})` gives `"[object Object]"`, which would land
  in an input the user then has to clear and could accidentally satisfy a `pattern`.

The principle: a missing sandbox must not throw and must not silently fail a user's form.

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

`FormErrors` is keyed by component key, and stays that way now `dataKey` exists. Data keys may repeat,
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

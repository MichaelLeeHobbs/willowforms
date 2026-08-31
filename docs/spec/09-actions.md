# Actions and events

**Status: planned.** The model declares all of it. Nothing authors an action and nothing fires one.

Two questions that used to be undecided here are settled: an action **returns effects** rather than
changing data, and one vocabulary serves both built-in and `code` actions. What is not settled is the
vocabulary itself, and that is deliberate. Working through what real forms do showed that actions sit one
layer above what is actually blocking them, so this is no longer the next thing to build. See
[why this is not next](#why-this-is-not-next).

## The boundary, first

Everything in this document executes author-supplied JavaScript. In a single-user builder that is fine.
In any multi-user deployment it is remote code execution by design, and the form author and the person
filling the form in are not the same person.

**Core ships no evaluator, and never will.** The host injects one and owns the sandbox. A convenience
`eval`-backed default would be indistinguishable from the vulnerability, and it would be the default —
which means most deployments would ship it.

```ts
type Evaluator = (expression: string, data: FormData, context?: FormContext) => JsonValue
```

That signature is the whole contract. The third argument is what the host knows and does not submit --
the signed-in user, the step, the tenant -- and it is passed separately from `data` on purpose: an
expression can read it, and nothing can submit it. Everything that runs author code — computed properties, `custom`
rules, rule guards, and the actions below — goes through it.

### What a host must supply

A sandbox with no access to the page, the network, or the host's globals. A `Worker` with a restricted
global scope, or a same-origin-isolated `iframe`, are the two ordinary answers. What is not acceptable:

- `eval` or `new Function` on the main thread, which is the host's own scope
- a "sanitised" string check, which is not a security boundary
- running author code on a server with anything the request user could not already do

### With no evaluator

Everything degrades permissively and nothing throws:

| Feature                         | Without an evaluator                            |
| ------------------------------- | ----------------------------------------------- |
| Computed property               | resolves to `null`; the component still renders |
| `custom` rule                   | passes                                          |
| Rule `when` guard               | the guarded rule is skipped                     |
| `renderWhen` computed condition | resolves to hidden                              |
| Action                          | does not run                                    |

`renderWhen` is the one that resolves to _hidden_ rather than _shown_, because that is what the renderer
already does and validation must agree with the renderer about what is on screen. See
[01-document-model.md](01-document-model.md#renderwhen).

The principle: a missing sandbox must not throw, and must not silently fail a user's form.

## The model

```ts
type EventName = 'onChange' | 'onClick' | 'onBlur' | 'onFocus' | 'onMount' | 'onUnmount'

interface ActionRef {
  name: string // a CodeAction on the document, or a built-in
  type: 'code' | 'builtin'
}

interface CodeAction {
  name: string
  body: string // JavaScript source
  params: Record<string, JsonValue>
}
```

A component's `events` maps an event to an ordered list of `ActionRef`. Actions live on the document, not
on the component, so one can be reused — which is the point of naming them.

`validateDocument` already checks that every `code` reference names an action that exists. That check has
been running since the first commit against a feature nobody can use.

## An action returns effects

**Status: decided, not written.** This was two open questions, and they turned out to be one.

An action does **not** change form data. It returns an ordered list of effects, and the runner applies
them. A built-in action and a `code` action return from the same vocabulary; the only difference between
them is who wrote the body.

### Why, and not the reason this document used to give

The old wording said direct mutation "makes undo meaningless". That argument is wrong and has been
removed: undo is a designer feature over documents, and runtime form data has no undo to make meaningless.
Two better reasons survive.

**The sandbox contract already forbids the thing mutation is good at.** `Evaluator` is
`(expression: string, data: FormData) => JsonValue`: synchronous, pure, and networkless, sandboxed because
author code is treated as remote code execution. Author code cannot `await`, cannot `fetch`, and has no
handle on the host. An imperative `setValue` would have to be a message posted back across that boundary,
which means adopting it is not a choice about action ergonomics. It is a decision to widen the sandbox
into a permanent bidirectional write channel, open after the node unmounts and after the form is
submitted. That is a much larger security decision than the one it looks like.

**A superseded result cannot be discarded by the author.** Type a postcode, three lookups go out, they
resolve out of order, and the answer to the first keystroke lands last. Fixing that needs state shared
across runs, and Worker runs are isolated by design, so the author cannot reach it. Only a runner holding
the returned value can drop a stale one. This is the common case, not the exotic one: it applies to every
lookup, availability check and quote in a real form.

The honest counter, worth recording because it is a good one: a capability model can emulate a returned
list, and a returned list cannot emulate a capability. That asymmetry is real. It buys progressive results
— a live upload percentage, a countdown — and those are conceded for now. They also need timers and
timers, which do not exist, so nothing is lost today that is not already lost.

### Effects, not a data patch

The list is **effects**, not a diff of form data. Roughly a third of what real forms do on an event
changes something other than data: move focus, scroll to an error, announce a result, navigate, download,
hand off to the host. A data-shaped patch cannot express any of those, and a vocabulary that covers only
the easy third would push everything else back into the escape hatch.

```ts
type Effect =
  | { kind: 'setValue'; dataKey: string; value: JsonValue }
  | { kind: 'clearValue'; dataKey: string }
  | { kind: 'focus'; nodeKey: string }
  | { kind: 'announce'; message: string }
  | { kind: 'setContext'; path: string; value: JsonValue }
  | { kind: 'validate'; scope?: string }
  | { kind: 'emit'; event: string; payload?: JsonValue }
  | { kind: 'halt'; reason?: string }
```

Three namespaces, deliberately visible in the type. Data effects address `dataKey`, which may repeat;
interface effects address `nodeKey`, which is unique; `setContext` addresses a dot path in `FormContext`,
which is the host's and never submitted. That is the same split `FormData` and `FormErrors` already make,
extended by the one [12-api.md](12-api.md#state-that-is-not-an-answer) settled, and an imperative
`set(key, value)` could not show any of it.

`setContext` is what makes "three addresses found" authorable: the effect writes it, and a condition reads
it.

It writes to the browser's copy, and only that. The server builds its own context from its own session
and never reads one out of the request body, so an effect cannot reach across and tell the server what to
believe. A rule guarding something that matters must therefore read a path the server can derive for
itself. That is a real limit on `setContext` and it is the right one: an effect is authored in a document,
and a document must not be able to grant itself privilege on the server.

An unknown effect kind rejects the whole list rather than applying part of it. A document authored in a
newer designer must fail visibly in an older host, not half-apply.

**Open: a batch that mixes namespaces is not atomic.** Rejecting an unknown kind up front is a check on
the list, not a transaction over applying it. `setValue` goes through the host's `onChange`, `setContext`
through whatever holds the context, and `focus` touches the DOM: three owners, no shared commit point, so
an effect that throws halfway leaves the earlier ones applied. Either the runner collects every change
and hands the host one commit, or the specification states that effects apply in order and may partially
apply. The second is cheaper and worse, and neither should be decided before the vocabulary is.

### `emit` is what makes the set closable

Formsmith has no persistence and no backend opinion, so `submit`, `save draft`, `look up this postcode`
and `send this to analytics` are all the same shape: a named event the host handles. One effect covers
them, and it is the reason the vocabulary can stay small rather than growing an entry per integration.

### Network access belongs to the host

No action of either shape can make a network call, because the evaluator cannot. So an asynchronous
behaviour is a **host-executed request**: the host performs the call, and the author's code is reduced to
two pure evaluator calls, one shaping the body from `data` and one mapping the response to effects. The
runner owns the in-flight token, the timeout, and the policy for what happens when a second request
starts before the first returns.

This falls out of the sandbox contract rather than being a preference, and it is why the mutation
question never really touched async.

### Degradation has three tiers, not one

The table above says "action: does not run", which is too coarse. A `same as billing` checkbox that
silently does nothing in a host with no evaluator is broken, not degraded.

| Action                                | Without an evaluator                                     |
| ------------------------------------- | -------------------------------------------------------- |
| Built-in, literal parameters only     | runs                                                     |
| Built-in with an expression parameter | that parameter resolves to `null`; the action still runs |
| `code`                                | does not run                                             |

### What is still open

The vocabulary above is a sketch, not the specification. Settling it means answering what an ordered list
does when one entry fails, whether a programmatic write re-fires the events of the field it wrote, and
where the cycle stops when two fields legitimately set each other. None of that is worth settling before
the gaps below are.

## Why this is not next

**Status: decided.** Actions are one layer above what is actually blocking real forms.

Working through the behaviours of checkouts, insurance quotes, job applications, surveys and booking
flows, the blockers sort into four groups, and the action model touches none of them:

- ~~**Ephemeral state that is not submitted.**~~ **Settled.** An effect writes to `FormContext`, which
  the host owns and supplies, and which a condition can read because it is JSON that survives a trip to
  the server. What cannot survive that trip stays in the kit component and nothing authored may depend on
  it. See [12-api.md](12-api.md#state-that-is-not-an-answer).
- **Steps.** Built. A `Step` component in both kits, shown when `context.step` names it, and
  `validateAcross` checks every step's fields rather than only the one on screen. Branch-to-question and
  a progress indicator are still missing. See [03-components.md](03-components.md).
- **Repeated scope.** Built. A row coordinate is formed at the boundary, `Operand.ref` carries a scope
  discriminant, and `applyChange` places a write into the right row. What is still missing for actions is
  narrower than it was: a Remove button inside row three needs to _name_ row three, and a row is
  addressed rather than identified. See [01-document-model.md](01-document-model.md#datakey).
- **Timers.** No scheduled trigger, so no cooldown, no autosave, no session warning.

**The argument that used to close this section has been answered, and it is worth saying how.** It read:
`renderWhen`'s only conditional form is `computed`, which needs an evaluator and has no authoring UI, so
conditional visibility — the most common dynamic behaviour a form has — needs a sandbox _and_ hand-edited
JSON, and a closed structured condition would do more for "most forms need no JavaScript" than this
entire document.

That is what happened. `Condition` is a fourth `PropValue` kind, evaluated by core with no sandbox, and
the Properties panel draws it as a picker. So the case for actions no longer rests on conditional
visibility being unreachable without one; it rests on what an action does that a condition cannot, which
is change something. See [01-document-model.md](01-document-model.md#conditions).

## Authoring

**Status: planned.** See [06-inspector.md](06-inspector.md#actions).

Two surfaces: a per-component Actions tab wiring events to references, and a document-level editor for
the actions themselves. The `code` property editor they both need now exists.

Its absence also has a workaround the other gaps do not: a host that needs behaviour can wire it outside
the form, through `onChange` on the whole document. And it is the only feature here that can make a form
unsafe.

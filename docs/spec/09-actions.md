# Actions and events

**Status: planned.** The model declares all of it. Nothing authors an action, nothing fires one, and no
evaluator exists to run one. This is the largest gap between what the type system promises and what a
user can reach.

## The boundary, first

Everything in this document executes author-supplied JavaScript. In a single-user builder that is fine.
In any multi-user deployment it is remote code execution by design, and the form author and the person
filling the form in are not the same person.

**Core ships no evaluator, and never will.** The host injects one and owns the sandbox. A convenience
`eval`-backed default would be indistinguishable from the vulnerability, and it would be the default —
which means most deployments would ship it.

```ts
type Evaluator = (expression: string, data: FormData) => JsonValue
```

That signature is the whole contract. Everything that runs author code — computed properties, `custom`
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

## Built-in actions

**Status: undecided.** `ActionRef.type` allows `'builtin'` and no built-in exists.

This is the decision that matters most here, because **most forms need no JavaScript at all.** The common
cases are:

- submit the form
- reset the form
- set another field's value
- show or hide something
- navigate somewhere

Every one of those is expressible declaratively. If the built-ins cover them, the overwhelming majority
of forms never touch the sandbox, and the sandbox becomes an advanced feature rather than a prerequisite
for a working form. That is a much better shape than "install a sandbox or your buttons do nothing".

The recommendation is to specify a small, closed set of built-ins and treat `code` as the escape hatch,
not the primary path.

## Firing

**Status: undecided.** The renderer receives `onChange` from a data-bound component today and does
nothing else with events. The open question at the end of this section is the semantics of the whole
feature, so nothing here is buildable yet. It would need:

- an `onAction` prop, so the host decides what running an action means
- lifecycle events, which means the renderer knows when a node mounts and unmounts
- an ordering guarantee for a list of actions on one event: sequential, and a failure stops the rest

**Undecided:** whether an action can change form data directly, or only return a value the renderer
applies. Direct mutation is simpler to write and much harder to reason about, and it makes undo
meaningless. Returning a patch is the safer design.

## Authoring

**Status: planned.** See [06-inspector.md](06-inspector.md#actions).

Two surfaces: a per-component Actions tab wiring events to references, and a document-level editor for
the actions themselves. Both need the `code` property editor, which does not exist.

## Why this is last

Its absence has a workaround the others do not: a host that needs behaviour can wire it outside the form
through `onChange` on the whole document. It is also the only feature here that can make a form unsafe.

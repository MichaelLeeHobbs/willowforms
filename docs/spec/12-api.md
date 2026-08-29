# Public API

**Status: partial.** The three entry points below are built and stable in practice. Nothing yet states a
compatibility promise, and the key grammar is looser than anything downstream of it wants.

This is what a consumer imports. Everything else in this specification describes behaviour behind these
three surfaces, and none of the other twelve files said what they were, which left the most-used contract
in the project as the only undocumented one.

## Three packages, three audiences

| Package               | Installed by                      | Brings                      |
| --------------------- | --------------------------------- | --------------------------- |
| `@formsmith/core`     | anyone, including a server        | types, tree ops, validation |
| `@formsmith/renderer` | anyone rendering a form           | `FormRenderer`, kit types   |
| `@formsmith/designer` | only a host embedding the builder | `Designer`                  |

A kit package brings its own two halves and depends on the first two. Most consumers never install the
designer, which is the point of the split.

## Embedding the designer

**Status: built.**

```tsx
import { Designer } from '@formsmith/designer'
import '@formsmith/designer/styles.css'
```

| Prop              | Type                               | Required | Meaning                           |
| ----------------- | ---------------------------------- | -------- | --------------------------------- |
| `initialDocument` | `FormDocument`                     | yes      | Starting document                 |
| `kit`             | `Kit`                              | yes      | Palette metadata                  |
| `rendererKit`     | `RendererKit`                      | yes      | Canvas renderers for the same kit |
| `onChange`        | `(document: FormDocument) => void` | no       | Fires on every change             |
| `onSave`          | `(document: FormDocument) => void` | no       | Shows a Save button when passed   |

`initialDocument` is a starting value, not a controlled prop. The designer owns the document from mount,
and observing it means `onChange`; passing a different `initialDocument` later does nothing. A host that
needs to replace the document from outside needs an API that does not exist yet.

The stylesheet is a separate import so a host theming by token override can load it once, in its own
order. See [11-theming.md](11-theming.md).

`onSave` is what makes the toolbar show a Save button, and its absence is why there is no button by
default: Formsmith does not persist, and one it cannot honour is worse than none. See
[04-shell.md](04-shell.md#toolbar).

## Rendering a form

**Status: built.** This is the package most consumers install, and the only one on the page for a person
filling in a form.

```tsx
import { FormRenderer } from '@formsmith/renderer'
```

| Prop           | Type                                      | Required | Meaning                                               |
| -------------- | ----------------------------------------- | -------- | ----------------------------------------------------- |
| `document`     | `FormDocument`                            | yes      | The form                                              |
| `kit`          | `RendererKit`                             | yes      | Renderers                                             |
| `data`         | `FormData`                                | yes      | Current values, flat, keyed by node                   |
| `onChange`     | `(key: string, value: JsonValue) => void` | yes      | One field changed                                     |
| `errors`       | `FormErrors`                              | no       | Messages to display, keyed by node                    |
| `language`     | `string`                                  | no       | BCP 47 tag; defaults to the document                  |
| `evaluate`     | `Evaluator`                               | no       | Sandbox for computed props                            |
| `device`       | `Device`                                  | no       | Render `css` for one device, not by media query       |
| `context`      | `FormContext`                             | no       | What the host knows and does not submit               |
| `revealHidden` | `boolean`                                 | no       | Draw what `renderWhen` hides. Authoring surfaces only |

### The host owns the data

`FormRenderer` is controlled and holds nothing. It reports one field at a time and never composes the
result, so the host decides what a value means, when validation runs, and what submit does:

```tsx
const [data, setData] = useState<FormData>({})
const [errors, setErrors] = useState<FormErrors>({})

<FormRenderer
  document={doc}
  kit={renderers}
  data={data}
  errors={errors}
  onChange={(key, value) => setData((d) => ({ ...d, [key]: value }))}
/>
```

Submitting is `setErrors(validateForm(doc.root, data))` and checking whether the result is empty. That is
the same call a server makes on the same document, which is the whole reason validation lives in core.
See [08-validation.md](08-validation.md#server-parity).

### What a form actually submits

**Status: built.** A value stays in `data` after the field that collected it is hidden. Tick "married",
give a spouse's name, untick it: `validateForm` correctly stops checking that field, and the answer is
still in the payload. The form submits an answer to a question it is no longer asking.

`submittedData(root, data, evaluate?)` is the projection a host applies when it submits. It is not done
to the value as it is held, because the host owns `data` and hiding is often temporary — an accordion
closing must not destroy what someone typed. Visibility comes from the same `isVisible` the renderer and
`validateForm` use, so all three agree about what is on screen.

It builds its result on a null prototype and copies it into a plain object at the end. `out[key] = value`
for a key of `__proto__` sets the prototype instead of adding a property, so the answer would vanish from
the payload and the payload would inherit whatever it pointed at. Data keys come out of a document and
the [grammar for them](#keys) is still only planned, so that is reachable today rather than in theory.

`FieldSchema.autoValidate` is the per-field hint that a field wants validating while it is typed into.
The host decides whether to honour it, and `autoValidateKeys(root)` names the fields that asked.

### State that is not an answer

**Status: built.** "Three addresses found." "Checking availability." "43 seconds until you can resend."
"Uploading, 40%." None of that belongs in `data`, because `data` is what the host submits and nobody
wants `__addressCandidates` in the payload. `renderWhen` could only read `data`, so there was nowhere for
it to live.

It turned out not to be one thing. Splitting it is the whole answer, and the line between the two halves
is not where it first looks.

#### The line: a condition must be answerable in Node

`renderWhen` gates validation. A hidden field is not validated, on the server as well as in the browser,
and that is deliberate: a required answer nobody can see must never block a submit. The consequence is
that **anything a condition can read has to be reproducible on the server**, or the two disagree about
what the form asked, silently, and in the permissive direction.

So the split is not "important" against "transient". It is: can a value be handed to Node?

|                         | Context  | Presentation                 |
| ----------------------- | -------- | ---------------------------- |
| Owner                   | the host | the kit component            |
| Type                    | JSON     | anything, including a `File` |
| Exists server-side      | yes      | no                           |
| A condition can read it | yes      | **never**                    |
| In the payload          | no       | no                           |

#### Context

`FormContext` is `Record<string, JsonValue>`, supplied through `FormRenderer`'s `context` prop and
`EvalOptions.context` in core. A condition reads it through a third operand kind:

```ts
{ kind: 'context', path: 'user.role' }
```

A dot path, because a host's context already is nested and making every host flatten `{ user: { role } }`
into `{ 'user.role': … }` is work Formsmith would be creating rather than doing. Every step is an
own-property read that must land on a plain object, so `constructor.prototype` reads as missing and a
path cannot walk into a string's `length`. A key containing a dot is unreachable, which is a stated limit
rather than an escape syntax, because an escape syntax is a parser and a parser is a thing with its own
bugs sitting in the middle of a security boundary.

Context and `data` are separate namespaces. Merging them would make which one a rule reads depend on what
the host happened to call a key, and the form author who wrote the rule cannot see the host's names.

That it is JSON is enforced by the type and nowhere else. A host in TypeScript cannot put a `Date` in it;
a host in JavaScript can, and the failure is the quiet kind again, because a `Date` compares as itself in
the browser and as a string once it has been through a request. `missingContext` reports absence, not
shape. Checking every leaf on every boot is a defensible thing to add and is deliberately not there yet.

The evaluator gets it too, as a third argument: `(expression, data, context)`. An evaluator written
before context existed ignores it and keeps working.

#### Presentation state stays in the component

A spinner's boolean, an upload's percentage, a `File`, an `AbortController`. These live in the kit
component's own React state, they always did, and the decision is that they stay there and no condition
can read them. There is nothing to build, which is the point: the renderer keeps holding no state, and
the value that could not survive a trip to Node is the value nothing authored depends on.

A host that wants "three addresses found" to drive a visibility rule publishes it to `context`. That is
one line in the host and it makes the rule work identically on the server. This is also what makes the
action vocabulary tractable: an effect writes to context, which the host already owns.

#### Why not a reserved namespace inside `data`

The cheapest option was `__` keys the host strips before submitting. Rejected for three reasons, and the
first alone is enough:

- It leaks. The strip is one line in one place in the host, and over the life of an application somebody
  will add a second submit path that does not have it. A design whose safety depends on nobody forgetting
  is a design that fails.
- It cannot hold a `File` or an `AbortController`, so it solves half the problem while looking like it
  solved all of it.
- Wrong cardinality. `data` is keyed by `dataKey` and repeats per row inside a `Repeater`, while
  "checking availability" is usually about the form.

#### The quiet failure, and where it is caught

A document that reads `user.role` and a host that never supplies it: the path reads as missing, the
condition is false, the component is hidden, and `validateForm` skips it. A required answer becomes
advisory, on the server.

Nothing at evaluation time can fix that. Core cannot tell an unwired host from a context that genuinely
has no such key, and the form still has to render for the person filling it in either way. But wiring is
a boot-time question, so it gets a boot-time answer:

```ts
const missing = missingContext(document.root, context)
if (missing.length) throw new Error('context missing: ' + missing.join(', '))
```

`contextKeys(root)` names every path a document reads, across visibility rules, condition-bound
properties, and the `when` guard on a validation rule. Expressions are not covered and cannot be: what a
string of JavaScript reads is the evaluator's business, and core does not parse it. A path holding
`false` or `0` is supplied, not missing, or a host would learn to ignore the report.

#### Still open: a row's own scope

Reading "this row's index" or "the row above" needs addressing that does not exist yet. That is
`Repeater`'s scoping problem and it is deliberately not answered here. See
[03-components.md](03-components.md#what-is-deliberately-absent).

### A type the kit does not have

**Status: built.** A document can name a component its kit does not implement, and switching kits at
runtime makes that ordinary rather than exceptional, because matching type strings between kits is
explicitly optional. See [02-kit-contract.md](02-kit-contract.md#writing-your-own-kit).

`RendererKit.fallback` is drawn in its place. Without one, a built-in stands in: a dashed box with
`role="alert"` naming the missing type and the node's key. It spreads `nodeProps` like any other
renderer, so an unrenderable node can still be selected and deleted in the designer instead of becoming a
node nobody can reach.

## Keys

**Status: partial**, and the loosest contract here.

A node's `key` is its identity. It is the property name in exported JSON Schema, the key in `FormData`
and `FormErrors`, the value of `data-fs-key`, and part of a CSS selector the designer builds. Today
`renameKey` accepts any non-empty string once trimmed, and uniqueness within the document is the only
rule enforced.

That is more permissive than what depends on it. A key holding a space or a quote makes a legal document
today and an awkward JSON Schema property tomorrow. The selectors are already defended: `CSS.escape` is
used everywhere a key becomes one, which is the only reason this has not broken yet.

**Planned:** a stated grammar, checked in `validateDocument` so a pasted document is judged by the same
rule as a rename. Until then, treat anything outside `[A-Za-z_][A-Za-z0-9_]*` as working by accident.

## Undo

**Status: built.** `MAX_HISTORY` is 100 and is exported. The store keeps the last hundred documents, and
consecutive edits to one property coalesce into a single entry, so a typed label costs one slot rather
than thirteen. See [06-inspector.md](06-inspector.md#editing-granularity).

`replaceDocument` takes an entry like any other edit, so applying pasted JSON is undoable.

## Platform baseline

**Status: built**, in the sense that the code already assumes all of it. None of it had been written
down.

| Requirement            | Because                                            |
| ---------------------- | -------------------------------------------------- |
| React 18 or 19         | The peer range on every package                    |
| Node 22+               | `engines`, and core is expected to run on a server |
| `URL.canParse`         | The `url` validation rule, in core                 |
| `<dialog>.showModal()` | The JSON dialog                                    |
| `CSS.escape`           | Selecting a node by key                            |
| `ResizeObserver`       | Keeping the selection frame on its target          |

`URL.canParse` sets the floor, and it lives in core, so it constrains a server as much as a browser:
Node 18.17, Chrome 120, Safari 17. Everything else here is older. In practice the baseline is the
browsers shipping at the end of 2023, and a consumer who needs to go further back needs a polyfill for
one function.

## Stability

**Status: undecided, deliberately.** Not an oversight, and not a question waiting on someone to find
time. Nothing here is published yet, so there is no promise to break and no evidence about which parts of
these types real kit authors lean on. Deciding now would mean guessing, and a compatibility promise is
the one kind of decision that is expensive to walk back.

What the decision will be about, when there is enough to go on: `ComponentDef` and `PropSchema` are the
types that matter, because a kit is written against them by someone this project will never meet. Adding
a required field to either breaks every kit at once. Adding an optional one does not, which is how
`ComponentDef.root` and `ComponentDef.icon` were added.

**Revisit before the first publish to npm.** That is the moment the question stops being theoretical,
because the first published version is the first one anyone can depend on.

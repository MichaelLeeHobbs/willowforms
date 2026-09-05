# Public API

**Status: built.** The public entry points, document-loading boundary, and pre-release compatibility policy are implemented and documented. [COMPATIBILITY.md](../COMPATIBILITY.md) defines supported platforms and change rules.

The key grammar used to be named here as an outstanding weakness. It is not: `keyProblem` enforces the
JavaScript identifier subset, called from both `validateDocument` and the panel's rename, so a paste and
a rename are judged the same way. See the section below, which is Built.

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

`@formsmith/designer` also exports `DesignerProps`, `DesignerTheme`, `useDesigner`, `DesignerApi`,
`RenameResult` and `MAX_HISTORY`. `DesignerProps` is the type of the props table below, and listing
everything except the type of the thing being documented has an obvious cost: a TypeScript host writing
a wrapper component has to redeclare it.
`Designer` is the supported surface and the rest of this section is about it; the hook is what `Designer`
is built on, and it is exported so a host that wants its own chrome around the same document model can
have one. Two things follow from that and are worth saying rather than discovering: the hook's
`replaceDocument` applies a document with no gate, so a host calling it owns the `validateDocument` call
that `Designer` makes on its behalf, and the hook's shape is not covered by the stability this table
implies for `Designer`.

## Embedding the designer

**Status: built.**

```tsx
import { Designer } from '@formsmith/designer'
import '@formsmith/designer/styles.css'
```

| Prop              | Type                               | Required | Meaning                                 |
| ----------------- | ---------------------------------- | -------- | --------------------------------------- |
| `initialDocument` | `FormDocument`                     | yes      | Starting document                       |
| `kit`             | `Kit`                              | yes      | Palette metadata                        |
| `rendererKit`     | `RendererKit`                      | yes      | Canvas renderers for the same kit       |
| `onChange`        | `(document: FormDocument) => void` | no       | Fires on every change                   |
| `onSave`          | `(document: FormDocument) => void` | no       | Shows a Save button when passed         |
| `theme`           | `'system' \| 'light' \| 'dark'`    | no       | Controlled designer colour mode         |
| `onThemeChange`   | `(theme: DesignerTheme) => void`   | no       | Reports a toolbar colour-mode selection |

`initialDocument` is read at mount. Observe edits with `onChange`; to load a different form, remount `Designer` with a different React `key`. A controlled document prop is outside the initial beta API.

The stylesheet is a separate import so a host theming by token override can load it once, in its own
order. See [11-theming.md](11-theming.md).

`theme` is controlled when supplied; without it the toolbar keeps its own view preference.
`onThemeChange` lets a host mirror that preference into the renderer kit's independently owned theme.
The playground uses the pair to keep MUI fields aligned with the designer in editing and preview modes.

`onSave` is what makes the toolbar show a Save button, and its absence is why there is no button by
default: Formsmith does not persist, and one it cannot honour is worse than none. See
[04-shell.md](04-shell.md#toolbar).

## Rendering a form

**Status: built.** This is the package most consumers install, and the only one on the page for a person
filling in a form.

```tsx
import { FormRenderer } from '@formsmith/renderer'
```

| Prop             | Type                                          | Required | Meaning                                                         |
| ---------------- | --------------------------------------------- | -------- | --------------------------------------------------------------- |
| `document`       | `FormDocument`                                | yes      | The form                                                        |
| `kit`            | `RendererKit`                                 | yes      | Renderers                                                       |
| `data`           | `FormData`                                    | yes      | Current values, keyed by data key; rows nest under the repeater |
| `onChange`       | `(address: string, value: JsonValue) => void` | yes      | One field changed, at an address                                |
| `errors`         | `FormErrors`                                  | no       | Messages to display, keyed by address                           |
| `language`       | `string`                                      | no       | BCP 47 tag; defaults to the document                            |
| `evaluate`       | `Evaluator`                                   | no       | Sandbox for computed props                                      |
| `device`         | `Device`                                      | no       | Render `css` for one device, not by media query                 |
| `context`        | `FormContext`                                 | no       | What the host knows and does not submit                         |
| `navigation`     | `FormNavigation`                              | no       | Controlled Back/Next navigation for condition-defined steps     |
| `evaluateAction` | `ActionEvaluator`                             | no       | Host-owned sandbox boundary for code actions                    |
| `onEffects`      | `(Effect[], ActionDispatch) => void`          | no       | Receives one validated action-effect batch                      |
| `onActionError`  | `(string, ActionDispatch) => void`            | no       | Reports action failures without throwing through the form       |
| `revealHidden`   | `boolean`                                     | no       | Draw what `renderWhen` hides. Authoring surfaces only           |
| `onError`        | `(error: Error, key: string) => void`         | no       | A component threw while rendering; the rest of the form stays   |
| `nonce`          | `string`                                      | no       | CSP nonce for the per-component `<style>` element               |

`nonce` is the one on that list a host cannot discover by its absence. The renderer emits one `<style>`
element for everything `node.css` authored, and a host serving `style-src 'self'` drops it with no error
of any kind: the element is in the DOM, the rules are in it, and none of them applies. Pass the same
nonce the page's policy names.

`navigation` leaves state with the host. Its optional `path` defaults to `step`, and `onNavigate(value)`
receives the previous or next reachable context value. The renderer evaluates branches from the current
answers and the kits display position without a potentially false total.

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
  onChange={(address, value) => setData((d) => applyChange(d, address, value))}
/>
```

### What `onChange` reports is an address, not a key

Outside a repeater an address is the bare key and nothing has changed. Inside one it carries the row
it came from, outermost first: `addresses[1].line1`.

The row coordinate is built from **answer** names and the leaf from the **component** name, which are
the same string until somebody sets a `dataKey`. So a `street` field holding `line1`, inside a repeater
keyed `addressList` holding `addresses`, reports changes at `addresses[1].line1` and takes its error at
`addresses[1].street`: two components may share an answer and still fail for different reasons.
`validateForm` keys `errors` that way, and `FormRenderer` reads them that way.

Use `applyChange` from `@formsmith/core` to write one. Spreading the address into an object literal,
`{ ...d, [address]: value }`, is the mistake this shape invites: it creates a property whose name is
the literal text `addresses[1].line1` rather than updating the row, and the form then looks like it is
discarding every keystroke inside a repeater. `applyChange` also refuses a reserved name and returns
the input unchanged when the address cannot be placed, so a hostile index cannot mint a sparse array.

Submitting is `setErrors(validateForm(doc.root, data))` and checking whether the result is empty. That is
the same call a server makes on the same document, which is the whole reason validation lives in core.
See [08-validation.md](08-validation.md#server-parity).

### What a form actually submits

**Status: built.** A value stays in `data` after the field that collected it is hidden. Tick "married",
give a spouse's name, untick it: `validateForm` correctly stops checking that field, and the answer is
still in the payload. The form submits an answer to a question it is no longer asking.

`submittedData(root, data, options?)` is the projection a host applies when it submits. The third
argument is the same `EvalOptions` bag `validateForm` takes, and it has to be the same one: this decides
which answers leave, using the same visibility rules, so handing it a different context than the
renderer had strips answers to questions the user was actually asked. It is not done
to the value as it is held, because the host owns `data` and hiding is often temporary — an accordion
closing must not destroy what someone typed. Visibility comes from the same `isVisible` the renderer and
`validateForm` use, so all three agree about what is on screen.

It builds its result on a null prototype and copies it into a plain object at the end. `out[key] = value`
for a key of `__proto__` sets the prototype instead of adding a property, so the answer would vanish from
the payload and the payload would inherit whatever it pointed at. The [grammar](#keys) refuses that name
now, and this still builds on a null prototype: the grammar is enforced by `validateDocument`, which
nothing on the render or submit path calls, so a document reaching here has been gated by the host or not
at all.

`FieldSchema.autoValidate` is the per-field hint that a field wants validating while it is typed into.
The host decides whether to honour it, and `autoValidateKeys(root)` names the fields that asked.

### Four core functions a host has to call

**Status: built.** This file opens by saying none of the other twelve said what a consumer imports, and
then omitted these four. All are exported from `@formsmith/core` and all four are used by the reference
server.

```ts
export declare function validateAcross(
  root: ComponentNode,
  data: FormData,
  scopes: EvalOptions[],
): FormErrors
export declare function submittedAcross(
  root: ComponentNode,
  data: FormData,
  scopes: EvalOptions[],
): FormData
export declare function contextValues(root: ComponentNode, path: string): JsonValue[]
export declare function evaluatorKeys(root: ComponentNode): string[]
```

The first two are what a wizard needs, and they come as a pair for a reason. A step is a container behind
a `renderWhen`, so validating the document in one environment checks the step the user is on and skips
every other — correct for a hidden field, wrong for a step already completed. `validateAcross` runs the
existing walk once per scope and merges. `submittedAcross` does the same for the payload, and a host that
takes only the first drops every answer given from step two onwards: the demo server validated across all
scopes and then projected under `scopes[0]`, which is a form that validates a required field and then
submits without it. See [03-components.md](03-components.md#steps).

`contextValues(root, path)` reads one context path across every row of repeated scope, which is what a
condition inside a repeater needs.

`evaluatorKeys(root)` names every node that cannot be evaluated without a sandbox, and it is a startup
question rather than a runtime one. A `computed` binding with no evaluator makes `isVisible` answer
false, so the node and its subtree leave `validateForm` entirely. A host can inject an evaluator in the
browser and not on the server: the browser then shows a section, validates it and submits, and the server
validates nothing beneath it and answers that the form is fine. Nothing at evaluation time can notice,
which is why a host asks this once, at startup, and refuses to run without an evaluator if the answer is
not empty.

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

#### A row's own scope

**Status: built.** A condition inside a repeater says which scope it means: `scope: 'row'` reads the
enclosing row, and the absence of it reads the form, which is what every document written before rows
existed already meant. `validateDocument` reports the three mismatches at boot, under the `row-scope`
code, rather than letting a condition read nothing and quietly hide a component.

The check itself is `rowScopeProblems`, which is internal on purpose: a host has one boot-time gate to
call and `validateDocument` runs this inside it. An earlier version of this page named that function as
though a host called it directly, and it is not exported.

Reading "the row above" or an index as a value is still not addressable, and is deliberately left alone.
See [03-components.md](03-components.md#repeated-scope).

### A type the kit does not have

**Status: built.** A document can name a component its kit does not implement, and switching kits at
runtime makes that ordinary rather than exceptional, because matching type strings between kits is
explicitly optional. See [02-kit-contract.md](02-kit-contract.md#writing-your-own-kit).

`RendererKit.fallback` is drawn in its place. Without one, a built-in stands in: a dashed box with
`role="alert"` naming the missing type and the node's key. It spreads `nodeProps` like any other
renderer, so an unrenderable node can still be selected and deleted in the designer instead of becoming a
node nobody can reach.

## Keys

**Status: built.** A node's `key` is its identity, and a `dataKey` is what the payload calls an answer.
Between them they are the property name in exported JSON Schema, the key in `FormData` and `FormErrors`,
the value of `data-fs-key`, part of a CSS selector, and a name an expression can mention. Uniqueness used
to be the only rule enforced, so a key holding a space, a quote or a newline made a legal document and an
awkward everything-else.

```
KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
MAX_KEY_LENGTH = 128
RESERVED_KEYS = [
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'prototype',
  'toLocaleString',
  'toString',
  'valueOf',
]
```

All three are exported, and this block is compared against them by
`test/docs.test.ts` -- it published three of the thirteen reserved names and no length bound at all,
which is the kind of wrong a specification can be for months. A consumer generating documents
programmatically checks against what the contract publishes, emits `toString` as a `dataKey`, and gets
`invalid-key` from `validateDocument` with nothing here to explain it.

It judges the key **as stored**, not a trimmed reading of it. Trimming is an input convenience in the
panel, which stores what it trimmed, so a key that reaches a document still wearing spaces was never
typed through the panel — and it is not the same string as its trimmed twin anywhere it is used, while a
rename of the same field would produce the trimmed one. Two components could otherwise hold what
everything downstream treats as one name, with the duplicate check unable to see it.

`keyProblem(key)` returns the reason or nothing. Three callers hand it to somebody: `renameKey` and `setDataKey` give it back for the Properties panel to show, and `validateDocument` reports `invalid-key`
or `invalid-data-key` against a pasted document. One rule decides all three, so a rename, a data key and
a paste are judged the same way.

Three more call it and answer with nothing, which is worth knowing rather than discovering.
`generateKey` falls back to `field` when the name it derived fails, and `decodeRow` and `decodeAddress`
return nothing -- the second is why `applyChange` drops a write whose address holds a refused name,
though `applyChange` never calls `keyProblem` itself. A host that sends an edit addressed to a reserved
key gets no error and no change. This section said "both callers", which reads as the complete surface.

**The grammar is the JavaScript identifier subset, and the reason is the evaluator rather than
tidiness.** A hyphen is the tempting addition, because real forms are full of `first-name`, and it is
exactly the one that breaks: `computed` bindings are host-evaluated JavaScript, so `first-name` in an
expression is a subtraction, silently, with no error anywhere. A key namespace expressions can name has
to be an identifier namespace.

**`.`, `[` and `]` are left free deliberately.** Row addressing needs them, and settling this before
repeated scope is why the key grammar comes first: a path grammar layered on a key grammar that does not
exist is how the libraries that had to break their addressing twice got there. See `docs/decisions.md`.

`__proto__` passes the pattern and is refused by name. Assigning it does not add a property, it sets the
prototype, so an answer under that key vanishes from the payload and the payload inherits whatever it
pointed at. `submittedData` builds on a null prototype to survive that; refusing the name is the other
half, and the cheaper one.

The rest of `Object.prototype` is the same hazard one notch quieter, and it has bitten once: a required
field keyed `toString` had its error merged with `merged[key] ??= message`, compared against
`Object.prototype.toString`, found not nullish, and dropped — a form with a missing required answer
submitting clean. `toString`, `valueOf`, `hasOwnProperty`, `constructor` and `isPrototypeOf` all satisfy
`KEY_PATTERN`, so nothing has to be bypassed to author one.

**The list is the second lock, never the first.** Nothing on the render or validate path calls
`validateDocument`, so a document carrying one of these keys reaches the code that has to survive it
anyway. The fix is always a null prototype at the accumulator; refusing the names only stops an author
creating such a document by hand.

The length bound is the same kind of rule and was not written down here at all. The grammar bounds
characters, not length, so a megabyte-long `dataKey` in an imported document passed every gate and then
appeared in `data-fs-key`, in a CSS selector, in `FormData` and as a property name in exported JSON
Schema.

This is a breaking change for a document holding a key outside the grammar, and it is deliberate while
nothing is published.

## Undo

**Status: built.** `MAX_HISTORY` is 100 and is exported. The store keeps the last hundred documents to go
back through, plus the one on screen, and
consecutive edits to one property coalesce into a single entry, so a typed label costs one slot rather
than thirteen. See [06-inspector.md](06-inspector.md#editing-granularity).

`replaceDocument` takes an entry like any other edit, so applying pasted JSON is undoable.

## Platform baseline

**Status: built**, in the sense that the code already assumes all of it. None of it had been written
down.

| Requirement            | Because                                                    |
| ---------------------- | ---------------------------------------------------------- |
| React 18 or 19         | The peer range on every package                            |
| Node 20+               | `engines` on every package. The repo itself develops on 22 |
| `URL.canParse`         | The `url` validation rule, in core                         |
| `<dialog>.showModal()` | The JSON dialog                                            |
| `CSS.escape`           | Selecting a node by key                                    |
| `ResizeObserver`       | Keeping the selection frame on its target                  |

`URL.canParse` sets the floor, and it lives in core, so it constrains a server as much as a browser:
Node 18.17, Chrome 120, Safari 17. Everything else here is older. In practice the baseline is the
browsers shipping at the end of 2023, and a consumer who needs to go further back needs a polyfill for
one function.

## Stability

**Status: built.** The [compatibility policy](../COMPATIBILITY.md) applies to the beta line. Additive optional fields are compatible; removing or renaming public contracts requires a migration path and release note. Deprecated APIs remain for at least one minor release after their replacement ships. Document migrations belong to `loadDocument` and are required when a new document version is introduced.

Pre-release status permits deliberate breaking changes, not undocumented ones. Kit contract changes must land with cross-kit coverage, because a new required field in `ComponentDef` or `PropSchema` affects every kit consumer.

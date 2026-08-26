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

`initialDocument` is a starting value, not a controlled prop. The designer owns the document from mount,
and observing it means `onChange`; passing a different `initialDocument` later does nothing. A host that
needs to replace the document from outside needs an API that does not exist yet.

The stylesheet is a separate import so a host theming by token override can load it once, in its own
order. See [11-theming.md](11-theming.md).

**Planned:** `onSave`, which is what makes the toolbar show a Save button. See
[04-shell.md](04-shell.md#toolbar).

## Rendering a form

**Status: built.** This is the package most consumers install, and the only one on the page for a person
filling in a form.

```tsx
import { FormRenderer } from '@formsmith/renderer'
```

| Prop       | Type                                      | Required | Meaning                              |
| ---------- | ----------------------------------------- | -------- | ------------------------------------ |
| `document` | `FormDocument`                            | yes      | The form                             |
| `kit`      | `RendererKit`                             | yes      | Renderers                            |
| `data`     | `FormData`                                | yes      | Current values, flat, keyed by node  |
| `onChange` | `(key: string, value: JsonValue) => void` | yes      | One field changed                    |
| `errors`   | `FormErrors`                              | no       | Messages to display, keyed by node   |
| `language` | `string`                                  | no       | BCP 47 tag; defaults to the document |
| `evaluate` | `Evaluator`                               | no       | Sandbox for computed props           |

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

`FieldSchema.autoValidate` is the per-field hint that a field wants validating while it is typed into.
The host decides whether to honour it, and `autoValidateKeys(root)` names the fields that asked.

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

# Import, export, and persistence

**Status: built.** Versioned WillowForms JSON import/export, the document-loading boundary, and the host save contract are implemented. An existing JSON Schema projection remains a limited developer utility. The document format is currently version `1`; migrations are added only when an actual version change needs one.

## Simple import and export

The supported interchange format is one WillowForms JSON document. It contains the component tree, settings, actions, languages, and translations. An author can export it as a file and import it later; importing validates the document before replacing the current form. The host continues to own storage and distribution.

The document's `version` and the core `loadDocument` boundary handle format compatibility. Package versions follow the [compatibility policy](../COMPATIBILITY.md). There is no separate archive format, conversion framework, or synchronization protocol.

## WillowForms does not persist

**Status: built**, and it is a decision, not a gap.

The designer holds a document and emits every version of it. Where that goes is the host's problem,
because a builder that assumed `localStorage`, or an API shape, or a file, would be wrong for most of the
people embedding it.

```tsx
<Designer initialDocument={doc} kit={kit} rendererKit={renderers} onChange={save} />
```

`onChange` emits each document change, independently of undo-history coalescing. The optional `onSave` callback supports explicit saving.

A host that wants a Save button rather than continuous saving passes `onSave`, and the toolbar shows
one; without it there is no button, because a Save the designer cannot honour is worse than none. See
[04-shell.md](04-shell.md#toolbar) and [12-api.md](12-api.md).

`apps/demo-server` exists to demonstrate the other half — that `validateForm` is the same function on a
server — and not to suggest WillowForms needs a backend.

## The JSON dialog

**Status: built.** A native `<dialog>` opened with `showModal()`, so focus trapping, Escape, the inert
background and the backdrop come from the browser rather than from code someone has to maintain.

Two views:

| View        | Editable | Holds                              |
| ----------- | -------- | ---------------------------------- |
| Document    | yes      | The form definition                |
| JSON Schema | no       | A projection of the submitted data |

Actions: Apply, Copy, Download, Import file, Revert.

An imported file is loaded **into the editor**, not applied. A bad file is then visible and fixable
rather than having already replaced the form.

The file picker accepts JSON files up to 10 MiB and explains the limit before selection. Embedded image data counts toward the total; linked images keep larger forms smaller. This is an editor file-read limit, not a document-version rule or a host storage policy. A newer selection, manual edit, Revert, Apply, or closing the dialog supersedes an in-flight read; late results and errors cannot overwrite the user's subsequent work.

## Pasted JSON is untrusted input

**Status: built.** This is the one place a user hands the builder arbitrary data, so it gets the same
treatment any untrusted input would.

Apply first parses JSON, then passes the result to `loadDocument`, the shared normalization and validation boundary. Syntax failures are reported separately. Loading checks the version, normalizes supported optional fields, and validates the structure, including duplicate keys, invalid references, and language metadata. The form is replaced only when loading succeeds; loading diagnostics remain visible beside the editable draft.

### validateDocument never throws

**Status: built.** It is total: it judges anything and reports malformed structure as an error rather
than an exception.

It used to assume its argument really was a `FormDocument`, which meant a pasted `"children": 5` took the
builder down, and the same request body reached `apps/demo-server` as an unhandled 500. The function
whose entire job is to judge untrusted documents was the one that could be crashed by one.

## JSON Schema export

**Status: built.** A one-way projection. JSON Schema is an export format, never storage: it cannot
express layout or nesting, and layout is half of what a visual builder produces.

`toJsonSchema(document)` walks the tree and keeps every component carrying a `schema`. That is the
predicate, and it is not quite the same as `ComponentDef.dataBound`: a hand-edited document can carry a
schema on a component the kit does not consider data-bound, and the export takes it at its word.

**Flat except for repetition.** Layout does not reach the payload, so a `Stack` contributes its children
at the same level a bare field would. Repetition does: a repeater is the one structural thing JSON Schema
expresses natively, so it exports as an `array` whose `items` describes the object its own children make,
and its rows' `required` lands inside `items` rather than on the document. Projecting a repeater's fields
flat would name answers the payload does not hold, and a server validating a real submission against the
export would then reject every one of them. [ARCHITECTURE.md](../ARCHITECTURE.md) states the same rule.

`FieldSchema['type']` also permits `array` and `object`. `Repeater` produces an `array` in both kits;
nothing produces an `object` yet.

| Model                                                      | Schema                                |
| ---------------------------------------------------------- | ------------------------------------- |
| `string` / `number` / `boolean`                            | the matching type                     |
| `date`                                                     | `string` with `format: date`          |
| `file`                                                     | `string`; no inferred binary encoding |
| `minLength` / `maxLength` on text                          | `minLength` / `maxLength`             |
| `minLength` / `maxLength` on a list                        | `minItems` / `maxItems`               |
| `min` / `max`                                              | `minimum` / `maximum`                 |
| `pattern`                                                  | `pattern`                             |
| `email` / `url` / `uuid`                                   | `format: email` / `uri` / `uuid`      |
| `required`, unguarded, on a component that is always shown | the parent object's `required` array  |
| A static `label`, or `text`                                | `title`                               |

The legacy `file` data type remains a string for stored-document compatibility. It does not guarantee base64, a completed upload, or a durable attachment reference. Custom attachment components define their JSON answer contract with their host.

### What it cannot carry

`unexportableRules()` names each dropped rule and the field it was on, and the dialog lists them rather
than leaving the loss unmentioned. Losses include:

- **`custom` rules.** Arbitrary JavaScript has no declarative equivalent.
- **Cross-field rules.** `matches` and `after` compare answers and cannot be represented by this projection.
- **Guarded rules.** A rule with a `when` guard applies only sometimes, and JSON Schema's `required` is
  unconditional. Exporting a guarded `required` as an unconditional one would reject payloads the form
  itself accepts.
- **Every rule on a component or beneath an ancestor carrying a `renderWhen`.** The same argument one level up: a component
  that is sometimes on screen collects an answer sometimes, so its `required` is conditional however
  unguarded the rule is. This one is easy to miss because it is invisible in the rule -- and every `Step`
  carries a `renderWhen`, so a wizard's required fields are dropped from the exported `required` array
  wholesale. `unexportableRules()` names them, and the dialog lists them; a host that exports a schema
  without reading that list gets one that accepts every submission.
- **A measuring rule on a type with no such keyword.** `minimum` and `maximum` are JSON Schema keywords
  for numbers, and `minLength`/`maxLength` need something with a length. `min` on a string or `minLength`
  on a boolean exports to a keyword every validator ignores, so it is dropped and reported rather than
  written down where it would look enforced. Asked on the exported type, not the declared one: `date` and
  `file` are declared as themselves and export as `string`.
- **Two format rules on one field.** `email`, `url` and `uuid` each write `format`, and a property has
  one. A field carrying two exported only the last, silently, while the dialog called the export
  lossless. Which of two formats an answer really has is not a question the exporter can answer, so all
  but the last are reported.
- **Two components sharing a `dataKey`.** Deliberate and documented -- two fields behind opposite guards
  writing one answer -- but a JSON Schema property is one property, so the last node visited wins and the
  first's type, format and constraints are discarded. Reported rather than resolved, for the same reason.

An unguarded required boolean exports with `const: true` as well as membership in `required`, so an unchecked consent field is rejected. Rules guarded by `when` or by visibility on the component or any ancestor are omitted and reported as lossy; exporting them unconditionally would reject answers that runtime validation accepts.

## Format scope

JSON Schema import, schema-generated form scaffolds, and form archives are outside product scope. The existing lossy JSON Schema export is an optional developer projection, not the saved document format or a replacement for WillowForms validation. Its existence does not commit the library to an inverse importer or additional conversion formats.

Core already owns `loadDocument` and its version boundary. A new document format version requires the migration and compatibility treatment described in [01-document-model.md](01-document-model.md#versioning-and-migration). With only version `1`, the migration registry is empty; the library does not need a second version or extra migration machinery in anticipation of one.

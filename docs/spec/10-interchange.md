# Import, export, and persistence

**Status: built.** The JSON dialog, the schema projection, and the host contract all exist. There is no
version migration, and JSON Schema import does not exist.

## Formsmith does not persist

**Status: built**, and it is a decision, not a gap.

The designer holds a document and emits every version of it. Where that goes is the host's problem,
because a builder that assumed `localStorage`, or an API shape, or a file, would be wrong for most of the
people embedding it.

```tsx
<Designer initialDocument={doc} kit={kit} rendererKit={renderers} onChange={save} />
```

`onChange` fires on every change, including every coalesced keystroke run. It is the only output the
designer has today.

**Planned:** a host that wants a Save button rather than continuous saving passes `onSave`, and the
toolbar shows one; without it there is no button, because a Save the designer cannot honour is worse than
none. `DesignerProps` has no `onSave` yet. See [04-shell.md](04-shell.md#toolbar) and
[12-api.md](12-api.md).

`apps/demo-server` exists to demonstrate the other half — that `validateForm` is the same function on a
server — and not to suggest Formsmith needs a backend.

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

## Pasted JSON is untrusted input

**Status: built.** This is the one place a user hands the builder arbitrary data, so it gets the same
treatment any untrusted input would.

Apply runs three stages in order and stops at the first stage that reports anything:

1. **Parse.** A syntax error is reported as one.
2. **Check the shape.** `version`, `id`, `name`, and a `root` with a string `key` and `type`. This is what
   makes the cast that follows honest.
3. **Validate the structure.** `validateDocument` catches duplicate keys, empty keys, unknown action
   references, and a `defaultLanguage` naming a language the document does not have.

**Within a stage, every problem is reported at once.** A document missing four fields says so four times,
because fixing them one round trip at a time is miserable. Between stages there is nothing to report
together: a file that does not parse has no shape to check, and a document of the wrong shape cannot be
walked. The guarantee is per stage, and stating it without that qualifier reads as a contradiction of the
sentence above it.

### validateDocument never throws

**Status: built.** It is total: it judges anything and reports malformed structure as an error rather
than an exception.

It used to assume its argument really was a `FormDocument`, which meant a pasted `"children": 5` took the
builder down, and the same request body reached `apps/demo-server` as an unhandled 500. The function
whose entire job is to judge untrusted documents was the one that could be crashed by one.

## JSON Schema export

**Status: built.** A one-way projection. JSON Schema is an export format, never storage: it cannot
express layout or nesting, and layout is half of what a visual builder produces.

`toJsonSchema(document)` walks the tree, keeps every component carrying a `schema`, and produces a
**flat** object. That is the predicate, and it is not quite the same as `ComponentDef.dataBound`: a
hand-edited document can carry a schema on a component the kit does not consider data-bound, and the
export takes it at its word.
Form data is flat, keyed by component key however deeply the components nest, so a nested schema would
misrepresent the payload.

`FieldSchema['type']` also permits `array` and `object`. Both are accepted and exported as the matching
type, and neither has a component that produces one yet.

| Model                           | Schema                                  |
| ------------------------------- | --------------------------------------- |
| `string` / `number` / `boolean` | the matching type                       |
| `date`                          | `string` with `format: date`            |
| `file`                          | `string` with `contentEncoding: base64` |
| `minLength` / `maxLength`       | the matching keyword                    |
| `min` / `max`                   | `minimum` / `maximum`                   |
| `pattern`                       | `pattern`                               |
| `email` / `url` / `uuid`        | `format: email` / `uri` / `uuid`        |
| `required`, unguarded           | the parent object's `required` array    |
| A static `label`, or `text`     | `title`                                 |

### What it cannot carry

`unexportableRules()` names each dropped rule and the field it was on, and the dialog lists them rather
than leaving the loss unmentioned. It used to describe all of them as custom rules, so a guarded
`required` was reported as something it was not:

- **`custom` rules.** Arbitrary JavaScript has no declarative equivalent.
- **Guarded rules.** A rule with a `when` guard applies only sometimes, and JSON Schema's `required` is
  unconditional. Exporting a guarded `required` as an unconditional one would reject payloads the form
  itself accepts.

**Known gap:** a required boolean exports as "the key must be present", which is not the same as "it must
be `true`". A `const: true` would express it, and does not yet.

## Not built

**JSON Schema import.** Generating a form from a schema is the obvious inverse and a genuinely useful
onboarding path: point it at an API contract and get a form. It is lossy in the other direction — a
schema says nothing about layout — so it is a _scaffold_, and should be honest about producing a starting
point rather than a finished form.

**Version migration.** See [01-document-model.md](01-document-model.md#versioning-and-migration). Decided,
not written: core owns migrations and `loadDocument` returns either a current document or the reasons it
cannot be one.

**A form bundle.** Document plus translations plus schema in one archive. Only worth building once
someone needs to move a form between systems.

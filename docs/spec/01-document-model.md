# Document model

**Status: partial.** The tree, property values, and validation rules are built and tested. The format has
no version migration path, and six fields the types declare have nothing reading them: `ComponentNode.css`
and `ComponentNode.events` (see [06-inspector.md](06-inspector.md#style) and
[09-actions.md](09-actions.md)), `ComponentDef.icon` (see [11-theming.md](11-theming.md#icons)),
`FormDocument.version`, and both members of `FormSettings`. `FieldSchema.autoValidate` was a seventh
until the canvas preview began reading it.

A form is a recursive tree of `ComponentNode`. The tree is the source of truth. Everything else —
JSON Schema, submitted data, the palette, the properties panel — is derived from it or projected out
of it.

## FormDocument

```ts
interface FormDocument {
  version: '1'
  id: string
  name: string
  root: ComponentNode // always a container
  actions: Record<string, CodeAction>
  languages: Language[]
  defaultLanguage: string // a BCP 47 tag, matching languageTag(l) for some l
  translations: Record<string, Record<string, string>> // tag -> key -> text
  settings: FormSettings
}
```

### Language identity is a tag, never a code

**Status: built.**

A `Language` has a `code` and an optional `dialect`. It is identified everywhere by the combined BCP 47
tag, which `languageTag()` produces: `{ code: 'en', dialect: 'US' }` is `en-US`. Translation bundles are
keyed by tag. `defaultLanguage` is a tag.

This is stated first because getting it wrong was invisible and expensive. The designer wrote bundles
under the bare code while the renderer read them under the tag, so every translation authored in the
panel went into a bundle nothing read, and the canvas kept showing raw keys. A second bug rewrote
`defaultLanguage` from the tag to the code, which made the two agree by accident and made the first bug
look fixed. One helper decides now, and nothing compares these strings by hand.

### Versioning and migration

**Status: planned.** Decided; not yet written.

`version` is the literal `'1'` and nothing reads it. There is no migration path, so any change to the
shape of a stored document would silently break every document a host has already saved.

**Core owns migrations.** `loadDocument(unknown)` takes arbitrary JSON and returns either a document at
the current version or the list of reasons it cannot be one. Every host would otherwise reimplement the
same upgrade logic, badly and differently, and a form definition outlives the code that wrote it.

- `version` is a string that increments: `'1'`, `'2'`. Not a semantic range; there is exactly one
  current shape at any time and either a document is at it or it is migrated to it.
- Migrations are ordered and total: each takes version N to N+1 and cannot fail. A document that cannot
  be migrated is rejected at load, not half-converted.
- An export carries the version it was written against, which is what makes the above possible.
- `validateDocument` stays separate. Migration answers "what shape is this", validation answers "is this
  shape coherent", and conflating them means a structurally broken document at the current version gets
  silently passed to a migration written for an older one.

## ComponentNode

```ts
interface ComponentNode {
  key: string
  type: string // kit-scoped, matches a ComponentDef
  props: Record<string, PropValue>
  schema?: FieldSchema // data-bound components only
  events?: Partial<Record<EventName, ActionRef[]>>
  children?: ComponentNode[] // containers only; absent means it takes none
  css?: Partial<Record<Device, string>>
  renderWhen?: PropValue
}
```

### key

**Status: built.** Unique within the document, enforced by `validateDocument`. Renaming refuses a
collision and says which component holds the name, rather than silently doing nothing.

### dataKey

**Status: planned.** Agreed; not yet written. `key` currently doubles as the key a component's value appears under in submitted
data. The type has documented it as _"doubles as the data key unless overridden"_ since the first commit,
and there has never been a field to override it with.

Two things need it. A component's identity in the tree and its identity in the payload are not the same
concern: renaming a field for clarity should not change the shape of what the server receives. And a
component that renders but submits nothing — a heading, a layout box — has a key today and no way to say
it has no data.

Adding `dataKey?: string`, defaulting to `key`, resolves both. `FormData`, `validateForm`, and
`toJsonSchema` all key on it.

### children

**Status: built.** Absent means the component cannot take children, which is different from present and
empty. `ComponentDef.container` declares the same fact for the palette, and the two must agree.

### css

**Status: planned.** Declared as raw CSS text per breakpoint. Nothing writes it and nothing reads it, so
per-breakpoint styling does not exist. See [06-inspector.md](06-inspector.md) for the Style tab and
[04-shell.md](04-shell.md) for viewport simulation, which has to come first: authoring a tablet rule is
meaningless without a way to see the tablet.

### events

**Status: planned.** Declared, with a six-member `EventName` union and `ActionRef` pointing at a
`CodeAction` on the document. Nothing authors them and nothing fires them. See
[09-actions.md](09-actions.md).

### renderWhen

**Status: partial.** The model, the renderer, and validation all honour it; there is no UI, so a
conditional field can only be authored through the JSON editor.

Visibility is decided by `isVisible()` in core and by nothing else. The renderer and `validateForm` both
call it, so they cannot disagree about what is on screen. They did once: the renderer skipped a hidden
node while validation walked the whole tree regardless, so a required field hidden by a condition failed
a submit with an error the user could not see or fix. Hiding a container hides everything beneath it.

With no evaluator injected, a computed condition resolves to hidden, because that is what the renderer
does and validation follows the renderer.

## PropValue

**Status: built.**

```ts
type PropValue =
  | { kind: 'static'; value: JsonValue }
  | { kind: 'computed'; expression: string }
  | { kind: 'i18n'; key: string }
```

A tagged union rather than a bag discriminated by which optional field happens to be present. Every
consumer switches on `kind` exhaustively, so adding a fourth binding mode is a compile error at every
call site instead of a silent fallthrough. FormEngine uses the other shape.

Switching a property between modes starts the new mode empty. An expression is not a label, and seeding
one with the other produces something that looks authored and is broken.

See [07-bindings.md](07-bindings.md).

## Immutability and structural sharing

**Status: built.**

Every operation in `core/tree.ts` returns a new tree that shares structure with the old one. Editing a
leaf allocates that node's ancestors and nothing else; untouched subtrees keep referential identity. An
operation that changes nothing returns the identical tree, by reference.

That last sentence is load-bearing in three places, and it was false until recently. `updateNode` and
`removeNode` mapped over their children unconditionally, so every node came back new on every edit:
`React.memo` could never skip a subtree, an illegal move still produced a document the undo stack
recorded as a version, and a remove that matched nothing counted as an edit. `tree.test.ts` asserts the
identities directly now.

## One form per document

**Status: built.** Decided deliberately, and worth recording because the obvious comparison goes the
other way.

A document holds exactly one `root`. FormEngine puts several named forms in one document and gives them
a panel. Formsmith will not.

Formsmith has no persistence of its own by design, so "a project" is already the host's concept: a host
that needs many forms holds many documents, and it already can. Putting them in one document would break
the format, complicate every panel, and buy nothing the host does not have.

The one thing a host-side collection genuinely cannot express is a reference from one form into another —
an embedded form, or a shared subtree. That is **form composition**, which is a different feature with a
different design, and it is not a reason to change the document's shape. If it is ever wanted, it should
be specified on its own terms rather than arrived at by copying a tab.

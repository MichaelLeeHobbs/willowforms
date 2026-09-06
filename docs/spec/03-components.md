# Component catalogue

**Status: built.** 26 of the 26 below are built in both kits, including repeated scope and controlled step navigation. Attachments use host-configured custom components; the standard kits contain no file input.

This file opened **Built** over those two lists. `README.md` calls that the direction that has been wrong
most often, and it was wrong here on the file that is also the roadmap -- so a reader planning against it
saw a catalogue finished and read the rest as finished too. `test/docs.test.ts` now holds each file's
opening status against the index, in both directions.

The two numbers are digits rather than words on purpose: `test/docs.test.ts` reads them and compares
them against the table below and against both kits' `definitions.ts`, so a component added to a kit and
not to this page fails the build.

This list records the built-in catalogue. File inputs belong to host-configured community or custom components as described below. A kit is free to offer a different catalogue; matching component types and value contracts make documents portable between compatible kits.

Catalogue growth requires a concrete task for a form author or respondent. Existing components remain supported until an explicit removal lands; their presence does not commit Formsmith to matching a general UI library. Application navigation and surrounding page layout belong to the host.

## How components are specified

A component is a `ComponentDef` (metadata, in core) plus a renderer (React, in the renderer's half). The
metadata is what the designer sees; it never imports the renderer. See
[02-kit-contract.md](02-kit-contract.md).

```ts
interface ComponentDef {
  type: string // kit-scoped id, matches ComponentNode.type
  label: string // palette display name
  group: PaletteGroup
  icon?: IconName // from the vocabulary core declares, not a free string
  container?: boolean // accepts children
  root?: boolean // the document root; exactly one per kit, never in the palette
  defaultRenderWhen?: (key: string) => PropValue // a visibility rule a new instance starts with
  dataBound?: boolean // appears in submitted data
  dataType?: FieldSchema['type']
  defaultProps: Record<string, JsonValue>
  initialProps?: Record<string, JsonValue>
  props: PropSchema[]
  events: EventName[]
}
```

`defaultProps` supplies runtime fallbacks and seeds new controls. Optional `initialProps` overrides those values only during `instantiate`; it does not change a renderer's fallback for an omitted property in a saved node. This additive metadata field lets newly created controls adopt improved defaults while preserving old documents. Kits without it keep their existing behavior. `test/docs.test.ts` compares this block with `ComponentDef` in core.

### Property count is a design decision

The rule this catalogue follows: **a property earns its place by being something a form author changes,
not by existing in the underlying component's API.**

Forwarding a component library's whole prop list into the panel is the easy path and the wrong one: a
date picker built that way offers upwards of thirty properties, and a form author hunting for `label`
reads past all of them. A Formsmith date picker is specified with five. A kit that wants the rest can add
them without changing anything here.

Convergence with other builders on the properties that _are_ included is expected. A field has a label, a
placeholder, a disabled state and helper text; a container has a direction and a gap. Those are the
domain, not anyone's invention.

### Shared property traits

Three are defined once per kit and reused, so the same concept has the same name and editor everywhere.

| Trait        | Editor    | Localizable | Notes                               |
| ------------ | --------- | ----------- | ----------------------------------- |
| `label`      | `string`  | yes         | The field's visible name            |
| `helperText` | `string`  | yes         | Shown beneath, replaced by an error |
| `disabled`   | `boolean` | no          | `advanced` section                  |

`placeholder` and `gap` are written out at each use instead. They belong here on the same argument and
have simply not been moved. Nothing enforces that a repeated property keeps the same editor across
components, which is the reason to move them rather than a reason not to.

## Palette groups

`PaletteGroup` is `inputs | selection | layout | display | feedback | navigation | custom`. All six
groups below hold components. `custom` is reserved for host-defined components and this catalogue never
uses it.

## The catalogue

26 components. **Built** means both kits implement it and the contract test passes.

### Layout

| Component  | Status | Container | Properties                                                  |
| ---------- | ------ | --------- | ----------------------------------------------------------- |
| `Screen`   | Built  | yes       | `maxWidth`, `gap`                                           |
| `Step`     | Built  | yes       | `gap`; ships with a `renderWhen` on `context.step`          |
| `Stack`    | Built  | yes       | `direction`, `gap`                                          |
| `Grid`     | Built  | yes       | `columns`, `gap`, `minColumnWidth`, `fillWidth`             |
| `Box`      | Built  | yes       | `padding`, `background`, `radius`                           |
| `Card`     | Built  | yes       | `title`, `subtitle`, `variant`                              |
| `Repeater` | Built  | yes       | `label`, `helperText`, `gap`; its value is the list of rows |

`Screen` is the root and is never in the palette. `Grid` is specified as intrinsic columns rather than a
twelve-column system: a form author thinks "two side by side", not "six of twelve".

With `fillWidth: true`, Grid fills its parent, treats `columns` as a maximum count, and wraps when columns would be narrower than `minColumnWidth`. A parent narrower than that minimum still fits one column. Both kits use the same geometry. New palette grids default to this mode; existing documents with `fillWidth` missing or false retain the previous width cap, `columns * (minColumnWidth + gap)`. This additive compatibility choice does not migrate saved layouts. In fill mode, column count is rounded down and bounded to at least one, minimum width to at least 1px, and gap to at least zero; non-finite inputs use the normal defaults.

`Repeater` is the one structurally interesting component here, and it is built. It renders its children
once per item in an array value, which makes it the array-valued repeated-scope container, and it is how a form
expresses "add another address".

**Rows never mint keys.** The authored subtree exists once in the document; a row exists in the DOM, in
`FormData` and in `FormErrors`, and never in the tree. That prohibition is what left every tree operation
untouched: each way duplicate keys break them needs the same key at three places in the tree, and it
never is. `dataKey` was never going to express "index 2 of this array", and it does not have to, because
no index is ever authored. See [Repeated scope](#repeated-scope).

### Display

| Component | Status | Data-bound | Properties                   |
| --------- | ------ | ---------- | ---------------------------- |
| `Heading` | Built  | no         | `text`, `level`              |
| `Text`    | Built  | no         | `text`, `variant`, `align`   |
| `Divider` | Built  | no         | `orientation`                |
| `Image`   | Built  | no         | `src`, `alt`, `fit`, `width` |

**`Link` refuses an address it does not recognise.** `href` comes from a document, and a form author is
not always the person deploying the form, so `javascript:` in an `href` is the same code-execution
boundary core refuses to cross anywhere else. `safeHref` allows http, https, mailto, tel and relative
addresses, and strips nothing: an address that fails renders as plain text rather than as a link that
does nothing.

`Image` requires `alt`. A decorative image passes an empty string deliberately, which is a different
statement from having forgotten.

### Inputs

| Component     | Status | Data type | Properties                                                    |
| ------------- | ------ | --------- | ------------------------------------------------------------- |
| `TextField`   | Built  | `string`  | `label`, `placeholder`, `helperText`, `multiline`, `disabled` |
| `TextArea`    | Built  | `string`  | `label`, `placeholder`, `helperText`, `rows`, `disabled`      |
| `NumberField` | Built  | `number`  | `label`, `helperText`, `disabled`                             |
| `DatePicker`  | Built  | `date`    | `label`, `helperText`, `min`, `max`, `disabled`               |
| `Button`      | Built  | no        | `text`, `variant`, `disabled`                                 |
| `ButtonGroup` | Built  | no        | `orientation`                                                 |

`TextArea` exists separately rather than as `TextField` with `multiline`, because the two have different
properties (`rows` versus nothing) and a palette entry that changes shape based on a checkbox is harder
to find than two entries. `TextField.multiline` stays for documents that already use it.

### Attachments

**Status: built.** File inputs are outside the standard catalogue. Legacy `FileUpload` nodes remain loadable and display the missing-component fallback until the host supplies a replacement renderer. Documents and answers are not silently rewritten. The [compatibility notes](../COMPATIBILITY.md#pre-beta-corrections) describe the replacement path.

A host that needs attachments installs or provides a custom component through the [existing kit interface](02-kit-contract.md#community-component-packages). A component can present a picker, progress, retry, removal, and an existing-attachment view using a service supplied by the host. Those behaviors belong to that extension, not to a required Formsmith upload subsystem.

A typical integration sends selected bytes to the host's service and reports a durable attachment ID as its JSON answer after success. When the form is reopened, the component uses that ID to ask the host for authorized metadata, download, or preview access. A filename alone is not proof of an uploaded file, and a browser `File` object is not a persisted form answer.

The host decides where and how bytes are stored, how access is authorized, which file types and sizes are accepted, and how incomplete uploads and deletions are handled. Formsmith defines no storage provider, upload endpoint, binary encoding, attachment database schema, or file-viewing service. Custom attachment components still satisfy the kit's accessibility and value-reporting obligations.

### Selection

| Component    | Status | Data type | Properties                                                  |
| ------------ | ------ | --------- | ----------------------------------------------------------- |
| `Select`     | Built  | `string`  | `label`, `options`, `placeholder`, `helperText`, `disabled` |
| `Checkbox`   | Built  | `boolean` | `label`, `helperText`, `disabled`                           |
| `RadioGroup` | Built  | `string`  | `label`, `options`, `direction`, `helperText`, `disabled`   |
| `RadioItem`  | Built  | no        | `label`, `value`, `disabled`                                |
| `Switch`     | Built  | `boolean` | `label`, `helperText`, `disabled`                           |

`options` is a `json` editor taking `{ label, value }[]`. Option values keep their type: a numeric value
stays a number, and choosing that option submits the number. An earlier version replaced any non-string
value with its array index, so selecting the first option submitted `"0"` whatever it said.

`RadioGroup` takes `options` and also accepts `RadioItem` children, for the case where an option needs
its own layout. Both kits render the simple case from `options`.

A required `Checkbox` or `Switch` must be checked. See
[08-validation.md](08-validation.md#the-rule-catalogue).

### Feedback

| Component  | Status | Properties                  |
| ---------- | ------ | --------------------------- |
| `Alert`    | Built  | `text`, `severity`, `title` |
| `Progress` | Built  | `variant`, `value`, `label` |

Both are display-only and never data-bound. `Progress` covers linear and circular through `variant`
rather than being two components, because they are one idea with two shapes.

### Navigation

| Component     | Status | Properties               |
| ------------- | ------ | ------------------------ |
| `Link`        | Built  | `text`, `href`, `target` |
| `Breadcrumbs` | Built  | `items`, `label`         |

## Events

Each component declares the events authors can bind in the inspector. The renderer dispatches those bindings to the host action executor; see [09-actions.md](09-actions.md). Both shipped kits declare the lists below, and `test/docs.test.ts` checks that the table matches their metadata. Focus and blur support is intentionally limited to the listed components; lifecycle events belong to `Screen`.

| Event                   | Raised by                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `onChange`              | `TextField`, `NumberField`, `TextArea`, `Checkbox`, `Switch`, `Select`, `RadioGroup`, `DatePicker` |
| `onClick`               | `Button`, `Link`                                                                                   |
| `onBlur`                | `TextField`, `TextArea`, `NumberField`, `DatePicker`                                               |
| `onFocus`               | `TextField`, `TextArea`                                                                            |
| `onMount` / `onUnmount` | `Screen`                                                                                           |

## What is deliberately absent

- **Tooltip as a component or shared trait.** There is no tooltip commitment. Visible Help text is the ordinary way to explain a question; a tooltip needs a concrete accessible use case before it becomes a requirement. See [ideas](../ideas.md#tooltip-for-supplementary-information).
- **Modal and Dialog layout.** A form builder composes a form; where that form appears is the host's
  layout problem.
- **A Wizard component.** There is no wizard type, and the two questions it was waiting on are answered
  below. The answer turned out to be that a wizard is not a component: a step is a container with a
  condition on it, and both kits ship `Step` as exactly that. See [Steps](#steps).
- **Embedded form and Slot.** These are form composition, which is a feature that needs its own design
  rather than arriving by analogy. See [01-document-model.md](01-document-model.md#one-form-per-document).
- **Typography as a raw wrapper.** `Heading` and `Text` cover what a form needs. A component whose whole
  purpose is to set a `variant` is a styling escape hatch, and that is what the Style tab is for.

## Adding one

1. Add the `ComponentDef` to both kits' metadata.
2. Add a renderer to both kits, spreading `nodeProps`.
3. Run `test/kit-contract.test.tsx`. It checks the obligations in `02-kit-contract.md`'s table against
   every kit, one per row of the
   table in [02-kit-contract.md](02-kit-contract.md), and `docs.test.ts` fails when the two counts
   disagree. Most hold for the kit as a whole; the `nodeProps` rule runs once per component.
4. Add a row above and mark it Built.

## Repeated scope

**Status: built.** A `Repeater` draws its children once per row of an array value. The design was settled
four ways in parallel and judged before a line was written; the decision and its two corrections are in
`docs/decisions.md`.

### Rows never mint keys

The authored subtree exists once in the document. A row exists in the DOM, in `FormData` and in
`FormErrors`, and never in the tree. Everything else follows from that prohibition, including the reason
no tree operation changed: each way duplicate keys break `findNode`, `updateNode`, `removeNode` and
`moveNode` needs the same key at three places in the tree, and it never is.

Core recognises a repeater from its shape — a data-bound container holding a list — rather than from a
type string, because component types are kit-scoped and core must not learn the word.

### No address is ever authored

An address is formed at the boundary and consumed at the boundary: an error key, a `data-fs-row`
attribute, a read into data. `addresses[1].postcode` is a runtime coordinate, not something in a
document, so there is no path grammar for a later feature to overload. It parses unambiguously only
because the key grammar excludes `.`, `[` and `]`, which is the return on holding them back.

`data-fs-row` is a separate attribute from `data-fs-key` because the two are wanted in opposite
directions: per-component CSS is authored once and has to reach every row, while a click has to land on
exactly one.

### A condition says which scope it means

`Operand.ref` carries `scope`. Absent means the form, which is what every `ref` written before repeaters
meant, so no document migrates. `row` reads the enclosing row — and reads _only_ it. There is
deliberately no fallback to the form when the row has no such field: once a name can mean either, no
caller can tell which one it got, and the fix is always another flavour of path.

That default carries the one real risk, so its mitigation shipped with it. A condition authored inside a
row and left at form scope reads nothing, hides its component, and takes it out of validation — the quiet
failure this project is organised against. `validateDocument` reports it, because unlike a missing
context it is decidable from the tree alone.

### What a host writes

`onChange` reports an address. Outside a repeater it is the data key, byte for byte, so a host that never
adds one sees no change. `applyChange` is the writer, and it ships in core so no host implements array
descent and `__proto__` is not handled two different ways in two places.

Rows are keyed by index. After a deletion React reuses each following component instance for the row
that moved into its index, so browser-owned transient state such as a file selection or IME composition
can follow the index rather than the answer. A stable generated id would instead put a non-answer inside
`data`, which [12-api.md](12-api.md#state-that-is-not-an-answer) refuses by design.

### Editing rows

Both kits provide Add and Remove controls and report the complete list through the repeater's ordinary
`onChange` address. `minItems` and `maxItems` rules disable controls at authored bounds and validate the
same bounds in core. As with every non-required rule, `minItems` passes on an empty list unless the field
also carries `required`. Nested repeaters use composed row addresses and are covered in core and renderer
tests.

The controls use every currently applicable bound, including guards reading form answers, host context, or an enclosing row. If more than one bound applies, the strictest determines the limit. `FormRenderer` supplies these resolved counts through `NodeRendererProps.itemLimits`; kits do not evaluate guards themselves.

## Steps

**Status: built.** The core of it is built. This section used to say a Step component was absent
because it needed a design, and named two open questions: where the current step lives given the renderer
holds no state, and what a step means to `validateForm`. Both are answered, and the answer is smaller
than the question: there is no Step type in core, because a step is a container with a condition on it.

### A wizard already runs

A step is a container with a condition on it. That is not a workaround discovered while looking for one;
it is what the pieces already do, and it was checked rather than assumed. A three-`Box` document, each
gated on the current step, run against core:

|                                                        | Result                                            |
| ------------------------------------------------------ | ------------------------------------------------- |
| `validateForm(root, { step: 2 })`                      | exactly step 2's fields                           |
| A condition on step 3 reading a step 1 answer          | works; `FormData` is flat                         |
| `toJsonSchema` over the whole document                 | omits and reports rules beneath conditional steps |
| Undo, tree operations, drag and drop, the kit contract | untouched; a step is a container                  |

`validateForm` takes a `ComponentNode`, not a document, so **per-step validation is
`validateForm(stepNode, data)`** and costs nothing. That was one of the two open questions and it was
already answered by a parameter that has been there the whole time.

### Validation and submission across steps

Validating only the current step cannot validate answers from completed steps. Hosts use the same explicit context scopes for validation and submission so earlier answers are checked and retained:

```ts
validateAcross(root, data, scopes: EvalOptions[]): FormErrors
submittedAcross(root, data, scopes: EvalOptions[]): FormData
contextValues(root, path): JsonValue[]
```

`validateAcross` runs the existing walk once per environment and merges. Steps partition the tree, so a
key appears under at most one of them and the merge has nothing to resolve.

`contextValues` is how the flow is read **out of the document**. A step is a container shown when
`context.step` equals its own name, so the steps are the names the document compares that path against.
The server enumerates from there and never from the request: a `validateForm` that took a step would let
a client name step one and have the rest go unchecked, and unlike a blocked submit that failure is
invisible and ships bad data.

`apps/demo-server` does exactly this, checked against the running server rather than asserted. A
three-step form submitted with an answer missing from step two returns 422 naming that field, even
though the submit arrives from step three.

One consequence found by running it: the boot-time `missingContext` check has to run against the
contexts the server will actually evaluate in, not against the bare session context. `step` is a path the
server fills in itself, once per scope, so checked against the base context every wizard is refused for a
path that was never missing.

### Where the current step lives

The current step is host-supplied context, separate from submitted answers. A host may keep it in local state, its existing router, or another application state owner. URL state is an option for deep links and browser navigation, not a library requirement. Formsmith reports navigation intent and does not provide a router. See [12-api.md](12-api.md#state-that-is-not-an-answer).

### Branching needs no new vocabulary

The flow is the steps whose `renderWhen` passes, in tree order. A step skipped because `country` is not
`GB` is skipped identically on the server, because that is an ordinary condition over ordinary data. An
edge list or a `nextWhen` target would say the same thing while taking flow order out of the tree, and
the tree being the source of truth is the thing the whole document model rests on.

Two consequences fall out rather than being designed:

- Going back and changing the answer that opened a branch hides that branch again, and
  `submittedData` already drops its answers from the payload while leaving them in `data`, so changing
  the answer back restores them. No `clearOnHide`, which would make hiding destructive against a model
  that has no runtime undo.
- **Progress must be truthful.** The built-in controls report position without a total. A host may display a known total for a fixed linear form; a flow whose length depends on later answers must not present an uncertain total as fixed.

Conditional steps reuse the existing tree order, structured conditions, and validation. They do not commit the library to a branching workflow engine, graph editor, or application routing system.

### What was blocking this, and it was not steps

An author could not see a conditional component on the canvas at all — a shipped defect affecting every
`renderWhen` in the project, of which steps were the largest case. Fixed: edit mode draws what a
condition hides and preview does not. See
[05-canvas.md](05-canvas.md#a-conditional-component-on-the-canvas).

### Settled: steps come before repeated scope

Argued both ways and decided on evidence rather than on which case read better. Across six form
libraries, four needed a breaking change to their row addressing after shipping and none ever needed one
to add pages, because paging partitions a form along an axis the data model does not have while
repetition adds a coordinate to every path beneath it. Steps here add no addressing at all, so there is
nothing for rows to inherit. Repeated scope is next but one: the key grammar comes between them, because
a path grammar on top of a key grammar that does not exist is how the mistake those libraries made would
get made here. See `docs/decisions.md`.

### Controlled navigation

Advancing a step is navigation, so the host still owns the current value in `context` and receives each
destination through `FormRenderer.navigation.onNavigate`. When that controlled prop is supplied, both
kits draw Back and Next controls. The renderer discovers step nodes from their own context conditions,
evaluates each candidate against current data to skip inactive branches, and reports a one-based position
without claiming a total that can change as answers change.

The `Step` palette entry is built. Both kits ship one, and it is the first use of `defaultRenderWhen` on
`ComponentDef` — a visibility rule a freshly dropped instance starts with, generated from the node's own
key, so two steps cannot silently share a condition and show at once. A starting value rather than a
constraint: the Rules tab edits it afterwards like any other `renderWhen`, deletion included.

The canvas supplies `context.step` and offers both its authoring switcher and the runtime controls, so
preview shows one reachable step at a time while editing shows all of them.
See [05-canvas.md](05-canvas.md#the-step-switcher).

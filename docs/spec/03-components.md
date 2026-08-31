# Component catalogue

**Status: built.** 27 of the 27 below are built, in both kits, and every palette group this catalogue
uses has components in it.

The two numbers are digits rather than words on purpose: `test/docs.test.ts` reads them and compares
them against the table below and against both kits' `definitions.ts`, so a component added to a kit and
not to this page fails the build.

This is the list Formsmith commits to. A kit is free to offer more or fewer — nothing in the contract
requires this catalogue — but the two kits in this repository implement it, which is what lets a document
authored against one render against the other.

## How components are specified

A component is a `ComponentDef` (metadata, in core) plus a renderer (React, in the renderer's half). The
metadata is what the designer sees; it never imports the renderer. See
[02-kit-contract.md](02-kit-contract.md).

```ts
interface ComponentDef {
  type: string // kit-scoped id, matches ComponentNode.type
  label: string // palette display name
  group: PaletteGroup
  icon?: string // name from the shared icon vocabulary
  container?: boolean // accepts children
  dataBound?: boolean // appears in submitted data
  dataType?: FieldSchema['type']
  defaultProps: Record<string, JsonValue>
  props: PropSchema[]
  events: EventName[]
}
```

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

27 components. **Built** means both kits implement it and the contract test passes.

### Layout

| Component  | Status | Container | Properties                                         |
| ---------- | ------ | --------- | -------------------------------------------------- |
| `Screen`   | Built  | yes       | `maxWidth`, `gap`                                  |
| `Step`     | Built  | yes       | `gap`; ships with a `renderWhen` on `context.step` |
| `Stack`    | Built  | yes       | `direction`, `gap`                                 |
| `Grid`     | Built  | yes       | `columns`, `gap`, `minColumnWidth`                 |
| `Box`      | Built  | yes       | `padding`, `background`, `radius`                  |
| `Card`     | Built  | yes       | `title`, `subtitle`, `variant`                     |
| `Repeater` | Built  | yes       | `gap`; its value is the list of rows               |

`Screen` is the root and is never in the palette. `Grid` is specified as intrinsic columns rather than a
twelve-column system: a form author thinks "two side by side", not "six of twelve".

`Repeater` is the one structurally interesting component here, and it is built. It renders its children
once per item in an array value, which makes it the only data-bound container, and it is how a form
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

**`FileUpload` reports a file name, not a file.** A file input is uncontrolled by design, and turning
bytes into form data is an upload protocol this project does not own: the host reads the input when it
submits. The value is the selected name, or an array of them, which is enough for `required` to mean
"a file was chosen" and for the schema to describe the field. This is the one place the catalogue promises
less than the type suggests.

`maxSize` is enforced by both kits at the moment of choosing: a file over it is dropped from the value and
the count of what was dropped is announced. It is still not a security boundary -- the host reads the input
itself when it submits, and nothing here can stop what a request contains -- so a host that cares has to
check again. This paragraph said `maxSize` was advisory until a host enforced it, which was true before
the kits did and had stayed on the page since.

**`Link` refuses an address it does not recognise.** `href` comes from a document, and a form author is
not always the person deploying the form, so `javascript:` in an `href` is the same code-execution
boundary core refuses to cross anywhere else. `safeHref` allows http, https, mailto, tel and relative
addresses, and strips nothing: an address that fails renders as plain text rather than as a link that
does nothing.

`Image` requires `alt`. A decorative image passes an empty string deliberately, which is a different
statement from having forgotten.

### Inputs

| Component     | Status | Data type | Properties                                                         |
| ------------- | ------ | --------- | ------------------------------------------------------------------ |
| `TextField`   | Built  | `string`  | `label`, `placeholder`, `helperText`, `multiline`, `disabled`      |
| `TextArea`    | Built  | `string`  | `label`, `placeholder`, `helperText`, `rows`, `disabled`           |
| `NumberField` | Built  | `number`  | `label`, `helperText`, `disabled`                                  |
| `DatePicker`  | Built  | `date`    | `label`, `helperText`, `min`, `max`, `disabled`                    |
| `FileUpload`  | Built  | `file`    | `label`, `helperText`, `accept`, `multiple`, `maxSize`, `disabled` |
| `Button`      | Built  | no        | `text`, `variant`, `disabled`                                      |
| `ButtonGroup` | Built  | no        | `orientation`                                                      |

`TextArea` exists separately rather than as `TextField` with `multiline`, because the two have different
properties (`rows` versus nothing) and a palette entry that changes shape based on a checkbox is harder
to find than two entries. `TextField.multiline` stays for documents that already use it.

`FileUpload` does not upload. It produces a value and the host decides what that means; a component that
posted somewhere would be a backend, which is a non-goal.

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
| `Breadcrumbs` | Built  | `items`                  |

## Events

Every component declares which of the six `EventName`s it can raise. Authoring them is
[09-actions.md](09-actions.md), which is not built.

The right-hand column is what the two kits declare today, not a rule -- both declare the same lists, and
`test/docs.test.ts` checks this table against them. Since nothing fires an event yet, the lists have never
had to be complete: `onFocus` reaches only the two free-text inputs, `onBlur` only those two and the
components that commit a value on leaving, and lifecycle events only `Screen`. Settle them when something
reads them.

| Event                   | Raised by                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `onChange`              | `TextField`, `NumberField`, `TextArea`, `Checkbox`, `Switch`, `Select`, `RadioGroup`, `DatePicker`, `FileUpload` |
| `onClick`               | `Button`, `Link`                                                                                                 |
| `onBlur`                | `TextField`, `TextArea`, `NumberField`, `DatePicker`                                                             |
| `onFocus`               | `TextField`, `TextArea`                                                                                          |
| `onMount` / `onUnmount` | `Screen`                                                                                                         |

## What is deliberately absent

- **Tooltip as a component.** It is a property of the thing it describes, not a sibling in the tree.
  Planned as a shared trait instead.
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

Rows are keyed by index, which remounts the rows below a deletion. That is the price of refusing a
generated row id, which would put a non-answer inside `data` — the thing
[12-api.md](12-api.md#state-that-is-not-an-answer) already refused by name.

### Still to build

Add and remove buttons, which is an action rather than a component; nested repeaters, which the coordinate
already supports and nothing yet exercises; and `minItems`/`maxItems` as rules of their own, though
`minLength` on the list now counts its rows correctly.

## Steps

**Status: partial.** The core of it is built. This section used to say a Step component was absent
because it needed a design, and named two open questions: where the current step lives given the renderer
holds no state, and what a step means to `validateForm`. Both are answered, and the answer is smaller
than the question: there is no Step type in core, because a step is a container with a condition on it.

### A wizard already runs

A step is a container with a condition on it. That is not a workaround discovered while looking for one;
it is what the pieces already do, and it was checked rather than assumed. A three-`Box` document, each
gated on the current step, run against core:

|                                                        | Result                                           |
| ------------------------------------------------------ | ------------------------------------------------ |
| `validateForm(root, { step: 2 })`                      | exactly step 2's fields                          |
| A condition on step 3 reading a step 1 answer          | works; `FormData` is flat                        |
| `toJsonSchema` over the whole document                 | requires all five fields, not the current step's |
| Undo, tree operations, drag and drop, the kit contract | untouched; a step is a container                 |

`validateForm` takes a `ComponentNode`, not a document, so **per-step validation is
`validateForm(stepNode, data)`** and costs nothing. That was one of the two open questions and it was
already answered by a parameter that has been there the whole time.

### The one thing that is genuinely broken

Submitting from the last step validates only the last step:

```
submit from step 3, city missing → { card: 'This field is required.' }
```

`city` was required, was never answered, and the form is accepted. That is `isVisible` behaving exactly
as specified — a hidden field is not validated — and it is wrong for a wizard, because the earlier steps
are not _unwanted_, they are _already done_. The distinction is the whole design: `renderWhen` false
means the author excluded this, and a step the user is not on means not yet.

So core gained two functions and no new concept:

```ts
validateAcross(root, data, scopes: EvalOptions[]): FormErrors
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

Not in `data`, which is submitted. Not held by the renderer, which holds no state and whose state core
could never see. It is host-supplied context, and it is navigation: the URL owns it, so the back button
and a deep link work without Formsmith knowing they exist. See
[12-api.md](12-api.md#state-that-is-not-an-answer).

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
- **Progress must refuse to claim a total.** "Step 2 of 5" is a lie in a branching flow: counting
  visible steps understates, counting every step overstates, and there is no third number. Position is
  knowable and a total is not, so the renderer should expose the first and not the second.

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

### Still to build

No Next or Back buttons: advancing a step is navigation, and navigation belongs to the host's router.

The `Step` palette entry is built. Both kits ship one, and it is the first use of `defaultRenderWhen` on
`ComponentDef` — a visibility rule a freshly dropped instance starts with, generated from the node's own
key, so two steps cannot silently share a condition and show at once. A starting value rather than a
constraint: the Rules tab edits it afterwards like any other `renderWhen`, deletion included.

The canvas half is built. It supplies `context.step` and offers a switcher naming the steps the document
declares, so preview shows one step at a time while editing shows all of them.
See [05-canvas.md](05-canvas.md#the-step-switcher).

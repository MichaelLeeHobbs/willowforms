# Component catalogue

**Status: partial.** Eight of the twenty-six below are built, in both kits. Two of the six palette groups
have no components at all.

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

`PaletteGroup` is `inputs | selection | layout | display | feedback | navigation | custom`. Every group
below is used, which closes two that are currently empty. `custom` is reserved for host-defined
components and this catalogue never uses it.

## The catalogue

Twenty-six components. **Built** means both kits implement it and the contract test passes.

### Layout

| Component  | Status  | Container | Properties                                        |
| ---------- | ------- | --------- | ------------------------------------------------- |
| `Screen`   | Built   | yes       | `maxWidth`, `gap`                                 |
| `Stack`    | Built   | yes       | `direction`, `gap`                                |
| `Grid`     | Built   | yes       | `columns`, `gap`, `minColumnWidth`                |
| `Box`      | Built   | yes       | `padding`, `background`, `radius`                 |
| `Card`     | Built   | yes       | `title`, `subtitle`, `variant`                    |
| `Repeater` | Planned | yes       | `minItems`, `maxItems`, `addLabel`, `removeLabel` |

`Screen` is the root and is never in the palette. `Grid` is specified as intrinsic columns rather than a
twelve-column system: a form author thinks "two side by side", not "six of twelve".

`Repeater` is the one structurally interesting component here. It renders its children once per item in
an array value, which makes it the only data-bound container, and it is how a form expresses "add another
address". It needs the document model to express a repeated scope: a data key that means "index 2 of this
array" rather than a name at the top level. `dataKey` does not do that and was never going to, so
`Repeater` is still blocked, on a design that has not been written. See
[01-document-model.md](01-document-model.md#datakey) for what data keys do cover.

### Display

| Component | Status | Data-bound | Properties                   |
| --------- | ------ | ---------- | ---------------------------- |
| `Heading` | Built  | no         | `text`, `level`              |
| `Text`    | Built  | no         | `text`, `variant`, `align`   |
| `Divider` | Built  | no         | `orientation`                |
| `Image`   | Built  | no         | `src`, `alt`, `fit`, `width` |

`Image` requires `alt`. A decorative image passes an empty string deliberately, which is a different
statement from having forgotten.

### Inputs

| Component     | Status  | Data type | Properties                                                         |
| ------------- | ------- | --------- | ------------------------------------------------------------------ |
| `TextField`   | Built   | `string`  | `label`, `placeholder`, `helperText`, `multiline`, `disabled`      |
| `TextArea`    | Built   | `string`  | `label`, `placeholder`, `helperText`, `rows`, `disabled`           |
| `NumberField` | Built   | `number`  | `label`, `helperText`, `disabled`                                  |
| `DatePicker`  | Planned | `date`    | `label`, `helperText`, `min`, `max`, `disabled`                    |
| `FileUpload`  | Planned | `file`    | `label`, `helperText`, `accept`, `multiple`, `maxSize`, `disabled` |
| `Button`      | Built   | no        | `text`, `variant`, `disabled`                                      |
| `ButtonGroup` | Built   | no        | `orientation`, `variant`                                           |

`TextArea` exists separately rather than as `TextField` with `multiline`, because the two have different
properties (`rows` versus nothing) and a palette entry that changes shape based on a checkbox is harder
to find than two entries. `TextField.multiline` stays for documents that already use it.

`FileUpload` does not upload. It produces a value and the host decides what that means; a component that
posted somewhere would be a backend, which is a non-goal.

### Selection

| Component    | Status | Data type | Properties                                                |
| ------------ | ------ | --------- | --------------------------------------------------------- |
| `Select`     | Built  | `string`  | `label`, `options`, `helperText`, `disabled`              |
| `Checkbox`   | Built  | `boolean` | `label`, `disabled`                                       |
| `RadioGroup` | Built  | `string`  | `label`, `options`, `direction`, `helperText`, `disabled` |
| `RadioItem`  | Built  | no        | `label`, `value`, `disabled`                              |
| `Switch`     | Built  | `boolean` | `label`, `disabled`                                       |

`options` is a `json` editor taking `{ label, value }[]`. Option values keep their type: a numeric value
stays a number, and choosing that option submits the number. An earlier version replaced any non-string
value with its array index, so selecting the first option submitted `"0"` whatever it said.

`RadioGroup` takes `options` and also accepts `RadioItem` children, for the case where an option needs
its own layout. Both kits render the simple case from `options`.

A required `Checkbox` or `Switch` must be checked. See
[08-validation.md](08-validation.md#the-rule-catalogue).

### Feedback

| Component  | Status  | Properties                  |
| ---------- | ------- | --------------------------- |
| `Alert`    | Planned | `text`, `severity`, `title` |
| `Progress` | Planned | `variant`, `value`, `label` |

Both are display-only and never data-bound. `Progress` covers linear and circular through `variant`
rather than being two components, because they are one idea with two shapes.

### Navigation

| Component     | Status  | Properties               |
| ------------- | ------- | ------------------------ |
| `Link`        | Planned | `text`, `href`, `target` |
| `Breadcrumbs` | Planned | `items`                  |

## Events

Every component declares which of the six `EventName`s it can raise. Authoring them is
[09-actions.md](09-actions.md), which is not built.

The right-hand column is what the two kits declare today, not a rule. Since nothing fires an event yet,
these lists have never had to be right: `onFocus` is missing from every input but `TextField`, and
lifecycle events are declared only by `Screen`. Settle them when something reads them.

| Event                   | Raised by                                    |
| ----------------------- | -------------------------------------------- |
| `onChange`              | data-bound components                        |
| `onClick`               | `Button`, `Link`                             |
| `onFocus` / `onBlur`    | `TextField`; `onBlur` alone on `NumberField` |
| `onMount` / `onUnmount` | `Screen`                                     |

## What is deliberately absent

- **Tooltip as a component.** It is a property of the thing it describes, not a sibling in the tree.
  Planned as a shared trait instead.
- **Modal and Dialog layout.** A form builder composes a form; where that form appears is the host's
  layout problem.
- **Embedded form and Slot.** These are form composition, which is a feature that needs its own design
  rather than arriving by analogy. See [01-document-model.md](01-document-model.md#one-form-per-document).
- **Typography as a raw wrapper.** `Heading` and `Text` cover what a form needs. A component whose whole
  purpose is to set a `variant` is a styling escape hatch, and that is what the Style tab is for.

## Adding one

1. Add the `ComponentDef` to both kits' metadata.
2. Add a renderer to both kits, spreading `nodeProps`.
3. Run `test/kit-contract.test.tsx`. It checks sixteen obligations against every kit. Most hold for the
   kit as a whole; the `nodeProps` rule runs once per component.
4. Add a row above and mark it Built.

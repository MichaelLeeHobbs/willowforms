# Inspector

**Status: partial.** Properties and Rules are built. Style and Actions do not exist. Four of the nine
property editors are unimplemented, and `PropSchema.section` is declared but ignored.

The right-hand pane edits whatever is selected. It is built entirely from kit metadata — the designer
never knows what a `TextField` is, only that something declared a `label` property with a `string`
editor.

## Tabs

| Tab        | Status  | Edits                                          |
| ---------- | ------- | ---------------------------------------------- |
| Properties | Built   | The selected component's `props`               |
| Style      | Planned | The selected component's `css`, per breakpoint |
| Actions    | Planned | The selected component's `events`              |
| Rules      | Built   | The selected component's `schema.validations`  |

Today a third tab holds form settings. That moves to the left pane, because it belongs to the document
rather than the selection. See [04-shell.md](04-shell.md#tabbed-left-pane).

### It is a real tablist

**Status: built.** `role="tablist"`, roving tabindex, arrow keys, Home and End, and tabs and panels
pointing at each other in both directions.

Worth stating because it is cheap and commonly skipped: the studied product ships tab strips with
`role="tab"` buttons and no owning `tablist`, and with `aria-selected` present only on the selected one.
The whole pattern costs about fifteen lines, and tests hold it.

## Properties

**Status: built.**

One row per `PropSchema` the component's `ComponentDef` declares, in declaration order. Above them, the
component's key.

### Sections

**Status: planned.** `PropSchema.section` is `'main' | 'style' | 'advanced'`, defaults to `'main'`, and
nothing reads it. Every property appears in one flat list, so `disabled` sits between `label` and
`placeholder` with equal weight.

`main` stays visible. `style` moves to the Style tab. `advanced` collapses behind a disclosure.

### The key field

**Status: built.** Commits on blur or Enter, not on every keystroke.

Renaming per character made every intermediate prefix a real document key with its own undo entry, and
made the field impossible to clear: the store refuses an empty key, so a controlled input snapped
straight back and you could never backspace far enough to retype.

A refused rename says why — `email is already used by another component` — and leaves the selection
where it was. It previously moved the selection to whichever component already held the name, so the
panel silently began editing a different node.

### Property editors

`PropEditor` declares nine. Five exist.

| Editor      | Status  | Control                                                 |
| ----------- | ------- | ------------------------------------------------------- |
| `string`    | Built   | Single-line text                                        |
| `multiline` | Planned | Textarea                                                |
| `number`    | Built   | Number input; clearing it clears the property           |
| `boolean`   | Built   | Checkbox                                                |
| `select`    | Built   | Picker; options come from the schema                    |
| `json`      | Built   | Textarea, committed on blur when it parses              |
| `color`     | Planned | Swatch plus a text field, so a token name is typeable   |
| `icon`      | Planned | Picker over the shared icon vocabulary                  |
| `code`      | Planned | Monospace editor with a line count; no language service |

An editor with no branch of its own falls back to a single-line text input rather than failing, so an
unimplemented editor is invisible until someone notices the control is wrong. `multiline` is the one that
can bite today: a kit declaring it gets a one-line box and no warning.

Every row also carries its binding mode picker when the property offers more than one. See
[07-bindings.md](07-bindings.md).

### The JSON editor is controlled

**Status: built**, and the reason is a bug worth remembering. It was uncontrolled, reading its value once
at mount, and rows were keyed by property name alone. Two components of the same type therefore shared
one instance: selecting the second showed the first's JSON, and blurring wrote it onto the second. Rows
are keyed by component and property now.

### Modified markers

A property with a value set shows a dot and, for a screen reader, the words `(modified)` inside the
label. The dot was previously a bare `<span aria-label="Modified">`, and ARIA prohibits `aria-label` on
an element with no role, so it announced nothing at all while looking handled. axe found it.

## Style

**Status: planned.** Nothing exists.

Writes `node.css`, which is `Partial<Record<Device, string>>` — raw CSS text per breakpoint. Editing is
scoped to the viewport currently simulated on the canvas, so **viewport simulation has to come first**:
authoring a tablet rule with no way to see a tablet is writing blind. See
[04-shell.md](04-shell.md#the-canvas-and-the-wasted-space).

Open questions, to answer before building:

- Raw CSS text, or a structured subset with a form? Raw is honest about being an escape hatch and needs
  no vocabulary; structured is safer and discoverable, and is what most authors want for padding and
  alignment. The likely answer is both, with the structured controls writing the same text.
- What selector does the text apply to? The component's own element only, or descendants too? Only the
  component's own element keeps the blast radius small and matches how the rest of the designer treats
  the kit's internals as off-limits.
- `any` versus the three devices: does `any` mean "all viewports" as a base layer, with the others
  overriding? That is the useful reading and should be stated rather than inferred.

## Actions

**Status: planned.** Nothing exists. See [09-actions.md](09-actions.md) for the model and the sandbox
boundary; this section is only about authoring.

Two halves:

- **Per component:** which of its declared `EventName`s fire which actions, in order.
- **Per document:** the named `CodeAction`s themselves, each a body and parameters. These are shared, so
  they need a home that is not the selected component — most likely the left pane's Settings tab.

The panel must be plain that an action needs a host-injected evaluator to run, in the same way the Rules
tab is about `custom`. An action that silently never fires is worse than one that visibly cannot.

## Rules

**Status: built.** See [08-validation.md](08-validation.md) for semantics.

The field's data type and its validate-while-typing flag sit above a list of rules. Each rule gets the
parameter its type demands, a message that falls back to the built-in default, and a remove button. A
rule already applied drops out of the add menu, except `custom`, where more than one is meaningful.

Two things the panel says out loud, because both are otherwise invisible:

- as soon as a field has rules but no `required`, that it stays valid while empty
- on a `custom` rule, that it passes rather than fails when no evaluator is injected

A component that holds no form data says so instead of showing an empty rule list.

**Missing:** no UI for a rule's `when` guard.

## Additional properties

**Status: planned.** Two things a kit cannot anticipate:

- **`renderWhen`.** Conditional visibility works everywhere except in the panel, so it is JSON-only
  today. It is a `PropValue` and wants the same editor as any other binding.
- **HTML attributes.** A passthrough for `id`, `data-*`, `aria-*`. Needs an allowlist rather than an open
  door: letting an author set arbitrary attributes on a kit's root element includes `style` and
  `onclick`, and this project already draws the code-execution boundary elsewhere.

## Editing granularity

**Status: built.** Consecutive edits to the same property coalesce into one undo entry. Typing a
thirteen-character label used to spend thirteen of the hundred history slots and push the real edits out
of reach.

A run breaks on a different property, a different component, a structural edit, or an undo. Deliberately
not on a timer: coalescing by wall clock makes the behaviour depend on how fast someone types and the
tests depend on how fast the machine runs them.

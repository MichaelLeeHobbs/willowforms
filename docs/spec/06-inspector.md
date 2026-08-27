# Inspector

**Status: partial.** Properties and Rules are built, and so is every property editor. Style and Actions
do not exist, and `PropSchema.section` is declared but ignored.

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

A third tab used to hold form settings. It has moved to the left pane, because it belongs to the document
rather than the selection. See [04-shell.md](04-shell.md#tabbed-left-pane).

### It is a real tablist

**Status: built.** `role="tablist"`, roving tabindex, arrow keys, Home and End, and `aria-selected` on
every tab rather than only the selected one.

Only the selected panel is rendered, so only the selected tab carries `aria-controls`. Every tab used to
carry it, which left two of the three naming an id that was not in the document. An unresolved IDREF is
not an axe violation, so the accessibility suite passed over it for as long as it existed.

The whole pattern costs about fifteen lines, and tests hold it. It lives in `panels/Tabs.tsx` and both
panes use it: the left pane needed the same thing, and two copies would have been two places to get the
roving tabindex subtly wrong.

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

`PropEditor` declares nine. All nine exist.

| Editor      | Status | Control                                                 |
| ----------- | ------ | ------------------------------------------------------- |
| `string`    | Built  | Single-line text                                        |
| `multiline` | Built  | Textarea                                                |
| `number`    | Built  | Number input; clearing it clears the property           |
| `boolean`   | Built  | Checkbox                                                |
| `select`    | Built  | Picker; options come from the schema                    |
| `json`      | Built  | Textarea, committed on blur when it parses              |
| `color`     | Built  | Swatch plus a text field, so a token name is typeable   |
| `icon`      | Built  | Picker over the shared icon vocabulary                  |
| `code`      | Built  | Monospace editor with a line count; no language service |

An editor with no branch of its own still falls back to a single-line text input rather than failing.
Nothing reaches that fallback now, but it is worth knowing it is there: `multiline` sat behind it from
the first commit until `Text` wanted one, and nothing failed, because a silently wrong control looks
exactly like a right one.

Three notes on the three newest. **The colour editor keeps the text as the value and the swatch as a
convenience**, because `<input type="color">` holds only `#rrggbb` and the useful things to write are
`var(--brand)`, `transparent` and `rgb(0 0 0 / 40%)`; a swatch that owned the value would rewrite every
one of them on first touch. **The icon editor is a select**, not a grid: there are thirty names, the pane
is 288px, and a name is what gets stored, so the preview is there only so nobody has to know what
`paragraph` looks like. **The code editor has no syntax highlighting and no language service**, on
purpose, because a half-working editor that lies about what it understands is worse than a plain one.

Every row also carries its binding mode picker when the property offers more than one. See
[07-bindings.md](07-bindings.md).

**The picker sits above the control, not beside it.** A property row is `108px minmax(0, 1fr) auto`:
label, control, and whatever follows. The picker shares the control's cell.

Inline was tried and does not fit. At the pane's 288px, a label, a readable picker and a usable text box
cannot share one line, and the first attempt gave the picker the flexible column and the control its
natural width, which collapsed the picker to about 38px and clipped "Value" to nothing. A working
control that reads as an empty box is worse than one that is obviously absent.

A boolean is the exception: a checkbox needs almost no width, so it sits beside the picker, and the
picker is told not to shrink there. Shrinking is exactly what clipped it the first time.

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

**Status: planned.** Nothing exists. The three questions this section used to leave open are answered
below, so it is a commitment rather than a sketch.

Writes `node.css`, which is `Partial<Record<Device, string>>`: raw CSS text per breakpoint. Editing is
scoped to the viewport currently simulated on the canvas, so **viewport simulation has to come first**.
Authoring a tablet rule with no way to see a tablet is writing blind. See
[04-shell.md](04-shell.md#the-canvas-and-the-wasted-space).

### Two ways to write the same text

Structured controls for the common properties, and a raw CSS field underneath. The structured controls
write into the same string the raw field edits, so there is one stored value and no second format to keep
in step.

Both, rather than either, because they fail in opposite directions. Raw text alone makes padding a typing
exercise and offers nothing to discover. A structured form alone turns every gap in its vocabulary into a
wall, and the vocabulary is never finished. Structured for what most authors want, raw for everything
else, and the raw field is what the structured controls are a shortcut for.

The structured set is deliberately small: padding, margin, alignment, width, background, border, radius.
Anything beyond that is the raw field's job. A property earns a control the same way a component property
earns a row, by being something a form author changes rather than by existing.

### It applies to the component's own element only

Not to descendants. The rest of the designer treats a kit's internals as off-limits, and invariant 3 has
a test enforcing that for the designer's own stylesheet; a Style tab that let an author write
`input { padding: 0 }` would hand every user the ability to make the same mistake the invariant exists to
prevent, one form at a time.

The text is applied scoped to the element carrying `data-fs-key`, and a selector in it cannot escape that
scope. What an author can still do is style that one element, which is the blast radius they can reason
about.

### `any` is the base layer

`Device` is `any | mobile | tablet | desktop`. `any` is not a fourth breakpoint. It is the base, applied
at every width, and the three device entries override it at theirs. A component with only `any` looks the
same everywhere, which is what an author who never opens the viewport switcher should get.

Cascade order is `any`, then the device matching the simulated viewport. Two device entries never apply
at once, so there is no ordering question between them.

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

The field's data type and its validate-while-typing flag sit above a list of rules. That flag writes
`FieldSchema.autoValidate`, which is a hint to whoever owns the form's data, since Formsmith never does.
The canvas preview reads it: a field that asked for it shows its error once the user has touched it,
rather than waiting for Validate. It was written by this checkbox and read by nothing at all until
recently, which made it a setting that did nothing. Each rule gets the
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

# Inspector

**Status: built.** Properties, Style, Actions and Rules are built, along with every property editor and
the section routing.

The right-hand pane edits whatever is selected. It is built entirely from kit metadata — the designer
never knows what a `TextField` is, only that something declared a `label` property with a `string`
editor.

## Tabs

| Tab        | Status | Edits                                          |
| ---------- | ------ | ---------------------------------------------- |
| Properties | Built  | The selected component's `props`               |
| Style      | Built  | The selected component's `css`, per breakpoint |
| Actions    | Built  | The selected component's `events`              |
| Rules      | Built  | The selected component's `schema.validations`  |

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

**Status: built.** `PropSchema.section` is `'main' | 'style' | 'advanced'` and defaults to `'main'`.

`main` stays visible. `style` moves to the Style tab, beside the CSS it competes with. `advanced`
collapses behind a disclosure, because giving `disabled` the same weight as `label` is what made the
panel a flat list where nothing stood out.

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

Booleans use the same vertical arrangement. Although a checkbox needs little width, putting it beside
the picker fails as soon as a modified value adds Reset in the row's third column: the picker keeps its
readable width and the checkbox is clipped. Keeping the checkbox below the picker leaves both controls
visible before and after the property is modified.

### The JSON editor is controlled

**Status: built**, and the reason is a bug worth remembering. It was uncontrolled, reading its value once
at mount, and rows were keyed by property name alone. Two components of the same type therefore shared
one instance: selecting the second showed the first's JSON, and blurring wrote it onto the second. Rows
are keyed by component and property now.

### Modified markers

A property with a value set shows a dot and, for a screen reader, the words `(modified)` inside the
label. The dot was previously a bare `<span aria-label="Modified">`, and ARIA prohibits `aria-label` on
an element with no role, so it announced nothing at all while looking handled. axe found it.

An unset property displays its effective value from the component definition's `defaultProps`. It has no
modified marker or Reset button because the document still stores no override. Resetting a property
therefore returns the control to a visible default rather than an empty field whose rendered result has
to be guessed.

## Style

**Status: built.** The three questions this section used to leave open are answered below, and the answers
are what was built.

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

The structured set is `padding`, `margin`, `text-align`, `width`, `background`, `border` and
`border-radius`. A control only ever touches its own declaration, so anything typed by hand survives
sitting next to a widget, and a property with no widget is left alone rather than discarded. That is the
property that lets one string have two editors.

The kit's own styling properties — the ones whose `PropSchema.section` is `style` — appear above the CSS
rather than on the Properties tab. A `Stack`'s `gap` is a better answer than a hand-written margin, and
an author who writes the CSS first will never discover the property afterwards.

### It applies to the component's own element only

Not to descendants. The rest of the designer treats a kit's internals as off-limits, and invariant 3 has
a test enforcing that for the designer's own stylesheet; a Style tab that let an author write
`input { padding: 0 }` would hand every user the ability to make the same mistake the invariant exists to
prevent, one form at a time.

The text is **declarations only**, applied scoped to the element carrying `data-fs-key`. `{`, `}`, `<`,
`@`, `\` and the CSS comment delimiters `/*` and `*/` are refused, as is a block whose quotes are not all
closed or that calls `url()`, `image-set()`, `element()` or `cross-fade()`. The first four characters are
how a component's styling would end its own block and reach the page, leave CSS through `</style>`, or
open an `@import`; the backslash is how it would spell one of them anyway, since `\3c` is `<` to a CSS
parser; and a comment delimiter is how it would swallow the rules after it -- these blocks share one
sheet, so an unbalanced `/*` takes other components' styling with it. The fetching functions were refused
for this panel in particular: `background: url(https://…)` on a page collecting answers makes the form
call out to whoever wrote the document.

Stated in full because this panel reports the refusal to the author, and a list that omitted three of
them left somebody reading "refused" with nothing here to explain which character offended. Refused rather than escaped, because escaping invites an
argument about which escape is sufficient, and refused rather than cleaned, because silently rewriting
what an author typed is how a rule ends up meaning something nobody asked for. The panel says the text
was refused; the renderer leaves it out.

Keys are author-controlled too, and they are escaped rather than refused, because unlike the
declarations they are not something an author is writing here and refusing one would break a document
that already renders over a character in a name. `<` is escaped along with the quotes: a key holding
`</style>` never has to be valid CSS to be a problem, since it closes the element the stylesheet sits in.

Rules are confined to one rendered form as well as to one component. A key is unique inside a document
and nowhere else, so two forms on a page both have a `root`, and without a scope the first one's styling
reaches into the second. The renderer stamps a per-instance `data-fs-scope` on every node and compounds
it into every selector.

What an author can still do is style that one element, which is the blast radius they can reason about.

### `any` is the base layer

`Device` is `any | mobile | tablet | desktop`. `any` is not a fourth breakpoint. It is the base, applied
at every width, and the three device entries override it at theirs. A component with only `any` looks the
same everywhere, which is what an author who never opens the viewport switcher should get.

Cascade order is `any`, then the device matching the simulated viewport. Two device entries never apply
at once, so there is no ordering question between them.

**On the canvas the device is named; in a page it is a media query.** The designer simulates a device by
sizing a frame, so a media query there would answer about the browser window and ignore the frame
entirely. `FormRenderer` takes an optional `device` for that case and emits only those rules, flat.
Without it every device becomes its query and the viewport decides, which is what a host wants. Both
paths come from one table in core.

Choosing a device in the Style tab moves the canvas to it, and choosing a viewport in the toolbar moves
what the Style tab edits. They are one choice made in two places, because a rule for a width you cannot
see is written blind.

## Actions

**Status: built.** See [09-actions.md](09-actions.md) for the runtime contract and sandbox boundary.

Two halves:

- **Per component:** which of its declared `EventName`s fire which actions, in order.
- **Per document:** the named `CodeAction`s themselves, each a body and default parameters, in the left
  pane's Settings tab.

Both surfaces state that code actions require a host-injected sandbox evaluator. Built-ins remain
available without one.

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

Each rule has an **Apply when** editor for always, never, structured conditions, or a host-evaluated
expression. Structured conditions use the same closed editor as component visibility.

## Additional properties

**Status: partial.** Two things a kit cannot anticipate. The first is built and has been for a while --
a section reading Planned above a bullet reading Built is the kind of status a reader stops trusting the
rest of the file over -- and the second is not started.

- **`renderWhen`.** **Built.** A Show when row offering Always, Never, a condition, or an expression.
  `renderWhen` is a `PropValue`, so a document can hold any of its kinds: a static falsy reads as
  Never, and a static truthy or a translation key reads as Always, which is what `isVisible` does with
  them. Reading anything truthy as a condition left the select saying so while rendering no editor,
  which made a hand-edited document unfixable from the panel. A
  component cannot test its own field: hiding a component when its own value is empty hides the only
  control that could fill it. The field list comes from the document, so a condition cannot name a key
  that does not exist, and a hand-edited one that does is shown rather than silently reassigned.
  See [01-document-model.md](01-document-model.md#conditions).
- **HTML attributes.** **Planned:** a passthrough for `id`, `data-*`, `aria-*`. Needs an allowlist rather
  than an open door: letting an author set arbitrary attributes on a kit's root element includes `style`
  and `onclick`, and this project already draws the code-execution boundary elsewhere.

## Editing granularity

**Status: built.** Consecutive edits to the same property coalesce into one undo entry. Typing a
thirteen-character label used to spend thirteen of the hundred history slots and push the real edits out
of reach.

A run breaks on a different property, a different component, a structural edit, or an undo. Deliberately
not on a timer: coalescing by wall clock makes the behaviour depend on how fast someone types and the
tests depend on how fast the machine runs them.

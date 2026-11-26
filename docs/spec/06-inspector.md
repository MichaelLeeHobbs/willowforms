# Inspector

**Status: built.** Properties, Style, Actions, Rules, and the property editors are built. Generic HTML attribute passthrough is outside the product scope. Accessibility is expressed through ordinary component properties and implemented by each kit; the complete accessibility audit remains Partial in [02-kit-contract.md](02-kit-contract.md#accessibility-from-ordinary-properties).

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
carry it, which left two of the three naming an id that was not in the document. axe does not flag an
unresolved `aria-controls` on an unselected tab, so the accessibility suite passed over it for as long as
it existed.

The whole pattern costs about fifteen lines, and tests hold it. It lives in `panels/Tabs.tsx` and both
panes use it: the left pane needed the same thing, and two copies would have been two places to get the
roving tabindex subtly wrong.

## Properties

Renaming a component key also updates structured references when its answer name follows that key and no other component in the same scope still writes the old answer. Visibility, property conditions, rule guards, and cross-field validation stay aligned; form references and each repeater's row references remain separate. An explicit `dataKey` remains stable. Expressions and action parameters are author-written source or arbitrary JSON and must be reviewed manually after a rename.

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

`PropEditor` declares eleven. All eleven exist.

| Editor      | Status | Control                                                                   |
| ----------- | ------ | ------------------------------------------------------------------------- |
| `string`    | Built  | Single-line text                                                          |
| `multiline` | Built  | Textarea                                                                  |
| `number`    | Built  | Number input; clearing it clears the property                             |
| `boolean`   | Built  | Checkbox                                                                  |
| `select`    | Built  | Picker; options come from the schema                                      |
| `image`     | Built  | Linked or embedded image with preview, removal, and load errors           |
| `options`   | Built  | Label/value rows with add, remove, manual moves, and alphabetical sorting |
| `json`      | Built  | Textarea, committed on blur when it parses                                |
| `color`     | Built  | Swatch plus a text field, so a token name is typeable                     |
| `icon`      | Built  | Picker over the shared icon vocabulary                                    |
| `code`      | Built  | Monospace editor with a line count; no language service                   |

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
the label, then the control across the other two columns. The picker shares the control's cell. Reset sits under the label, so setting a value neither moves nor narrows the control: it is as wide before a value is set as after.

Inline was tried and does not fit. At the pane's 288px, a label, a readable picker and a usable text box
cannot share one line, and the first attempt gave the picker the flexible column and the control its
natural width, which collapsed the picker to about 38px and clipped "Value" to nothing. A working
control that reads as an empty box is worse than one that is obviously absent.

Booleans use the same vertical arrangement, so every row reads the same way.

A property bound to an expression, a translation or a condition takes the whole width, with its label and Reset on the line above, because those editors need more room than two columns give, and a group of conditions indents. Show when, and a rule's Message and Apply when, do the same while their editor is open. The reason a Key, Data key, Pattern or Advanced CSS value was refused takes a line of its own under the row, so it cannot narrow the field it is about.

### Choice options

Select and Radio group use the options editor for static label/value arrays. Authors can add and remove rows, move them up or down, or sort labels alphabetically in either direction. Sorting writes the saved array order; subsequent edits return to fixed/manual mode. Values keep their JSON types, including numbers and booleans, and unrelated option fields are preserved. Computed bindings retain their expression editor. All edits participate in undo.

### The JSON editor is controlled

**Status: built**, and the reason is a bug worth remembering. It was uncontrolled, reading its value once
at mount, and rows were keyed by property name alone. Two components of the same type therefore shared
one instance: selecting the second showed the first's JSON, and blurring wrote it onto the second. Rows
are keyed by component and property now.

### Modified markers

A property with a value set shows a dot and, for a screen reader, the words `(modified)` inside the
label. The dot was previously a bare `<span aria-label="Modified">`, and ARIA prohibits `aria-label` on
an element with no role, so it announced nothing at all while looking handled. axe found it.

An unset property displays its effective value from the component definition's `defaultProps`. It has no modified marker or Reset button because the document stores no override. The shipped kits apply these defaults when a resolved property is absent, so Reset restores the same value in the inspector and rendered form. Explicit values, including empty strings and `null`, override the default. Custom kits must keep their declared defaults and runtime behavior aligned.

## Style

**Status: built.** The three questions this section used to leave open are answered below, and the answers
are what was built.

Writes `node.css`, which is `Partial<Record<Device, string>>`: raw CSS text per breakpoint. Editing is
scoped to the viewport currently simulated on the canvas, so **viewport simulation has to come first**.
Authoring a tablet rule with no way to see a tablet is writing blind. See
[04-shell.md](04-shell.md#the-canvas-and-the-wasted-space).

### Common appearance controls and advanced CSS

The Style tab leads with plain controls for text alignment (Left, Center, Right), Bold, Italic, Underline, Strikethrough, font family, text size, text color, and component width. Font families are familiar local font stacks with fallbacks; the selector loads no remote fonts. Existing custom stacks remain visible and editable through Advanced CSS. Text size offers a number and unit, including relative units. Underline and strikethrough can be toggled independently. Spacing offers separate Top, Right, Bottom, and Left sizes for inside and outside spacing. Background and border controls provide a color picker, thickness, appearance, and corner rounding. Sizes use numeric inputs with explicit units; authors do not need to learn CSS shorthand. Text alignment positions content within a component; whole-component placement uses the parent layout's alignment properties.

Raw declarations and shorthand inputs live in a collapsed **Advanced CSS** section for experienced authors and AI-assisted editing. Both interfaces edit the same `node.css` string. Friendly controls read shorthand declarations and device overrides, preserve unrelated declarations and text decorations, and leave unsupported values visible as custom values rather than silently replacing them. Individual spacing edits affect only the chosen side. Border appearance controls apply to all four sides. Clearing a size removes that explicit longhand override, revealing any shorthand or inherited base value.

The kit's own properties whose `PropSchema.section` is `style` appear first. A Stack's gap and alignment are available without writing CSS. All per-node appearance changes participate in undo and retain the existing CSS safety boundary.

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
`FieldSchema.autoValidate`, which is a hint to whoever owns the form's data, since WillowForms never does.
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

**Status: built.** Visibility is authored here. Accessibility uses the component's ordinary properties and the [kit contract](02-kit-contract.md#accessibility-from-ordinary-properties).

- **`renderWhen`.** **Built.** A Show when row offering Always, Never, a condition, or an expression.
  `renderWhen` is a `PropValue`, so a document can hold any of its kinds: a static falsy reads as
  Never, and a static truthy or a translation key reads as Always, which is what `isVisible` does with
  them. Reading anything truthy as a condition left the select saying so while rendering no editor,
  which made a hand-edited document unfixable from the panel. A
  component cannot test its own field: hiding a component when its own value is empty hides the only
  control that could fill it. The field list comes from the document, so a condition cannot name a key
  that does not exist, and a hand-edited one that does is shown rather than silently reassigned.
  See [01-document-model.md](01-document-model.md#conditions).
- **Accessibility properties.** Authors use Label, Help text, validation messages, image alternative text, and the relevant action or region name. Kits handle generated IDs, label associations, descriptions, and required/invalid state. Where a supported variant needs a name that visible text cannot supply, it gets a specific name property. This is not a general attribute bag, and the [remaining cross-kit acceptance checks](02-kit-contract.md#accessibility-from-ordinary-properties) must be completed before claiming full coverage.

## Editing granularity

**Status: built.** Consecutive edits to the same property coalesce into one undo entry. Typing a
thirteen-character label used to spend thirteen of the hundred history slots and push the real edits out
of reach.

A run breaks on a different property, a different component, a structural edit, or an undo. Deliberately
not on a timer: coalescing by wall clock makes the behaviour depend on how fast someone types and the
tests depend on how fast the machine runs them.

### Image sources and decorative backgrounds

Image sources have a URL field and preview, a local file picker that embeds PNG, JPEG, WebP, or GIF up to 2 MiB per image, and Remove image. Invalid sources and failed previews show an actionable error. Embedded data stays inside the document; WillowForms does not upload assets or manage storage. SVG is supported through linked image URLs, never injected markup or embedded SVG. Hosts supply accessible asset URLs and an appropriate image CSP.

Layout containers, including the root Screen, expose Background image, Image fit (Cover, Contain, Tile), Image position, and Readability overlay (None, Light, Dark) in a Background image disclosure in Style. These are ordinary version-1 properties and support the normal property binding modes and undo; they apply across devices. Backgrounds are decorative and affect only the container's own element. Meaningful artwork uses an Image component with alternative text. Dedicated image properties permit image fetching through a shared image-source allowlist; raw CSS continues to reject URL functions.

# Designer shell

**Status: built.** The layout, the toolbar, the keyboard map, the scrollbars, viewport simulation,
collapsible panes and the tabbed left pane are all built.

The shell is everything around the canvas: the panes, the toolbar, and the rules for what has focus.

## Layout

Three panes under a toolbar. **Status: built.** The diagram describes the current layout.

```
┌──────────────────────────────────────────────────────────────────┐
│ toolbar                                                          │
├────────────┬────────────────────────────────────┬────────────────┤
│ left pane  │ canvas                             │ inspector      │
│            │                                    │                │
│ Components │  ┌──────────────────────────────┐  │ Properties     │
│ Tree       │  │ the form, as the kit renders │  │ Style          │
│ Settings   │  │ it                           │  │ Actions        │
│            │  └──────────────────────────────┘  │ Rules          │
└────────────┴────────────────────────────────────┴────────────────┘
```

The left pane has Components, Tree, and Settings tabs. The inspector has Properties, Style, Actions, and Rules tabs. Toolbar controls wrap when space is limited, long form names truncate, and scrolling stays within the designer's panes and canvas.

Both side panes are `--fs-panel-width` (288px) and fixed. The canvas takes what is left.

The full-screen demo keeps overflow inside the panes and canvas rather than scrolling the document. A
pane grip is 15px including its one-pixel divider, so its 14px glyph fits inside the border box instead
of adding a fractional pixel of page overflow.

### Collapsible panes

**Status: built.** A grip on the inner edge of each pane collapses it, and the canvas takes the space.
Collapse state is per pane and is not part of the document: it is a view preference, and putting it in
the document would mean two people editing the same form disagree about what it looks like.

Per pane rather than one shared flag, because hiding the palette to see a wide form and hiding the
inspector to see the tree are different intentions.

**The grip sits outside the pane it controls.** Inside, it would be a one-way door: collapsing the pane
would take the control that reopens it with it. The chevron points the way the pane will move.

A collapsed pane is `hidden` and explicitly `display: none`, so it leaves both layout and the
accessibility tree rather than becoming a region a keyboard can still land in. `test/a11y.test.tsx` and
the browser layout suite audit that state.

### Tabbed left pane

**Status: built.** The palette and the structure tree were stacked in one scrolling column, so a form
with thirty components pushed the palette out of reach: the thing you reach for most often was the thing
furthest from the top. They are tabs:

| Tab        | Holds                                  |
| ---------- | -------------------------------------- |
| Components | The palette, searchable and grouped    |
| Tree       | The structure tree                     |
| Settings   | Form name, languages, default language |

Settings has moved out of the inspector, where it was a third tab called Form. It belongs to the
document, not to whatever is selected, and putting it beside per-component properties was a convenience
that made the panel mean two things.

**One consequence, and it is a real loss.** A component could be dragged from the palette straight into
the tree, which is how you put something inside a container the canvas has made hard to aim at. The two
are never on screen together now, so that route is gone; palette to canvas and tree to tree both still
work. See [05-canvas.md](05-canvas.md#what-can-be-dragged-where). Switching to the Tree tab when a
palette drag begins would bring it back, at the cost of the palette vanishing after every drop, which is
worse for the common case of adding three fields in a row. A third option, splitting the pane so the tree
sits collapsible beneath the palette, is recorded in [../ideas.md](../ideas.md) against the day the drop
is actually missed.

The tablist is the same component the inspector uses. It was extracted rather than copied: roving
tabindex, arrow keys, Home and End, and panels naming their tab is fifteen lines that are easy to get
subtly wrong twice, and the inspector's copy had already been wrong once.

### Starting layouts

The Components tab offers three searchable presets: **Ruled section** (heading, divider, and field), **Statistics row** (three compact number fields in a responsive Grid), and **Repeatable entry** (a compact item-and-quantity Repeater). They are available when the active kit declares the ordinary component types, properties, container behavior, and data types needed by each composition. Unsupported presets are omitted.

Clicking or keyboard-activating a preset inserts its entire subtree under the selected container, or the selected field's parent, and selects the new group. Insertion is one undoable action and closes a narrow-layout drawer. Each inserted node receives a fresh key; existing answer aliases also reserve names. Presets expand immediately into ordinary editable nodes that can be rearranged, removed, and exported/imported through the existing versioned JSON document. They introduce no new component types, runtime behavior, or interchange format.

## The canvas and the wasted space

**Status: built**, and worth explaining because the obvious fix is wrong.

The canvas currently shows the form centred, with dead space either side. That space is the `Screen`
component's own `maxWidth`, which is a real property of the form being authored — a form that renders at
640px wide should be _shown_ at 640px wide. Stretching it to fill the canvas would be lying about what
the form looks like.

What makes that space meaningful is **viewport simulation**. The canvas becomes a device frame:

| Viewport | Width | Notes                                   |
| -------- | ----- | --------------------------------------- |
| Desktop  | fill  | The default; the canvas is the viewport |
| Tablet   | 768px | Centred, with the frame visible         |
| Mobile   | 390px | Centred, with the frame visible         |

The margins stop being wasted and become the device. `Device` is already in the document model,
declared as `'any' | 'desktop' | 'tablet' | 'mobile'`, and is what per-breakpoint CSS keys on, so this
is also a prerequisite for the Style tab. See [06-inspector.md](06-inspector.md#style). The designer
works in `Viewport`, which is `Device` without `any`: `any` is the base layer per-breakpoint CSS falls
back to, not something anyone can look at.

Viewport is a view preference, not part of the document. Two people editing one form must not disagree
about what the form is because one of them last opened it on a phone.

**The frame is not clamped to the canvas.** A 768px frame in a 656px canvas would be 656px wide while
calling itself a tablet, which is the one thing a simulation must not do. It overflows and the canvas
scrolls. Scaling it with a transform would be worse: every rectangle the drop arithmetic measures would
stop matching the coordinates the pointer arrives in.

The form sits in a frame the designer owns and the kit cannot see. Hit-testing is
`closest('[data-fs-key]')` and the selection overlay measures against the surface, so an element carrying
neither is invisible to both. That is a claim about geometry, so it is checked in a browser rather than
here: `e2e/viewport.spec.ts` selects and drags at 390px wide.

## Narrow layouts and Preview

Below 960px of shell width, authoring panels use modal drawers opened by the **Components and structure** and **Component properties** buttons. They leave the canvas width available when closed. Each drawer has a close button, traps keyboard focus, closes with Escape, and restores focus to its opener. Adding a palette component closes the drawer so the result is visible; on narrow layouts palette insertion uses its click/keyboard action, while the Tree retains keyboard rearrangement. Desktop collapsed-panel preferences are independent of drawer state. Crossing the breakpoint remounts panel-local tab state.

Preview hides the authoring panels and their openers at every width without changing desktop collapse preferences. Returning to editing restores those preferences and leaves focus on the Preview toggle. Preview disables shell document-editing shortcuts. Diagnostics are optional rather than taking space from the form by default.

## Toolbar

**Status: built.** Every control in the table is, and the two notes under it are about how they behave
rather than about anything outstanding. It read Partial over a table of eight Built rows, which is the
kind of status a reader cannot act on.

| Control     | Status | Does                                                             |
| ----------- | ------ | ---------------------------------------------------------------- |
| Form name   | Built  | Shown; edited on the Settings tab                                |
| Undo / Redo | Built  | Disabled when there is nothing to undo                           |
| JSON        | Built  | Opens the document dialog                                        |
| Preview     | Built  | On the canvas bar, not the toolbar                               |
| Save        | Built  | Calls the `onSave` prop; hidden when the host does not pass one  |
| Viewport    | Built  | Desktop / tablet / mobile                                        |
| Language    | Built  | Which language the canvas renders in; hidden below two languages |
| Theme       | Built  | System / light / dark for the designer chrome                    |

**Save needs care.** Formsmith does not persist, so a Save button that appears unconditionally promises
something the designer cannot deliver. It renders only when the host passes `onSave`, and its absence is
the honest default: `onChange` already emits every version, and many hosts save from that.

**Theme, language and viewport are view state.** None of them touches the document, and there are tests
saying so, because the temptation to store the author's last choice in the form they were editing is
real and the consequence is two people disagreeing about what a form is.

`system` is the absence of `data-fs-theme`, not a third palette: the stylesheet already answers
`prefers-color-scheme`, so writing an explicit value would override the media query with nothing.

The language select is hidden below two languages, where it is furniture. If the language the canvas is
showing is removed from the document, the canvas falls back to the default. That is derived during
render rather than corrected afterwards, so there is no frame in which the canvas points at a language
the document does not have and draws every translation as its raw key.

## Scrollbars

**Status: built.** See [11-theming.md](11-theming.md#scrollbars), which owns the tokens and the reason
the canvas needs an exception to invariant 3.

Small, and disproportionately visible: unstyled scrollbars made the whole thing read as unfinished.

## Keyboard

**Status: built.** The full map lives in [../accessibility.md](../accessibility.md); the shell-level
rules are:

- **One tab stop for the structure tree.** Roving tabindex, so Tab reaches the tree once and arrows take
  over inside it.
- **Escape clears the selection**, or abandons a drag if one is in progress.
- **Undo and redo** are `Ctrl`/`Cmd` + `Z`, `Shift+Z`, and `Y`.
- **`Ctrl`/`Cmd` + `D` duplicates** the focused tree row, in beside itself, and moves focus to the copy.
  It is refused on the root, which has no siblings to sit among.
- **Shortcuts do not fire while typing.** A handler that undid the document because someone typed `z`
  in a label would be worse than no shortcut.

### Known conflict

`Delete` and `Backspace` on a focused tree row are handled by the row and by a shell-level shortcut --
both keys, in both places. The row stops propagation, because without it one keypress removed the
component twice and needed two undos. Any new shell-level shortcut has to consider the same collision.

**Shell-level, not window-level.** `Designer.tsx` attaches the handler to `shell.current`, and this said
`window` twice. On `window` the designer claimed Ctrl+Z, Delete, Backspace and Escape for the whole host
page, so a builder embedded in an admin panel took that page's undo away and gave nothing back. A
contributor following the old wording would have bound to `window` and put it back.

## The live region

**Status: built.** A polite `role="status"` region announces what changed when focus did not move:
canvas selections, keyboard moves, refused moves, additions and removals.

Tree navigation is deliberately **not** announced there. Focus lands on the row and a screen reader reads
it on arrival; announcing as well says everything twice.

An identical consecutive message gets a zero-width space appended, because an unchanged live region is
never read out and a second identical move would otherwise be silent.

## What the shell does not own

- **The document.** It holds one and emits every version through `onChange`.
- **Storage.** See [10-interchange.md](10-interchange.md).
- **The canvas contents.** That is the renderer and the kit.

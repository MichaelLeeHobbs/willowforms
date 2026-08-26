# Designer shell

**Status: partial.** The three-pane layout, the toolbar, and the keyboard map are built. Panels do not
collapse, the left pane is not tabbed, there is no viewport simulation, and the scrollbars are unstyled.

The shell is everything around the canvas: the panes, the toolbar, and the rules for what has focus.

## Layout

Three panes under a toolbar. **Status: built** for the arrangement; the pane contents below are where it
is going, not where it is.

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

Today the left pane is one scrolling column of palette above tree, Settings is the inspector's third tab
and is labelled **Form**, and the inspector has three tabs rather than four. The two sections below say
what moves. Read the picture as the target.

Both side panes are `--fs-panel-width` (288px) and fixed. The canvas takes what is left.

### Collapsible panes

**Status: planned.** A handle on the inner edge of each pane collapses it, and the canvas takes the
space. Collapse state is per-pane and is not part of the document — it is a view preference, and putting
it in the document would mean two people editing the same form disagree about what it looks like.

### Tabbed left pane

**Status: planned.** Today the palette and the structure tree are stacked in one scrolling column, so a
form with thirty components pushes the palette out of reach. They become tabs:

| Tab        | Holds                                  |
| ---------- | -------------------------------------- |
| Components | The palette, searchable and grouped    |
| Tree       | The structure tree                     |
| Settings   | Form name, languages, default language |

The tab is called **Form** in the code and everywhere a test selects it. It is called Settings here
because that is what it becomes when it moves; rename it when it moves, not before, or the spec and the
suite disagree about a string a user can read.

Settings moves out of the inspector, where it currently sits as a third tab. It is a property of the
document, not of the selected component, and putting it beside per-component properties was a
mistake of convenience.

## The canvas and the wasted space

**Status: planned**, and worth explaining because the obvious fix is wrong.

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
declared as `'any' | 'desktop' | 'tablet' | 'mobile'`, and is what per-breakpoint CSS keys on — so this
is also a prerequisite for the Style tab. See [06-inspector.md](06-inspector.md#style).

Viewport is a view preference, not part of the document.

## Toolbar

**Status: partial.**

| Control     | Status  | Does                                                              |
| ----------- | ------- | ----------------------------------------------------------------- |
| Form name   | Built   | Shown; edited on the Settings tab                                 |
| Undo / Redo | Built   | Disabled when there is nothing to undo                            |
| JSON        | Built   | Opens the document dialog                                         |
| Preview     | Built   | On the canvas bar, not the toolbar                                |
| Save        | Planned | Calls a new `onSave` prop; hidden when the host does not pass one |
| Viewport    | Planned | Desktop / tablet / mobile                                         |
| Language    | Planned | Which language the canvas renders in                              |
| Theme       | Planned | Light / dark for the designer chrome                              |

**Save needs care.** Formsmith does not persist, so a Save button that appears unconditionally promises
something the designer cannot deliver. It renders only when the host passes `onSave`, and its absence is
the honest default: `onChange` already emits every version, and many hosts save from that.

## Scrollbars

**Status: planned.** Nothing in either stylesheet styles a scrollbar, so a dark theme shows the
platform's light ones. Both panes and the canvas need `scrollbar-width: thin` with `scrollbar-color`
from the existing tokens, and the `::-webkit-scrollbar` equivalents.

Small, and disproportionately visible: unstyled scrollbars make the whole thing read as unfinished.

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

`Delete` on a focused tree row is handled by the row and by a window-level shortcut. The row stops
propagation, because without it one keypress removed the component twice and needed two undos. Any new
window-level shortcut has to consider the same collision.

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

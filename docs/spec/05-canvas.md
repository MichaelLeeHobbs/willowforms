# Canvas

**Status: partial.** Selection, hover, drag and drop, and the keyboard path are built. There is no
selection toolbar, no empty state, and no way to select the canvas by keyboard.

The canvas renders the real runtime renderer, not a design-time approximation. What is on screen is
literally what ships, which is the only way a WYSIWYG builder stays honest as a kit evolves.

## Finding a component in the DOM

Every rendered node carries `data-fs-key` and `data-fs-type`, because every kit renderer spreads
`nodeProps`. That attribute is the only link from a DOM element back to a document node, and everything
below is built on it. See [02-kit-contract.md](02-kit-contract.md#the-one-obligation).

Hit-testing is `event.target.closest('[data-fs-key]')`. A kit component that forgets `nodeProps` cannot
be selected, moved, or dropped near.

## Selection

**Status: built.**

Clicking a component selects it. A solid frame with a type label marks the selection; a dashed outline
follows the pointer. Both are absolutely positioned siblings measured from the target's
`getBoundingClientRect`, never wrappers, so nothing about selection can disturb the kit's layout.

Clicking the canvas outside the root clears the selection. Escape does the same.

### A click is a selection gesture, not an interaction

While editing, pointer events are cancelled in the capture phase before the kit's components see them.
Selecting a field never focuses it, toggles a checkbox, or opens a select.

Both halves of that are needed and they do different jobs:

- `preventDefault` cancels the browser's own action, which stops focus.
- `stopPropagation` keeps the event from reaching the kit's handlers, which stops a component opening.

Cancelling only the default was not enough. Material UI's Select opens from an `onMouseDown` on an
element _inside_ the one carrying `data-fs-key`, and a React handler already holding the event does not
care that its default was cancelled. Clicking a Select opened its dropdown until an end-to-end test in a
real browser caught it — a synthetic event dispatched at the outer element never reached the handler, so
every manual check had passed.

Preview mode hands the form back its own events untouched.

### One CSS rule reaches into kit components

```css
.fs-canvas__surface:not(.is-preview) [data-fs-key] {
  pointer-events: auto;
}
```

MUI sets `pointer-events: none` on a disabled Button, and a kit may do the same on any disabled control.
Without this, that component cannot be clicked and the click silently selects its parent instead, which
is worse than nothing happening. It restores hit-testing only, only while editing, and only on elements
the designer marked. It sets no visual property, which is the bar any future exception has to clear.

### Selection toolbar

**Status: built.** A small toolbar on the selection frame: duplicate, add a sibling, and remove. It is
omitted on the root, which has no siblings to sit among and cannot be removed; three buttons that refused
would be worse than no toolbar.

**Duplicate and add-a-sibling are different actions**, which is why both are there. Duplicate copies the
component's configuration, so it means "another one set up like this". Add-a-sibling instantiates the
same type with its defaults, so it means "another one of these". The second is the commoner intent and
the palette is the only route to it otherwise, which makes you aim at a drop target to say something
simple.

`Ctrl`/`Cmd` + `D` is the keyboard route to duplicate, from the tree.

### The canvas cancels events, including its own

The toolbar sits inside `.fs-canvas__surface` so it can be positioned against the frame, which puts it
inside the capture-phase handlers that stop a click operating a kit component. Those handlers exempt
anything inside `.fs-selection`.

Without the exemption the canvas swallowed its own toolbar's clicks. The buttons then read as dead
rather than broken, which is the failure mode this project treats as worst, and no unit test could see
it: the handlers are real DOM capture and the frame's `pointer-events` is layout. It took a browser.

Duplicate re-keys the copied subtree, because every key is unique within a document. An earlier draft of this
section guessed it would key a copy the way `instantiate` keys a new component, from the type. That is
wrong for a copy: it renames `emailAddress` to `textField7` and throws away the only part of the name a
form author chose. A copy is keyed from the original's name instead, with a trailing number stripped
first so a copy of `website2` is `website3` rather than `website22`. Each key is reserved as it is
generated, or a container holding two `textField` children produces a copy whose children collide with
each other.

## Drag and drop

**Status: built.** Pointer events throughout, so it works on touch and adds no dependency. HTML5
drag-and-drop was rejected: no control over the drag image, and close to unusable on touch.

### What can be dragged where

| From    | To     | Result                 |
| ------- | ------ | ---------------------- |
| Palette | Canvas | Insert a new component |
| Canvas  | Canvas | Move                   |
| Tree    | Tree   | Reorder or reparent    |

Palette to tree used to work and no longer can: the two are on separate tabs in the left pane, so they
are never on screen at the same time. The drop zone still exists and would resolve correctly if they
were. See [04-shell.md](04-shell.md#tabbed-left-pane).

### The threshold

A press becomes a drag only after the pointer travels four pixels. Below that it is a click, and the
click handler runs normally. Above it, the click that would follow the release is swallowed.

Without this, palette entries could not both add on click and drag onto the canvas.

### Resolving a drop on the canvas

Pure arithmetic over measured rectangles, in `dnd.ts`, with no DOM access. That is not tidiness: jsdom
has no layout engine, so this is the only way any of it can be tested at all.

1. The innermost **container** under the pointer becomes the parent.
2. Its children are compared against the pointer along whichever axis they are laid out on.
3. The axis is **inferred from where the children actually are**, not from a prop name. A kit is free to
   call its direction property anything, or to use a grid and have no property at all.
4. The dragged node and its whole subtree are excluded, so nothing can be dropped inside itself.

An empty container is outlined rather than showing a bar.

### Resolving a drop on the tree

Different arithmetic, because tree rows do not nest the way canvas boxes do: a row covers only itself and
its children are separate rows below it, so "innermost container under the pointer" is meaningless.

A row's top and bottom bands reorder among siblings. The middle band drops _into_ the row when it is a
container, and otherwise falls back to the nearer edge, so a leaf row never swallows a drop.

### An index means two different things

Drop resolution measures slots in a list with the dragged node filtered out, and what that slot means
depends on where the node came from.

Reordering **within** a parent, the slot is already right: `moveNode` removes before it inserts, so the
list it inserts into is the filtered one. Measuring against the list that still contains the dragged node
put every downward reorder one position too far.

Coming from **another** parent, the node was never among these siblings, so the slot has to be translated
back into the real children list. `documentIndex` picks between the two, and the distinction is easy to
lose: an earlier draft of this section stated only the first case, which reads as a rule that would break
the second.

### The controller tells the zone what is being dragged

The drag controller passes the dragged key into each zone's resolver rather than each zone reading it
from React state. A resolver registered from an effect closes over state that can be a render behind, and
a tree zone that believed nothing was being dragged failed to exclude it from its own sibling list.

### Release

On release the controller asks each zone, in turn, where the drop lands. The first to claim it wins; the
canvas and the tree cannot both be under the pointer.

Zones measure the DOM **at release**, not from a snapshot taken earlier. A React pointer handler always
runs before the window listener that records the drag, so any snapshot it took is one event behind, and a
quick flick from the palette followed by an immediate release was silently dropped on the floor.

Escape abandons a drag. The release that follows is not treated as a click.

## Preview

**Status: built.** Toggles the canvas between authoring and using the form. In preview the kit's
components receive their own events, data is collected, and Validate runs the real rule engine and shows
both the data and the errors.

The same `validateForm` that a server would call. See [08-validation.md](08-validation.md#server-parity).

## A conditional component on the canvas

**Status: built**, after shipping broken. Conditions were the last phase's flagship: a closed vocabulary,
evaluated in core, with a picker in the panel. An author could express one, and then could not see the
component they expressed it on.

The mechanism was three shipped decisions meeting, each defensible alone:

1. The canvas renders through the same `FormRenderer` in edit mode as in preview, with the same `data`,
   which starts empty and stays empty.
2. While editing, a click is a selection gesture, so pointer events are swallowed in the capture phase
   before the kit's components see them. The author cannot type into a field to satisfy a condition.
3. `isVisible` returned false, so the node was absent from the DOM. `measureTree` skips what did not
   render, so nothing could be dropped into it either.

Set `renderWhen` on a field and it left the canvas. It was still a row in the tree, so it could be
selected and its properties edited, but it could not be seen, positioned, or dropped into. The repository
already knew half of this: the canvas tests read the tree rather than the canvas precisely because "a
node hidden by `renderWhen` is a row here and no element there", written as a testing caution without
anyone noticing it described an authoring hole.

**Editing and preview now disagree about this, as they already disagree about events.** `FormRenderer`
takes `revealHidden`; the canvas passes it while editing and never in preview. A revealed node carries
`data-fs-hidden="true"`, and its children come with it, or a conditional container would still be a hole.
Arranging a form means arranging every component in it, including the ones a given user will not see;
showing what a user sees is what Preview is for.

Validation is untouched. `validateForm` calls the same `isVisible`, so this changed what is drawn and
never what is checked.

**Open: what the marker should look like.** The attribute is in the DOM; nothing draws with it yet.
Invariant 3's test forbids the obvious answer — its bar is that a sanctioned reach into a kit component
gives back something the designer took, never an appearance decision on the kit's behalf, and dimming a
revealed node is exactly that. An overlay in `SelectionLayer` is the shape that fits, since selection and
hover frames already work that way.

### The step switcher

**Status: built.** The canvas supplies `context.step`, and a bar control chooses which step it names. The
steps come out of the document — `contextValues(root, 'step')` reads the names its conditions compare
that path against — so a form with no steps gets no control and an ordinary form is unchanged.

Without it, preview showed an empty form for any wizard and an author could not check their own work.

Only `step`. The rest of a host's context is not knowable here, and inventing values would be worse than
showing none, so a condition reading `user.role` on the canvas still reads as missing. Editing draws the
component regardless, which is what keeps that from being a hole.

## Gaps

**Empty state.** A document whose root has no children renders an empty canvas with no explanation. It
should say what to do.

**Keyboard access to the canvas.** Components can only be selected there with a pointer; the tree is the
keyboard path to the same thing. A roving tabindex over rendered nodes would fight the kit's own
focusable controls, so this needs a design rather than an implementation.

**Mid-drag scrolling.** Zones measure at release, so a canvas scrolled during a drag resolves correctly,
but the indicator drawn during the drag comes from an earlier measurement and drifts.

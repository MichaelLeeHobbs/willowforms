# Building a form

What an author does to add, select, arrange, duplicate and remove components on the canvas and in the structure tree, how the canvas shows the form while it is being built, and how undo takes an edit back. Area code `BUILD`.

The toolbar, panes and narrow layouts belong to `WORK`. Preview and simulated canvas sizes belong to `PREV`. Editing a component's properties, keys and conditions belongs to `CONF`. Announcements, focus order and contrast belong to `A11Y`. What steps and repeated rows mean to a respondent belongs to `FLOW`.

## Palette (PAL)

| ID           | Requirement                                                                                                                              | Pri | Verify | Status   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| BUILD-PAL-01 | The system shall offer in the palette every component type the active kit declares, except a type the kit marks as a form root.          | P1  | Test   | Accepted |
| BUILD-PAL-02 | The system shall group the palette's entries under the palette group each component declares.                                            | P2  | Test   | Accepted |
| BUILD-PAL-03 | The system shall narrow the palette to the components whose display name or type name contains the author's search text.                 | P2  | Test   | Accepted |
| BUILD-PAL-04 | The system shall add a new component, set up with the kit's defaults, when an author clicks or keyboard-activates a palette entry.       | P1  | Test   | Accepted |
| BUILD-PAL-05 | The system shall add a component from the palette at the end of the selected container.                                                  | P1  | Test   | Accepted |
| BUILD-PAL-06 | The system shall add a component from the palette at the end of the selected component's parent when the selected one takes no children. | P1  | Test   | Accepted |
| BUILD-PAL-07 | The system shall add a component from the palette at the end of the form's root when nothing is selected.                                | P1  | Test   | Accepted |
| BUILD-PAL-08 | The system shall select the component it has just added.                                                                                 | P1  | Test   | Accepted |
| BUILD-PAL-09 | The system shall give each added component a key derived from its type that no other component in the form holds.                        | P1  | Test   | Accepted |
| BUILD-PAL-10 | The system should offer the starting layouts Ruled section, Statistics row and Repeatable entry in the palette.                          | P2  | Test   | Accepted |
| BUILD-PAL-11 | The system shall omit a starting layout that the active kit lacks the components, properties or data types to build.                     | P2  | Test   | Accepted |
| BUILD-PAL-12 | The system shall insert a starting layout's whole group of components where a palette component would be added, and select the group.    | P2  | Test   | Accepted |
| BUILD-PAL-13 | The system shall give every component a starting layout inserts a key that matches no key or answer name already in the form.            | P2  | Test   | Accepted |

- BUILD-PAL-01: source: docs/spec/03-components.md "Palette groups"; e2e/canvas.spec.ts "the palette does not offer the root component".
- BUILD-PAL-02: source: docs/spec/03-components.md "Palette groups"; docs/spec/04-shell.md "Tabbed left pane" ("searchable and grouped").
- BUILD-PAL-03: source: docs/spec/04-shell.md "Tabbed left pane". Matching on the type name as well as the display name: the code is the only source (packages/designer/src/panels/Palette.tsx).
- BUILD-PAL-04: source: docs/spec/05-canvas.md "The threshold" ("palette entries could not both add on click and drag"); docs/accessibility.md "Keyboard" ("palette buttons add components"); packages/designer/src/panels/Canvas.test.tsx "still adds from the palette on a plain click".
- BUILD-PAL-05, BUILD-PAL-06, BUILD-PAL-07: source: packages/designer/src/store.regressions.test.ts "where an added component lands". Tests are the only source for a palette component; docs/spec/04-shell.md "Starting layouts" states the same placement for a starting layout.
- BUILD-PAL-08: source: packages/designer/src/store.regressions.test.ts "selects what it added, and only after it is in the document". A test is the only source.
- BUILD-PAL-09: source: docs/spec/05-canvas.md "The canvas cancels events, including its own" (new components are keyed from the type); docs/spec/12-api.md "Keys" (a derived name that fails the key rules falls back to a generic one).
- BUILD-PAL-10, BUILD-PAL-11, BUILD-PAL-12, BUILD-PAL-13: source: docs/spec/04-shell.md "Starting layouts"; e2e/authoring-presets.spec.ts. Inserting a starting layout as one undo step is BUILD-UNDO-11.

## Selection and its toolbar (SEL)

| ID           | Requirement                                                                                                                                  | Pri | Verify | Status   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| BUILD-SEL-01 | The system shall select a component when an author clicks any part of it on the canvas.                                                      | P1  | Test   | Accepted |
| BUILD-SEL-02 | The system shall select a disabled component that an author clicks on the canvas, not its parent.                                            | P2  | Test   | Accepted |
| BUILD-SEL-03 | The system shall not focus, toggle, open or otherwise operate a component that an author clicks to select while editing.                     | P1  | Test   | Accepted |
| BUILD-SEL-04 | The system shall not pass an author's keystrokes to a component on the canvas while editing.                                                 | P1  | Test   | Accepted |
| BUILD-SEL-05 | The system shall mark the selected component with a frame labelled with its type.                                                            | P1  | Test   | Accepted |
| BUILD-SEL-06 | The system should outline the component under the pointer while editing.                                                                     | P2  | Test   | Accepted |
| BUILD-SEL-07 | The system shall keep the selection frame over the selected component while the canvas scrolls or resizes.                                   | P1  | Test   | Accepted |
| BUILD-SEL-08 | The system shall draw selection and hover marks without changing the layout of the form.                                                     | P1  | Test   | Accepted |
| BUILD-SEL-09 | The system shall clear the selection when an author clicks the canvas outside every component.                                               | P1  | Test   | Accepted |
| BUILD-SEL-10 | The system shall clear the selection when an author presses Escape while no drag is in progress.                                             | P1  | Test   | Accepted |
| BUILD-SEL-11 | The system shall show the same selected component on the canvas, in the structure tree and in the Inspector.                                 | P1  | Test   | Accepted |
| BUILD-SEL-12 | The system shall clear the selection when the selected component is no longer in the form.                                                   | P2  | Test   | Accepted |
| BUILD-SEL-13 | The system shall remove the selected component when an author presses Delete anywhere in the designer except a text field.                   | P1  | Test   | Accepted |
| BUILD-SEL-14 | The system shall not remove a component when Backspace is pressed in a text field or on a designer button.                                   | P1  | Test   | Accepted |
| BUILD-SEL-15 | The system should show a toolbar on the selection frame offering Duplicate, Add a sibling and Remove.                                        | P2  | Test   | Accepted |
| BUILD-SEL-16 | The system shall not show the selection toolbar on the form's root.                                                                          | P2  | Test   | Accepted |
| BUILD-SEL-17 | The system shall place a duplicate, with the original's configuration and contents, directly after the original.                             | P1  | Test   | Accepted |
| BUILD-SEL-18 | The system shall select a duplicate once it is made.                                                                                         | P2  | Test   | Accepted |
| BUILD-SEL-19 | The system shall key a duplicate from the original's key, replacing any trailing number with the next free one.                              | P2  | Test   | Accepted |
| BUILD-SEL-20 | The system shall give every component in a duplicate a key that no other component in the form holds.                                        | P1  | Test   | Accepted |
| BUILD-SEL-21 | The system shall place a new component of the selected component's type, set up with the kit's defaults, directly after it on Add a sibling. | P2  | Test   | Accepted |
| BUILD-SEL-22 | The system shall remove the selected component and its contents when the author chooses Remove in the selection toolbar.                     | P2  | Test   | Accepted |

- BUILD-SEL-01: source: docs/spec/05-canvas.md "Selection"; packages/designer/src/panels/Canvas.test.tsx "walks up from a nested element to the component that owns it"; e2e/canvas.spec.ts "clicking a component on the canvas selects it and shows its properties".
- BUILD-SEL-02: source: docs/spec/05-canvas.md "One CSS rule reaches into kit components". No behavioural test found; packages/designer/src/designer.css.test.ts only allows the rule.
- BUILD-SEL-03: source: docs/spec/05-canvas.md "A click is a selection gesture, not an interaction"; e2e/canvas.spec.ts "clicking a select does not open its dropdown".
- BUILD-SEL-04: source: e2e/canvas.spec.ts "selecting a field does not type into it, and the keystrokes reach the shell"; packages/designer/src/panels/Canvas.test.tsx "does not reach the kit input when focus is already inside it". Tests are the only source.
- BUILD-SEL-05, BUILD-SEL-06, BUILD-SEL-08: source: docs/spec/05-canvas.md "Selection"; e2e/canvas.spec.ts "the selection frame sits on the component it selected"; packages/designer/src/panels/Canvas.test.tsx "draws a hover frame for the component under the pointer".
- BUILD-SEL-07: source: e2e/canvas.spec.ts "the frame follows the component when the canvas scrolls"; e2e/viewport.spec.ts "the selection frame is drawn over the component, not beside it". Tests are the only source.
- BUILD-SEL-09, BUILD-SEL-10: source: docs/spec/05-canvas.md "Selection"; docs/spec/04-shell.md "Keyboard"; e2e/keyboard.spec.ts "Escape clears a selection made by clicking a field on the canvas".
- BUILD-SEL-11: source: docs/spec/05-canvas.md "Gaps" ("Tree and canvas selection stay synchronized"); docs/accessibility.md "Keyboard".
- BUILD-SEL-12: source: packages/designer/src/store.regressions.test.ts "does not leave the selection on a node an undo removed" and "clears the selection when a container holding it is removed". Tests are the only source.
- BUILD-SEL-13: source: docs/spec/04-shell.md "Known conflict" (a shell-level Delete shortcut); e2e/keyboard.spec.ts "Delete removes a component selected by clicking a field on the canvas"; packages/designer/src/Designer.test.tsx "still deletes on Delete, which is unambiguous from anywhere".
- BUILD-SEL-14: source: packages/designer/src/panels/Tree.test.tsx "does not delete when focus is on a toolbar button"; packages/designer/src/Designer.test.tsx "does not delete on Backspace from a target it cannot attribute"; docs/spec/04-shell.md "Keyboard" ("Shortcuts do not fire while typing").
- BUILD-SEL-15, BUILD-SEL-16: source: docs/spec/05-canvas.md "Selection toolbar"; e2e/canvas.spec.ts "the selection frame carries a toolbar, and the root does not".
- BUILD-SEL-17: source: docs/spec/05-canvas.md "Selection toolbar" ("Duplicate copies the component's configuration"); e2e/canvas.spec.ts "the toolbar is clickable, despite sitting on a frame that is not".
- BUILD-SEL-18: source: packages/designer/src/store.ts (`duplicateComponent`); e2e/keyboard.spec.ts "Control+D duplicates a component beside itself and focuses the copy". The code is the only source for selection; the doc names focus only.
- BUILD-SEL-19, BUILD-SEL-20: source: docs/spec/05-canvas.md "The canvas cancels events, including its own"; packages/designer/src/store.regressions.test.ts "never gives two duplicates the same key, however they are batched".
- BUILD-SEL-21: source: docs/spec/05-canvas.md "Selection toolbar"; e2e/canvas.spec.ts "add a sibling makes a fresh component, not a copy".
- BUILD-SEL-22: source: docs/spec/05-canvas.md "Selection toolbar"; e2e/canvas.spec.ts "the toolbar removes the selected component".

## Drag and drop (DND)

| ID           | Requirement                                                                                                                                 | Pri | Verify        | Status   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------- | -------- |
| BUILD-DND-01 | The system shall insert a new component where an author drops a palette entry on the canvas.                                                | P1  | Test          | Accepted |
| BUILD-DND-02 | The system shall move a component to where an author drops it on the canvas.                                                                | P1  | Test          | Accepted |
| BUILD-DND-03 | The system shall move a component to where an author drops its row in the structure tree.                                                   | P1  | Test          | Accepted |
| BUILD-DND-04 | The system shall show, while a drag is over a place a drop can land, where the component will land.                                         | P1  | Test          | Accepted |
| BUILD-DND-05 | The system shall land a drop exactly where its indicator showed.                                                                            | P1  | Test          | Accepted |
| BUILD-DND-06 | The system shall treat a press that travels less than four pixels as a click, not a drag.                                                   | P1  | Test          | Accepted |
| BUILD-DND-07 | The system shall not treat the release that ends a drag as a click.                                                                         | P1  | Test          | Accepted |
| BUILD-DND-08 | The system shall drop into the innermost container under the pointer on the canvas.                                                         | P1  | Test          | Accepted |
| BUILD-DND-09 | The system shall order a drop among a container's children along the direction they are drawn in, whether stacked, side by side or wrapped. | P1  | Test          | Accepted |
| BUILD-DND-10 | The system shall refuse to drop a component into itself or into any component it contains.                                                  | P1  | Test          | Accepted |
| BUILD-DND-11 | The system should outline an empty container as the drop target rather than draw a bar in it.                                               | P2  | Test          | Accepted |
| BUILD-DND-12 | The system shall drop into a container when the pointer is over the middle of the container's row in the structure tree.                    | P1  | Test          | Accepted |
| BUILD-DND-13 | The system shall place a drop on the tree row of a component that takes no children before or after that row, never inside it.              | P1  | Test          | Accepted |
| BUILD-DND-14 | The system shall add a component dropped into a Repeater once, to the Repeater's own contents, whichever drawn row it is dropped in.        | P1  | Test          | Accepted |
| BUILD-DND-15 | The system shall abandon a drag, leaving the form unchanged, when the author presses Escape.                                                | P1  | Test          | Accepted |
| BUILD-DND-16 | The system shall leave the form unchanged when a drag is released outside every place a drop can land.                                      | P1  | Test          | Accepted |
| BUILD-DND-17 | The system shall leave the form unchanged when the browser cancels a drag.                                                                  | P2  | Test          | Accepted |
| BUILD-DND-18 | The system shall land a drag that is released immediately after a quick movement where the pointer was released.                            | P2  | Test          | Accepted |
| BUILD-DND-19 | The system shall keep the drop indicator correct when the canvas scrolls or resizes during a drag, even while the pointer is still.         | P2  | Test          | Accepted |
| BUILD-DND-20 | The system shall land a drop and a selection on the component under the pointer at every simulated canvas width.                            | P1  | Test          | Accepted |
| BUILD-DND-21 | The system should support dragging and dropping by touch as well as by mouse.                                                               | P2  | Demonstration | Deferred |

- BUILD-DND-01, BUILD-DND-02, BUILD-DND-03: source: docs/spec/05-canvas.md "What can be dragged where"; e2e/canvas.spec.ts "dragging from the palette drops the component where the bar showed" and "dragging a component on the canvas moves it"; e2e/tree-drag.spec.ts.
- BUILD-DND-04: source: docs/spec/05-canvas.md "Resolving a drop on the canvas"; e2e/tree-drag.spec.ts "the row under the pointer says where a drop would go, and Escape drops nothing".
- BUILD-DND-05: source: docs/spec/05-canvas.md "An index means two different things"; packages/designer/src/dnd.test.ts "resolveTreeDrop index against moveNode"; e2e/viewport.spec.ts "a move still lands where the bar showed at mobile width".
- BUILD-DND-06, BUILD-DND-07: source: docs/spec/05-canvas.md "The threshold"; packages/designer/src/drag.test.ts "treats exactly the threshold as a drag" and "the click that follows a drag".
- BUILD-DND-08, BUILD-DND-09, BUILD-DND-10, BUILD-DND-11: source: docs/spec/05-canvas.md "Resolving a drop on the canvas"; e2e/canvas.spec.ts "dropping into a row container infers the horizontal axis". Wrapped children: packages/designer/src/dnd.test.ts "a wrapping container, which both shipped kits have" is the only source.
- BUILD-DND-12, BUILD-DND-13: source: docs/spec/05-canvas.md "Resolving a drop on the tree"; e2e/tree-drag.spec.ts "a row dragged onto a container row moves inside it" and "a container is not dropped into its own child".
- BUILD-DND-14: source: e2e/repeater.spec.ts "a field dropped into a repeater lands in the authored row, once"; packages/designer/src/dnd.test.ts "a drop into the second row of a repeater". Tests are the only source.
- BUILD-DND-15: source: docs/spec/05-canvas.md "Release"; docs/spec/04-shell.md "Keyboard"; e2e/canvas.spec.ts "Escape abandons a drag without changing the document".
- BUILD-DND-16: source: e2e/canvas.spec.ts "a palette drag released off the canvas adds nothing"; packages/designer/src/drag.test.ts "commits nothing when no zone claims the release". Tests are the only source.
- BUILD-DND-17: source: packages/designer/src/drag.test.ts "a drag the browser takes away". A test is the only source.
- BUILD-DND-18: source: docs/spec/05-canvas.md "Release".
- BUILD-DND-19: source: docs/spec/05-canvas.md "Gaps" ("Mid-drag scrolling"); e2e/canvas-scroll.spec.ts.
- BUILD-DND-20: source: docs/spec/04-shell.md "The canvas and the wasted space" (the frame is not scaled, so drops stay true); e2e/viewport.spec.ts. Which widths exist belongs to `PREV`.
- BUILD-DND-21: source: docs/spec/05-canvas.md "Drag and drop" ("so it works on touch"). No test drives a touch drag.

## Structure tree (TREE)

| ID            | Requirement                                                                                                                          | Pri | Verify | Status   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --- | ------ | -------- |
| BUILD-TREE-01 | The system shall show every component of the form, including hidden ones, as a row of a structure tree that mirrors the nesting.     | P1  | Test   | Accepted |
| BUILD-TREE-02 | The system shall move keyboard focus through the tree rows in document order with the up and down arrows, stopping at either end.    | P1  | Test   | Accepted |
| BUILD-TREE-03 | The system shall move keyboard focus to a row's first child with the right arrow and to its parent with the left arrow.              | P1  | Test   | Accepted |
| BUILD-TREE-04 | The system should move keyboard focus to the first and last rows with Home and End.                                                  | P2  | Test   | Accepted |
| BUILD-TREE-05 | The system shall select the component whose tree row keyboard focus moves to.                                                        | P1  | Test   | Accepted |
| BUILD-TREE-06 | The system shall select the component whose focused tree row the author activates with Enter or Space.                               | P1  | Test   | Accepted |
| BUILD-TREE-07 | The system shall move the focused component past its neighbouring sibling with Alt and the up or down arrow.                         | P1  | Test   | Accepted |
| BUILD-TREE-08 | The system shall move the focused component to the end of the container directly above it with Alt and the right arrow.              | P1  | Test   | Accepted |
| BUILD-TREE-09 | The system shall move the focused component out of its container, to just after that container, with Alt and the left arrow.         | P1  | Test   | Accepted |
| BUILD-TREE-10 | The system shall refuse a keyboard move that has no valid destination and leave the form unchanged.                                  | P1  | Test   | Accepted |
| BUILD-TREE-11 | The system shall remove the focused component and its contents when the author presses Delete or Backspace on its tree row.          | P1  | Test   | Accepted |
| BUILD-TREE-12 | The system shall remove exactly one component for one press of Delete or Backspace.                                                  | P1  | Test   | Accepted |
| BUILD-TREE-13 | The system shall duplicate the focused component, directly after itself, when the author presses Ctrl or Cmd with D on its tree row. | P1  | Test   | Accepted |
| BUILD-TREE-14 | The system should offer a Remove button on every tree row except the root's.                                                         | P2  | Test   | Accepted |
| BUILD-TREE-15 | The system shall not remove, move or duplicate the form's root.                                                                      | P1  | Test   | Accepted |

- BUILD-TREE-01: source: docs/spec/04-shell.md "Tabbed left pane"; docs/spec/05-canvas.md "A conditional component on the canvas" (a hidden node "is a row here"); docs/accessibility.md "Screen readers".
- BUILD-TREE-02, BUILD-TREE-03, BUILD-TREE-04: source: docs/accessibility.md "Keyboard"; e2e/keyboard.spec.ts "arrows walk the tree and step into containers" and "Home and End reach the ends"; packages/designer/src/keyboard.test.ts "focusTarget".
- BUILD-TREE-05: source: e2e/keyboard.spec.ts "focus selects, so the panels follow the keyboard"; packages/designer/src/panels/Tree.test.tsx "selects the row it moves to, so the panels follow". docs/accessibility.md "Keyboard" now says so too.
- BUILD-TREE-06: source: docs/accessibility.md "Keyboard".
- BUILD-TREE-07, BUILD-TREE-08, BUILD-TREE-09: source: docs/accessibility.md "Keyboard"; e2e/keyboard.spec.ts "Alt with the arrows reorders a component" and "Alt with the arrows moves a component in and out of a container"; packages/designer/src/keyboard.test.ts "moveTarget".
- BUILD-TREE-10: source: docs/spec/04-shell.md "The live region" ("refused moves"); e2e/keyboard.spec.ts "a move that cannot happen is announced rather than ignored"; packages/designer/src/keyboard.test.ts "refuses to move right into a sibling that takes no children". How the refusal is announced belongs to `A11Y`.
- BUILD-TREE-11, BUILD-TREE-12: source: docs/accessibility.md "Keyboard"; docs/spec/04-shell.md "Known conflict"; e2e/keyboard.spec.ts "Delete removes once, and one undo brings it back".
- BUILD-TREE-13: source: docs/spec/04-shell.md "Keyboard"; docs/spec/05-canvas.md "Selection toolbar"; e2e/keyboard.spec.ts "Control+D duplicates a component beside itself and focuses the copy". Where focus goes afterwards belongs to `A11Y`.
- BUILD-TREE-14: source: e2e/remove-buttons.spec.ts "a Remove button makes no tree row taller, and stays inside its row"; packages/designer/src/panels/Tree.tsx. Tests and code are the only source.
- BUILD-TREE-15: source: docs/spec/04-shell.md "Keyboard" (duplicate refused on the root); docs/spec/05-canvas.md "Selection toolbar" (the root "cannot be removed"); packages/designer/src/keyboard.test.ts "never moves the root"; e2e/keyboard.spec.ts "Control+D refuses the root rather than nesting a screen in itself".

## Undo (UNDO)

| ID            | Requirement                                                                                                                                 | Pri | Verify     | Status   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | -------- |
| BUILD-UNDO-01 | The system shall undo the most recent document edit when the author asks.                                                                   | P1  | Test       | Accepted |
| BUILD-UNDO-02 | The system shall redo an undone edit, restoring exactly the document that undo stepped back from.                                           | P1  | Test       | Accepted |
| BUILD-UNDO-03 | The system shall undo on Ctrl or Cmd with Z, and redo on Ctrl or Cmd with Shift and Z or with Y.                                            | P1  | Test       | Accepted |
| BUILD-UNDO-04 | The system shall not undo or redo from a shortcut pressed while the author is typing in a text field.                                       | P1  | Test       | Accepted |
| BUILD-UNDO-05 | The system shall let an author undo the last 100 document edits.                                                                            | P2  | Test       | Accepted |
| BUILD-UNDO-06 | The system shall record a run of consecutive edits to one property of one component as one undo step.                                       | P1  | Test       | Accepted |
| BUILD-UNDO-07 | The system shall start a new undo step when an edit is to a different property, a different component or the structure, or follows an undo. | P2  | Test       | Accepted |
| BUILD-UNDO-08 | The system shall decide where one undo step ends without regard to how quickly the edits were made.                                         | P2  | Inspection | Accepted |
| BUILD-UNDO-09 | The system shall record no undo step for an edit that changes nothing, including a refused move or rename.                                  | P1  | Test       | Accepted |
| BUILD-UNDO-10 | The system shall discard the edits available to redo when a new edit follows an undo.                                                       | P2  | Test       | Accepted |
| BUILD-UNDO-11 | The system shall record each addition, starting layout, move, duplicate or removal as one undo step.                                        | P1  | Test       | Accepted |
| BUILD-UNDO-12 | The system shall keep view changes, such as the selection, viewport, theme, canvas size and pane sizes, out of the undo history.            | P2  | Test       | Accepted |
| BUILD-UNDO-13 | The system shall apply every one of several edits made in the same instant, losing none.                                                    | P2  | Test       | Accepted |
| BUILD-UNDO-14 | The system shall not change a document version it has already handed to the host.                                                           | P1  | Test       | Accepted |
| BUILD-UNDO-15 | The system shall keep every component an edit did not touch identical, not copied, in the new document version.                             | P2  | Test       | Accepted |

- BUILD-UNDO-01, BUILD-UNDO-02: source: docs/spec/12-api.md "Undo"; packages/designer/src/store.regressions.test.ts "redo returns exactly the document undo stepped off".
- BUILD-UNDO-03, BUILD-UNDO-04: source: docs/spec/04-shell.md "Keyboard"; packages/designer/src/Designer.test.tsx "the undo and redo shortcuts".
- BUILD-UNDO-05: source: docs/spec/12-api.md "Undo"; packages/designer/src/store.test.ts "caps the stack, dropping the oldest entries".
- BUILD-UNDO-06, BUILD-UNDO-07, BUILD-UNDO-08: source: docs/spec/06-inspector.md "Editing granularity"; docs/spec/12-api.md "Undo"; e2e/authoring.spec.ts "typing a label is one undo step, not one per keystroke".
- BUILD-UNDO-09: source: docs/spec/01-document-model.md "Immutability and structural sharing"; packages/designer/src/store.regressions.test.ts "refused moves", "pushes no history entry for a refused rename" and "takes no undo slot for a property set to what it already was".
- BUILD-UNDO-10: source: packages/designer/src/store.test.ts "clears the redo future on a fresh edit". A test is the only source.
- BUILD-UNDO-11: source: docs/spec/04-shell.md "Starting layouts" ("one undoable action"); e2e/keyboard.spec.ts "Delete removes once, and one undo brings it back"; e2e/authoring-presets.spec.ts "adding a preset from the phone drawer reveals the inserted layout and undoes it as a whole". Undoing an applied import is DOC-JSON-11.
- BUILD-UNDO-12: source: docs/spec/04-shell.md "Resizable panes" and "Toolbar"; docs/spec/05-canvas.md "Fixed canvas sizes". Keeping view preferences out of the document itself is DOC-SAVE-04.
- BUILD-UNDO-13: source: packages/designer/src/store.regressions.test.ts "two different writers in one tick". A test is the only source.
- BUILD-UNDO-14, BUILD-UNDO-15: source: docs/spec/01-document-model.md "Immutability and structural sharing"; CLAUDE.md invariant 4; packages/designer/src/store.regressions.test.ts "undo and redo leave the arrays they read alone".

## The canvas while editing (CANV)

| ID            | Requirement                                                                                                                                | Pri | Verify     | Status   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --- | ---------- | -------- |
| BUILD-CANV-01 | The system shall draw the form on the canvas with the same kit components a respondent sees.                                               | P1  | Inspection | Accepted |
| BUILD-CANV-02 | The system shall draw a conditionally hidden component on the canvas while editing.                                                        | P1  | Test       | Accepted |
| BUILD-CANV-03 | The system shall draw the contents of a conditionally hidden container on the canvas while editing.                                        | P1  | Test       | Accepted |
| BUILD-CANV-04 | The system shall let an author select a conditionally hidden component on the canvas.                                                      | P1  | Test       | Accepted |
| BUILD-CANV-05 | The system shall accept a drop into a conditionally hidden container on the canvas.                                                        | P1  | Test       | Accepted |
| BUILD-CANV-06 | The system shall label the selection "Hidden in preview" when the selected component's own condition or a containing component's hides it. | P2  | Test       | Accepted |
| BUILD-CANV-07 | The system shall show that a component is hidden only in the selection's label, leaving the component's own appearance unchanged.          | P2  | Test       | Accepted |
| BUILD-CANV-08 | The system shall draw one row of a Repeater's contents on the canvas while editing, even when the Repeater has no answers.                 | P1  | Test       | Accepted |
| BUILD-CANV-09 | The system shall draw every Step on the canvas while editing.                                                                              | P1  | Test       | Accepted |
| BUILD-CANV-10 | The system should offer a step switcher on the canvas only when the form's conditions name at least two steps.                             | P2  | Test       | Accepted |
| BUILD-CANV-11 | The system should show, on the canvas of a form with no components, a guide to adding them that names the keyboard route through the tree. | P2  | Test       | Accepted |

- BUILD-CANV-01: source: docs/spec/05-canvas.md "Canvas" (the canvas renders the real runtime renderer).
- BUILD-CANV-02, BUILD-CANV-03: source: docs/spec/05-canvas.md "A conditional component on the canvas"; e2e/hidden.spec.ts "a hidden container stays on the canvas and says it is hidden"; packages/designer/src/panels/Canvas.test.tsx "is on the canvas while editing, so it can be seen and arranged". That Preview hides it again belongs to `PREV`.
- BUILD-CANV-04: source: docs/spec/05-canvas.md "A conditional component on the canvas"; packages/designer/src/panels/Canvas.test.tsx "is selectable on the canvas, not only through the tree".
- BUILD-CANV-05: source: docs/spec/05-canvas.md "A conditional component on the canvas"; e2e/hidden.spec.ts "something can still be dropped into a hidden container".
- BUILD-CANV-06, BUILD-CANV-07: source: docs/spec/05-canvas.md "A conditional component on the canvas"; e2e/hidden.spec.ts "a component that is shown carries no marker"; packages/designer/src/panels/Canvas.test.tsx "marks only the component the condition hides".
- BUILD-CANV-08: source: e2e/repeater.spec.ts "a repeater is authorable even though it has no rows" and its header ("edit mode draws one row"). Tests are the only source.
- BUILD-CANV-09: source: packages/designer/src/panels/Canvas.test.tsx "shows every step while editing, so all of them can be arranged"; docs/spec/05-canvas.md "The step switcher" ("Editing draws the component regardless").
- BUILD-CANV-10: source: docs/spec/05-canvas.md "The step switcher"; packages/designer/src/panels/Canvas.test.tsx "shows no switcher for a form that declares no steps". What the chosen step does in Preview belongs to `FLOW` and `PREV`.
- BUILD-CANV-11: source: docs/spec/05-canvas.md "Gaps" ("Empty state"); test/designer-preview.test.tsx.

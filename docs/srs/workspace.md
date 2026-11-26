# Designer workspace

The designer's layout around the canvas: its panes, its toolbar, how it behaves in a narrow space, and the rules it keeps with the host page it sits in. Area code `WORK`.

What undo does is `BUILD-UNDO`; the palette and the structure tree are `BUILD-PAL` and `BUILD-TREE`; the Inspector's tabs are `CONF-PROP-01`; the JSON dialog is `DOC-JSON`; offering Save only when the host handles saving is `DOC-SAVE-03`; keeping view preferences out of the document is `DOC-SAVE-04`; the canvas language control is `LOC-LANG-19`; a right-to-left designer is `LOC-DIR-07`. Preview, the viewport and fixed-size controls belong to `PREV`. The theme control, designer tokens, light and dark belong to `HOST`. Focus, tab order, announcements and contrast belong to `A11Y`.

## Panes (PANE)

| ID           | Requirement                                                                                                                       | Pri | Verify | Status   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| WORK-PANE-01 | The system shall arrange the designer as a toolbar above three side-by-side regions: the left pane, the canvas and the Inspector. | P1  | Test   | Accepted |
| WORK-PANE-02 | The system shall offer Components, Tree and Settings tabs in the left pane.                                                       | P1  | Test   | Accepted |
| WORK-PANE-03 | The system should open the left pane on its Components tab.                                                                       | P2  | Test   | Accepted |
| WORK-PANE-04 | The system shall offer the form's name, languages and default language on the Settings tab rather than in the Inspector.          | P2  | Test   | Accepted |
| WORK-PANE-05 | The system shall let an author change the form's name on the Settings tab.                                                        | P1  | Test   | Accepted |
| WORK-PANE-06 | The system should keep the starting layouts closed behind a Starting layouts disclosure until the author opens it.                | P3  | Test   | Accepted |
| WORK-PANE-07 | The system should show the starting layouts that match the palette search whether or not their disclosure is open.                | P3  | Test   | Accepted |
| WORK-PANE-08 | The system shall let an author collapse and reopen each side pane independently of the other.                                     | P1  | Test   | Accepted |
| WORK-PANE-09 | The system shall give the space of a collapsed side pane to the canvas.                                                           | P1  | Test   | Accepted |
| WORK-PANE-10 | The system shall keep the control that reopens a collapsed pane on screen while the pane is collapsed.                            | P1  | Test   | Accepted |
| WORK-PANE-11 | The system shall let an author resize each side pane independently by dragging the divider between it and the canvas.             | P1  | Test   | Accepted |
| WORK-PANE-12 | The system shall start each side pane at the host's default pane width, 288 pixels unless the host sets another.                  | P2  | Test   | Accepted |
| WORK-PANE-13 | The system shall keep each side pane's width between 240 and 560 pixels.                                                          | P1  | Test   | Accepted |
| WORK-PANE-14 | The system shall keep the canvas at least 320 pixels wide in a wide layout by narrowing the side panes while space is short.      | P1  | Test   | Accepted |
| WORK-PANE-15 | The system shall return the side panes to the widths the author chose once the space to show them returns.                        | P2  | Test   | Accepted |
| WORK-PANE-16 | The system shall widen or narrow a pane by 10 pixels with the arrow keys on its divider, or by 40 pixels with Shift held.         | P2  | Test   | Accepted |
| WORK-PANE-17 | The system shall set a pane to its narrowest or its widest available width when the author presses Home or End on its divider.    | P2  | Test   | Accepted |
| WORK-PANE-18 | The system shall restore a pane's default width when the author presses Enter on its divider or double-clicks the divider.        | P2  | Test   | Accepted |
| WORK-PANE-19 | The system shall return a pane to the width it had before a resize drag when the author presses Escape during the drag.           | P2  | Test   | Accepted |
| WORK-PANE-20 | The system shall leave the selection unchanged when Escape cancels a pane resize drag.                                            | P2  | Test   | Accepted |
| WORK-PANE-21 | The system shall remember each pane's chosen width across page loads in the same browser, for every form and kit it opens there.  | P2  | Test   | Accepted |
| WORK-PANE-22 | The system shall not remember a width from a resize drag that was cancelled.                                                      | P2  | Test   | Accepted |
| WORK-PANE-23 | The system shall ignore a remembered pane width it cannot use and start that pane at its default width.                           | P2  | Test   | Accepted |
| WORK-PANE-24 | The system shall keep pane resizing working for the session when the browser refuses to store the chosen width.                   | P2  | Test   | Accepted |
| WORK-PANE-25 | The system shall offer no resize divider for a pane that is collapsed or hidden.                                                  | P2  | Test   | Accepted |
| WORK-PANE-26 | The system shall show a reopened pane at the width it had before it was collapsed.                                                | P2  | Test   | Accepted |
| WORK-PANE-27 | The system shall restore each side pane's width and collapsed or open state, as they were before Preview, when Preview is left.   | P1  | Test   | Accepted |

- WORK-PANE-01: source: docs/spec/04-shell.md "Layout"; e2e/layout.spec.ts "pane handles remove the panes from layout and restore them". A configurable arrangement is out of scope (docs/spec/11-theming.md "What is not themeable").
- WORK-PANE-02: source: docs/spec/04-shell.md "Tabbed left pane"; e2e/keyboard.spec.ts "the left pane tabs are reachable and navigable by keyboard". The tablist's keyboard behaviour belongs to `A11Y`.
- WORK-PANE-03: source: docs/spec/04-shell.md "Tabbed left pane" (the palette is "the thing you reach for most often"); packages/designer/src/panels/LeftPane.tsx (the active tab starts at Components). The code is the only source for the starting tab.
- WORK-PANE-04: source: docs/spec/04-shell.md "Tabbed left pane" (Settings "has moved out of the inspector"). Adding, removing and choosing languages is `LOC-LANG-05`, `LOC-LANG-10` and `LOC-LANG-11`; the Settings tab's Form density control is `CONF` (see the note under `CAT-LAY-15`).
- WORK-PANE-05: source: docs/spec/04-shell.md "Toolbar" (Form name "edited on the Settings tab"); e2e/document.spec.ts "an edited document is applied"; e2e/layout.spec.ts "keeps the desktop shell within a laptop viewport with a long form name".
- WORK-PANE-06: source: docs/spec/04-shell.md "Starting layouts" ("collapsed by default"); e2e/authoring-presets.spec.ts "adding a preset from the phone drawer reveals the inserted layout and undoes it as a whole". Which starting layouts exist and what inserting one does is `BUILD-PAL-10`, `BUILD-PAL-11`, `BUILD-PAL-12` and `BUILD-PAL-13`.
- WORK-PANE-07: source: docs/spec/04-shell.md "Starting layouts" ("searching automatically reveals matching presets"); e2e/authoring-presets.spec.ts "presets are editable, exportable, and usable on a phone" (each preset is found by search with the disclosure closed).
- WORK-PANE-08, WORK-PANE-09, WORK-PANE-10: source: docs/spec/04-shell.md "Collapsible panes"; packages/designer/src/Designer.test.tsx "collapses each pane independently" and "leaves the grip reachable once the pane is gone"; e2e/layout.spec.ts "pane handles remove the panes from layout and restore them". Removing a collapsed pane from the accessibility tree belongs to `A11Y`.
- WORK-PANE-11, WORK-PANE-12, WORK-PANE-13: source: docs/spec/04-shell.md "Layout"; e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form". The default width is the `--fs-panel-width` token (docs/spec/11-theming.md "Designer tokens").
- WORK-PANE-14, WORK-PANE-15: source: docs/spec/04-shell.md "Layout" ("panels temporarily shrink when necessary without overwriting the user's preferred widths"); e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form" (at 960 pixels wide, and back at 1600).
- WORK-PANE-16, WORK-PANE-17, WORK-PANE-18: source: docs/spec/04-shell.md "Resizable panes"; e2e/panel-resize.spec.ts "keyboard resizing, canceled drags, and default reset keep selection and accessible separator values intact". End reaches the widest width the 320-pixel canvas minimum allows, which may be less than 560. The divider's name and announced values belong to `A11Y`.
- WORK-PANE-19, WORK-PANE-20, WORK-PANE-22: source: docs/spec/04-shell.md "Resizable panes" ("Escape cancels an active drag without clearing the selected component", "canceled drags do not" save); e2e/panel-resize.spec.ts "keyboard resizing, canceled drags, and default reset keep selection and accessible separator values intact".
- WORK-PANE-21: source: docs/spec/04-shell.md "Resizable panes" ("shared across forms and kits on the same origin"); e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form". Keeping widths out of the document is `DOC-SAVE-04`, and out of undo is `BUILD-UNDO-12`.
- WORK-PANE-23, WORK-PANE-24: source: docs/spec/04-shell.md "Resizable panes" ("Invalid preferences are ignored, and unavailable storage leaves resizing functional for the session"); e2e/panel-resize.spec.ts "invalid saved widths recover and resizing survives blocked storage".
- WORK-PANE-25, WORK-PANE-26: source: docs/spec/04-shell.md "Resizable panes" ("collapse and Preview preserve saved widths, and hidden panels have no resize handle"); e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form".
- WORK-PANE-27: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("Returning to editing restores those preferences"); e2e/focused-preview.spec.ts "Preview preserves editing panels and keeps diagnostics optional"; e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form". That Preview hides the panes, and where focus lands on leaving it, belong to `PREV` and `A11Y`.

## Toolbar (BAR)

| ID          | Requirement                                                                                                          | Pri | Verify | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| WORK-BAR-01 | The system shall show the form's name in the toolbar.                                                                | P2  | Test   | Accepted |
| WORK-BAR-02 | The system shall shorten a form name too long for the toolbar rather than push the toolbar's controls out of view.   | P2  | Test   | Accepted |
| WORK-BAR-03 | The system shall wrap the toolbar's controls onto further lines when the toolbar is too narrow to hold them on one.  | P2  | Test   | Accepted |
| WORK-BAR-04 | The system shall offer Undo and Redo controls in the toolbar.                                                        | P1  | Test   | Accepted |
| WORK-BAR-05 | The system shall disable the Undo control while there is no edit to undo.                                            | P1  | Test   | Accepted |
| WORK-BAR-06 | The system shall disable the Redo control while there is no undone edit to redo.                                     | P1  | Test   | Accepted |
| WORK-BAR-07 | The system shall open the form's JSON dialog from a JSON control in the toolbar.                                     | P1  | Test   | Accepted |
| WORK-BAR-08 | The system shall hand the host the document as it stands, including every edit so far, when the author chooses Save. | P1  | Test   | Accepted |

- WORK-BAR-01: source: docs/spec/04-shell.md "Toolbar" (Form name "Shown"); e2e/document.spec.ts "an edited document is applied".
- WORK-BAR-02: source: docs/spec/04-shell.md "Layout" ("long form names truncate"); e2e/layout.spec.ts "keeps the desktop shell within a laptop viewport with a long form name".
- WORK-BAR-03: source: docs/spec/04-shell.md "Layout" ("Toolbar controls wrap when space is limited"). No test checks the wrap itself.
- WORK-BAR-04: source: docs/spec/04-shell.md "Toolbar"; e2e/authoring-presets.spec.ts "adding a preset from the phone drawer reveals the inserted layout and undoes it as a whole". What undo and redo do is `BUILD-UNDO-01` and `BUILD-UNDO-02`; their shortcuts are `BUILD-UNDO-03`.
- WORK-BAR-05: source: docs/spec/04-shell.md "Toolbar" ("Disabled when there is nothing to undo"); e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form"; test/designer-preview.test.tsx "does not delete the selected component from a preview button".
- WORK-BAR-06: source: packages/designer/src/Designer.tsx (Redo is disabled without a redo). The code is the only source; docs/spec/04-shell.md "Toolbar" states the disabled state for undo only.
- WORK-BAR-07: source: docs/spec/04-shell.md "Toolbar" ("Opens the document dialog"); e2e/document.spec.ts "the dialog opens showing the current document". The dialog itself is `DOC-JSON`.
- WORK-BAR-08: source: docs/spec/04-shell.md "Toolbar" ("Calls the `onSave` prop"); docs/spec/12-api.md "Embedding the designer"; packages/designer/src/Designer.test.tsx "hands the host the current document". Showing Save only when the host handles saving is `DOC-SAVE-03`.

## Narrow layouts (NARR)

| ID           | Requirement                                                                                                                              | Pri | Verify | Status   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| WORK-NARR-01 | The system shall show the left pane and the Inspector as drawers whenever the designer itself is narrower than 960 pixels.               | P1  | Test   | Accepted |
| WORK-NARR-02 | The system shall offer, in a narrow layout, a Components and structure control and a Component properties control that open each drawer. | P1  | Test   | Accepted |
| WORK-NARR-03 | The system shall give the canvas the designer's full width in a narrow layout while no drawer is open.                                   | P1  | Test   | Accepted |
| WORK-NARR-04 | The system shall show in each drawer the same pane, with the same tabs, that a wide layout shows.                                        | P1  | Test   | Accepted |
| WORK-NARR-05 | The system shall close an open drawer from a close button inside it.                                                                     | P1  | Test   | Accepted |
| WORK-NARR-06 | The system shall close an open drawer when the author presses Escape.                                                                    | P1  | Test   | Accepted |
| WORK-NARR-07 | The system shall close the drawer once a component is added from its palette.                                                            | P2  | Test   | Accepted |
| WORK-NARR-08 | The system shall close the drawer once a starting layout is inserted from it.                                                            | P2  | Test   | Accepted |
| WORK-NARR-09 | The system may leave dragging from the palette out of a narrow layout, where palette entries add by click or keyboard activation.        | P3  | Test   | Accepted |
| WORK-NARR-10 | The system shall offer no pane resize divider and no collapse control in a narrow layout.                                                | P2  | Test   | Accepted |
| WORK-NARR-11 | The system shall restore the wide layout's pane widths and collapsed or open states when the designer grows back to 960 pixels or wider. | P2  | Test   | Accepted |

- WORK-NARR-01: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("Below 960px of shell width"); e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form" (at 800 pixels wide); e2e/focused-preview.spec.ts "phone authoring panels are keyboard-accessible drawers and leave Preview usable". The breakpoint is the designer's own width, not the window's (packages/designer/src/ResponsivePanel.tsx); no test sizes the designer apart from the window. Drafted to "require drawers only", the recommendation still awaiting the developer.
- WORK-NARR-02: source: docs/spec/04-shell.md "Narrow layouts and Preview"; e2e/focused-preview.spec.ts "phone authoring panels are keyboard-accessible drawers and leave Preview usable". That Preview hides these controls belongs to `PREV`.
- WORK-NARR-03: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("They leave the canvas width available when closed"); e2e/focused-preview.spec.ts "phone authoring panels are keyboard-accessible drawers and leave Preview usable". The test measures the canvas width only in Preview.
- WORK-NARR-04: source: docs/spec/04-shell.md "Narrow layouts and Preview"; e2e/focused-preview.spec.ts "phone authoring panels are keyboard-accessible drawers and leave Preview usable" (a palette entry is used inside the drawer); e2e/authoring-presets.spec.ts "adding a preset from the phone drawer reveals the inserted layout and undoes it as a whole".
- WORK-NARR-05, WORK-NARR-06: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("Each drawer has a close button ... closes with Escape"); e2e/focused-preview.spec.ts "phone authoring panels are keyboard-accessible drawers and leave Preview usable". The test presses Escape but never clicks the close button. Trapping focus in a drawer and returning it to the opener belong to `A11Y`.
- WORK-NARR-07: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("Adding a palette component closes the drawer so the result is visible"); e2e/focused-preview.spec.ts "phone authoring panels are keyboard-accessible drawers and leave Preview usable".
- WORK-NARR-08: source: docs/spec/04-shell.md "Starting layouts" ("closes a narrow-layout drawer"); e2e/authoring-presets.spec.ts "adding a preset from the phone drawer reveals the inserted layout and undoes it as a whole".
- WORK-NARR-09: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("on narrow layouts palette insertion uses its click/keyboard action"); packages/designer/src/Designer.tsx (a palette drag starts only outside a narrow layout). No test checks it. Adding by click or keyboard is `BUILD-PAL-04`.
- WORK-NARR-10: source: docs/spec/04-shell.md "Narrow layouts and Preview"; e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form" (no separator at 800 pixels). The absence of collapse controls: the code is the only source (packages/designer/src/Designer.tsx).
- WORK-NARR-11: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("Desktop collapsed-panel preferences are independent of drawer state"); e2e/panel-resize.spec.ts "both panel widths persist across reload, kits, preview, collapse, and smaller windows without changing the form" (widths return at 1600). No test checks that a collapsed pane stays collapsed across the breakpoint.

## Designer-wide behaviour (SHELL)

| ID            | Requirement                                                                                                                                                                                            | Pri | Verify     | Status   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ---------- | -------- |
| WORK-SHELL-01 | The system shall respond to its keyboard shortcuts only while keyboard focus is inside the designer.                                                                                                   | P1  | Test       | Accepted |
| WORK-SHELL-02 | The system shall keep its keyboard shortcuts working after the author clicks a component or empty space on the canvas.                                                                                 | P1  | Test       | Accepted |
| WORK-SHELL-03 | The system shall not act on its own shortcuts while one of its dialogs is open.                                                                                                                        | P2  | Test       | Accepted |
| WORK-SHELL-04 | The system shall not act on its document-editing shortcuts in Preview.                                                                                                                                 | P1  | Test       | Rejected |
| WORK-SHELL-05 | The system shall keep its content within the space the host gives it, scrolling inside its panes and canvas rather than scrolling the host page.                                                       | P1  | Test       | Accepted |
| WORK-SHELL-06 | The system shall draw its overlays on the canvas, such as the selection frame, selection toolbar, drop indicator and drag label, beneath any host element stacked above the designer, such as a modal. | P1  | Test       | Accepted |
| WORK-SHELL-07 | The system shall open its own dialogs and drawers above all other content on the host page.                                                                                                            | P1  | Test       | Accepted |
| WORK-SHELL-08 | The system should draw thin scrollbars in the designer's own colours in its panes and on its canvas.                                                                                                   | P3  | Inspection | Accepted |
| WORK-SHELL-09 | The system shall leave a scrollable region inside the form on the canvas with the scrollbars its kit gives it, not the designer's.                                                                     | P2  | Test       | Accepted |

- WORK-SHELL-01: source: docs/spec/04-shell.md "Known conflict" ("Shell-level, not window-level"; a builder on `window` "took that page's undo away"); packages/designer/src/Designer.tsx (`useKeyboardShortcuts`). No test presses a key on the host page outside the designer. Which shortcuts exist is `BUILD-UNDO-03`, `BUILD-SEL-10`, `BUILD-SEL-13` and `BUILD-TREE-13`.
- WORK-SHELL-02: source: e2e/keyboard.spec.ts "Control+Z undoes after a click on the canvas" and "Delete removes a component selected by clicking a field on the canvas"; packages/designer/src/Designer.tsx (the shell takes focus on a canvas press). Tests and code are the only source.
- WORK-SHELL-03: source: packages/designer/src/Designer.tsx (shortcuts ignore a target inside an open dialog). The code is the only source.
- WORK-SHELL-04: source: docs/spec/04-shell.md "Narrow layouts and Preview" ("Preview disables shell document-editing shortcuts"); test/designer-preview.test.tsx "does not delete the selected component from a preview button". May overlap `PREV`; kept here because it scopes the shortcuts.
- WORK-SHELL-05: source: docs/spec/04-shell.md "Layout" ("scrolling stays within the designer's panes and canvas") and "Resizable panes" (the full-screen demo); e2e/layout.spec.ts "the full-screen demo keeps scrolling inside the designer" and "keeps the desktop shell within a laptop viewport with a long form name".
- WORK-SHELL-06: source: docs/spec/04-shell.md "Stacking"; e2e/canvas.spec.ts "a modal of the host covers the selection toolbar". A host element placed before the designer that must cover it needs its own stacking order, which is the host's obligation.
- WORK-SHELL-07: source: docs/spec/04-shell.md "Stacking" ("The shell's own dialogs and drawers open in the browser's top layer"); e2e/document.spec.ts "the JSON dialog is modal, not merely open". No test checks a drawer against a stacked host element.
- WORK-SHELL-08: source: docs/spec/11-theming.md "Scrollbars"; docs/spec/04-shell.md "Scrollbars". The thumb's contrast belongs to `A11Y`; its token belongs to `HOST`.
- WORK-SHELL-09: source: docs/spec/11-theming.md "Scrollbars" (the canvas surface resets both properties for kit components); packages/designer/src/designer.css.test.ts (pins `.fs-canvas__surface [data-fs-key]` to the scrollbar properties). CLAUDE.md invariant 3.

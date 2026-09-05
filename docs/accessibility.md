# Accessibility

What has been checked, how, and what is still missing. The point of writing it down is that "we care
about accessibility" is not a claim anyone can verify, and most of what follows is enforced by tests
rather than by intention.

Target is WCAG 2.2 AA.

## Ordinary authoring properties

Authors configure labels, help text, validation, image alternative text, and action or region names. Kits generate the semantic markup, IDs, and accessibility associations on the intended controls. There is no planned generic ARIA or HTML attribute editor. The [kit acceptance requirements](spec/02-kit-contract.md#accessibility-from-ordinary-properties) define the cross-kit audit still to complete; this scope decision is not a claim of full conformance.

## Enforced by tests

These fail the build, not a review.

| Check                                                                         | Where                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Contrast for both stylesheets, in both themes                                 | `test/contrast.test.ts`                             |
| Every button in the designer shell has an accessible name                     | `packages/designer/src/panels/Tree.test.tsx`        |
| Every form control in the shell has a label                                   | same                                                |
| Landmarks carry accessible names                                              | same                                                |
| One tab stop for the whole structure tree                                     | same                                                |
| Arrow-key navigation and keyboard moves                                       | same, plus `packages/designer/src/keyboard.test.ts` |
| The live region is polite, is a status region, and repeats identical messages | same                                                |
| Inspector tabs are a real tablist with roving tabindex and arrow keys         | `packages/designer/src/panels/Rules.test.tsx`       |
| axe-core over the whole designer in twelve states                             | `test/a11y.test.tsx`                                |
| Focus really lands where it should, in a real browser                         | `e2e/keyboard.spec.ts`                              |
| The JSON dialog is modal, traps focus and closes on Escape                    | `e2e/document.spec.ts`                              |

Two of those twelve axe states draw the form with `@formsmith/kit-mui` rather than the HTML kit. Nothing
in this repository put a MUI form in front of axe before, so the kit most consumers will use was covered
only by the hand-written rules in `test/kit-contract.test.tsx` -- which are, by construction, the ones
somebody thought of.

The dialog row is in a browser and not in the axe pass on purpose. jsdom has no `<dialog>`, so
`test/a11y.test.tsx` polyfills `showModal()` as `this.open = true`: there is no top layer, no inert
background and no `::backdrop` there, and the properties this document credits to the browser are
exactly the ones that environment cannot provide.

## Contrast

Measured from the stylesheets themselves, so a token change that breaks a ratio fails CI. Lowest
measured value in each palette:

| Palette         | Lowest ratio | Pair                                     |
| --------------- | ------------ | ---------------------------------------- |
| Designer, light | 3.35:1       | scrollbar thumb on the well, needs 3:1   |
| Designer, dark  | 3.65:1       | scrollbar thumb on the panel, needs 3:1  |
| HTML kit, light | 4.24:1       | warning stripe on the surface, needs 3:1 |
| HTML kit, dark  | 4.15:1       | field border on the field, needs 3:1     |

Each row is the lowest pair the suite asserts in that palette, and the two designer rows are user
interface components rather than text, so 3:1 is the floor they have to clear. Body text is well above
it: the lowest text pair is muted text on the well at 5.25:1 light. Quoting that figure as the minimum,
which this table used to, made the designer look safer than it is.

These four figures are computed rather than transcribed. `test/contrast.test.ts` records every pair it
measures and compares the lowest in each palette against this table, so a token change that stays above
the floor cannot leave the numbers here quietly wrong. The light row for the HTML kit was: it said
4.83:1, the field border, while the warning stripe sat half a point below it at 4.24:1.

The primary button label, which the prior-art study recorded at 3.03:1 in the product this project
studied, sits at 5.49:1 light and 6.39:1 dark. See `docs/prior-art`.

## Keyboard

The Tree and panels are the supported keyboard authoring interface: palette buttons add components, the Tree selects and rearranges them, and the panels edit their properties. Canvas and Tree selection stay synchronized. Direct keyboard selection of rendered canvas nodes is outside scope. The form's own controls remain keyboard-operable in Preview, and equivalent authoring operations, clear focus, and understandable announcements remain requirements.

| Key                                                 | Does                                                      |
| --------------------------------------------------- | --------------------------------------------------------- |
| Arrow up / down                                     | Move through the structure tree, stepping into containers |
| Arrow right / left                                  | Into the first child, out to the parent                   |
| Home / End                                          | First and last row                                        |
| Alt + arrow up / down                               | Reorder among siblings                                    |
| Alt + arrow right                                   | Move into the container above                             |
| Alt + arrow left                                    | Move out one level, landing after the parent              |
| Enter / Space                                       | Select the focused row                                    |
| Delete / Backspace                                  | Remove the focused component                              |
| Ctrl or Cmd + D                                     | Duplicate the focused component, beside itself            |
| Ctrl or Cmd + Z, Shift + Z, Y                       | Undo and redo                                             |
| Escape                                              | Clear the selection, or abandon a drag                    |
| Arrow left / right, Home, End on the inspector tabs | Move between tabs                                         |

Drag and drop is a pointer gesture with no standard keyboard equivalent, and WAI-ARIA does not define
one. The Alt-plus-arrow moves are the outliner convention from editors and file trees, chosen because
people already know it. Without them, every rearrangement in this builder would need a mouse.

## Screen readers

- The structure tree is a real `role="tree"` with `aria-level`, `aria-selected`, and `aria-expanded`.
- The inspector is a real `role="tablist"`, with panels and tabs pointing at each other in both
  directions.
- The JSON editor is a native `<dialog>` opened with `showModal()`, so focus trapping, Escape, the inert
  background, and the backdrop come from the browser rather than from code that has to be maintained.
- A polite live region announces canvas selections, keyboard moves, refused moves, additions, and
  removals. Tree navigation is deliberately not announced there: focus lands on the row, which a screen
  reader reads on arrival, and a second announcement would say everything twice.
- Identical consecutive announcements get a zero-width space appended, because an unchanged live region
  is never read out and a second identical move would otherwise be silent.

## Kits own their own accessibility

The renderer knows nothing about the markup a kit produces, so it cannot supply labels or error wiring.
`@formsmith/kit-html` does it properly and is the reference: a real `<label for>` per field,
`aria-invalid` on a failing field, `aria-describedby` pointing at a message element that always exists,
`role="alert"` on the message, and a visible focus ring on everything interactive.

The message element is rendered even when empty so that `aria-describedby` never points at a missing
node, which is why an error appearing later is picked up rather than ignored.

## What the audit caught

Worth recording, because it is the argument for having one. axe found a serious-impact violation the
hand-written tests could not: the properties panel marked a modified field with
`<span aria-label="Modified">`, and ARIA prohibits `aria-label` on an element with no role. A screen
reader ignored it completely. It looked handled and announced nothing. The dot is now decorative and the
word is visually hidden text inside the label.

## Known gaps

Verification gaps remain even with a defined keyboard authoring path.

- **The full ordinary-property acceptance audit is incomplete.** Existing checks cover several label, description, required/invalid, and error behaviors. The [kit contract](spec/02-kit-contract.md#accessibility-from-ordinary-properties) additionally requires checking the applicable cases across both kits, translations, repeated rows, and multiple rendered forms, plus browser focus and screen-reader behavior.

- **The automated audit cannot see layout.** axe-core runs over the designer in twelve states: at rest,
  with a component selected, on the Rules, Settings and Style tabs, with a condition being edited, in
  validated preview, with both panes collapsed, and with the JSON dialog open. jsdom has no
  rendering engine, so `color-contrast`, `target-size`, and `scrollable-region-focusable` are disabled by
  name rather than reporting nothing useful. Contrast is covered separately by computing the ratios from
  the stylesheets. Running axe in a real browser would close the rest.
- **No screen reader has actually been used.** Everything above is verified from the DOM and from the
  spec, which catches wiring mistakes but not awkward phrasing or a confusing reading order.
- **The palette is a plain list of buttons.** Reachable by Tab, but with no grouping semantics, so its
  category headings are visual only.
- **Reduced motion is handled where something moves, and nowhere else.** The HTML kit's stylesheet has a
  `prefers-reduced-motion` block for its own transitions. The designer chrome has none, because nothing
  in it animates; the moment something does, that is the first thing to write.
- **No skip link** past the palette to the canvas.
- **Colour is load-bearing in one place**: the drop indicator during a drag is a coloured bar with no
  other signal. It is transient and pointer-only, so it affects nobody using the keyboard path, but it
  would fail a strict reading of "not by colour alone".

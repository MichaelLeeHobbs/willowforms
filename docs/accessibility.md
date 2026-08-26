# Accessibility

What has been checked, how, and what is still missing. The point of writing it down is that "we care
about accessibility" is not a claim anyone can verify, and most of what follows is enforced by tests
rather than by intention.

Target is WCAG 2.2 AA.

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
| axe-core over the whole designer in six states                                | `test/a11y.test.tsx`                                |
| Focus really lands where it should, in a real browser                         | `e2e/keyboard.spec.ts`                              |

## Contrast

Measured from the stylesheets themselves, so a token change that breaks a ratio fails CI. Lowest
measured value in each palette:

| Palette         | Lowest ratio | Pair                                 |
| --------------- | ------------ | ------------------------------------ |
| Designer, light | 5.25:1       | muted text on the well background    |
| Designer, dark  | 5.05:1       | focus ring on the panel, needs 3:1   |
| HTML kit, light | 4.83:1       | field border on the field, needs 3:1 |
| HTML kit, dark  | 4.15:1       | field border on the field, needs 3:1 |

The primary button label, which the prior-art study recorded at 3.03:1 in the product this project
studied, sits at 5.49:1 light and 6.39:1 dark. See `docs/prior-art`.

## Keyboard

The whole builder is reachable without a pointer.

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
| Ctrl or Cmd + D                                     | Duplicate the focused component in beside itself          |
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

Honest list. None of these are hard, they are simply not done.

- **The automated audit cannot see layout.** axe-core runs over the designer at rest, with a component
  selected, on the Rules and Form tabs, in validated preview, and with the JSON dialog open. jsdom has no
  rendering engine, so `color-contrast`, `target-size`, and `scrollable-region-focusable` are disabled by
  name rather than reporting nothing useful. Contrast is covered separately by computing the ratios from
  the stylesheets. Running axe in a real browser would close the rest.
- **No screen reader has actually been used.** Everything above is verified from the DOM and from the
  spec, which catches wiring mistakes but not awkward phrasing or a confusing reading order.
- **The canvas is not keyboard reachable.** Components are selected there by pointer only; the tree is
  the keyboard path to the same thing. Reaching the canvas by keyboard would need a roving tabindex over
  rendered nodes, which fights with the kit's own focusable controls.
- **The palette is a plain list of buttons.** Reachable by Tab, but with no grouping semantics, so its
  category headings are visual only.
- **No reduced-motion handling**, because nothing currently animates. Worth remembering before anything
  does.
- **No skip link** past the palette to the canvas.
- **Colour is load-bearing in one place**: the drop indicator during a drag is a coloured bar with no
  other signal. It is transient and pointer-only, so it affects nobody using the keyboard path, but it
  would fail a strict reading of "not by colour alone".

# The 2026-08-30 review, worked through

A deep review of the whole repository produced 428 findings on 2026-08-30. This is what happened to
them. The queue that drove it is `docs/build-out/queue.md`, frozen before the first commit; the contract
it followed is `docs/build-out/RUN.md`.

**402 fixed, 21 triaged, 428 accounted for.** 32 commits on `build-out/review-2026-08-30`, 120 files,
about 15,900 lines added. The suite went from 911 unit tests to 1,500 and from 65 browser tests to 68.

## What the run was actually for

Not the count. Two thirds of these findings are a sentence in a comment or a missing test, and a review
that produces 428 of anything is mostly noise unless somebody reads each one against the code. The
findings worth the exercise fell into a few shapes, and the shapes repeat:

**A check that cannot fail.** The largest single category, and the reason the test suite grew by 589
tests rather than by 60 fixes. The malformed-document table in `tree.test.ts` asserted "some error was
reported" and one of its rows was satisfied by an error the mutation did not cause. The end-to-end test
named "typing a label is one undo step" used `fill()`, which dispatches one event, so the coalescing it
names was never exercised. The scroll test never checked that the surface scrolled. The kit contract
found `aria-invalid` on a `Repeater`'s container -- where it is inert -- and passed. Each of these was a
guard reporting a hole as a fix.

**A silent permissive answer.** `submittedData` wrote `key: []` for a repeater whose value was not a
list, inventing an answer nobody gave. `optionValue` mapped one submitted string to two options. A
`renderWhen` this panel could not author displayed as "Always" and could not be removed. `moveNode`
would move a component into a leaf, producing a subtree no renderer draws while `validateForm` keeps
walking it. None of these throws; all of them make a form quietly ask for, or accept, the wrong thing.

**A document that disagrees with the code.** All three validation entry points were documented with an
evaluator as the last parameter; it is an options bag, and passing a function positionally silently
drops every custom rule. The contrast table quoted 5.25:1 as the designer's worst pair when the real
figure is 3.35:1. The catalogue was described as 25, 26 and 27 components in three files. A section read
Planned above a bullet reading Built.

**A rule the code claims and does not have.** `repointBinding` rewrote every literal equal to the old
key while `duplicateNode`'s own comment explained why it must not -- so renaming a component silently
rewrote conditions about answers. `safeDeclarations` allowed `url()` while the single-value sink refused
it, so the refusal could be walked around one field over.

## The changes a user would notice

- The designer's own control borders were at 1.39:1 against the surfaces they sit on, where WCAG 1.4.11
  asks 3:1 -- a text field was identified by a border nobody could see. There is a `--fs-control-border`
  token now, separate from the divider colour.
- The device frame carried `overflow: hidden` and a background, so at tablet and mobile the canvas
  clipped focus rings, broke every `position: sticky` in the form, and painted the designer's colour
  behind a kit that has one.
- The drop indicator and the selection frame shared a stacking context with the rendered form, and
  MUI's `AppBar` defaults to `z-index: 1100`: a drag over one had no visible target.
- Dragging one of exactly two children of a row put it back where it started, every time, because the
  axis was inferred from the siblings left after the dragged node was removed.
- Selecting a component from the tree scrolled the host's page, not just the canvas.
- A rule's numeric parameter could not be cleared to retype: `Number('')` is `0`, so backspacing the
  last digit set `minLength` to zero.
- Copy and Download in the JSON dialog handed over the stored document rather than the draft.
- A MUI select had no empty option, so a non-required field could be answered and never unanswered.
- `maxSize` on a file input was a number in a panel whose own hint admitted it did nothing.

## The mechanisms, not the fixes

Four things now fail the build that could not before, which matters more than any individual repair:

1. **The documented suite size is checked against the suite.** Three documents quote it and the test
   compared them with each other. No test can count the run it belongs to, so this is a reporter
   (`test/count-reporter.ts`): it fails the process on a mismatch and skips itself on a filtered run,
   saying which it did.
2. **Invariant 3 is enforced as written.** The CSS guard could not see a bare `input {}` at file scope,
   because its reach check needs a scope to reach from. Every selector must now name an `fs-` class, and
   `declarationsFor` reads every block a selector has rather than the first.
3. **The contrast instrument is calibrated.** Every ratio in the suite came out of twenty lines of
   arithmetic that nothing checked; it is pinned against WCAG's own reference values now, including the
   `0.03928` branch. `tokensFrom` throws for a selector nobody wrote instead of measuring an empty
   palette.
4. **The accessibility document is compared with the suite it describes.** It claimed six axe states
   over an enumeration of five; there are nine, two of them added here -- the Style tab and the
   condition editor, the two most ARIA-dense panels in the designer, which had never been audited.

## What was refused, and why

21 findings are in `docs/build-out/triage.md` with a reason each. The honest summary: five are
performance notes over lists of a few dozen entries with no defect behind them; four are type-level
improvements that cannot survive contact with a document, which is untrusted data and needs a total
runtime answer whatever the type says; three describe behaviour that had already been fixed; three need
a piece of infrastructure rather than a test (a browser axe pass, a linear-time regex engine, a
forced-colors sweep); and one was simply wrong -- it read a rendered non-breaking space as an ordinary
one.

Two are worth reading before touching the code they name. The `pattern` rule is unanchored, matching
JSON Schema and not `<input pattern>`, and it stays that way because anchoring it would make the engine
disagree with the schema the same document exports. And bounds-checking a canvas release against the
surface's client box broke a real drop: the canvas scrolls, so a drop onto the last component of a long
form lands below the visible box while sitting squarely inside the form.

## What is left

`docs/build-out/found.md` is the hand-over. Eight entries, found while working and deliberately not
fixed, because each is a design decision rather than a repair. The two that matter most:

- **A repeater's rows cannot be reached in the designer at all.** No kit renders an add-row control,
  edit mode swallows keystrokes, and preview starts with empty data. `Repeater` is described as built,
  and a component whose rows nobody can create is built only in the sense that it renders.
- **Renaming a component leaves every condition that named its answer dangling.** A rename moves the
  answer name with the key, and nothing follows it. Three defensible fixes, and choosing between them
  decides what a key is.

`docs/decisions.md` gained five entries during the run, each recording a choice that changes behaviour
rather than a repair.

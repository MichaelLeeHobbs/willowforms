# The 2026-08-30 second-pass review, worked through

A second deep review of the whole repository produced 542 findings: 4 critical, 52 high, 174 medium, 171
low and 141 notes, across all 176 tracked files. This is what happened to them. The queue that drove it is
`docs/build-out/queue.md`, frozen before the first commit; the contract it followed is
`docs/build-out/RUN.md`.

**53 commits on `build-out/review-b`, 154 files, about 31,400 lines added.** The suite went from 1,500
unit tests to 1,967 and from 68 browser tests to 78. Everything else in this document is about what those
numbers were for.

## What the second pass was actually for

The first review found defects. This one found the shape they leave behind.

Nearly every finding worth the exercise had one of two forms, and they turn out to be the same form seen
from two ends:

**A fix that landed on one side of a symmetry.** `duplicateNode` re-pointed a condition and the designer's
rename did not. `aria-invalid` reached the element a screen reader announces and `aria-required` reached
its `InputBase` wrapper. `visitShape` moved outside the key chain and `visitEvents` stayed in. The two kits
agreed on a heading's rank in their palettes and disagreed in their fallbacks. Each pair had one half
fixed, with a passing test beside it, for as long as the pair had existed.

**A guard that was not re-checked against the code it now guards.** The invariant-3 CSS test named
`.fs-shell` and `.fs-canvas__surface` while the form had moved into `.fs-canvas__frame`. The kit contract
read an attribute the error boundary's fallback also emits, so replacing a whole kit renderer with
`throw new Error()` left 211 tests green. The artefact check asserted files exist and never loaded one, so
`@formsmith/kit-mui` was unimportable under MUI 6 with CI green. The count reporter watched three documents
and the fourth -- the one `CLAUDE.md` sends every contributor to -- was unwatched.

The pattern is not carelessness. It is what happens when the thing being checked moves and the check does
not, and the only way to find it is to run the check against code that should fail it.

## What a user of the designer would notice

Ordered by how likely somebody is to hit it.

- **A required MUI `Select` announced nothing.** `aria-required` sat on the `InputBase` root, which has no
  role, so a screen reader was told the control was optional. `aria-invalid` arrives on the combobox by
  itself, which is why only half of this was ever visible.
- **A computed condition inside a repeater hid its field in every row.** It was evaluated against the
  form's data rather than the row's, so it read an absent key, came back falsy, and took the field out of
  `validateForm` with it -- a required answer quietly becoming optional, on the server.
- **Deleting a container from the tree dropped focus onto the page.** The row it restored focus to was the
  deleted node's own child, so every subsequent arrow key went nowhere.
- **Every freshly dropped `RadioItem` rendered pre-checked**, all at once, because an unanswered group's
  selection and the item's default value are both the empty string.
- **The JSON dialog's Revert left the errors from a draft that was no longer on screen**, with no way to
  clear them short of closing the dialog.
- **Duplicating twice in one tick produced two components with the same key**, which makes every later tree
  operation edit the first match, silently.
- **A cancelled drag's trailing click selected whatever was under the pointer.** Escape and window loss
  both marked the gesture abandoned; `pointercancel` did not.
- **A wizard's exported schema required nothing.** Every `Step` carries a `renderWhen`, and a rule on a
  node that can be hidden is dropped from `required` -- correctly, and the specification said the only
  lossy cases were `custom` and guarded rules.
- **The demo server had no shutdown at all**, so `docker stop` during a write left the half-written store
  its own reader refuses.

## Guards that can now fail

The tests this run is proudest of are the ones that were watched failing first.

- **The CSS isolation guard** is an allowlist of what is _not_ the form, so a new wrapper is refused rather
  than waved through -- and both of its readers walk braces rather than matching a regex, because the two
  that matched regexes each had a hole: one could not tell a rule inside `@media` from one beside it, and
  the other split a prelude on a comma inside `:is()`.
- **The kit contract cannot be turned off by a kit.** Four rules opened with a bare `return` when the kit
  did not offer the component they drive, and two `it.each` tables were built by filtering, which registers
  no tests at all when empty. Both are named lists now, both fail rather than skip.
- **`check-dist.mjs` imports every built package** and checks that the shipped source maps resolve to
  shipped files. It is the first thing in the repository that reads what a consumer installs.
- **The documented end-to-end count is checked against the spec files**, not against the other documents,
  because three documents agreeing is satisfied by all three being wrong -- and they were.
- **The events table, both token tables, the disabled axe rules, the two obligation tables and the decision
  log's shape** are each checked against the thing they describe.
- **CI builds the playground**, which is the only thing that imports the two stylesheets by their published
  subpaths -- so the anchored-alias failure `aliases.ts` describes would have reached a release rather than
  a run. It also no longer retries a failed browser test, no longer cancels a `main` build, and cannot hang
  a runner for six hours.

- **`tsc --build` builds the packages before it checks the apps.** Adding the two apps to the build was
  one of this run's fixes, and it shipped without the project references that order the work -- so on a
  clean checkout each app was checked before the `dist/index.d.ts` it imports existed. Locally it passed,
  every time, on dist left over from an earlier build. CI is the only thing in this repository that starts
  from nothing, and it is the reason the failure was ever seen.

## What was refused, and why

Triage carried 54 groups of findings, most of them in stage 5. Three refusals are worth naming because
they are the ones where the review was right about the fact and wrong about the answer:

- **`and` and `or` do not short-circuit, deliberately.** An unreadable branch anywhere makes the whole
  condition unreadable, and short-circuiting would skip it: `or(true, <broken>)` would answer `true` and
  _show_ a component whose rule nobody can read.
- **`e2e/repeater.spec.ts` cannot carry the Trap 11 fixture.** It drops a `Repeater` from the palette, so
  its two names are whatever `instantiate` produces. What it proves is that authoring reaches a row at all.
- **The `anchor === -1` fallback and two like it are unreachable rather than untested.** Deleting a guard
  because the current call graph cannot reach it is how a refactor becomes a crash.

Two fixes were **written, measured, and reverted**, with what was measured written down:

- The tab strip's focus-after-selection repair passed in jsdom and moved no focus at all in Chromium. A
  keyboard regression is worse than the hole it closes, so the synchronous focus stayed and the finding is
  open with the evidence.
- The `ResizeObserver` leak test: the counting stub was never installed, because it was conditional on an
  environment that provides one. It is installed now, and it still counts zero when the designer mounts,
  which nobody has explained. The test was written, seen to fail, and deleted rather than weakened into one
  that passes.

Four more tests were deleted after being watched pass against the unfixed code -- two number fields that
jsdom's `type="number"` input cannot be driven through, and two written before their premise was checked.
A test that cannot fail is worse than no test, and this run kept saying so about its own work.

## What is left

`docs/build-out/found.md` is the hand-over: thirteen entries, each outside the frozen queue, each with what
it is, where, why it was out of scope and what it costs to leave. The three that matter most:

- **A repeater's rows cannot be reached in the designer at all.** No kit renders an add-row control, edit
  mode swallows keystrokes, and preview starts with empty data. It is also why no test with a layout engine
  can draw a repeater with two rows, which is the one review finding this run could not close.
- **Renaming a component leaves every condition that named its answer dangling.** Three defensible fixes,
  and choosing between them decides what a key is.
- **`Button.variant` is a different vocabulary in each kit**, so a document authored against one carries a
  variant the other has never heard of -- against the contract's one obligation.

`docs/build-out/triage.md` holds every finding judged not worth fixing, each with a reason. `docs/decisions.md`
gained 23 entries, each recording a choice that changes behaviour rather than a repair.

## The stack

Six pull requests, each based on the one below it, so each reads in order:

| Stage | Items | Head branch                     |
| ----- | ----- | ------------------------------- |
| 0     | 0     | `build-out/b/00-base`           |
| 1     | 1-3   | `build-out/b/03-kit-contract`   |
| 2     | 4-7   | `build-out/b/07-symmetry-audit` |
| 3     | 8-18  | `build-out/b/18-test-highs`     |
| 4     | 19-26 | `build-out/b/26-spec-guides`    |
| 5     | 27-32 | `build-out/b/32-docs-low`       |
| 6     | 33    | `build-out/b/33-close`          |

Every queue item is its own branch and every branch is a fixed pointer, so item N's diff is
`git diff build-out/b/<N-1>-slug..build-out/b/<N>-slug` and any one of them can be read without reading the
run.

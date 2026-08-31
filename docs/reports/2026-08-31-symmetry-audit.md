# The symmetry and guard-recheck audit

Item 7 of the second remediation run. This is the process finding rather than a code finding, and it is
the reason the run exists in the shape it does.

All four CRITICALs in `docs/reviews/2026-08-30-second-pass.md` were introduced by the first remediation
run, and all four are one mistake: **a fix landed on one side of a symmetry, or a guard was not re-checked
against the code the fix changed.** Every one of them was green the whole time.

So this walks the first run's commits and asks two questions. For each fix: what was the twin, and was it
fixed? For each guard that run added or rewrote: break the thing it exists to catch, and watch it go red.

## Method

The first run is the 33 commits on `build-out/review-2026-08-30` that are not on `origin/main`
(`git log --oneline origin/main..build-out/review-2026-08-30`). The queue calls it 32; the difference is
the digest commit at the tip, which fixed nothing.

Every mutation below was applied to the working tree, run against the named suite, and reverted with
`git checkout --`. The results are what the terminal printed, not what I expected it to print. Three of
them surprised me and are marked.

## The pairs

Every pair the review's cross-cutting theme 1 names, plus every pair found while working items 1 to 6.
"No twin" is a verdict. "Never looked at" is not, and does not appear.

| Pair                                                               | State when the review was written  | Verdict                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateForm` / `validateAcross`, null prototype                  | fixed on one side                  | **Fixed, item 1.** The merge coalesced with `??=`, so it failed open where the walk failed closed.                                                                                                                                                             |
| `same`, object branch / array branch                               | fixed on one side                  | **Fixed, item 2.** The object branch passed `depth + 1`; the array branch dropped it.                                                                                                                                                                          |
| `evaluate`, `not` / `and` and `or`                                 | fixed on one side                  | **Fixed, item 2.** `MAX_DEPTH` bounded only chains of `not`, which is the branch nobody nests.                                                                                                                                                                 |
| `validateDocument`'s `visit` / its `condition` walker              | fixed on one side                  | **Fixed, item 2.** The outer walk had `MAX_TREE_DEPTH`; the walker inside the function documented as total had nothing.                                                                                                                                        |
| `rowScopedRefs` / `formScopedRefs`                                 | neither bounded                    | **Removed, item 2.** They were character-identical apart from one predicate. Now one function taking the scope it wants.                                                                                                                                       |
| `no-restricted-imports`, static import / dynamic import            | dynamic uncovered, both invariants | **Fixed, item 5,** in core as well as the designer. The review named only the designer; the identical hole was in both.                                                                                                                                        |
| `DOCS` in the reporter / `DOCS_WITH_COUNTS` in `docs.test.ts`      | five entries against three         | **Removed, item 6.** One list, imported. Two of the five quoted no total and the check could not notice.                                                                                                                                                       |
| `copy-assets.mjs`'s asset list / the CI artefact check             | drifted                            | **Removed, item 5.** The checker imports the copier's list, and reads the package list off the directory.                                                                                                                                                      |
| The contract's attribute rules / the boundary's fallback           | both emitting the same attributes  | **Fixed, item 3.** The fallback marks itself, and every render in the file goes through one error trap.                                                                                                                                                        |
| `--fs-control-border` measured / `--fs-border` not                 | one measured, one not              | **Resolved, item 6.** `--fs-border` is decoration and is now listed with that reason; the token list is read off the sheet.                                                                                                                                    |
| The two dark blocks in each stylesheet                             | already guarded                    | **No twin left.** `darkBlocks` asserts they declare the same tokens, and the guard fails on a one-digit drift (measured).                                                                                                                                      |
| `Canvas` / `Palette` guard `event.button`; `Tree` does not         | live                               | **Live, item 12 owns it.** Confirmed: `Canvas.tsx:336` and `Palette.tsx:120` guard it, `Tree.tsx` has no such line.                                                                                                                                            |
| `moveNode` guards `Array.isArray(children)`; `insertNode` does not | live, and deliberate               | **Not a defect.** `moveNode:439` refuses a leaf parent and its comment says `insertNode` would happily create one. The guard is at the operation that can reach it from the API; `insertNode` is the primitive it is built from. Recorded rather than changed. |
| `visibility.ts` wraps the evaluator; `validation.ts` does not      | live                               | **Live, item 8 owns it.** `guardPasses` and the `custom` rule call the host evaluator with no `try`.                                                                                                                                                           |
| `visibility.ts` wraps the evaluator; the renderer does not         | live                               | **Live, item 9 owns it.** `packages/renderer/src/index.tsx` contains no `try` at all.                                                                                                                                                                          |
| `safeStyleValue` / `safeDeclarations`, the two CSS sinks           | both guarded, by different suites  | **No twin.** `kit-css-injection.test.tsx` covers the prop sink and fails on it (measured). `css.test.ts` covers the `node.css` sink and its coverage gap is item 18. Two sinks, two suites, both live.                                                         |

### Theme 2 — a comment describing an intent the code does not carry out

Four, all confirmed still live and all owned by later items. Listed here because a comment that lies is
what stopped anybody re-reading the code under it, which is the mechanism this audit is about.

| Comment                                                                         | What the code does                                                                                                   | Owner   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------- |
| `Icon.tsx:256-259` — "the cast is replaced by asking the type for its own keys" | Line 261 is `(Object.keys(GLYPHS) as (keyof typeof GLYPHS)[])`. The cast is on the line the comment says removed it. | item 21 |
| `designer.css:855` — claims to close an inheritance breach                      | Uses `revert` where `initial` was meant, so the breach is open.                                                      | item 21 |
| `store.ts:218` — "the node is small"                                            | `JSON.stringify`s a node carrying its whole subtree.                                                                 | item 21 |
| `Binding.tsx:227` — a rename "moves" translations                               | It copies them.                                                                                                      | item 13 |

## The guards

Every guard file the first run created, plus every guard it rewrote inside an existing file. Each was
broken the way the thing it guards would break, run, and reverted.

| Guard                                        | Mutation                                                        | Result                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/eslint.config.test.ts`                 | the four dynamic-import cases, against the config as it stood   | 4 red, "got nothing" (item 5)                                                                                                               |
| `test/count-reporter.ts`                     | `onInit` renamed away                                           | 1 red, "the mark was undefined" (item 6)                                                                                                    |
| `test/count-reporter.ts`                     | a listed document with its figure removed                       | 1 red, naming the file (item 6)                                                                                                             |
| `test/kit-css-injection.test.tsx`            | `safeStyleValue` returns its input                              | 4 of 6 red                                                                                                                                  |
| `packages/core/src/language.test.ts`         | `languageTag` drops the dialect                                 | 1 of 3 red                                                                                                                                  |
| `packages/designer/src/geometry.test.ts`     | `measureTree` returns `[]`                                      | 2 of 6 red                                                                                                                                  |
| `packages/kit-mui/src/renderers.test.tsx`    | `Box` ignores the authored radius                               | 4 of 4 red                                                                                                                                  |
| `packages/designer/src/designer.css.test.ts` | `:where(.fs-shell) input { border: 0 }` added to the stylesheet | red (item 4; **passed 25/25 before**)                                                                                                       |
| `packages/designer/src/designer.css.test.ts` | `declarationsFor` returns after its first block                 | 1 red (item 4)                                                                                                                              |
| `test/docs.test.ts`                          | a package removed from the README table                         | 2 of 84 red                                                                                                                                 |
| `test/contrast.test.ts`                      | `--fs-control-border` lightened under its 3:1 floor             | 2 of 73 red                                                                                                                                 |
| `test/contrast.test.ts`                      | one dark block changed by a single hex digit                    | 1 of 73 red                                                                                                                                 |
| `test/contrast.test.ts`                      | a new unmeasured border token                                   | 1 red, naming it (item 6)                                                                                                                   |
| `test/kit-contract.test.tsx`                 | a kit renderer replaced by `throw new Error()`                  | 4 red (item 3; **passed 211/211 before**)                                                                                                   |
| `test/a11y.test.tsx`                         | an unlabelled `<input>` added to the shell toolbar              | **8 of 9 red.** See below.                                                                                                                  |
| `test/setup.ts`                              | not mutated                                                     | The ResizeObserver counters are recorded and consumed by nothing, which the first run triaged with its reasoning. Unchanged and still true. |

### Three mutations that did not go the way I expected

Recorded because a mutation that fails to fail is either a finding or a badly aimed mutation, and telling
them apart is the whole skill.

**`safeDeclarations` disabled, and `kit-css-injection.test.tsx` stayed green at 6 of 6.** Not a hole: that
suite guards `safeStyleValue`, the prop sink, and `safeDeclarations` is the `node.css` sink guarded by
`css.test.ts`. Re-aimed at `safeStyleValue` and it went red 4 of 6. The lesson is the one the review keeps
making: check what the guard's subject actually is before concluding anything from a green run.

**A package renamed to `@formsmith/kit-htmlX` in the README, and `docs.test.ts` stayed green at 84.** Also
not a hole, and closer to one: the check is `expect(readme).toContain(name)`, and `@formsmith/kit-htmlX`
contains `@formsmith/kit-html`. Removing the name properly turned it red 2 of 84. The substring match is
trap 4 and it is real, but it is a weakness rather than a defect, and `docs.test.ts` belongs to item 26.

**Three separate attempts to remove an accessible name left `a11y.test.tsx` green at 9 of 9.** The palette
search has a `placeholder`, which axe accepts; the dialog close button holds `&times;`, which is a name;
the condition-editor remove button is not rendered in any audited state. Instrumenting `audit()` settled
it: eight of the nine states inspect between 172 and 545 nodes across 16 to 20 rules, so the suite is
live. Injecting an unlabelled `<input>` into the shell turned 8 of 9 red, which is the proof.

## What the audit found that the review did not

**The JSON-dialog case in `test/a11y.test.tsx` audits one rule out of twenty.**

It is the ninth of the nine, and it is the one state that stayed green with an unlabelled `<input>` sitting
in the shell it was auditing. Instrumented, with the dialog open:

```
inspected=20 rules=1 violations=0 incomplete=19
incomplete=aria-allowed-attr, aria-conditional-attr, aria-deprecated-role, aria-hidden-focus,
  aria-prohibited-attr, aria-required-attr, aria-required-children, aria-required-parent, aria-roles,
  aria-tab-name, aria-valid-attr-value, aria-valid-attr, autocomplete-valid, avoid-inline-spacing,
  button-name, form-field-multiple-labels, label, nested-interactive, select-name
reason="Axe encountered an error; test the page for this type of problem manually"
```

Nineteen rules come back `incomplete` rather than passing or failing, and `incomplete` is not a violation,
so the assertion is `[] === []` and the test passes. `button-name`, `label`, `aria-required-attr` and
`nested-interactive` are all in that list. The state with the most complex markup in the designer — a
modal, a tablist, a textarea and a focus trap — is the one state nothing checks.

The mechanism is jsdom's `<dialog>`: `showModal` is a stub, and `DocumentDialog.test.tsx` patches it onto
the prototype to make the dialog testable at all. Axe errors out on the resulting tree.

Out of the frozen queue, so it is recorded in `docs/build-out/found.md` rather than fixed here. It is the
same shape as trap 7 and belongs with the Playwright axe pass already triaged for `target-size` and
`scrollable-region-focusable`: the rules jsdom cannot answer need a real browser, and this is a third one.

## What this says about the first run

The first run closed 402 of 428 findings and its work was mostly right. What it did not do is re-read its
own fixes from the other side. Every pair in the table above where the verdict is "fixed on one side" has
a comment on the fixed twin explaining the bug in detail — the understanding was there, written down, next
to the code, and it was applied once.

Two mechanisms account for most of it, and both are structural rather than a matter of care:

- **A list written twice.** Four of the sixteen pairs are literally two lists that had to agree and had no
  mechanism making them agree, each with a comment asking somebody to remember. Three of those are now one
  list; the fourth is one function.
- **A guard whose subject was replaced.** The kit contract and the CSS guard were both correct when
  written and both stopped being able to fail when the code beneath them changed — a fallback that emits
  the attributes a rule reads, a stylesheet selector that wraps a scope in `:where()`. Neither run
  re-mutated the guard afterwards, which is the step that would have caught both in thirty seconds.

The habit that catches this is in `.claude/skills/write-tests/SKILL.md` and it is one line: break the fix,
watch the right test go red, put it back. Sixteen mutations are recorded above. Two of them found a guard
that had been green and meaningless for months, and three of them found nothing except that I had aimed
badly, which is the ordinary cost of doing it at all.

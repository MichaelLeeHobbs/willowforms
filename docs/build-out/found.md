# Found during the build-out

Work discovered while remediating the 2026-08-30 reviews that is **outside the frozen queue**. Nothing
here gates completion. This file is the starting point for normal work on the project once the run ends.

Add an entry as: what it is, where, why it is out of scope, and how bad it would be to leave.

Entries below the second-pass heading came from the run against
`docs/reviews/2026-08-30-second-pass.md`. Everything above it came from the first pass and is still open;
the second review re-derived five of those independently, which is worth knowing before closing one.

---

## Second pass (from 2026-08-31)

## The JSON-dialog case in the axe suite audits one rule out of twenty

`test/a11y.test.tsx` — the ninth of its nine states opens the JSON dialog and audits the shell. With the
dialog open, axe errors internally and returns nineteen of its twenty rules as `incomplete` rather than as
passes or failures. `incomplete` is not a violation, so the assertion compares an empty array with an
empty array and the test passes.

Measured in item 7 by instrumenting the suite's own `audit()` helper. The other eight states inspect
between 172 and 545 nodes across 16 to 20 rules; this one inspects 20 nodes across 1 rule. The rules that
go missing include `button-name`, `label`, `aria-required-attr` and `nested-interactive` — which is most of
what a modal dialog needs checking for. Proved by injecting an unlabelled `<input>` into the shell
toolbar: eight of the nine states went red and this one did not.

The mechanism is jsdom's `<dialog>`. `showModal` is a stub, and `DocumentDialog.test.tsx` patches it onto
the prototype to make the dialog testable at all; axe errors on the resulting tree and says so —
"Axe encountered an error; test the page for this type of problem manually".

Out of scope because item 7 is an audit and the queue is frozen, and because the fix is not a patch: it is
the same Playwright axe pass already triaged for `target-size` and `scrollable-region-focusable`. This is
the third rule class jsdom cannot answer, and the argument for that pass is now three findings strong
rather than two. Bad to leave: the state with the most complex markup in the product — a modal, a tablist,
a textarea and a focus trap — is the one state nothing checks, and it reads as covered.

## Every tree walker outside `validateDocument` is unbounded, and the gate is what protects them

Item 2 bounded the six walkers that cross a _condition_. There are about a dozen more that walk the
_tree_, and none of them counts depth: `collectKeys` and `flatten` in `tree.ts`, `duplicateNode`'s
`copy`, `visit` and `collect` in `validation.ts`, `visit` in `schema.ts`, `visit` and `collect` in
`context.ts`, `measureTree` in the designer's `geometry.ts`, and the Tree panel's row walk.

They are safe today for one reason: `validateDocument` refuses a tree deeper than `MAX_TREE_DEPTH`, 500,
and 500 frames is nothing. So every walker downstream of the gate is protected by the gate. That holds
exactly as far as "nothing reaches those functions without passing the gate first", and that is a
sentence nobody has checked. The playground loads documents from `localStorage`; the designer's store
takes a pasted document through the JSON dialog. If either reaches `flatten` before
`validateDocument`, the protection is a coincidence.

Out of scope because item 2 names its six and the queue is frozen, and because the fix is not "add a
depth counter to twelve functions" -- it is deciding where the gate is, which is a design question worth
one answer rather than twelve. Not bad to leave: no path is known to be open. Worth doing because the
argument that it is closed is currently unwritten, which is how the four CRITICALs in this review got
there.

## `MAX_BODY` is a size cap and nothing checks the shape of what it lets through

`apps/demo-server/src/index.ts` — item 2 added a depth bound on the parsed body, because a 12 KB body
nested 6 000 deep took the submit route down inside `c.json` where `JSON.stringify` is not iterative.
Depth is one shape. Width is another: a body of a million single-character keys is under 1 MB, parses,
and makes `validateForm` do a million lookups. Item 14 owns `MAX_BODY` not being a body limit, so the
streaming half is queued; the "what else about a 1 MB body is expensive" half is not.

Out of scope because it needs a threat model rather than a patch, and this is a demo server that binds
localhost only. Worth writing down because the depth bound is now the only shape-of-input check on the
route, and one check tends to read as coverage.

---

## First pass (2026-08-30)

## The CI actions still target Node 20

`.github/workflows/ci.yml` — `actions/checkout@v4`, `actions/setup-node@v4` and `pnpm/action-setup@v4`
all target Node 20, which GitHub deprecated on 2025-09-19 -- as does `actions/upload-artifact@v4`, the
fourth action in the workflow and the one this entry originally missed. Every run now prints a warning and forces
them onto Node 24:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on
> Node.js 24.

Out of scope because the queue was frozen before it was noticed, and it is a warning rather than a
failure. Leaving it costs nothing until GitHub drops the compatibility shim, at which point every
workflow stops. The fix is a version bump on three lines, so it is worth doing on its own rather than
inside a remediation branch where it would be noise.

## The end-to-end harness reads persisted state without waiting for the commit

**Fixed in item 25, and kept here with the date rather than deleted.** The nine
`expect(await designer.rootChildren()).toEqual(before)` assertions now poll, and the five computed-style
assertions with them. The original entry is below, because this file is read for what is still open and a
silently vanishing entry is worse than one marked closed.

`e2e/harness.ts` — `rootChildren()` and `document()` read `localStorage` directly, and the playground
writes it during React's commit. Nothing between a gesture and the read waits for that commit, so all
~35 call sites race it.

Out of scope because it is **not** what broke CI, and saying so matters. It was my first diagnosis and
it was wrong: the failure snapshot showed Undo still disabled, meaning no mutation had happened at all,
which ruled the race out as the cause. The real defect was measuring a bounding box before the element
stopped moving, and that is fixed. The race is real but latent, and fixing it blind would have muddied
which change actually mattered.

Worth doing when something else forces a harness change. Cheap: wait a frame inside those two readers.

## Nothing enforces that the palette fits on screen

`e2e/canvas.spec.ts` and `e2e/repeater.spec.ts` drag entries out of the component palette. Whether
those entries are on screen depends on how many components the palette holds, how tall the platform
renders the list, and a 720px viewport. Adding Step and Repeater pushed the Selection group past the
bottom edge, which broke the palette drag on Linux CI while it kept passing on Windows.

The drags now scroll their source into view, so the suite is no longer wrong. What is missing is
anything that says so out loud: add three more components and a category drops off the bottom again,
and the next person also gets a failure that looks like flake and is not.

Out of scope because the queue was frozen before it happened, and because the fix is a judgement call
rather than a defect. A check that fails when the palette exceeds the viewport would say it directly.
Recorded as Trap 13 in the write-tests skill either way, since the reasoning is worth more than the
check.

## `gap` means one thing in kit-mui and another in kit-html

`packages/kit-mui/src/renderers.tsx` and `packages/kit-html/src/renderers.tsx` — `Stack`, `Grid` and
`Step` pass `gap` straight to MUI's `gap` prop, which reads it as a multiple of `theme.spacing`
(default 8), while the HTML kit reads it as pixels. So an authored `gap: 2` is 16px in one kit and 2px
in the other, and a document authored against one and rendered through the other lays out differently.

`test/kit-contract.test.tsx` already names this and treats it as deliberate, and for the _defaults_ it
is: a kit is entitled to its own `defaultProps`, and 2 and 16 are both right in their own kit. What is
not deliberate is the **authored** value meaning two different things, which is the same class of
defect as the corner radius fixed in item 6 — that one was found only because someone measured it.

Out of scope because item 6 is the radius, the queue is frozen, and this needs a decision rather than a
fix: either `gap` becomes pixels everywhere, which is a breaking change to every MUI document, or the
prop is documented as kit-relative and the designer stops pretending one number travels. Bad to leave:
it is invisible until someone switches kits, which is the one thing this project advertises.

## The kit contract table counts a row that is not a kit obligation

`test/docs.test.ts` — the guard slices `kit-contract.test.tsx` from `describe.each(KITS)` to the end of
the file and counts every `it(` in it, then requires one row per case in the table in
`docs/spec/02-kit-contract.md`. Anything written after the per-kit block is counted too, so the
"a default copied between kits" case has a row in the table describing an obligation no third-party kit
has: it is about these two kits agreeing with each other.

Found while adding the cross-kit length test for item 6, which the guard also miscounted until it was
moved above the per-kit block. Out of scope at the time because the queue was frozen and nothing was
wrong that day.

**Fixed in item 27**, which carried a review finding saying the same thing from the other end. The slice
now ends at the next top-level `describe` rather than at the end of the file, and the row that then had
no rule -- "A Step's gap default matches the Stack it renders as", which is these two kits agreeing with
each other rather than an obligation on anybody's kit -- came out of the table.

The second pass went further: the guard also missed the rules driven per kit from _outside_ that block,
so the spec presented one table as the whole obligation set while the suite ran nearly twice that. The
figure was written here as "fourteen" and is now twenty-three, which is the reason it is not a figure
any more: `test/docs.test.ts` holds the count and compares it, and a number in this file is one nobody
maintains. There are two tables now, both counted, and the count is of the whole file minus the per-kit block
minus the describes that are about these two kits rather than about kits. Nothing is left to hand over
here.

## A repeater's rows cannot be reached in the designer

No kit renders an "add row" control, and the canvas starts with empty data, so a repeater has no rows in
preview and exactly one — drawn by `revealHidden` so the authored subtree can be selected — in edit mode,
where the canvas deliberately swallows keystrokes so a click selects rather than types.

The result is that **no keystroke can reach a repeater row anywhere in this product**. Rows exist for a
host rendering the form outside the designer with data that already has some.

Found while trying to write an end-to-end test for item 19's canvas fix, which routes `onChange` through
`applyChange`. The fix is right and the renderer tests prove the address is placed correctly; what could
not be written is a browser test, because the gesture does not exist. That is also the reason the write
path could be wrong for as long as it was: nobody could type into a row to notice.

Out of scope because it is a feature — an add/remove-row affordance, which is a kit component, a
document-model question about who owns the button, and a decision about whether the designer seeds
preview data. All three are real design work rather than remediation. Bad to leave: `Repeater` is
described as built in `03-components.md`, and a component whose rows nobody can create is built only in
the sense that it renders.

## Button.variant is a different vocabulary in each kit

`kit-mui` offers `contained` / `outlined` / `text`; `kit-html` offers `solid` / `outline` / `plain`.
Every other field of every other property matches. A document authored against one kit therefore carries
a `variant` the other has never heard of, and the playground's kit switch is the fastest way to see it:
MUI's Button gets `solid` and ignores it, the HTML kit gets `contained` and drops it into a class name
nothing styles.

Found while widening the cross-kit comparison for item 23, which previously compared a property's `name`
and `editor` only. The comparison is strict now with this one pair exempted by name, and the exemption
has its own test that fails if the two ever agree, so it cannot outlive the divergence.

Out of scope because choosing the surviving vocabulary is a product call: aligning them changes what a
shipped kit's documents mean, and the alternative — declaring option values kit-local and dropping the
"a document renders through either kit" claim to "a document renders, with kit-local values reset" — is a
spec change. This is the same class as the `gap` units entry above: the kits agree on the shape of a
property and disagree about what its values mean.

## A ref naming a data key nothing writes is reported by nothing

`validateDocument` walks a document's structure and says nothing about a `renderWhen` whose `ref` names
a data key no node answers under. The condition is false forever, the component is permanently hidden,
and `renderWhen` gates validation -- so its rules never run on the server either, and the submit
succeeds.

Queue item 18 closed the way this happens most often: a rename used to move the answer name and leave
every ref behind, and it now re-points them. What is left is the case a rename cannot fix -- a ref typed
against a key that never existed, or one left dangling by a deletion -- and that wants the gate rather
than the store.

Out of scope for that item because it is a new structural error code, which changes what every host's
boot gate reports about documents stored today. `docs/decisions.md` records the reasoning under the
rename entry. The shape is the one `rowScopeProblems` uses: walk the tree, collect the data keys anything writes,
report each ref that names none of them, under its own code so a host can decide what to do about it.

## The canvas's primary-button guard cannot be isolated by a jsdom test

`Canvas.tsx`'s `if (event.button !== 0) return` is what stops a right-press arming a drag, and replacing
it with a no-op leaves every test green -- including two written for it in `Canvas.test.tsx`, which say
so in their own comment rather than claiming coverage they do not have.

Something else in the jsdom environment also stops a right-press reaching `begin`, so a test driven
there cannot tell the guard from that. The tests that exist pin the outcome a user sees (a right-press
moves nothing), which is worth having and is not the same as covering the line.

Out of scope for queue item 24 because settling it means finding out _why_ a `fireEvent.pointerDown`
with `button: 2` does not reach the handler the way `button: 0` does -- a question about the environment
rather than about this component. The tree's equivalent guard has a working pair of tests, so comparing
the two harnesses is the obvious place to start. `e2e/` is the other option: a real browser has real
buttons, and this is the class of thing `CLAUDE.md` says belongs there.

## `instantiate`'s docblock still reads as though it always returns a node

Copilot raised it against PR #67: the signature returns `ComponentNode | undefined` -- a definition
whose `type` is unusable produces nothing -- and the docblock above it describes a function that
returns a node. A consumer reading the comment writes no undefined branch, and the first malformed kit
definition they meet is a `TypeError` one call later.

Out of scope for the item that pull request carries, which is documentation figures and the queue's own
record. It belongs with `packages/core/src/factory.ts` and whatever else in that file makes a claim about
what it returns; the fix is a sentence, but the question of how many other docblocks describe a
pre-`undefined` signature is worth asking once rather than one file at a time.

## The MUI image's refused `src` is unguarded, and the reported defect does not happen

The review said `kit-mui`'s `ImageNode` renders `<img src="">` for an address the allowlist refuses --
a request for the current page in several browsers -- while `LinkNode`, reading the same allowlist,
degrades to plain text and says why. One allowlist, two behaviours.

Building the test showed the DOM outcome does not occur. React refuses an empty `src` outright and
leaves the attribute off, so `hasAttribute('src')` is `false` whether the line reads
`src={safeHref(...) ?? ''}` or omits the attribute, and every assertion about the markup passes against
the defect. React does warn instead -- "An empty string (\"\") was passed to the src attribute" -- and
that fires when the whole file runs and not when the test runs alone, so a gate built on it would
depend on what else is in the suite.

The line was changed anyway, because omitting the attribute is what it means and it is what stops the
warning. It is unguarded. A Playwright case is the honest home if anybody wants one: a real browser is
where "requests the page again" would be observable at all, and `e2e/` is where `CLAUDE.md` says this
class of thing goes. `kit-html` has the identical line at `renderers.tsx:511` and was not changed,
because item 37 owns that file and the same reasoning applies to it.

## `Repeater` has no label, so its group is named after the data key

`kit-mui`'s repeater wraps its rows in `role="group"` with no accessible name, which a screen reader
announces as an unnamed group around every list. It is now named from `node.dataKey ?? node.key`,
because that is the only author-written string a repeater has: the component declares one property,
`gap`.

The real fix is a `label` property on `Repeater` in both kits, which is a contract change --
`03-components.md`'s "built means both kits implement it" -- and so out of scope for a remediation run.
`kit-html`'s repeater has the same shape.

## The number editor's overflow guard cannot be driven in jsdom

`Properties.tsx`'s number editor refuses a value `Number.isFinite` rejects, because `Number('1e999')` is
`Infinity` and `JSON.stringify` writes that as `null` -- so the export and the submitted payload would
disagree with what the author typed. The comment there records it as a fixed defect.

Nothing holds the fix in place and nothing here can. A real browser accepts `1e999` into a
`type="number"` input and hands the raw string to `onChange`; jsdom sanitises an invalid number-input
value to `''` first, so the empty-string branch fires and no jsdom test can separate the two. Confirmed
twice: `user.type` never reaches the handler at all, and `fireEvent.change` with the same string arrives
as `''`.

Belongs in `e2e/`, which is what `CLAUDE.md` says about anything jsdom cannot represent. One Playwright
case typing `1e999` into a number property and asserting the stored document holds no `null` would
settle it. The same shape as the canvas's primary-button guard recorded above -- both are guards whose
input the test environment refuses to produce.

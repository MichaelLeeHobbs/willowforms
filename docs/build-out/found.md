# Found during the build-out

Work discovered while remediating the 2026-08-30 reviews that is **outside the frozen queue**. Nothing
here gates completion. This file is the starting point for normal work on the project once the run ends.

Add an entry as: what it is, where, why it is out of scope, and how bad it would be to leave.

Entries below the second-pass heading came from the run against
`docs/reviews/2026-08-30-second-pass.md`. Everything above it came from the first pass and is still open;
the second review re-derived five of those independently, which is worth knowing before closing one.

---

## Second pass (from 2026-08-31)

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
all target Node 20, which GitHub deprecated on 2025-09-19. Every run now prints a warning and forces
them onto Node 24:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on
> Node.js 24.

Out of scope because the queue was frozen before it was noticed, and it is a warning rather than a
failure. Leaving it costs nothing until GitHub drops the compatibility shim, at which point every
workflow stops. The fix is a version bump on three lines, so it is worth doing on its own rather than
inside a remediation branch where it would be noise.

## The end-to-end harness reads persisted state without waiting for the commit

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

`packages/kit-mui/src/renderers.tsx` and `packages/kit-html/src/renderers.tsx` — `Stack`, `Container`
and `Step` pass `gap` straight to MUI's `gap` prop, which reads it as a multiple of `theme.spacing`
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
each other rather than an obligation on anybody's kit -- came out of the table. `CONTRACT_RULES` is 19.
Nothing is left to hand over here.

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

## Renaming a component key leaves every condition that named its answer dangling

`renameKey` re-points the renamed node's own `renderWhen` and nothing else. A component with no
explicit `dataKey` answers under its key, so renaming `emailField` to `email` renames the answer too,
and a sibling whose `renderWhen` reads `emailField` now reads a key nothing writes. The condition is
false, the sibling is hidden, its rules never run, and nothing says a word. Dragging the two apart, or
renaming for tidiness a week later, is all it takes.

Found while writing the Key field's first test in `Properties.test.tsx` for item 23, which had none. I
wrote the assertion for the behaviour I expected, watched it fail, and did not pin the current one --
the test now covers what the panel really promises (the node's own condition follows it), and this is
here instead.

Out of scope because the fix is a product decision, not a repair. Three defensible answers: re-point
every ref to the old data key when no other node still writes it; set an explicit `dataKey` on rename so
the answer name never moves at all, which makes a key pure identity; or refuse the rename with a warning
naming the components that would break. The first is the smallest, the second is the most honest about
what a key is, and choosing between them changes what renaming means. `validateDocument` reporting a ref
to a key nothing writes would also have caught it, and that is a fourth decision.

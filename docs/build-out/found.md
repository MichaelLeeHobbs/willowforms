# Found during the build-out

Work discovered while remediating the 2026-08-30 review that is **outside the frozen queue**. Nothing
here gates completion. This file is the starting point for normal work on the project once the run ends.

Add an entry as: what it is, where, why it is out of scope, and how bad it would be to leave.

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
moved above the per-kit block. Out of scope because the queue is frozen and nothing is wrong today.
Cheap to fix: end the slice at the closing of the per-kit describe rather than at the end of the file,
and drop the row that then has no rule.

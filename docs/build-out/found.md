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

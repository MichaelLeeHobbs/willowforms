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

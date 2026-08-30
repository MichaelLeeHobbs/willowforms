# Findings triaged, not fixed

A finding from `tmp/formsmith-review-2026-08-30.md` that the run decided not to act on. Recording it here
counts as handling it for the purposes of the queue. Leaving it out does not.

The review skill names the recurring false-positive shapes, and they are the reasons that belong here:
nitpick gravity, a failure the system cannot actually produce, a style preference wearing the clothes of
a bug, a premature-abstraction warning with no defect behind it, and a guard that exists one layer up.

Security and correctness findings do **not** get triaged for tidiness. If one is wrong, say what makes it
wrong; if it is merely inconvenient, fix it.

Add an entry as: `area / file:line` — the finding in one clause, then the reason in one line.

_Nothing yet._

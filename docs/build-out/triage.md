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

## Catastrophic backtracking is bounded, not closed — `validation.ts` pattern rule

**HIGH, area 2.** An author's `pattern` is compiled and run on the server against text an attacker
chose. Confirmed by execution, which the report had marked BLOCKED: `^(a+)+$` against 31 characters
hung a test run for five minutes.

**Fixed:** the input is capped at 4096 characters, and a pattern with an unbounded quantifier inside
another unbounded one — `(a+)+`, `(a*)*`, `((a+)*)+` — is refused rather than run. Refused means the
rule _fails_, because a pattern that cannot be trusted has not been satisfied.

**Not fixed, and this is the entry:** `(a|a)*` is exponential too and is not caught. No cheap syntactic
rule separates a dangerous alternation from `(ab|cd)+`, and refusing every quantified alternation would
reject patterns real forms are full of. Neither is there a timeout: Node cannot interrupt a synchronous
match, so bounding the _time_ means a worker thread or a linear-time engine such as RE2 — a runtime
dependency that does not work in the browser, where this same code runs.

That is a dependency decision with a cross-platform cost, and it belongs to whoever owns the project
rather than to a remediation run. The mitigation above removes the shape the report demonstrated and
every polynomial case; what remains is an alternation an author has to write deliberately.

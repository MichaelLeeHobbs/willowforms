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

## Rows are keyed by index, and browser-owned state follows the index — `renderer/index.tsx`

**HIGH, area 3.** React reuses the component instance at each index and unmounts only the last, so
deleting row 0 leaves the instance that drew row 0 drawing row 1. Anything a kit derives from `value`
follows the data and is fine; anything the browser owns does not. The vehicle the review named is
`FileUploadNode`, which renders `type="file"` with no `value` — the input still shows `a.pdf` while the
data holds `b.pdf`. Focus, text selection and IME composition ride along.

**Not fixed, and this is the entry.** There is no better key available, and that is a consequence of a
decision rather than an oversight. A React key has to be stable for the row's lifetime, and both
candidates fail: a generated row id would be a non-answer living inside `data` and in the submitted
payload, which `12-api.md` refuses by name and the row-addressing decision rejected explicitly; and the
row object's own identity changes every time that row is edited, so keying on it would remount the row
on every keystroke.

**What was done:** the comment defending the choice stated the opposite of what React does — that index
keys "remount rows below a deletion" — which is why nobody had noticed. It now says what actually
happens and what it costs.

**What would close it:** a row identity that lives outside `data`, held by the renderer for the lifetime
of the mount. That is a real design, it is not small, and it reopens a decision that was settled with
reasons. It belongs to whoever owns the project, not to a remediation run.

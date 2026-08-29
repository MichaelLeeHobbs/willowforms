# Overnight, 2026-08-28 into 2026-08-29

Written as the work happened. Horizon: 9am Eastern, Saturday 2026-08-29.

## What shipped

### Merged before the handover

- **#19 Style tab.** Per-component CSS, structured controls and a raw field over one string.

- **#20 host context** — merged as `313b108`. It merged mid-session while work continued on the branch,
  so five later commits were stranded and have been moved onto `feat/steps` cut from the updated main.

### Open

- **#21 `feat/steps`** — the canvas defect, the steps decision, `validateAcross`, the step switcher.

## The work

### The merge exposed a bug neither branch could see

`submittedData` came from #19 with a positional `evaluate`; core moved to an options bag in #20. Merged,
it could not read the host's context. That is not a signature mismatch: `submittedData` decides which
answers leave the payload, using `isVisible`, so a different context than the renderer had strips answers
to questions the user really was asked. It is the disagreement `isVisible` exists to prevent, arriving
through an argument list. Fixed, with a test that goes red when the options are not threaded through.

### An effect cannot tell the server what to believe

Copilot caught a sentence in the actions sketch saying a rule evaluates on the server "where the context
is whatever the request supplied", contradicting the security model two files over. Reworded as a limit
rather than a reassurance. Logged.

### The canvas defect is fixed

A component with `renderWhen` set was absent from the canvas DOM: invisible, unselectable there, and
undroppable, because `measureTree` skips what did not render. The tree was the only way to reach it. This
affected every condition in every document and had shipped that way.

`FormRenderer` now takes `revealHidden`. The canvas passes it while editing and never in preview, the
same way the two already disagree about events. Validation is untouched.

Four of the new checks run in a browser, because dropping into a container is resolved from measured
rectangles. Breaking the fix turns three of them red, the drop test among them.

### Two `.gitignore` holes, both found by running things

`.vscode/` was unignored, so a `git add -A` during a conflict resolution swept an editor temp file into a
commit. `apps/demo-server/forms.json` was unignored, so running the demo server dirties the tree and
fails `format:check`.

## Verification

841 unit tests, 62 e2e, lint / format / typecheck / build clean. The context feature was also exercised
end to end through the real demo server in Node: a guest's empty submit accepted, an admin's rejected, a
document reading a path the server does not supply answered with a 500 naming that path, and a payload
claiming `user.role: admin` ignored because the server reads its own context.

## Decision log

See `docs/decisions.md`. Entries added since the handover:

1. Steps next, then the key grammar, then repeated scope — with the losing case's strongest surviving
   point, which changes what repeated scope must include.
2. `missingContext` is checked against the scopes, not the bare context.
3. Edit mode draws what a condition hides; preview does not.
4. The context an effect writes is the browser's, never the server's.

### Steps: decided, then built

The steelman settled it. Four of six form libraries needed a breaking change to their row addressing
after shipping; none ever needed one to add pages. Steps add no addressing here, so nothing is waiting on
them. Order is steps, then the key grammar, then repeated scope.

There is no Step type in core: a step is a container with a condition. Per-step validation was already
free. What was broken is the submit, which from the last step validated only the last step and accepted
an answer skipped earlier. `validateAcross` merges a run per step and `contextValues` reads the flow out
of the document, so the server never takes the step list from the request.

The canvas now supplies `context.step` with a switcher, so a wizard can actually be previewed.

### A finding that only came from running it

The boot-time `missingContext` check has to run against the contexts a host will evaluate in, not its
base context. `step` is a path the server fills in per scope, so checked against the base context every
wizard was refused for a path that was never missing.

### The key grammar

`12-api.md` called this the loosest contract in the project: uniqueness was the only rule enforced, so a
key holding a space, a quote or a newline made a legal document. It is also the decided prerequisite for
repeated scope.

Now the JavaScript identifier subset, and the reason is the evaluator rather than tidiness. A hyphen is
the tempting addition, because real forms are full of `first-name`, and it is exactly the one that
breaks: `computed` bindings are host-evaluated JavaScript, so `first-name` in an expression is a
subtraction, silently. `.`, `[` and `]` stay free because row addressing needs them. `__proto__` passes
the pattern and is refused by name.

`keyProblem` is called from both `validateDocument` and the panel's rename, so a paste and a rename are
judged the same way — which is what that section said was missing.

### Two lookups for one key gave two different answers

`findNode` and `findParent` answered with the _last_ node carrying a key while `pathTo` answered with the
first. Found while measuring what repetition breaks. First match now, matching `pathTo` and
`querySelector`. Deliberately did not touch `updateNode`, which edits every match: what that should do is
the repeated-scope design's question.

### Two more review findings

A `Step` in the MUI kit was 128 pixels tall between fields — MUI's `gap` is a spacing-scale multiplier
and the HTML kit's is pixels, and the unit did not travel with the definition when I copied it. The
contract suite now checks the narrow true version of this; a first attempt at a general rule would have
forced MUI's `Grid` to change, which is correct because its renderer converts.

The demo server also ran a validation scope per non-string step value, now filtered.

### minLength on a list always failed

`jsonToString` returns `''` for anything that is not a string, number or boolean, and the length rules
went through it. A multi-select with two options chosen measured zero, so `minLength: 2` failed every time
and `maxLength` passed every time — silently, with the chosen options on screen and a message saying the
answer was too short.

### Row addressing, designed four ways

Not built. Four designs in parallel under different constraints, then judged. The decision and both
corrections are in `docs/decisions.md`; the two worth your attention:

**All four independently found that rows never enter the tree**, which corrects the steelman entry saying
repeated scope is "a node-identity change in `tree.ts` first". The measurement behind that was real, but
every failure in it needs one key at three places in the tree, and it never is. `tree.ts` needs no
changes. The real bug that measurement surfaced — two lookups disagreeing — was live with unique keys too
and is fixed.

**The data shape is forced, not chosen.** `toJsonSchema` projects for a validator that never runs this
code, and JSON Schema expresses `array/items/object` natively while it cannot express an unbounded family
of `addresses[0].street` keys. Nested also keeps `onChange` unchanged, because adding a row is one write
to one top-level key.

## Parked on an external gate

- **#21** — awaiting Copilot re-review after two findings were fixed. Both were real: the canvas
  validated without the context it renders with, reintroducing the renderer/validation disagreement
  `isVisible` exists to prevent; and `contextValues` collected more than its comment claimed. Nothing
  blocks continuing.

## Still running

Nothing.

## Hit the stop-list

Nothing yet.

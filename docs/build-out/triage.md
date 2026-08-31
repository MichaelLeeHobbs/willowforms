# Findings triaged, not fixed

A review finding that a run decided not to act on. Recording it here.
counts as handling it for the purposes of the queue. Leaving it out does not.

The review skill names the recurring false-positive shapes, and they are the reasons that belong here:
nitpick gravity, a failure the system cannot actually produce, a style preference wearing the clothes of
a bug, a premature-abstraction warning with no defect behind it, and a guard that exists one layer up.

Security and correctness findings do **not** get triaged for tidiness. If one is wrong, say what makes it
wrong; if it is merely inconvenient, fix it.

Second-pass entries cite `docs/reviews/2026-08-30-second-pass.md`; first-pass entries cite
`tmp/formsmith-review-2026-08-30.md`, which is gitignored and exists in one working copy only.

---

## Second pass (from 2026-08-31)

## `renameKey` leaves every other reference dangling — `store.ts:437-493`, area 6, item 21

**MEDIUM, already open.** Renaming a component repoints only that node's own `renderWhen`, so a sibling
whose condition names the old data key silently starts reading a key nothing writes: the condition is
false, the sibling is hidden, and its rules never run.

This is the same finding the _first_ pass recorded in `docs/build-out/found.md` under "Renaming a
component key leaves every condition that named its answer dangling", with four defensible answers
written out and the observation that choosing between them changes what renaming means. Two review passes
reaching it independently is worth knowing; it does not make it smaller. Left where it is, with the
options, rather than answered in a MEDIUM sweep.

## The store re-validates the whole document on every commit — `store.ts:297-305`, area 6, item 21

**MEDIUM.** The "checked once" validation re-runs `validateDocument` over the whole tree and re-emits its
problems, so a form with a few hundred nodes walks the entire document on every keystroke that commits.

Left because it is a performance observation with no measurement behind it and no defect: the walk is
correct, and `MAX_TREE_DEPTH` bounds it. The fix is either memoising on the document's identity -- which
`commit` already gives, since an unchanged document keeps its reference -- or moving the check off the
commit path entirely, and choosing needs a profile of a form somebody says is slow. Recorded with the
five other perf notes the first pass triaged for the same reason.

## Hard-coded ids in `FormSettings` — `FormSettings.tsx:104,144,186,199,204,217`, area 9, item 21

**MEDIUM.** The panel uses fixed element ids and, worse, a fixed radio group `name`, so two designers on
one page share a radio group: choosing a default language in one moves it in the other.

Left because two designers on one page is not a configuration this project supports or tests, and the
change touches every control in the panel. `useId` is the fix and it is mechanical; what makes it not
worth doing inside a MEDIUM sweep is that the same pattern appears in several panels and doing one of
them is the half-fix this run exists to stop. Worth doing as one pass over the designer, with a test that
renders two shells.

## `DocumentDialog` computes its JSON in the render body — `DocumentDialog.tsx:72-74`, area 9, item 21

**MEDIUM.** `documentJson`, `schemaJson` and `lossy` are recomputed on every render of the dialog body,
including every keystroke in the textarea beside them.

Left, and it is the same call the first pass made about this file: a `JSON.stringify` of a document
nobody types a whole document into is not on a frame budget, and a `useMemo` here has to stay correct
across an edit. Worth doing on evidence rather than before it.

## The mode picker shows no selection for a kind it does not know — `Binding.tsx:88,138-148`, area 9, item 21

**MEDIUM, partly covered.** A `PropValue.kind` outside the four the picker offers renders it with nothing
selected, so the control reads as unset while the document holds a binding.

The `renderWhen` row already handles exactly this: it offers an "Always (unrecognised rule)" option when
the document holds a `kind` it cannot draw, so the row can let go of it deliberately. The same treatment
belongs on the general mode picker, and it is not a two-line change -- the option's label has to say what
is being replaced, and the picker is shared by every property row.

Left as a known gap rather than half-done. `validateDocument` refuses such a document, so reaching it
takes a paste that bypassed the gate.

## The HTML kit writes layout props as inline styles — `kit-html/renderers.tsx`, area 5, item 20

**MEDIUM.** Every layout and display prop lands in a `style` attribute, which a strict
`Content-Security-Policy` without `'unsafe-inline'` blocks outright, so a form served under one loses
its layout entirely.

Not fixed, because the fix is a rewrite of how this kit expresses an authored value rather than a repair.
The props are per-node and arbitrary -- a gap of 17, a max width of 613 -- so a class cannot carry them;
the routes are a nonce'd `<style>` element per node, or CSS custom properties set from a nonce'd sheet, or
a `CSSStyleSheet` built at runtime. `FormRenderer` already takes a `nonce` for the per-node CSS it emits,
which is where such a design would start.

That is a real piece of work with a design question in it: whether a kit's _layout_ props go down the
same channel as a document's authored CSS. It belongs to whoever owns the project, and this run's job is
not to answer it in passing. Bad to leave in the sense that it silently rules out a deployment class, and
the README does not warn anybody. Recorded rather than hidden.

## An unanswered group and an answer of `''` are the same thing — `kit-html/renderers.tsx:700`, area 5, item 20

**MEDIUM.** `jsonToString(value)` is `''` for `undefined`, `null` and the empty string alike, so a
`RadioItem` or an option whose value is `''` shows as selected on a group nobody has answered.

Left because closing it means deciding what an empty-string option _means_, and the honest answer is
probably that it is not an answer -- which is a document-model call, not a kit one. `isEmpty` in core
already treats `''` as empty, and `required` refuses it, so the two layers agree that an empty string is
a non-answer; what the kit does is show it as one anyway. Making the kit disagree with core about that
would be worse than the symptom.

The symptom needs a document that authors an option with an empty value, which the panel does not offer:
`MembershipOptions` drops blank lines, and an option list is authored through it. Reachable by hand-edited
JSON only.

## A `custom` rule with no evaluator passes — `validation.ts:415`, area 3, item 19

**MEDIUM.** The finding is that `if (!options.evaluate) return undefined` lets every custom rule through
on a host that injected no sandbox. That is the documented degradation, stated in this file's own header
and in `docs/spec/08-validation.md`, and reversing it would make the library unusable without an
evaluator: every custom rule would fail for a host that has deliberately declined to supply one.

The failure the finding is really about is a host that _needs_ an evaluator and has not noticed, and that
already has an answer at the right layer: `evaluatorKeys(root)` reports every component whose rules need
one, and `apps/demo-server` refuses to accept a submit for such a document with a 500 naming the
components. A boot-time check is where "this host is misconfigured" belongs; a per-rule guess is not.

What did change in item 8 is the case this finding is next to: an evaluator that _throws_ now fails the
rule, because a broken expression is not a configuration choice.

## `validateAcross` multiplies scopes by rows — `validation.ts:707-711`, area 3, item 19

**MEDIUM.** Each scope walks the whole tree, and `MAX_ROWS` bounds the rows inside one walk, so a
document with many steps multiplies a bounded quantity by a document-controlled one. Both factors are
already bounded in practice: the scopes come from `contextValues(root, 'step')`, which is the set of
distinct literals a document compares `context.step` against, and a document deep enough to matter is
refused by `MAX_TREE_DEPTH` first.

Left because the honest fix is a work budget across the whole validation pass rather than another
constant, and that is a design with a number in it that nobody has measured. What made the original
report worth acting on -- a _request_-controlled multiplier -- is `MAX_ROWS`, which exists. The demo
server also refuses a body over `MAX_BODY` before any of this runs, and item 14 made that a real limit.

Worth revisiting with a profile rather than by argument.

## `applyChange` and `rowContext` disagree about a row that is not an object — `rows.ts:502`, area 2, item 19

**MEDIUM, partly fixed.** `rowContext` coerces a row that is not a plain object to `{}` so the renderer
can draw it, and `applyChange` refuses to write into one -- so a row arriving as a string draws as an
empty row whose keystrokes go nowhere.

Not reconciled here, and the reason is that both halves are right for their own caller. Drawing nothing
for a malformed row would hide a row the data says exists; writing into it would mean choosing what
`"nope"` becomes when somebody types into its `line1`, which is inventing an answer. What was missing is
that nobody is told, and item 18 added the report at the layer that can give one: `validateForm` now
reports `NOT_A_LIST` for a repeater whose value is not a list, which is the same shape one level up.

A row inside a well-formed list that is itself malformed still draws empty and refuses writes. Closing
that means deciding whether the renderer may replace a row, which is a document-model question.

## `eslint .` does lint `aliases.ts` — area 10, item 5

**MEDIUM, refuted.** The finding says the file `CLAUDE.md` calls load-bearing is never linted. It is.
Measured twice while doing item 5: a deliberate unused variable in `aliases.ts` fails `pnpm lint` and is
reported against that path, and a deliberate `any` there fires four type-aware rules, which also settles
the narrower reading -- the file is in `tsconfig.eslint.json`'s `include`, so the project service covers
it. Nothing to change.

---

## First pass (2026-08-30)

Add an entry as: `area / file:line` — the finding in one clause, then the reason in one line.

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

## `JsonValue` admits `NaN` and `Infinity` — `types.ts:9`, area 1

**LOW.** `JSON.stringify({a: NaN})` is `{"a": null}`, so a context value the browser compared as a
number arrives at the server as `null` and the two disagree about the same condition. TypeScript cannot
express "a number that is finite", so the type cannot carry the rule. What could be done was: `order`
now answers "unordered" for `NaN` instead of subtracting, so a comparison against one is false rather
than accidentally true, and two infinities compare equal. The round trip stays the host's problem, and
`FormContext`'s docblock already says the values have to survive `JSON.stringify`.

## `ValidationRule['when']` admits `i18n` and `computed` — `types.ts:120-129`, area 1

**NOTE.** A guard is a boolean and `PropValue` has four members, two of which do not denote one. Narrowing
the field to `static | computed | condition` is a compile-time improvement only: `when` arrives from a
pasted document, so `guardPasses` still has to be total and still has to choose an answer for a kind it
does not know. The complaint that the two consumers "chose opposite polarities" was the real defect and it
is not one -- both answer `true`, both meaning "no guard was expressed" -- but only one of them said so.
Now both do.

## `pattern` is unanchored — `validation.ts:183`, area 2

**LOW.** It matches JSON Schema, not `<input pattern>`, so `\d{5}` accepts `abc12345` and an author
copying from an HTML tutorial gets a weaker rule than the one they copied. Anchoring it would make the
engine disagree with the schema the same document exports, and a server validating a submission against
that export would then accept what the form refused -- silently, which is the failure mode this project
is organised against. Documented instead, in `08-validation.md` where an author reads it and beside the
code that does it.

## The MUI helper-text spacer is already a non-breaking space — `renderers.tsx:52-55`, area 3

**LOW, refuted.** The finding says the comment claims U+00A0 while the literal is U+0020. The file holds
`M-BM- ` on that line, which is U+00A0 in UTF-8: the review read the rendered character rather than the
bytes. Nothing to change.

## A "circular" Progress in the HTML kit is a disc, not an arc — `kit-html.css:447-451`, area 4

**NOTE.** MUI draws a real `CircularProgress`; the HTML kit draws a round element with the same fill,
which reads as a pie rather than a ring. Making them match means an SVG arc with its own animation, its
own reduced-motion behaviour and its own determinate geometry — a component, not a repair, and the kit's
stated job is to prove a kit is a package rather than to match MUI's drawing. The two agree on the
semantics that matter and the contract checks: `role="progressbar"`, the value attributes, and the
absence of them when indeterminate.

## `FormData` and `FormContext` cannot be told apart in both directions — `types.ts:186,207`, area 1

**LOW, partly fixed.** `FormContext` is `Readonly` now, so handing a context to something that wants data
is a type error — the direction where the host's own facts would end up in the payload. The opposite
direction still compiles, and closing it needs a nominal brand, which would make every host cast an
object literal to call `validateForm`. A library that is unpleasant to call is a library people wrap,
and a wrapper is where the two get swapped for real.

## The canvas zone should not bounds-check a release — `Canvas.tsx:315-326`, area 6

**NOTE.** The finding is that `resolveRelease` never checks the release point is inside the surface. I
wrote the check, and it broke `dragging a component on the canvas moves it`: the canvas scrolls, so a
drop onto the last component of a long form is released below the surface's visible box while sitting
squarely inside the form's own geometry. The client box is the wrong question, and the right one --
"is this point inside any container?" -- is what `resolveDrop` already answers by returning nothing.
The guard exists one layer down. The fabricated `dragId` of `0` in the same finding was real and is
fixed: it is `-1` now, a value no drag can be holding.

## Perf notes with no defect behind them — areas 5 and 6

**NOTE, five findings.** `groupKit` is O(components × groups) and `findLanguage` is linear, both over
lists of at most a few dozen entries; `indexKit(kit)` allocates a Map per pointer move in `Tree.tsx`, on
a kit with 27 components; `measureIn` reads 2N rectangles where N+1 would do, per drag rather than per
move; and `DocumentDialog` re-serialises the document on every keystroke in a textarea nobody types a
whole document into. Each is a real observation and none of them is a defect: the numbers are small, the
work is not on a frame budget, and the fix in every case is a memo or a shared instance that has to stay
correct across an edit. Worth doing on evidence -- a profile, a form somebody says is slow -- and not
before.

## `LeftPane` re-renders `Tree` when `api` changes — `LeftPane.tsx:55-65`, area 5

**NOTE, no longer true.** The finding says `api` is a new object every render. `useDesigner` memoises it
now, so it changes when the document, the selection or one of its callbacks does -- which is when the
tree has something new to draw.

## Two glyphs hardcode `opacity` — `Icon.tsx:111,166`, area 5

**NOTE.** In forced-colors mode the browser replaces the colour and leaves the opacity, so those two
glyphs stay faint where the rest go solid. The fix is an SVG attribute that cannot be media-queried from
this file, so it means either drawing the two glyphs differently or moving icon styling into
`designer.css` and giving every glyph a class -- a change to how icons are drawn, made for a mode
neither kit has been tested in. It is worth doing as part of a forced-colors pass, with something to
check the result against.

## The ResizeObserver stub counts; no test consumes it yet — `setup.ts:22`, area 10

**NOTE, half fixed.** The stub records constructions, observations and disconnects now, and holds the
tally on `globalThis` because the setup file runs once per test file while the stub it installs is
global -- counters in module scope would be incremented by whichever file ran first and read as zero
everywhere else, which is the silent pass the counting was added to prevent.

I could not make the leak test itself trustworthy in the time it deserved. The counters are cross-file
state, testing-library's `cleanup` disconnects observers between tests, and the reading a test gets
therefore depends on what ran before it in the same worker -- I had a version passing at the end of one
file and failing at the top of it, which is a test that reports the order of the suite rather than the
behaviour of the code. The instrument is in place for a test written against a mounted-and-unmounted
component in isolation.

## `scrollIntoView` is stubbed and nothing asserts it — `setup.ts:32`, area 10

**LOW, no longer applicable.** The selection layer does not call it any more: it scrolls the canvas by
its own offsets, because `scrollIntoView` walks every scrollable ancestor and dragged the host's page
around whenever somebody clicked a tree row. The stub stays because `userEvent` calls it while typing
and a kit is free to; the docblock says so now.

## axe's `target-size` and `scrollable-region-focusable` are covered nowhere — `a11y.test.tsx:34`, area 10

**NOTE.** Both are disabled for want of layout, like `color-contrast`, and only contrast has a
compensating check. Covering them means measuring hit areas and scroll containers in a real browser --
a Playwright axe pass, which is a piece of infrastructure rather than a test, and worth adding as one
deliberate step rather than as a corner of a stage-5 sweep.

## Two documented checks that were already true — areas 8 and 10

**NOTE, no longer applicable.** `vite.config.ts:9` (no `strictPort`) was fixed in item 22, when the same
hazard turned up from the Playwright side. `designer.css.test.ts:36` (`declarationsFor` locating a block
by substring) was fixed in item 26, where a duplicated selector made the substring reader lose half a
rule; it now walks every block a selector has and checks the prelude is the whole selector rather than
part of one.

## The remaining tail of designer test gaps — area 10

**LOW.** The review's last finding lists a dozen small coverage gaps. Seven are covered now: `modesFor`'s
conditional arm, `describeMove`'s four arms, the `pattern` and `custom` rule editors, the raw box
following a structured control, `pointercancel`, the drag label's source, an unknown icon name and the
icon's height.

The rest are left: the one-step viewport switcher case in `Canvas.test.tsx`, `aria-labelledby` as an
accepted label in `Tree.test.tsx`'s sweep, `download` and `onFile` in `DocumentDialog.test.tsx`, and
hook-level tests for five `DesignerApi` writers that are covered through the panels that call them.
Each is a real gap and none of them is a defect: they are tests to write when something touches those
paths, which is when a test written for them will be checked against a change rather than against the
code it was copied from.

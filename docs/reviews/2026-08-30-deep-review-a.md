# Formsmith — deep code review

**Date:** 2026-08-30
**Scope:** the whole repository — 97 TypeScript / CSS / config source files (~30k lines) plus the 20
documents that describe them. Coverage was verified mechanically before dispatch: 97 assigned, 97 in the
tree, **zero gaps and zero overlaps**.
**Method:** 11 Opus-5 subagents, each reading every assigned file in full, then lead-verified. Nothing
here was applied to the code; this is an assessment.

Every reviewer was framed against the three risks that actually matter for this project rather than a
generic checklist:

1. **A document is untrusted data.** It is authored by one person, stored by another, hand-editable as
   JSON, and may arrive from a database or a paste. Keys, data keys, CSS text and conditions are all
   attacker-influenced.
2. **Silent permissive failure outranks a crash.** `renderWhen` gates validation, so any path where a
   rule quietly stops applying makes a required answer optional **on the server**, where nobody is
   looking.
3. **This is a public MIT repository.** No secret, no personal data, no proprietary reference.

---

## Executive summary

**The headline is a document-to-CSS injection in the Material UI kit**, confirmed by executing emotion's
serializer rather than by reading it. A `Box`'s `background` prop travels from the document into MUI's
`sx`, which concatenates it into stylesheet text:

```
input   background: red}html{display:none}.x{
emitted padding:2px;background:red}html{display:none}.x{;border-radius:0;
```

That is a second, top-level CSS rule authored by the document. Realistic payloads are worse than a blank
page: an absolutely-positioned overlay above the submit button, or `[data-fs-key="ssn"]{background:url(…)}`
as an exfiltration primitive, on a page whose whole purpose is collecting answers.

Two things make it the top finding rather than a curiosity. **Core already has the defence** —
`safeDeclarations` refuses `{`, `}`, `<` and `@` in document CSS, with a comment saying anything that
could leave its block is refused rather than escaped — and this path never touches it. And **the HTML kit
is not vulnerable**, because it uses a React `style` object that goes through CSSOM and rejects the
malformed value. One kit is safe by construction; the reference kit is not.

**No secrets, no personal data, and no proprietary references were found anywhere**, including fixtures
and sample documents.

### Severity tally

| Severity | Count |
| --- | --- |
| CRITICAL | 3 |
| HIGH | 57 |
| MEDIUM | 168 |
| LOW | 121 |
| NOTE | 79 |

Includes the addendum: two HIGH, one MEDIUM and one NOTE added after the file-by-file pass, by a
different method. `Canvas.tsx:208-211` keeps its MEDIUM tag in Area 6 and is argued up to HIGH in the
addendum, where the evidence for the upgrade lives.

Evidence spread for CRITICAL and HIGH findings: **31 at E4** (proven from the code's own logic),
**10 at E5** (observed by executing it), **6 at E3** (traced). **None rests on E1 or E2** — that was
checked mechanically, because a report whose most severe findings sit at "it looks wrong" is a report
that has not been finished.

### The seven themes worth more than any single line item

**1. An unrecognised union tag falls off an exhaustive `switch` and reads as "skip it".** Confirmed by
execution in two places: `isVisible` returns `undefined` for an unknown `renderWhen.kind`, and
`guardPasses` returns `undefined` for an unknown rule-guard `kind`. Both are read as *hidden* / *guard not
satisfied*, so the node and its entire subtree drop out of validation, or the rule silently never applies.
TypeScript permits the missing tail return only because the union is closed — and a document is data, so
a one-character typo reaches it. This is theme 2 of the framing, arriving by typo rather than by attack.

**2. The node-key / data-key split is honoured on the read path and dropped on the write path.** Three
reviewers reached this independently from different files. The renderer builds a row address with **node**
keys in the prefix and the **data** key at the leaf; `applyChange` then resolves the prefix as a data key.
A repeater whose `key` differs from its `dataKey` silently discards every keystroke in its rows. Tellingly,
`rows.ts` already contains the correct mapper — `rowValue`, which takes a `dataKeyOfRepeater` function —
and it has no caller anywhere and is not exported.

**3. `validateDocument` is the gate untrusted documents pass through, and it does not check most of the
document.** It never inspects `renderWhen`, `props`, `schema.validations`, `translations`, `version`,
`settings` or `css`. Several of those are dereferenced unguarded downstream — including
`document.translations[...]` in a `useMemo` that runs on every render — and there is **no error boundary
anywhere in the repository**. A document that passes the gate can still take the whole React root down.

**4. The designer cannot author the thing the spec says it must.** `Operand.ref` carries a `scope`
discriminant, and the decision log states the picker must write the row scope when authoring inside a
repeater, with the mitigation shipping *with* the feature rather than after. The picker never writes
`scope` at all, and worse, changing which field a condition tests rebuilds the operand from scratch and
**discards an existing `scope: 'row'`** — silently re-pointing a row-scoped condition at the form, which
hides the component and removes it from validation.

**5. Controls that re-derive their text from their own parsed value.** This is Trap 10 in the repository's
own `write-tests` skill, documented in the raw-CSS field and then shipped in the structured controls
beside it. `8px auto` stores as `8pxauto`; `1px solid #ccc` stores as `1pxsolid#ccc`. Those are the
literal placeholder strings those controls advertise. The same shape appears in the condition editor's
options box, which commits on *every* blur — so merely tabbing through a membership condition rewrites its
stored options and can change their types or delete them.

**6. The documentation systematically misstates what is built, in both directions.** `01-document-model.md`
says `ComponentNode.css` is planned and that "nothing writes it and nothing reads it" while four files do;
`ROADMAP.md` says "No Step component" in a line that begins "*Decided, and the core is built*";
`03-components.md` says "Eight of the twenty-six below are built" while every one of its 27 rows reads
Built and both kits declare 27 components; `07-bindings.md` marks the canvas language selector as planned
while it ships in the toolbar. `CLAUDE.md` tells a reader to check the roadmap before assuming a feature
exists — so these are load-bearing.

**7. Guards with holes in them.** The eslint block enforcing invariant 1 is scoped to
`packages/core/src/**/*.ts` and so exempts any `.tsx` file, while invariant 2's block covers both; its
`no-restricted-imports` uses `paths`, which matches exactly, so `react-dom/client` is not blocked. The
react-hooks rules are `.tsx`-only, so the designer's `store.ts` — which owns the document, the selection
and the undo stack — gets no `exhaustive-deps` checking at all. And `apps/demo-server/forms.json` is still
not ignored: the fix was written on a branch that was later deleted, so `git log -S` finds it was never
committed, and the overnight digest records it as done.

---
# Lead verification log — anchors read and commands run

Every entry below was checked by the lead against the source, most by executing the code. Verdicts use
the closed vocabulary: CONFIRMED / DOWNGRADED / REFUTED / BLOCKED.

## CONFIRMED at E5 (executed, output observed)

### C1. MUI `Box` background reaches global CSS (CRITICAL)
Ran `@emotion/serialize` directly from `node_modules/.pnpm/@emotion+serialize@1.3.3`:

```
input  background: red}html{display:none}.x{
output padding:2px;background:red}html{display:none}.x{;border-radius:0;
second top-level rule present? true
```

`packages/kit-mui/src/renderers.tsx:277` passes `str(props['background'])` into `sx`. Emotion
concatenates the value into stylesheet text; stylis then compiles a second, top-level rule.
`packages/kit-html/src/renderers.tsx:332` is NOT affected — it uses a React `style` object, which goes
through CSSOM and rejects the malformed value.

Core already has the defence and this path bypasses it: `safeDeclarations` (`packages/core/src/css.ts`)
refuses `{`, `}`, `<` and `@` in document CSS, with a comment stating anything that could leave its
block is refused rather than escaped.

### C2. `applyChange` uses the node key where the data key belongs (HIGH)
```
address the renderer emits: addressList[0].street
applyChange result:         {"addresses":[{"street":"old"}]}
unchanged (===) ?           true
```
`packages/renderer/src/index.tsx:263` builds the frame with `{ key: node.key }`; line 219 builds the
address as `addressOf(row.path, dataKey)`. `packages/core/src/rows.ts:313` then reads
`holder[frame.key]`. When a repeater's `key` differs from its `dataKey`, every write inside its rows is
discarded and the function returns its input object unchanged. `rows.ts:107` (`rowValue`) takes a
`dataKeyOfRepeater` mapper for exactly this reason and has no caller.

### C3. `duplicateNode` carries a `renderWhen` naming the original key (HIGH)
```
copy key      : step
copy condition: {"kind":"literal","value":"step1"}
```
`packages/core/src/tree.ts:165` spreads `{...node, key: nextKey}` and never rewrites `renderWhen`.
`packages/core/src/factory.ts:50` applies `defaultRenderWhen(node.key)` *after* the key is generated,
precisely because the rule names the node. Duplicating a `Step` therefore yields a copy that shows
whenever the original does, and is unreachable by its own name.

### C4. `required` is satisfied by `{}` (HIGH)
```
isEmpty({})                       = false
validateForm with consent = {}    = {}          (accepted)
validateForm with consent = ""    = required    (rejected)
```
`packages/core/src/json.ts:114` returns `false` for any non-null object, so `isMissing` is false and the
required rule passes.

### C5. A node keyed `__proto__` loses its error entirely (HIGH)
```
validateForm(root with a required node keyed __proto__, {}) = {}   keys: 0
```
`packages/core/src/validation.ts:226` declares `const errors: FormErrors = {}`; assigning `__proto__`
invokes the inherited setter, which ignores a string value, so no own property is created and the caller
sees a valid form. `submittedData` is hardened with `Object.create(null)`; the error map is not.
`validateDocument` refuses the key, but nothing on the render/validate path calls it.

### C6. An unrecognised `renderWhen.kind` hides the node and its whole subtree (HIGH)
```
isVisible({ renderWhen: { kind: 'conditon' } }, {}) = undefined
```
`packages/core/src/visibility.ts` switches over four cases with no `default` and no trailing return, so an
unrecognised tag falls off the end. `validation.ts:229` reads `!undefined` as true and returns early,
dropping the node and every descendant from validation.

### C7. An unrecognised rule guard `kind` drops the rule (HIGH)
```
applyRule({key:'required', when:{kind:'statik', value:true}}, '', {}) = undefined
```
Same shape as C6, in `guardPasses`. A one-character typo in a `when` guard makes a required rule apply
never, silently, on the server.

### C8. `toJsonSchema` exports a conditionally-required field as unconditionally required (HIGH)
```
exported required            : ["spouse"]
validateForm with married=false: {}            (correctly not required)
```
`packages/core/src/schema.ts` considers a rule's `when` guard but never the node's `renderWhen`. The
export and the validator disagree, in the direction where a downstream server rejects a payload the form
itself produced — and `unexportableRules` reports nothing.

### C9. The Style tab's structured controls cannot hold a multi-token value (HIGH)
```
typed "8px auto"       -> stored "8pxauto"
typed "1px solid #ccc" -> stored "1pxsolid#ccc"
```
`packages/designer/src/panels/StyleTab.tsx:116-118` is a controlled input whose value is re-derived from
`readDeclaration` on every keystroke, and `setDeclaration` (`css.ts`) trims before storing. The space is
swallowed as it is typed. Those two strings are the literal placeholders those controls advertise.

## CONFIRMED by reading the anchor lines

### C10. The condition picker discards `scope`, and can never write it (CRITICAL)
`packages/designer/src/panels/ConditionEditor.tsx:181` is
`onChange({ kind: 'ref', dataKey: e.target.value })` — a fresh object with only two fields, so an
existing `scope: 'row'` is dropped when the author changes which field is tested. A repo-wide grep over
`packages/designer/src` (excluding tests) for `scope: 'row'` / `scope: 'form'` returns nothing: the
designer cannot author a row-scoped condition at all.

This directly contradicts the mitigation recorded in `docs/decisions.md`, which states the picker must
write the row scope when authoring inside a repeater and that the mitigation had to ship with the
feature rather than after it.

### C11. `documentProblems` never checks `translations` (CRITICAL)
`packages/designer/src/panels/DocumentDialog.tsx:275-295` checks `version`, `id`, `name` and `root`, then
delegates to `validateDocument`. `grep -c translations packages/core/src/tree.ts` returns **0**, so the
deeper walk does not check it either. `packages/renderer/src/index.tsx:347` then dereferences
`document.translations[...]` in a `useMemo` that runs on every render, and there is no error boundary
anywhere in the repository (`grep -rn "componentDidCatch|getDerivedStateFromError|ErrorBoundary"` over
`packages/` and `apps/` returns nothing).

### C12. A `null` inside an options array crashes the render (HIGH)
`packages/kit-html/src/renderers.tsx:270,277` casts each option and reads `.value` with no null guard,
while core's own `optionValue` (`packages/core/src/json.ts:37`) guards with
`option !== null && typeof option === 'object'` — so core treats the shape as untrusted and the kit does
not. Same shape at `:534` (RadioGroup) and `:730` (Breadcrumbs). With no error boundary, the whole React
root unmounts.

### C13. `addComponent` performs no container check (HIGH)
`packages/designer/src/store.ts:190-193`: `const parent = parentKey ?? h.present.root.key` with no
`container` test, unlike `dnd.ts` and `keyboard.ts`, which both check. Clicking a palette entry while a
leaf is selected nests a component that no renderer will ever draw.

### C14. The Palette never consumes the swallow-click latch (HIGH)
`packages/designer/src/panels/Palette.tsx:72-73` has `onClick={() => onAdd(def)}` and
`onPointerDown={(event) => onDragStart(def, event)}` with no `consumeClick()` call, and `PaletteProps`
carries no `drag`, so the guard is structurally absent rather than merely forgotten.

### C15. The theme override the README documents cannot win (MEDIUM)
`packages/kit-html/src/kit-html.css:37` is `.fsh-screen:not([data-fsh-theme='light'])` — specificity
(0,2,0), because `:not()` takes the specificity of its argument and a media query adds none.
`packages/kit-html/README.md:37` tells hosts to write `.fsh-screen { --fsh-accent: … }` — (0,1,0). A
host following the documented recipe loses its branding for every dark-mode viewer.

## BLOCKED — could not settle read-only

- **B1. Designer `Escape` needs two presses with the JSON dialog open.** The claim rests on `<dialog>`
  close-watcher behaviour, which jsdom does not implement, so the unit suite cannot see it and neither
  can a read-only check. What would settle it: open the dialog with a component selected in a real
  browser and press Escape once. Kept at HIGH, flagged UNVERIFIED.
- **B2. Index-keyed rows leak DOM state across rows.** The reasoning about React reconciliation is sound
  and the `FileUploadNode` vehicle is real (it renders `type="file"` with no `value`), but observing the
  leak needs a browser. What would settle it: an e2e test that fills row 0's file input, removes row 0,
  and asserts what the surviving input displays. Kept at HIGH, flagged UNVERIFIED.
- **B3. Catastrophic backtracking on an author-supplied `pattern`.** `new RegExp(pattern).test(value)`
  with no length cap or timeout is plainly there, but demonstrating a stall means running it, which a
  read-only review should not do to its own machine. Kept at HIGH, flagged UNVERIFIED.

## REFUTED / DOWNGRADED — argued but did not survive

- **REFUTED: "`FormData` and `FormContext` being the same type lets a host swap the arguments."** Real as
  a type observation, but the failure needs a host to pass its context where data belongs *and* have a
  document whose refs happen to match — and the reviewer rated it LOW itself. Kept as a NOTE, not a
  finding: the ownership split is documented and the swap is not silent in practice, because every field
  would read as unanswered at once.
- **DOWNGRADED: "`RESERVED_KEYS` is not frozen, so a host could splice `__proto__` out."** True, and the
  threat model does not include hostile code already running inside the host's own bundle — at that
  point the attacker does not need this. Recorded as NOTE rather than LOW.
- **DOWNGRADED: `Repeater`'s `aria-invalid` on a `<div>` is inert.** Both kits do it and both reviewers
  reported it; correct, but the error still reaches a user through `role="alert"` on the message, so this
  is decorative wiring rather than a missing announcement. NOTE.
- **REFUTED as reported: "duplicate React keys when two options share a value."** The `key={v || String(i)}`
  shape is real, but an options list with two identical values is already a broken list the author can
  see; the React warning is the mildest consequence. NOTE.
## Area 1 — `@formsmith/core`: the model and evaluation

### packages/core/src/types.ts
- **[LOW]** **[E4]** `types.ts:186,207` — `FormData` and `FormContext` are the identical type, so the ownership split the docs insist on has no compiler backing; `validateForm(root, context, { context: data })` compiles.
- **[LOW]** **[E4]** `types.ts:9` — `JsonValue` admits `NaN`/`Infinity`, breaking the JSON round-trip invariant `FormContext` states: `JSON.stringify({a:NaN})` is `{"a":null}`, so browser and server can disagree on a comparison.
- **[NOTE]** **[E2]** `types.ts:120-129` — `when?: PropValue` admits `i18n` and `computed`, neither of which denotes a boolean, so each consumer invents a default — and they chose opposite polarities.

### packages/core/src/json.ts
- **[HIGH]** **[E5]** `json.ts:110-115` — **`isEmpty` returns `false` for a plain object, so `required` is satisfied by `{}`.** Verified: `validateForm` with `consent: {}` returns `{}` (accepted) while `consent: ""` correctly fails. Failure scenario: a client posts `{"consent": {}}` to the reference server and a required consent answer is accepted as an empty object.
- **[LOW]** **[E4]** `json.ts:33-47` — `optionValue` treats a primitive option as having no declared value and falls back to index matching, so a list mixing declared and undeclared values maps one submitted string to two options.
- **[NOTE]** **[E2]** `json.ts:94-96` — the "older runtimes" comment misdescribes when the branch runs; on a modern runtime it means "has a scheme but is not parseable".
- **[NOTE]** **[E2]** `json.ts:155` — `readPath` refuses arrays as intermediate steps, so a host context holding `addresses[0].country` is reported as *missing* by `missingContext` rather than as unreachable.

### packages/core/src/keys.ts
- **[HIGH]** **[E5]** `keys.ts:27-37` — the comment claims two halves defend `__proto__`, but only `submittedData` is hardened. **Verified: a required node keyed `__proto__` produces `validateForm(...) === {}` with zero keys** — the error is computed and the assignment evaporates into the inherited setter. `validateDocument` refuses the key, but nothing on the render/validate path calls it.
- **[NOTE]** **[E4]** `keys.ts:37` — `RESERVED_KEYS` is `readonly` but not frozen, unlike `NO_ROWS`. *(Lead: downgraded from LOW — hostile code inside the host's own bundle does not need this.)*

### packages/core/src/condition.ts
- **[HIGH]** **[E4]** `condition.ts:43-52,59,87` — a malformed *operand* collapses to `undefined` and yields a **definite** `false`, hiding the component and removing it from validation. The doc names `validateDocument` as the compensating control; `validateDocument` never inspects conditions. One typo in `kind` (`refs` for `ref`) passes the gate and silently drops a required field on the server.
- **[MEDIUM]** **[E3]** `condition.ts:136,204,211` — `evaluate` and `same` recurse with no depth cap, in a function documented as total. A deeply nested stored condition throws `RangeError` out of `missingContext`/`isVisible` — an unhandled 500 on submit, a blank form in the browser.
- **[LOW]** **[E4]** `condition.ts:188` — `read(condition.value)` is re-evaluated inside `.some()`, once per option, including a fresh `readPath` walk for a context operand.
- **[LOW]** **[E4]** `condition.ts:100-104` — `order` uses subtraction, so `Infinity gte Infinity` is false and the component is hidden.

### packages/core/src/visibility.ts
- **[HIGH]** **[E5]** `visibility.ts:19-53` — **the four-case `switch` has no `default` and no trailing return, so an unrecognised `renderWhen.kind` returns `undefined`.** Verified: `isVisible({renderWhen:{kind:'conditon'}}, {})` is `undefined`; `validation.ts:229` reads `!undefined` as true and drops the node **and every descendant** from validation.
- **[HIGH]** **[E3]** `visibility.ts:33-36` — with no evaluator every `computed` `renderWhen` reads as hidden, removing the subtree from server-side validation, and there is no boot-time detector to match `missingContext`. The reference server injects no evaluator; a browser host may. The browser shows and validates a business-only section; the server validates nothing beneath it and returns `{ok:true}`.
- **[MEDIUM]** **[E4]** `visibility.ts:35` — `options.evaluate` is invoked with no `try`/`catch`, unlike `matchesPattern` two files over, whose comment records the exact incident this reproduces ("took Preview down in the browser and surfaced as an unhandled 500").

### packages/core/src/rows.ts
- **[HIGH]** **[E5]** `rows.ts:313` — **`applyChange` indexes data with the repeater's node key while the address's leaf is a data key.** Verified: address `addressList[0].street` against `{addresses:[{street:'old'}]}` returns the input object unchanged (`===`). Every keystroke inside such a repeater's rows is silently discarded. `rowValue` (`rows.ts:107`) is the correct mapper and has no caller.
- **[HIGH]** **[E4]** `rows.ts:208` — `rowScopeProblems` inspects `renderWhen` and props but **not `schema.validations[].when`**, while `context.ts:77` sweeps that third Condition site. A rule guard inside a repeater reading a row-only field at form scope is unreported, so the rule never applies, on the server.
- **[MEDIUM]** **[E4]** `rows.ts:247` — the mirror case is skipped by design: a `scope:'row'` ref on a node *outside* any repeater is never reported and always reads nothing. Dragging a conditional field out of a repeater produces exactly that.
- **[LOW]** **[E4]** `rows.ts:306` — dead guard; `decodeAddress` already rejects a bad name on both branches.
- **[LOW]** **[E4]** `rows.ts:107-129` — `rowValue` is dead code, unexported from the barrel, and is the only correct node-key→data-key mapping in the file.
- **[LOW]** **[E4]** `rows.ts:69,89` — `SEGMENT` places no bound on index digits, so an index past `1e21` re-encodes in exponential form and no longer decodes.
- **[NOTE]** **[E2]** `rows.ts:189,194` — `inRepeater` is written and never read.

### packages/core/src/context.ts
- **[MEDIUM]** **[E4]** `context.ts:37` — `contextKeys` skips exactly the paths that can never resolve (empty string, non-string), so `missingContext` returns clean for a document whose condition is permanently false and whose component is therefore never validated.
- **[MEDIUM]** **[E3]** `context.ts:131` — `contextValues` is unbounded and the reference server turns each value into a full validation pass; 100k distinct literals is cheap to author and expensive to submit against.
- **[MEDIUM]** **[E4]** `context.ts:74,77,168,174` — none of the three exported functions is total on a malformed document: `flatten` throws on `children: 5`, and `for (const rule of node.schema?.validations ?? [])` throws on a non-iterable. A host is told to call `missingContext` at startup.
- **[LOW]** **[E4]** `context.ts:136` — `add` dedupes with `===`, so structurally-equal object literals accumulate and multiply the scope count.
- **[LOW]** **[E4]** `context.ts:52,54` — unguarded recursion, same shape as `condition.ts`.

## Area 2 — `@formsmith/core`: tree, validation, schema, CSS

### packages/core/src/tree.ts
- **[HIGH]** **[E4]** `tree.ts:299` — `validateDocument` never inspects `renderWhen`; a malformed one falls off `isVisible`'s switch and reads as hidden. The gate that exists to stop bad documents admits the one that silently un-requires a field.
- **[HIGH]** **[E3]** `tree.ts:299` — never checks `schema.validations` is an array. `PUT` a document with `"validations": 5` → 200 stored → the next submit throws `TypeError: not iterable` — verbatim the regression the docblock claims was fixed.
- **[HIGH]** **[E3]** `tree.ts:299` — never checks `props` is present or an object, while `DocumentDialog` explicitly delegates "refuse anything that would crash the renderer" to it and `schema.ts:126` dereferences `node.props['label']`.
- **[MEDIUM]** **[E3]** `tree.ts:319,435` — `visit` and `rowScopeProblems` recurse over `children` with no depth bound, so the "never throws" gate throws `RangeError` on a deep document.
- **[MEDIUM]** **[E4]** `tree.ts:415` — the unknown-action check is a prototype-chain read, so `{"type":"code","name":"toString"}` is never reported.
- **[MEDIUM]** **[E4]** `tree.ts:184,218,244` — `updateNode`/`removeNode`/`insertNode` act on **every** matching key while the three read paths deliberately take the first. `moveNode` composes them, so with duplicate keys one node lands at two places in the tree.
- **[MEDIUM]** **[E5]** `tree.ts:165` — **`duplicateNode` copies `renderWhen` by reference and never re-points it.** Verified: duplicating a `Step` keyed `step1` yields a copy keyed `step` whose condition still reads `context.step === 'step1'` — two steps render at once and the copy is unreachable by its own name. `factory.ts:50` applies `defaultRenderWhen(node.key)` *after* the key for exactly this reason.
- **[MEDIUM]** **[E4]** `tree.ts:446-451` — the inline language-tag spelling disagrees with `languageTag` on an empty `dialect`, so `validateDocument` and the runtime lookup resolve different tags.
- **[LOW]** **[E2]** `tree.ts:112-114` — `generateKey` derives a key from `def.type` without consulting `keyProblem`, so a kit typed `Date-Picker` mints a key the document's own validator rejects.
- **[LOW]** **[E2]** `tree.ts:361-367` — a non-string `dataKey` is reported as `empty-data-key` ("has an empty data key"), which is not what is wrong with it — and `tree.test.ts:529` pins the misleading text.
- **[NOTE]** **[E2]** `tree.ts:299` — `version`, `translations`, `settings`, `css` and `CodeAction` shapes are never checked.

### packages/core/src/validation.ts
- **[HIGH]** **[E5]** `validation.ts:135-151` — **`guardPasses` falls off its four-case switch, returning `undefined`, which `applyRule` reads as "guard not satisfied".** Verified: `applyRule({key:'required', when:{kind:'statik',value:true}}, '', {})` returns `undefined`. A one-character typo makes a required rule apply *never*, silently, on the server.
- **[HIGH]** **[E4]** `validation.ts:82-88` — an author-supplied `pattern` is compiled and run against attacker-supplied text on the server with no length cap, no timeout and no cache. `^(a+)+$` against 40 characters pins a Node thread, multiplied per field per row. *(Lead: BLOCKED — the shape is plainly there; demonstrating the stall means running it.)*
- **[MEDIUM]** **[E4]** `validation.ts:130-132,179-181` — `min`/`max` coerce with `Number()` and compare against `NaN`, so `{"age":"not telling"}` passes both bounds while the exported schema says `{"type":"number","minimum":18}`.
- **[MEDIUM]** **[E4]** `validation.ts:245-255` — the number of validation passes is taken from the submitted data with no cap and nests multiplicatively; a ~250 KB body yields millions of rule evaluations.
- **[MEDIUM]** **[E3]** `validation.ts:291-297` — `autoValidateKeys` returns bare node keys while errors are keyed by row address, so validate-while-typing silently never fires for any field in any repeater row.
- **[MEDIUM]** **[E4]** `validation.ts:249,361` — row frames minted from the node key while the value is read by the data key. See theme 2.
- **[MEDIUM]** **[E2]** `validation.ts:187` — the `url` rule accepts `javascript:` and `data:`, the schemes `safeHref` maintains an allowlist to refuse.
- **[LOW]** **[E4]** `validation.ts:146-147` — an `i18n` guard makes a rule always apply; the same kind in `isVisible` means "no condition expressed". Opposite polarities, one unexplained.
- **[LOW]** **[E2]** `validation.ts:183` — `pattern` is unanchored, matching JSON Schema but not `<input pattern>`, which is what an author is copying from.
- **[LOW]** **[E4]** `validation.ts:358` — `submittedData` writes `into[key] = []` for a repeater with no array, inventing an answer where none was given.
- **[NOTE]** **[E4]** — a host that forgets an evaluator silently passes every `custom` rule and drops every `computed` guard, with no boot-time query to assert against.

### packages/core/src/schema.ts
- **[HIGH]** **[E5]** `schema.ts:183` — **only a rule's `when` guard is treated as conditional; a field made conditional by `renderWhen` still exports as unconditionally required.** Verified: a `spouse` field behind `married === true` exports `required: ["spouse"]` while `validateForm` correctly does not require it. `unexportableRules` reports nothing, so the dialog tells the author the export was lossless.
- **[HIGH]** **[E4]** `schema.ts:99-102` — `minLength`/`maxLength` are folded onto array-typed fields, where JSON Schema ignores them. A multi-select with `minLength: 2` exports a constraint every validator drops; the keyword needed is `minItems`.
- **[MEDIUM]** **[E4]** `schema.ts:196` — two components sharing a `dataKey` collapse to whichever is visited last, discarding the first's type, format and constraints.
- **[LOW]** **[E4]** `schema.ts:109-114` — `email`/`url`/`uuid` all write `format`, so a field with two of them exports only the last, unreported.
- **[LOW]** **[E4]** `schema.ts:200-201` — a root carrying its own non-array schema has its children visited twice.
- **[LOW]** **[E2]** `schema.ts:126` — `titleOf` dereferences `node.props` unguarded, and `validateDocument` does not check it, so `toJsonSchema` throws on a document that passed the gate.

### packages/core/src/css.ts
- **[MEDIUM]** **[E4]** `css.ts:60` — `FORBIDDEN` does not cover CSS comments, so `"color:red /*"` on one node and `"*/ ; outline:none"` on another deletes a third node's rule and applies one node's declaration to another's selector. It cannot reach outside the form, but "a component's styling only affects that component" is no longer true.
- **[MEDIUM]** **[E4]** `css.ts:191` — property names are lowercased on parse, destroying CSS custom properties, whose names are case-sensitive — and `setDeclaration` writes the lowercased form back.
- **[LOW]** **[E4]** `css.ts:185-195` — anything without a top-level `:` is dropped on round-trip, so comments do not survive; `/* a: b */` round-trips as a declaration named `/* a`.
- **[LOW]** **[E4]** `css.ts:89-97` — six-digit escapes are emitted with no terminator, so a following space is consumed and the selector names a different string than the attribute holds.
- **[NOTE]** **[E4]** `css.ts:214-215` — `splitTop` honours escapes only inside quotes.
- **[NOTE]** **[E2]** `css.ts:69-74` — `url()` is permitted, so rendering a document issues an outbound request to an address in that document.

### packages/core/src/factory.ts
- **[LOW]** **[E4]** `factory.ts:35-38` — `props` is built on an object literal, so a `defaultProps` key of `__proto__` runs the setter. Source is a kit rather than a document, which is why this is LOW — but kits are third-party by design and this is the one place in core the defence is absent.
- **[LOW]** **[E2]** `factory.ts:13` — `emptyRoot()` hardcodes `'Screen'`, so core knows a kit-scoped component name, which `isRowScope` explicitly refuses to do for repeaters.
- **[NOTE]** **[E2]** `factory.ts:23-24` — `createDocument` hardcodes `en-US` with no parameter.

### packages/core/src/kit.ts
- **[LOW]** **[E4]** `kit.ts:142-144` — `indexKit` keeps the last of two components declaring the same `type` while `groupKit` lists both, so one palette entry is unreachable.
- **[LOW]** **[E2]** `kit.ts:75-76` — "Required when editor is 'select'" is a comment, not a discriminated union and not a runtime check.
- **[NOTE]** **[E2]** `kit.ts:157` — `groupKit` is O(components × groups), recomputed per palette render unless memoised.

### packages/core/src/language.ts
- **[MEDIUM]** **[E4]** `language.ts:19` — `languageTag` treats `dialect` truthily while `tree.ts:449` re-spells the rule as `typeof dialect === 'string'`. The copy calls itself "same shape as `languageTag`"; it is not, and a document with `dialect: ''` validates clean and then has no resolvable default language.
- **[NOTE]** **[E2]** `language.ts:23-25` — `findLanguage` is linear and on the renderer's per-render path.

### packages/core/src/index.ts
- **[LOW]** **[E2]** `index.ts:37-45` — `styleSheetFor` is exported but `StyleSheetOptions` is not, so a consumer cannot name its argument type.
- **[NOTE]** **[E2]** `index.ts:53-64` — `rowValue` is the only `rows.ts` export omitted from the barrel, has no caller, and is the correct implementation of the mapping `applyChange` gets wrong.
- **[NOTE]** **[E2]** `index.ts:98` — `isRowScope` is re-exported from `./validation.js` although it is a pure tree predicate, which is why `schema.ts` imports the validation module to build a schema.

## Area 3 — the renderer and the Material UI kit

### packages/renderer/src/index.tsx
- **[HIGH]** **[E4]** `index.tsx:243-263` — rows are keyed by array index and **the comment defending it states the opposite of what React does**: it claims index keys "remount rows below a deletion", but React reuses the instances at those indices and only unmounts the last. Any browser state the kit does not drive from `value` therefore follows the wrong row. `FileUploadNode` renders `type="file"` with no `value`, so after deleting row 0 the input still shows `a.pdf` while the data holds `b.pdf` — the user sees one filename and submits another. Focus and IME composition ride along. *(Lead: BLOCKED — reasoning is sound and the vehicle is real; observing it needs a browser.)*
- **[MEDIUM]** **[E4]** `index.tsx:147` — `resolveProp`'s `condition` case drops `options.row`, so a condition-bound **prop** inside a row cannot read its row. `isVisible` passes it; this does not. `rowScopeProblems` tells the author to "set the test to read this row", which then works for `renderWhen` and silently does nothing for a prop.
- **[MEDIUM]** **[E4]** `index.tsx:161` — `Object.entries(node.props)` is unguarded, making the renderer the only layer not total over an untrusted document. With no error boundary, one node missing `props` removes the entire form.
- **[MEDIUM]** **[E4]** `index.tsx:144,280,347` — three lookups on untrusted objects read through the prototype chain, against the own-property rule core states everywhere else. `language="__proto__"` resolves `translations` to `Object.prototype`; a node keyed `constructor` makes `errors['constructor']` a function, so `error` is truthy for a field with no error.
- **[MEDIUM]** **[E3]** `index.tsx:256,263` — reads rows by data key, builds the address from the node key. See theme 2.
- **[MEDIUM]** **[E4]** `index.tsx:167-177,238` — `MissingType` never renders `error`, while `validateForm` still validates the node. A blocking required error with no message on the field it belongs to.
- **[MEDIUM]** **[E3]** `index.tsx:261-268` — the `RowCtx.Provider` value is rebuilt inline on every render, so it has a new identity each time and defeats the four `useMemo`s in every descendant. A 50-row repeater re-runs `isVisible` and `resolveProps` for 400 nodes per keystroke.
- **[LOW]** **[E2]** `index.tsx:256-257` — `rows`/`drawn` are computed for every node, not only row scopes.
- **[LOW]** **[E2]** `index.tsx:375` — the generated `<style>` takes no `nonce` and there is no prop to supply one, so a host with `style-src 'self'` loses every per-component style silently.

### packages/kit-mui/src/renderers.tsx
- **[CRITICAL]** **[E5]** `renderers.tsx:277` — **a document's `background` reaches global CSS through `sx`.** Verified by running emotion's serializer: `background: "red}html{display:none}.x{"` emits a second top-level rule. Core's `safeDeclarations` exists to refuse exactly this and is bypassed; `kit-html` is unaffected because it uses a React `style` object. Realistic payloads: an overlay above the submit button, or a keyed-selector `url()` exfiltration primitive.
- **[HIGH]** **[E4]** `renderers.tsx:215` — `SelectNode` reads its value with `str()`, which returns `''` for a number, so a numeric option value round-trips to "nothing selected". `optionValue` in core exists so numeric values survive; `RadioGroupNode` in this same file gets it right. The user picks an option, the data holds `2`, the control renders empty, and the choice can never be made to stick.
- **[MEDIUM]** **[E4]** `renderers.tsx:145,371,505` — `TextField`, `TextArea` and `DatePicker` use `str(value)` rather than `jsonToString(value)`, so a host seeding `{age: 30}` shows an empty field whose data is not empty; `required` passes and typing overwrites an answer never seen.
- **[MEDIUM]** **[E4]** `renderers.tsx:124` — `Heading` casts `level` to `Variant` unchecked, the only unchecked prop in the file. `level: 'h7'` renders a `<span>` with no heading role or level. `kit-html` fixed exactly this and says so in a comment.
- **[MEDIUM]** **[E4]** `renderers.tsx:189-193,401-404,437-441` — `Checkbox`, `Switch` and `RadioGroup` never set `aria-invalid`, breaking a stated kit obligation; `kit-html` sets it on all three. The spec notes the contract test deliberately does not cover it, which is why it has stayed broken.
- **[MEDIUM]** **[E3]** — no data-bound renderer marks a required field as required, in the accessibility tree or the DOM, in either kit. `node` is available on `NodeRendererProps` and no renderer reads it. WCAG 3.3.2.
- **[MEDIUM]** **[E4]** `renderers.tsx:278` — `Box`'s radius is divided by 8 then multiplied by MUI's shape token, so `radius: 16` is 8px here and 16px in `kit-html` — the cross-kit divergence the `Grid` comment was written to fix.
- **[MEDIUM]** **[E3]** `renderers.tsx:521-554` — `FileUploadNode` never reads `value`, so a restored draft shows "No file chosen" while the payload will submit a filename.
- **[LOW]** **[E4]** `renderers.tsx:350` — `src` bypasses `safeHref`, which the sibling `LinkNode` applies to `href`. Not XSS, but an uncontrolled outbound request with referrer on every render. Same gap in `kit-html:399`.
- **[LOW]** **[E4]** `renderers.tsx:104` — `aria-invalid` on a `Stack` (`role="generic"`) is inert. *(Lead: downgraded to NOTE — `role="alert"` on the message still announces.)*
- **[LOW]** **[E2]** `renderers.tsx:196,408` — `Checkbox` reads `helperText`, which only `Switch` declares, so it is unreachable from the panel and drops silently under `kit-html`.
- **[LOW]** **[E4]** `renderers.tsx:228,448` — option keys derived from the value duplicate when two options share one.
- **[LOW]** **[E2]** `renderers.tsx:52-55` — the comment says "a non-breaking space"; the literal is U+0020. Behaviour is right, the stated mechanism is not.
- **[LOW]** **[E2]** `renderers.tsx:548` — `e.target as unknown as HTMLInputElement` launders a union rather than narrowing it.
- **[NOTE]** **[E2]** `renderers.tsx:220-232` — no empty option, so a MUI `Select` cannot be returned to "unanswered"; `kit-html` can.

### packages/kit-mui/src/definitions.ts
- **[LOW]** **[E4]** `definitions.ts:392-414` — `ButtonGroup.variant` is a three-option editor no renderer in either kit reads. The cross-kit test compares prop names, so symmetric drift is invisible to it.
- **[LOW]** **[E2]** `definitions.ts:128` — `Checkbox` declares no `helperText` although its renderer reads one.
- **[LOW]** **[E2]** `definitions.ts:340` — `Image.src` gets a bare string editor with no hint while `Link.href` documents its allowlist; the metadata asymmetry mirrors the renderer one.
- **[NOTE]** **[E2]** `definitions.ts:207-214` — the header calls this half "pure data", but `Step.defaultRenderWhen` is a function, so a `Kit` cannot round-trip through JSON.
- **[NOTE]** **[E2]** `definitions.ts:543,560` — `Progress`'s default of `value: 0` contradicts its own hint ("leave empty for an indeterminate bar"); a freshly dropped Progress is a determinate 0%.

### packages/kit-mui/src/index.ts
No issues found.

## Area 4 — the dependency-free HTML kit

### packages/kit-html/src/renderers.tsx
- **[HIGH]** **[E4]** `renderers.tsx:270,277` — `SelectNode` casts each option and reads `.value` with no null guard, so a `null` in the options array throws during render. Core's `optionValue` guards for exactly this; with no error boundary anywhere in the repo, the whole React root unmounts, taking unsaved document state with it.
- **[HIGH]** **[E4]** `renderers.tsx:534,535` — same unguarded read in `RadioGroupNode`.
- **[HIGH]** **[E4]** `renderers.tsx:730,731` — same in `BreadcrumbsNode`.
- **[MEDIUM]** **[E4]** `renderers.tsx:359,365` — `Text` interpolates an unvalidated document string into `className`, while `ButtonNode` and `Card` in the same file narrow theirs. Not XSS (React escapes the attribute), but on a host using a utility CSS framework, `variant: "body fixed inset-0 z-50"` covers the viewport — UI redress over the real form.
- **[MEDIUM]** **[E4]** `renderers.tsx:650,660` — `AlertNode` does not narrow `severity`; MUI does. An unrecognised severity also silently withholds `role="alert"`.
- **[MEDIUM]** **[E4]** `renderers.tsx:532` — `RadioGroupNode` interpolates `direction` unnarrowed and silently falls back to flex's `row` while `defaultProps` says `column`.
- **[MEDIUM]** **[E4]** `renderers.tsx:399` — `Image` puts a document `src` in the DOM with no scheme check while `LinkNode` runs `href` through `safeHref`.
- **[MEDIUM]** **[E4]** `renderers.tsx:332` — `Box` passes an arbitrary string as a CSS `background` despite `editor: 'color'`; `url()` is a valid value, so every render becomes a beacon.
- **[MEDIUM]** **[E4]** `renderers.tsx:687-688` — a `Progress` switching determinate→indeterminate keeps a `style` attribute, so the stylesheet's `:not([style])` hook stops matching and the bar renders permanently full — "finished" instead of a sweep.
- **[MEDIUM]** **[E4]** `renderers.tsx:28` — `str(v, fallback)` returns the empty string when the value is `''`, so every "safe default" is bypassed by an emptied field: a `<button>` with no text, an `<a>` with no text, an empty `<label for>`, `aria-label=""` on a progressbar. Clearing a label in the panel is the most natural way to "remove" it.
- **[LOW]** **[E4]** `renderers.tsx:420,607` — `TextArea` and `DatePicker` use `str(value)` where `TextField` and `Select` use `jsonToString`, so `{notes: 42}` renders empty and is overwritten on the next keystroke.
- **[LOW]** **[E2]** `renderers.tsx:81-83` — `aria-invalid`/`aria-describedby` on a bare `<div>`; the contract test finds the attribute and passes while it does nothing.
- **[LOW]** **[E2]** `renderers.tsx:268,679,727` — hardcoded English (`Choose…`, `Progress`, `Breadcrumb`) where every comparable string is a `localizable` prop.
- **[LOW]** **[E2]** `renderers.tsx:661` — a non-error `Alert` gets no role; MUI gives it `role="note"`, so one document exposes two accessibility trees.
- **[LOW]** **[E4]** `renderers.tsx:30` — `num` accepts `NaN`, which reaches `aria-valuenow="NaN"` and an invalid inline width, painting the bar full.
- **[NOTE]** **[E2]** `renderers.tsx:279,537` — duplicate React keys when two options share a value.

### packages/kit-html/src/definitions.ts
- **[MEDIUM]** **[E4]** `definitions.ts:397,409-419` — `ButtonGroup.variant` is offered in the panel and read by no renderer in either kit.
- **[LOW]** **[E4]** `definitions.ts:232` — the comment "The only data-bound container" is false in this same file: `RadioGroup` declares `container: true` and `dataBound: true`. It stays out of `isRowScope` by accident of its `dataType`, not because the pairing is unique — so a future data-bound array container silently becomes a repeater.
- **[LOW]** **[E2]** `definitions.ts:431` — `Switch` declares three props where `docs/spec/03-components.md:145` lists two, and nothing compares prop tables to kit definitions.
- **[NOTE]** **[E2]** `definitions.ts:499,510-515` — `maxSize` is a second panel control with no effect, disclosed in its own hint.

### packages/kit-html/src/kit-html.css
- **[MEDIUM]** **[E4]** `kit-html.css:36-47` — **the documented theming recipe cannot win.** The kit's dark rule `.fsh-screen:not([data-fsh-theme='light'])` is specificity (0,2,0) because `:not()` takes its argument's specificity and a media query adds none; the README tells hosts to write `.fsh-screen { --fsh-accent: … }`, which is (0,1,0). A host follows the documented recipe and its branding silently reverts for every dark-mode viewer.
- **[LOW]** **[E4]** `kit-html.css:394-400` — `--success`/`--warning` alert colours are hardcoded hex, contradicting "every value is a custom property", excluded from the dark swap, and unmeasured by the contrast gate.
- **[LOW]** **[E4]** `kit-html.css:207-209` — the elevated-card shadow is pure black with no dark variant, so "elevated" is invisible in dark mode.
- **[LOW]** **[E3]** `kit-html.css:423-427` — the indeterminate hook is an attribute-presence test on `style`, a fragile coupling to how React emits inline styles.
- **[LOW]** **[E2]** `kit-html.css:439-445` — under reduced motion an indeterminate bar renders full-width at 50% opacity, which reads as "complete".
- **[LOW]** **[E2]** `kit-html.css:169-178` — the comment claims a focus ring on "every interactive element"; radios carry no kit class and fall back to the UA ring, which the contrast suite does not measure.
- **[NOTE]** **[E2]** `kit-html.css:447-451` — a "circular" determinate Progress is a partly-filled disc, not an arc, where MUI renders a real `CircularProgress`.
- **[NOTE]** **[E2]** `kit-html.css:186,194,266,374` — four components lack the `min-width: 0` their siblings carry, so they overflow rather than shrink inside a row `Stack`.

### packages/kit-html/src/index.ts
No issues found.

## Area 5 — the designer shell and store

### packages/designer/src/store.ts
- **[HIGH]** **[E4]** `store.ts:189-194` — `addComponent` wraps `insertNode`'s result in a fresh document unconditionally, so an insert that matched no parent still commits a history entry and still moves the selection onto a key that is not in the document. `moveComponent` and `removeComponent` already guard against exactly this and are the only two tested for it.
- **[HIGH]** **[E4]** `store.ts:189-194` — **no container check on `parentKey`.** Every other insertion path checks (`dnd.ts:94`, `keyboard.ts:92`); this one does not, and `insertNode` will give `children` to any node. Clicking a palette entry with a leaf selected nests a component no renderer will draw — and it still counts toward `validateForm` and `toJsonSchema`, so it contributes a required-but-unfillable field.
- **[HIGH]** **[E4]** `store.ts:249` — `setTranslation` indexes `doc.translations` before the `?? {}`, so a pasted document without that key throws inside a React state updater, taking the designer and its undo history down.
- **[MEDIUM]** **[E4]** `store.ts:202-208,222-230,372-380,393-404,419-427` — every property writer rebuilds the document even when `updateNode` returned the root unchanged, so no-op operations consume undo slots and can evict real edits from the capped stack.
- **[MEDIUM]** **[E4]** `store.ts:79-89` — `undo`/`redo` restore the document and never the selection, so undo routinely leaves `selectedKey` naming a node that no longer exists — the precondition for the first HIGH above.
- **[MEDIUM]** **[E4]** `store.ts:339` — `removeComponent` clears the selection only on an exact key match, so removing a container leaves the selection on a removed descendant.
- **[MEDIUM]** **[E3]** `store.ts:305-314` — `renameKey` reports `{ok:true}` and moves the selection for a key not in the document, committing a phantom entry.
- **[MEDIUM]** **[E4]** `store.ts:309-312` — a rename rewrites `node.key` only and leaves key literals elsewhere in the node dangling. A `Step`'s kit-supplied condition names its own key, so renaming `step1` makes it unsatisfiable forever with nothing reporting why.
- **[MEDIUM]** **[E3]** `store.ts:344-365` — `duplicateComponent` reads the tree from the render-time closure and inserts inside a later updater, so the key it reserved can already be taken.
- **[MEDIUM]** **[E3]** `store.ts:192` — `queueMicrotask(() => setSelectedKey(...))` is a side effect scheduled from inside a state updater, which the comment three lines above says must be pure.
- **[MEDIUM]** **[E4]** `store.ts:445-468` — `useDesigner` returns a fresh object with fresh closures every render, so nothing downstream can memoise; every keystroke re-renders Canvas and Tree in full and re-attaches the window keydown listener.
- **[MEDIUM]** **[E4]** `store.ts:172-173` — `initial` is stored unvalidated while the only in-repo write path is gated, so a host restoring a document with duplicate keys silently edits the first match everywhere.
- **[LOW]** **[E2]** `store.ts:183-188` — the comment says the new key is computed outside the updater; `instantiate` is inside it.
- **[LOW]** **[E2]** `store.ts:472` — a module-level `history` shadows the state variable of the same name.

### packages/designer/src/Designer.tsx
- **[HIGH]** **[E4]** `Designer.tsx:480-484,493-496` — the window-level Delete/Backspace shortcut stays armed while the JSON modal is open. `showModal()` makes the background inert to *pointers*, not to keys, and the `typing` guard excludes only inputs — so Backspace on the dialog's Apply button deletes the component selected behind it while the textarea still shows the pre-deletion JSON.
- **[HIGH]** **[E3]** `Designer.tsx:485-488` — Escape calls `preventDefault()` unconditionally when a selection exists, cancelling the native `<dialog>` close request, so the JSON dialog needs two presses. *(Lead: BLOCKED — jsdom does not implement close watchers. Settle it by pressing Escape once in a real browser with a component selected.)*
- **[MEDIUM]** **[E4]** `Designer.tsx:480-488` — deletion and selection-clearing via the shortcut are the only two shell mutations that are not announced, against the shell spec's "additions and removals are announced".
- **[MEDIUM]** **[E4]** `Designer.tsx:66-68` — the `onChange` effect lists the host's callback in its deps and fires on mount, so a host passing an inline arrow re-emits on every one of its own renders — an infinite loop if the host does not bail on identical values. `drag.ts` deliberately holds its callback in a ref for exactly this reason.
- **[MEDIUM]** **[E4]** `Designer.tsx:456-497` — shortcuts are bound to `window` with no containment check, so the designer claims Ctrl+Z, Delete, Backspace and Escape for the entire host page.
- **[LOW]** **[E4]** `Designer.tsx:150,158-159` — a removed canvas language is masked rather than reconciled, so re-adding it silently jumps the canvas back to it.
- **[LOW]** **[E2]** `Designer.tsx:419` — `e.target.value as Theme` is an unchecked assertion on a DOM string.
- **[NOTE]** **[E4]** `Designer.tsx:64` — `initialDocument` is read only at mount; a host that swaps it gets no effect and no warning.

### packages/designer/src/keyboard.ts
- **[MEDIUM]** **[E3]** `keyboard.ts:24` — `at()` resolves a key to its first occurrence, so with duplicate keys focus, the move and the announcement all agree on a node the user did not act on.
- **[LOW]** **[E4]** `keyboard.ts:41-43` — unreachable guard, kept only to satisfy `noUncheckedIndexedAccess`.
- **[NOTE]** **[E4]** `keyboard.ts:26-32` — the "every node is expanded" premise is asserted here and enforced nowhere; adding collapse to the tree makes focus moves silent no-ops.

### packages/designer/src/Icon.tsx
- **[LOW]** **[E3]** `Icon.tsx:237` — an out-of-vocabulary icon name renders an empty `<svg>` rather than failing, which is the failure the file's own header says the design prevents.
- **[LOW]** **[E2]** `Icon.tsx:243` — `Object.keys(GLYPHS) as IconName[]` is unsound, compounded by a second cast in `Properties.tsx`.
- **[NOTE]** **[E2]** `Icon.tsx:111,166` — two glyphs hardcode `opacity`, bypassing the token system; in forced-colors mode the colour is overridden and the opacity is not.

### packages/designer/src/index.ts
- **[MEDIUM]** **[E4]** `index.ts:5,7,8` — `Palette`, `Canvas` and `Tree` are public exports that no consumer can construct: `DragController`, `useDrag`, `Viewport`, `CanvasProps`, `TreeProps` and `PaletteProps` are all unexported, and `package.json` exposes only `.` and `./styles.css`.
- **[LOW]** **[E4]** `index.ts:3-4` — `RenameResult` is not exported although `DesignerApi.renameKey` returns it.
- **[NOTE]** **[E2]** `index.ts:5-8` — the four exported panels are an arbitrary subset, so every internal refactor of them is semver-major for no stated reason.

### packages/designer/src/panels/LeftPane.tsx
- **[MEDIUM]** **[E4]** `LeftPane.tsx:53` — holds the `DragController` and does not pass it to `Palette`, which is why the palette cannot consume a swallowed click. `PaletteProps` has no `drag` member, so the gap is structural.
- **[LOW]** **[E4]** `LeftPane.tsx:53-67` — switching tabs unmounts the inactive panel, discarding the palette's search query and a half-typed language code.
- **[NOTE]** **[E4]** `LeftPane.tsx:55-65` — `Tree` re-renders on every `api` change, and `api` is a new object every render.

### packages/designer/src/panels/Palette.tsx
- **[HIGH]** **[E3]** `Palette.tsx:72-73` — **arms a drag on pointerdown and never calls `consumeClick()`.** A palette→canvas drag dispatches its `click` on `.fs-body`, above both readers, so the latch survives and eats the next click: after every drop, the first click on a component silently fails to select it. And an abandoned drag that releases back on the button fires `onAdd` anyway.
- **[LOW]** **[E4]** `Palette.tsx:73` — arms a drag for any pointer button, including right-click.
- **[LOW]** **[E4]** `Palette.tsx:60-61` — an empty kit reports `No components match ""` rather than saying the kit is empty.
- **[NOTE]** **[E4]** `Palette.tsx:36` — search matches `label` only, so typing the component's own type name finds nothing.

### packages/designer/src/panels/Tabs.tsx
- **[LOW]** **[E4]** `Tabs.tsx:110` — the tabpanel carries `tabIndex={0}` while always containing focusable content, adding an unlabelled tab stop.
- **[LOW]** **[E3]** `Tabs.tsx:73-75` — focus is moved by re-querying the DOM by id and depends on `CSS.escape`; both `?.` chains fail silently.
- **[NOTE]** **[E4]** `Tabs.tsx:58-66` — with one tab, arrow keys call `onSelect` with the already-active tab.

## Area 6 — canvas, geometry, drag and drop, designer CSS

### packages/designer/src/panels/Canvas.tsx
- **[MEDIUM]** **[E4]** `Canvas.tsx:208-211` — **`onChange` stores the renderer's address as a flat data key.** Core ships `applyChange` as "the writer a host uses in `onChange`" and it has no caller anywhere in the repo. Typing into a field inside a repeater on the canvas writes `data['repeater[0].textField']` while the renderer reads `data.repeater[0].textField`, so no character ever appears.
- **[MEDIUM]** **[E4]** `Canvas.tsx:198-204` — the auto-validate filter compares node keys against error *addresses*, so no field inside a repeater ever validates while typing.
- **[MEDIUM]** **[E4]** `Canvas.tsx:265-280,382-398` — "a click selects rather than types" is enforced for pointer and mouse only; Tab into the canvas and type, and the kit's `onChange` fires, seeding the preview's data while the author believes they are arranging a layout.
- **[MEDIUM]** **[E4]** `Canvas.tsx:271-280` — starts a move drag for any button, so a right-press-and-move relocates a component under its own context menu.
- **[LOW]** **[E4]** `Canvas.tsx:181-206` — `validateForm` runs over the whole tree on every edit while editing, where the result is always discarded.
- **[LOW]** **[E4]** `Canvas.tsx:434` — dead conditional; `Viewport` is a non-empty string union.
- **[LOW]** **[E4]** `Canvas.tsx:174-180` — the comment justifies `NO_ERRORS` by "the memo the renderer keeps", and no such memo exists in the renderer or either kit.
- **[LOW]** **[E3]** `Canvas.tsx:166-172` — the snapshot comment mis-names the risk: scrolling, not layout change, is what invalidates it, and mid-drag scrolling is a documented gap.
- **[NOTE]** **[E2]** `Canvas.tsx:315-326` — `resolveRelease` never checks the release point is inside the surface, and passes a fabricated `dragId` of `0`.
- **[NOTE]** **[E2]** `Canvas.tsx:262-269` — `isOwnChrome` is an undeclared dependency of two `useCallback`s with `[]` deps.

### packages/designer/src/geometry.ts
- **[MEDIUM]** **[E4]** `geometry.ts:42-44` — `nodeElement` resolves a key by first `querySelector` match, and a key is no longer unique in the DOM now that rows repeat it. Selection, the frame, `scrollIntoView` and `measureTree` all silently get row 0.
- **[MEDIUM]** **[E4]** `geometry.ts:101-131` — `measureTree` walks the *document* and measures one element per authored node, so rows 1..N-1 produce no candidates: hovering row 1 resolves against row 0's children, and a container inside a row is invisible to `parentAt` for every row but the first.
- **[LOW]** **[E4]** `geometry.ts:5-7` — the docstring says `data-fs-key` is "the only thing tying a DOM element back to a document node", which is what makes the first-match `querySelector` read as correct; `data-fs-row` now co-identifies.
- **[LOW]** **[E4]** `geometry.ts:92-99` — the comment documents the pre-`revealHidden` behaviour as if it were current.
- **[NOTE]** **[E2]** `geometry.ts:54-63` — 2N rect reads where N+1 would do, run over the whole tree per drop.

### packages/designer/src/dnd.ts
- **[LOW]** **[E4]** `dnd.ts:175-192` — a palette drop returns the raw slot while a cross-parent move translates it, so a parent with a non-rendering child lands the two at different indices.
- **[LOW]** **[E4]** `dnd.ts:43-56,141` — `inferAxis` receives the sibling list with the dragged node removed, so moving one of exactly two children of a row container infers `column` and compares on the wrong axis.
- **[NOTE]** **[E4]** `dnd.ts:201-211` — dead arithmetic: a child's rect is contained by its parent's, so both the `min` and the `max` always reduce to the parent.
- **[NOTE]** **[E4]** `dnd.ts:62-83` vs `299-315` — `forbiddenKeys` and `treeForbidden` are the same fixpoint duplicated, and the comment describes a single pass the code does not do.
- **[NOTE]** **[E4]** `dnd.ts:27-28,86-100` — `contains` is inclusive on both edges, so a point on a shared boundary is inside both siblings and the winner is document order.

### packages/designer/src/drag.ts
- **[HIGH]** **[E3]** `drag.ts:115-119,165` — `swallowClick` is set on every release and cleared only by a `consumeClick()` caller. For any drag whose start and end are in different zones the `click` fires above both readers, so the flag survives and eats the next unrelated click. Only a drag entirely inside the canvas surface clears it.
- **[HIGH]** **[E4]** `drag.ts:139` — `setState` on every `pointermove` with no memo boundary below it, so dragging over a 150-component form re-renders all 150 at pointer-event frequency, for state whose only consumer is the drag label.
- **[MEDIUM]** **[E4]** `drag.ts:122-126,169-175` — Escape's swallow flag is immediately undone by the following pointerup, so cancelling a drag and releasing still selects whatever is under the pointer — the behaviour the comment says it prevents.
- **[MEDIUM]** **[E3]** `drag.ts:177-186` — bare window listeners with no `setPointerCapture` and no `blur`/`visibilitychange` cancel, so releasing outside the window leaves the drag label glued to the cursor.
- **[NOTE]** **[E4]** `drag.ts:95,138,150-151` — the `at.current` fallback is dead code, and in the one case it claims to cover it still holds `{0,0}`.
- **[NOTE]** **[E2]** `drag.ts:100-101` — a ref mutation during render, unsafe under a discarded concurrent render.
- **[NOTE]** **[E3]** `drag.ts:157-160` — "the first zone that claims a release wins" is decided by `Map` insertion order, not geometry.

### packages/designer/src/panels/SelectionLayer.tsx
- **[MEDIUM]** **[E4]** `SelectionLayer.tsx:25-30,68-74` — the frame is measured with the first-match `nodeElement`, and the click that produced `selectedKey` discarded the `data-fs-row` that identified the row, so with more than one row the outline, label and toolbar all appear around row 0.
- **[MEDIUM]** **[E4]** `SelectionLayer.tsx:78-96` — the `ResizeObserver` and both listeners are torn down and rebuilt on every hover move, and each `observe()` delivers an immediate callback, so a sweep across 30 components costs 30 observer cycles plus 30 extra renders.
- **[LOW]** **[E3]** `SelectionLayer.tsx:99-103` — `scrollIntoView` scrolls every scrollable ancestor, so a host page jumps whenever a component is selected from the tree.
- **[LOW]** **[E4]** `SelectionLayer.tsx:85-87` — if React replaces the root element the observer keeps watching a detached node.
- **[NOTE]** **[E4]** `SelectionLayer.tsx:68-74` — `measure` returns a fresh object every call, so scroll events always re-render even when nothing moved.

### packages/designer/src/designer.css
- **[MEDIUM]** **[E4]** `designer.css:10-35` — `.fs-shell` sets three **inherited** properties (`font-family`, `font-size`, `color`) which flow through the surface and frame into the kit's components, and nothing resets them on the canvas. The invariant test permits bare `.fs-shell` and its shape check cannot see inheritance, so in dark mode an author styles and approves text that ships as default black at the browser's default size — invariant 3 breached by inheritance rather than by a descendant selector.
- **[MEDIUM]** **[E3]** `designer.css:722-733` vs `319-324` — `touch-action: none` is declared for the palette and tree rows and for nothing in the canvas, which is `overflow: auto`. On touch, pressing a component and dragging pans the surface, the browser claims the gesture, `pointercancel` fires, and canvas→canvas moves are unavailable — against the spec's "pointer events throughout, so it works on touch".
- **[LOW]** **[E4]** `designer.css:228-233 & 722-724`, `251-258 & 730-733` — two selectors are each declared twice ~500 lines apart, and the guard's `declarationsFor` finds only the first textual occurrence, so a second block on an allowlisted selector would be invisible to the property-pinning check.
- **[LOW]** **[E2]** `designer.css:172` — `.fs-chrome button` targets a class that exists nowhere; dead, and a descendant selector whose base is neither guarded name.
- **[LOW]** **[E4]** `designer.css:773-780` — `overflow: hidden` on the device frame clips a focus ring with positive offset and breaks `position: sticky`, at tablet and mobile only — a device simulation that changes the form rather than the viewport.
- **[LOW]** **[E4]** `designer.css:773-780` — the same rule paints the panel background behind the form, so a dark designer around a light kit theme is unreadable at tablet and mobile and fine at desktop.
- **[LOW]** **[E4]** `designer.css:690-694,926-931` — the drop indicator and selection frame share a stacking context with the kit's output; MUI's AppBar defaults to `z-index: 1100` and draws over both.
- **[LOW]** **[E3]** `designer.css:952-964,989-1001` — the selection toolbar sits ~27px above the frame with only 24px of surface padding, so selecting the topmost component clips it with no way to scroll to it.
- **[NOTE]** **[E4]** `designer.css:696-700` — the drop bar's halo is drawn in the app background colour, the one colour it is never drawn against.

## Area 7 — the inspector panels

### packages/designer/src/panels/Properties.tsx
- **[HIGH]** **[E4]** `Properties.tsx:74,144` — `DataKeyField` holds a draft with no re-sync and a React key that does not change when only the data key changes, so an undo leaves stale text that the next blur writes back — silently reversing the undo and changing the payload key.
- **[HIGH]** **[E4]** `Properties.tsx:98,50-56` — the data-key list handed to the condition picker is every data key in the document with no indication which exist only inside a repeater row, so the picker invites the exact quiet failure `rowScopeProblems` was written to catch, and this panel never runs `validateDocument`.
- **[MEDIUM]** **[E4]** `Properties.tsx:290,327` — the Show-when expression textarea has no accessible name; the only label points at the mode select. The a11y suite audits a selected component at rest, so axe never sees this state.
- **[MEDIUM]** **[E4]** `Properties.tsx:206-215` — `KeyField.commit` compares the untrimmed draft and relies on the store to trim, so a rename that normalises to a no-op leaves the panel showing a key the document does not have.
- **[MEDIUM]** **[E4]** `Properties.tsx:541-553` — the `select` editor reads and writes option values as strings only, while `PropOption.value` is `JsonValue` and core ships `optionValue` to invert it. Not reachable with the two shipped kits.
- **[LOW]** **[E2]** `Properties.tsx:466` — two labels target the same id, so the operator select's accessible name is both concatenated.
- **[LOW]** **[E4]** `Properties.tsx:279-286` — an `i18n` or static-truthy `renderWhen` renders as `always` and cannot be cleared from this row.
- **[LOW]** **[E2]** `Properties.tsx:630,648-652` — `JsonEditor` sets `aria-invalid` but never associates the parse error with the textarea.
- **[NOTE]** **[E2]** `Properties.tsx:50-56,356-362` — the same `dataKeys` derivation is written twice verbatim and recomputed on every render alongside a fresh `indexKit` Map.

### packages/designer/src/panels/ConditionEditor.tsx
- **[CRITICAL]** **[E4]** `ConditionEditor.tsx:181` — **changing which field a `ref` tests rebuilds the operand as `{kind:'ref', dataKey}`, discarding an existing `scope: 'row'`.** A repo-wide grep confirms the designer never writes `scope` at all. So a row-scoped condition silently becomes form-scoped — reading nothing, hiding the component, removing it from validation — and there is no control anywhere to put it back. This contradicts the mitigation `docs/decisions.md` records as having to ship *with* the feature.
- **[HIGH]** **[E4]** `ConditionEditor.tsx:205,235-241` — `coerce` is applied to every literal regardless of operator, so `postcode is 01234` stores the number `1234` and can never match the string the form holds. The doc comment claims comparison operators "are the only place this matters"; the code contradicts it.
- **[HIGH]** **[E4]** `ConditionEditor.tsx:284-314` — `OptionsField` commits on **every** blur, so merely tabbing through a membership condition rewrites its stored options through `jsonToString` + `coerce`: `["true","01234"]` becomes `[true,1234]`, and an option that stringifies to `''` is deleted.
- **[MEDIUM]** **[E4]** `ConditionEditor.tsx:87-97` — `morph` discards an entire nested group when the operator changes from `and`/`or`/`not` to a scalar one, and the store's label coalescing means one undo returns to before the whole condition was authored rather than restoring the group.
- **[MEDIUM]** **[E4]** `ConditionEditor.tsx:126-128,221` — a fresh `ref` is always form-scoped and there is no control to make it row-scoped, so a row-scoped condition cannot be authored in the designer at all.
- **[LOW]** **[E4]** `ConditionEditor.tsx:200-207` — an object/array/null literal renders as an empty box, misrepresenting the document.
- **[LOW]** **[E4]** `ConditionEditor.tsx:235-241` — `coerce` makes `"true"`, `"false"` and any numeric string unauthorable as text literals.

### packages/designer/src/panels/Rules.tsx
- **[MEDIUM]** **[E4]** `Rules.tsx:106,110` — `schema.validations` is used unguarded and `validateDocument` never checks it, so a pasted `"schema": {"type":"string"}` renders fine on the canvas and takes the whole designer down when the Rules tab is opened.
- **[MEDIUM]** **[E4]** `Rules.tsx:118-128` — the Data type select silently changes whether a container repeats, because core recognises a repeater from `schema.type === 'array'` plus `children`. Changing it from `array` stops the children being drawn per row and makes every row-scoped condition inside read nothing.
- **[LOW]** **[E4]** `Rules.tsx:242` — the numeric parameter cannot be cleared: `Number('')` is `0`, so emptying the box silently sets the rule to 0.
- **[LOW]** **[E2]** `Rules.tsx:277` — an unrecognised rule key yields an `undefined` placeholder where the rest of the row degrades gracefully.
- **[NOTE]** **[E5]** `Rules.tsx:1-16` — the header says the panel warns about `when` guards; there is no `when` UI at all, which the spec records as missing.

### packages/designer/src/panels/Binding.tsx
- **[MEDIUM]** **[E3]** `Binding.tsx:177` — `translations[tag]?.[value.key]` guards the bundle, not the record, so a document lacking `translations` crashes the panel.
- **[MEDIUM]** **[E4]** `Binding.tsx:161-167` — editing a translation key writes a new binding on every keystroke and never rewrites `document.translations`, so renaming a key blanks both language boxes and orphans the existing translations permanently.
- **[LOW]** **[E4]** `Binding.tsx:25-27` — `translationKey` bakes the component key in at bind time and `renameKey` does not rewrite it, so the documented convention holds only until the first rename.
- **[NOTE]** **[E2]** `Binding.tsx:83-95` — four non-exhaustive `if`s where a fifth kind would compile into a dead control, which the comment says the block exists to prevent.

### packages/designer/src/panels/StyleTab.tsx
- **[HIGH]** **[E5]** `StyleTab.tsx:112-120` — **the structured controls cannot hold a multi-token value.** Verified: typing `8px auto` stores `8pxauto`; `1px solid #ccc` stores `1pxsolid#ccc`. The input is controlled from a re-parse on every keystroke and `setDeclaration` trims, so the space is swallowed as it is typed. Those two strings are the literal placeholders these controls advertise, and `Margin`, `Border` and `Background` are all unusable as a result.
- **[LOW]** **[E4]** `StyleTab.tsx:174-177` — `RawCss` commits text it has already determined will be refused, so invalid CSS survives a reload with nothing on screen to explain the unstyled component once the panel is closed.
- **[NOTE]** **[E4]** `StyleTab.tsx:108-123` — touching any control rewrites the whole block: property names are lowercased, the edited declaration moves to the end, and a CSS comment parses as a property name.

### packages/designer/src/panels/Inspector.tsx
No issues found.

### packages/designer/src/panels/Tree.tsx
- **[MEDIUM]** **[E4]** `Tree.tsx:357-370` — every row's Remove button is in the tab order, so the "one tab stop for the whole tree" the comment claims is not what ships; a 40-component form adds 39 extra stops — the exact problem the roving tabindex was added to solve.
- **[MEDIUM]** **[E3]** `Tree.tsx:207-215` — deleting a row from the keyboard leaves focus on `document.body`, unlike the move and duplicate paths which both restore it.
- **[LOW]** **[E4]** `Tree.tsx:232,251` — the "pointer is over the tree" test uses the root row's width and falls back to `0`, silently rejecting every drop if that row is not found.
- **[NOTE]** **[E2]** `Tree.tsx:77,143` — `indexKit(kit)` allocates a fresh Map per pointer move and per keypress.
- **[NOTE]** **[E4]** `Tree.tsx:340` — `aria-expanded` is always `true` with no collapse affordance.

### packages/designer/src/panels/DocumentDialog.tsx
- **[CRITICAL]** **[E4]** `DocumentDialog.tsx:275-295` — **`documentProblems` never checks `translations`, and neither does `validateDocument`** (`grep -c translations packages/core/src/tree.ts` → 0). An accepted document then crashes the renderer's `useMemo` on the next render, with no error boundary anywhere: the author's work is gone and the previous document is reachable only through an undo stack no longer on screen. The comment says these checks "are what make the cast that follows them honest".
- **[HIGH]** **[E4]** `DocumentDialog.tsx:242-256,139-141` — the dialog hand-rolls a tablist with a roving tabindex, no arrow-key handler, no `aria-controls` and no tabpanel, so the JSON Schema view is unreachable by keyboard. `Tabs.tsx` implements this correctly and its own comment says two copies were the mistake being avoided. Axe passes because no rule requires arrow-key support.
- **[MEDIUM]** **[E4]** `DocumentDialog.tsx:182-187` — the file input is never reset, so importing the same file twice does nothing, with no note and no error.
- **[LOW]** **[E4]** `DocumentDialog.tsx:174-179` — Copy and Download serialise the live document, not the draft, so after editing the textarea both silently export the unedited version.
- **[LOW]** **[E4]** `DocumentDialog.tsx:163-167` — `key={message}` collides when `validateDocument` reports the same message twice, dropping a row.
- **[NOTE]** **[E4]** `DocumentDialog.tsx:65-67` — `JSON.stringify`, `toJsonSchema` and `unexportableRules` all run on every keystroke in the textarea.
- **[NOTE]** **[E4]** `DocumentDialog.tsx:42-44,144` — the close button drives `onClose` twice; idempotent today.

### packages/designer/src/panels/FormSettings.tsx
- **[MEDIUM]** **[E4]** `FormSettings.tsx:39` — `raw.split('-')` keeps only two subtags, so `zh-Hans-CN` is stored as `zh-HANS` and every translation authored for it goes into a bundle the host will never find.
- **[MEDIUM]** **[E4]** `FormSettings.tsx:30-60` — a language code is accepted with no grammar check, so `en US` becomes a bundle key nothing will ever resolve.
- **[LOW]** **[E4]** `FormSettings.tsx:141-147,162-166` — the refusal message has no id and the input no `aria-describedby`, so a screen-reader user cannot re-read why the code was refused; `KeyField` does associate its equivalent.
- **[LOW]** **[E4]** `FormSettings.tsx:62-65,108-116` — languages are matched by tag, so two entries sharing a tag are both removed by one click.
- **[NOTE]** **[E4]** `FormSettings.tsx:41-44` — an empty Name falls back to the raw code, producing "pt-BR pt-BR".

## Area 8 — apps, configuration, end-to-end suite

### apps/demo-server/src/index.ts
- **[HIGH]** **[E4]** `index.ts:26` — `readStore`'s bare `catch { return {} }` cannot tell "no file yet" from "corrupt or half-written", and the empty object becomes the base of the next write. A kill mid-`writeFile` costs every stored form, with a `200 {ok:true}` and no log line.
- **[MEDIUM]** **[E4]** `index.ts:54` — read-modify-write across an `await` with no lock and no atomic rename; two concurrent `PUT`s lose one.
- **[MEDIUM]** **[E4]** `index.ts:138` — `serve({fetch, port})` passes no `hostname`, so the unauthenticated store binds to every interface while the line below says localhost.
- **[MEDIUM]** **[E3]** `index.ts:37` — `cors()` with no options is `origin: '*'` with `PUT`/`DELETE` allowed and reflected request headers, on routes with no auth. Any page a developer visits can delete their forms.
- **[MEDIUM]** **[E4]** `index.ts:45` — `(await readStore())[id]` is a prototype-chain lookup, so `GET /api/forms/constructor` passes the not-found guard and returns 200 with an empty body; the submit route reaches `flatten(undefined)` and 500s.
- **[MEDIUM]** **[E4]** `index.ts:55` — `store[id] = doc` with an attacker-chosen key, so `PUT /api/forms/__proto__` returns `{ok:true}` and stores nothing. Core's own `submittedData` documents this exact hazard and builds on a null prototype; the reference server does the thing core warns against.
- **[MEDIUM]** **[E4]** `index.ts:131` — the body is neither parse-guarded nor shape-checked, so `null` or malformed JSON is a 500 rather than a 400 — the failure mode `validateDocument` was made total to fix, still reachable one layer earlier.
- **[MEDIUM]** **[E4]** `index.ts:49` — no body-size limit on a route that writes what it receives to disk.
- **[MEDIUM]** **[E4]** `index.ts:41` — the listing reports `doc.id` while the store is keyed by the URL parameter, so a mismatch advertises an id that 404s.
- **[MEDIUM]** **[E5]** `index.ts:18` — **`apps/demo-server/forms.json` is still not ignored.** `git check-ignore` exits 1 and `git log -S` finds the line was never committed: the fix was written on a branch that was later deleted, while `docs/reports/2026-08-29-overnight.md` records it as done. Anyone who runs the demo and then `git add -A` commits their documents into a public repo.
- **[MEDIUM]** **[E3]** `index.ts:135` — the route echoes the raw payload and never applies `submittedData`, so the reference implementation a reader copies keeps answers to questions the form stopped asking.
- **[LOW]** **[E4]** `index.ts:19` — `Number(process.env['PORT'])` yields `NaN` for a non-numeric value, and `listen(NaN)` picks an ephemeral port.
- **[LOW]** **[E4]** `index.ts:60` — `DELETE` rewrites the store and reports success for ids that never existed.
- **[LOW]** **[E4]** `index.ts:41` — destructuring each stored value unguarded, so `{"a": null}` in the file is a 500.
- **[NOTE]** **[E3]** `index.ts:4` — the header says the server exists so the playground can show a document surviving a reload; the playground never calls it and persists to `localStorage`.

### apps/playground/src/App.tsx
- **[HIGH]** **[E4]** `App.tsx:85` — **switching the kit remounts the Designer from the boot document and then persists it**, discarding every edit since page load. `initial` is fixed by `useState` and never updated; `key={kitId}` forces the remount; the Designer's mount effect fires `onChange` which writes to `localStorage`. A reload does not recover it. `e2e/document.spec.ts:122` is the test that would have caught it and it switches kits without editing first.
- **[MEDIUM]** **[E4]** `App.tsx:31` — `loadDocument` guards the parse and not the shape, and never calls `validateDocument`, so a malformed stored document throws on every load with no in-app way out — the same input the JSON editor is proven to refuse.
- **[NOTE]** **[E4]** `App.tsx:56` — unreachable throw, present only to satisfy `noUncheckedIndexedAccess`.

### apps/playground/src/main.tsx, sample.ts, playground.css
No issues found.

### apps/playground/vite.config.ts
- **[LOW]** **[E4]** `vite.config.ts:9` — no `strictPort`, so `pnpm dev` silently serves from another port when 5180 is taken — possibly 5181, the demo server's. The e2e config passes `--strictPort` for exactly this reason, so the two paths disagree about the same hazard.

### aliases.ts
No issues found.

### eslint.config.js
- **[MEDIUM]** **[E4]** `eslint.config.js:95` — **invariant 1's guard is scoped to `packages/core/src/**/*.ts` and so exempts any `.tsx` file**, while invariant 2's block lists both extensions. `packages/core/src/Preview.tsx` importing React would lint clean and ship in `dist`.
- **[MEDIUM]** **[E4]** `eslint.config.js:100` — `no-restricted-imports` `paths` matches exactly, so only the bare `react` and `react-dom` are blocked; `react-dom/client` and `react/jsx-runtime` pass. Nothing else enforces invariant 1.
- **[MEDIUM]** **[E4]** `eslint.config.js:75` — the react-hooks rules apply only to `**/*.tsx`, so `packages/designer/src/store.ts` — which owns the document, the selection and the undo stack — gets no `exhaustive-deps` checking at all.
- **[NOTE]** **[E4]** `eslint.config.js:173` — `ignores: ['e2e/**']` is dead configuration; the e2e specs are `*.spec.ts` and never matched the block's `files`.
- **[NOTE]** **[E4]** `eslint.config.js:30` — `'antd/*'` is redundant beside `'antd'` under the matcher's gitignore semantics.

### vitest.config.ts
- **[NOTE]** **[E4]** `vitest.config.ts:13` — `include` covers `packages/*/src` and `test/` only, so a test file added under `apps/` lints and typechecks clean and is never run.
- **[NOTE]** **[E4]** `vitest.config.ts:26` — coverage counts the `*.test.ts` files themselves, inflating the percentage with files that are 100% covered by definition.

### playwright.config.ts
- **[MEDIUM]** **[E4]** `playwright.config.ts:44` — `reuseExistingServer: !CI` cancels the `--strictPort` reasoning two lines above it: when something already answers on 5180, the command never runs. Combined with the missing `strictPort` in the Vite config, a sibling worktree's dev server means the whole suite runs green against another branch's code.

### e2e/harness.ts
- **[LOW]** **[E4]** `harness.ts:76` — `rootChildren()` returns `[]` when nothing is persisted, so five `expect(after).toEqual(before)` assertions degrade to `[] === []` rather than failing.
- **[LOW]** **[E4]** `harness.ts:73` — `node()` is a page-wide unscoped `[data-fs-key]` locator with no `.first()`, so the first spec that previews a repeater with two rows makes every such call a strict-mode violation.

### e2e/authoring.spec.ts
- **[MEDIUM]** **[E4]** `authoring.spec.ts:19` — the test named "typing a label is one undo step, not one per keystroke" **never types**: `fill()` dispatches one `input` event, so coalescing is not exercised. Remove the fold from `commit` and the test still passes.
- **[MEDIUM]** **[E4]** `authoring.spec.ts:112` — "adding a language leaves the document valid" never asserts a language was added; it asserts a value the sample already ships with. Make the button a no-op and it stays green.
- **[LOW]** **[E2]** `authoring.spec.ts:61` — `getByLabel('Message').last()` disambiguates by DOM order, so a panel-order change silently fills the canvas field instead.
- **[NOTE]** **[E4]** `authoring.spec.ts:129` — "renders nothing rather than throwing" never checks that anything is empty.

### e2e/canvas.spec.ts
- **[MEDIUM]** **[E4]** `canvas.spec.ts:36` — the scroll test never asserts the surface scrolled, so if the content is shorter than the surface both positions are unchanged and it passes with the selection layer's scroll listener deleted.
- **[NOTE]** **[E2]** `canvas.spec.ts:31` — the frame-alignment test compares `x`, `y` and `width` but not `height`.

### e2e/document.spec.ts
- **[NOTE]** **[E3]** `document.spec.ts:122` — the only spec exercising the playground's remount path, and it switches kits on an unedited document, so it cannot see the data loss reported above.
- **[NOTE]** **[E2]** `document.spec.ts:67` — `toHaveCount(4)` pins a magic number with nothing naming which four problems are expected.

### e2e/hidden.spec.ts
- **[NOTE]** **[E4]** `hidden.spec.ts:32` — the negative control would also pass if the attribute were never emitted anywhere.

### e2e/keyboard.spec.ts
No issues found.

### e2e/repeater.spec.ts
- **[MEDIUM]** **[E4]** `repeater.spec.ts:54` — the test named "preview draws a row per answer and keeps them apart" **draws no rows and checks nothing about keeping them apart**; its only assertion is a count of zero. So nothing in the browser suite ever renders a second row, which is exactly where jsdom cannot help — and the harness's unscoped locator would be a strict-mode violation the moment anyone tried.
- **[NOTE]** **[E2]** `repeater.spec.ts:32` — the palette-to-canvas drag is duplicated verbatim twice and is nearly a harness helper.

### e2e/style.spec.ts
- **[NOTE]** **[E2]** `style.spec.ts:64` — the assertion would also hold if the per-component stylesheet never reached the page; it carries weight only because of the alert check beside it.

### e2e/viewport.spec.ts
- **[NOTE]** **[E4]** `viewport.spec.ts:21` — asserts only that no *inline* width is set, so a frame constrained by a CSS class would pass a test named "constrains nothing".

## Area 9 — core unit tests

### packages/core/src/tree.test.ts
- **[MEDIUM]** **[E4]** `tree.test.ts:249` — the malformed-language case is satisfied by an error the mutation did not cause; deleting the language-code check leaves it green.
- **[MEDIUM]** **[E4]** `tree.test.ts:357` — nothing tests that `duplicateNode` rewrites a `renderWhen` naming the copied node — the defect confirmed above.
- **[LOW]** **[E3]** `tree.test.ts:196-206` — dialect-free language fixture the factory never produces.
- **[LOW]** **[E3]** `tree.test.ts:105-131` — no test moves a node into a *leaf*, and `moveNode` never checks the target is a container.
- **[LOW]** **[E3]** `tree.test.ts:415-434` — the test named "without sharing the records that hold them" checks `props` and `validations`; `css` and `events` are still shared by reference.
- **[NOTE]** **[E2]** `tree.test.ts:93` — `updateNode`'s root-match branch is never exercised.

### packages/core/src/validation.test.ts
- **[HIGH]** **[E4]** `validation.test.ts:43` — an **empty** rule message is never tested, and `''` makes the rule silently stop failing (`if (error)` treats it as no error). A pasted `"message": ""` makes a field optional on the server with no diagnostic.
- **[HIGH]** **[E4]** `validation.test.ts:106-132` — the describe named "expression-backed rules degrade permissively" never executes the `condition` branch of `guardPasses` — the entire no-sandbox story. Mutating it to `return false` leaves the whole repository suite green.
- **[HIGH]** **[E4]** `validation.test.ts:335` — `submittedData` has no repeater fixture, so its whole row branch is untested; deleting the `isRowScope` branch leaves every test green.
- **[MEDIUM]** **[E4]** `validation.test.ts:227-231` — "does not make false empty for every other rule" passes either way.
- **[MEDIUM]** **[E4]** `validation.test.ts:73-76` — the `url` rule is never tested against a scheme, so its acceptance of `javascript:` is unmeasured.
- **[MEDIUM]** **[E4]** `validation.test.ts:121-124` — the computed guard is tested only in the no-evaluator direction.
- **[LOW]** **[E3]** `validation.test.ts:518-519` — the wizard fixture uses keys (`step-who`) the product's own grammar refuses.
- **[LOW]** **[E2]** `validation.test.ts:570-584` — `validateAcross`'s first-wins merge is never exercised.
- **[NOTE]** **[E3]** `validation.test.ts:222-225` — passes a field with zero rules, so it holds for any implementation.

### packages/core/src/condition.test.ts
- **[MEDIUM]** **[E4]** `condition.test.ts:48-50` — `eq` between two unreadable operands is never tested and returns `true`, contradicting the guard the source documents; `ne` over two unanswered fields is therefore false and hides a component.
- **[LOW]** **[E3]** `condition.test.ts:187-212` — the junk list has no `ref` with a non-string `dataKey`, so that type check is unexecuted.
- **[NOTE]** **[E2]** `condition.test.ts:18-19` — the `row` argument is never passed from this file.

### packages/core/src/rows.test.ts
- **[HIGH]** **[E4]** `rows.test.ts:203-276` — the describe named "the quiet failure, caught before anyone submits" never covers a rule guard, which is the third Condition site — confirmed above as a real hole in `rowScopeProblems`.
- **[MEDIUM]** **[E4]** `rows.test.ts:193-200` — certifies as correct a document that produces the silent-permissive outcome and that no boot-time check reports.
- **[MEDIUM]** **[E4]** `rows.test.ts:130-140` — never drives a repeater whose stored value is not a list through `validateForm`.
- **[MEDIUM]** **[E5]** `rows.ts:107-129` — `rowValue` has no test and no caller anywhere.
- **[MEDIUM]** **[E3]** `rows.test.ts:19-23` — no test drives a nested repeater through `validateForm`, `submittedData` or `applyChange`.
- **[LOW]** **[E5]** `rows.ts:42` — `innermost` is exported and untested.

### packages/core/src/context.test.ts
- **[MEDIUM]** **[E4]** `context.test.ts:169-178` — every `contextValues` test builds on `renderWhen`, so two of the three sites it sweeps are unexercised; a step name reachable only from a prop or a rule guard would drop out of `validateAcross` and go unchecked on the server.
- **[LOW]** **[E3]** `context.test.ts:126-130` — `null` is the one falsy value a real host context can return and is untested.
- **[LOW]** **[E3]** `context.test.ts:208-210` — the dedupe is reference equality and is tested only with strings.
- **[NOTE]** **[E2]** `context.test.ts:84-98` — the empty-path skip is not covered.

### packages/core/src/css.test.ts
- **[LOW]** **[E4]** `css.test.ts:69-76` — only the `mobile` media query is ever asserted, so `tablet` and `desktop` breakpoints can move silently.
- **[NOTE]** **[E3]** `css.test.ts:137-155` — `escapeKey` applied to the `scope` argument is unexecuted.
- **[NOTE]** **[E2]** `css.test.ts:164` — `printDeclarations` is never asserted as its own contract.

### packages/core/src/json.test.ts
- **[MEDIUM]** **[E4]** `json.test.ts:1-191` — **no describe for `isEmpty` or `valueOf`**, the two functions the file says exist so "empty has to mean one thing", and the object branch is asserted nowhere in the repository — which is why the `required` accepts `{}` defect survived.
- **[NOTE]** **[E3]** `json.test.ts:72-137` — `safeHref`'s older-runtime fallback is unreachable on Node 22 and therefore uncovered.
- **[NOTE]** **[E3]** `json.test.ts:26-31` — `optionValue`'s first-match-wins behaviour and its positional/declared collision are untested.

### packages/core/src/keys.test.ts
- **[LOW]** **[E4]** `keys.test.ts:49-55` — the reserved-names test iterates `RESERVED_KEYS` itself, so emptying the list makes the loop vacuous and only one unrelated test goes red.
- **[LOW]** **[E4]** `keys.test.ts:49-55` — `constructor` and `prototype` are named by no independent test.
- **[NOTE]** **[E3]** `keys.test.ts:63-79` — the whitespace/reserved ordering is untested, so which message a caller shows is unpinned.

### packages/core/src/schema.test.ts
- **[HIGH]** **[E4]** `schema.test.ts:164-170` — `unexportableRules`' guarded-rule half is executed by no fixture anywhere; deleting the line leaves both tests green, so a host is told a lossy export is lossless.
- **[MEDIUM]** **[E4]** `schema.test.ts:126-137` — no guarded `required` fixture, so removing `&& !rule.when` leaves every schema test green.
- **[LOW]** **[E3]** `schema.test.ts:139-149` — `titleOf`'s fallback to `props['text']` is unexecuted.
- **[LOW]** **[E3]** `schema.test.ts:208-286` — one level of repeater only; the recursion and the root-with-schema branch are unexercised.

### packages/core/src/visibility.test.ts
- **[MEDIUM]** **[E4]** `visibility.test.ts:45-95` — no test gives the *root* passed to `validateForm` its own `renderWhen`, so the case that returns zero errors for the entire form is uncovered — which is exactly the documented `validateForm(stepNode, data)` pattern when a host forgets the context.
- **[NOTE]** **[E3]** `visibility.test.ts:97-138` — `options.context`/`options.row` forwarding is verified only indirectly.
- **[NOTE]** **[E3]** `visibility.test.ts:68-74` — the hidden-container case uses a `static` false only.

## Area 10 — designer, renderer and contract tests

### packages/designer/src/designer.css.test.ts
- **[HIGH]** **[E4]** `designer.css.test.ts:92` — **the invariant 3 guard has a hole in the shape of the original incident.** It tests `reachesPast(s, '.fs-shell')` and `reachesPast(s, '.fs-canvas__surface')` by literal `indexOf`, but the form is nested at `.fs-canvas__frame` (`Canvas.tsx:407`). A rule `.fs-canvas__frame input { padding: 5px 8px }` — the exact rule the docblock says broke MUI's notched outline — contains neither base, so all four tests stay green. `.fs-canvas input` and anything else scoped below the surface escape the same way.
- **[MEDIUM]** **[E3]** `designer.css.test.ts:86` — the guard fires only on selectors that *name* a scope, so a bare `input { … }` at file scope is invisible to every assertion. No such rule exists today; the hole does.
- **[LOW]** **[E3]** `designer.css.test.ts:36` — `declarationsFor` locates a block by substring, the same shape as the Trap 4 incident that was fixed by exact matching in `test/contrast.ts` and left here.

### test/contrast.test.ts
- **[HIGH]** **[E5]** `contrast.test.ts:55` — **the palette most users see is never measured.** Both stylesheets declare three token blocks; `palettes()` reads `.fs-shell` and `.fs-shell[data-fs-theme='dark']` and skips the `@media (prefers-color-scheme: dark)` block. The theme default is `system`, which sets no attribute, so the unmeasured block is what a viewer with an OS dark preference gets. Same omission for `kit-html`. Edit one dark block and not the other and the suite — whose docblock says both stylesheets are measured in both themes — stays green.
- **[MEDIUM]** **[E3]** `contrast.test.ts:55` — the designer's own input and select borders are unmeasured while the kit's are, so panel controls could become invisible against the panel background in one theme.

### test/contrast.ts
- **[MEDIUM]** **[E3]** `contrast.ts:38` — the measuring instrument has no calibration test: nothing asserts a known WCAG value, so changing the luminance coefficients or the `0.03928` branch shifts every ratio with no test failing. The entire contrast claim rests on it.
- **[LOW]** **[E3]** `contrast.ts:71` — `tokensFrom` returns `{}` for a selector it cannot find; the loudness the docblock promises lives in the caller, so any other caller silently gets an empty palette.

### test/docs.test.ts
- **[HIGH]** **[E5]** `docs.test.ts:48` — the e2e total is quoted in three documents and compared in none: the `>= 100` filter discards CLAUDE.md's "65 tests", and README and ROADMAP phrase it without the word `tests` so neither is captured. The skill's own checklist claims this guard compares them.
- **[HIGH]** **[E4]** `docs.test.ts:182` — the contract-row guard compares two integers and matches no text, so deleting a test *and* an unrelated table row keeps it green while the table documents a rule nothing runs — exactly the Trap 7 condition it exists to prevent.
- **[MEDIUM]** **[E5]** `docs.test.ts:181` — nothing guards `docs/accessibility.md`, which is already stale (it says six axe states; there are seven).
- **[MEDIUM]** **[E3]** `docs.test.ts:67` — the count check verifies the documents agree with each other, never with the suite.
- **[MEDIUM]** **[E3]** `docs.test.ts:110` — `docs/spec/README.md` is excluded from the per-file link walk and its own check ignores anchors entirely.
- **[LOW]** **[E3]** `docs.test.ts:228` — the link regex silently skips links carrying a title, reference-style links and autolinks.
- **[NOTE]** **[E3]** `docs.test.ts:199` — the rule count includes a trailing describe the comment says it excludes; the counts match today by coincidence of a row having been added.
- **[NOTE]** **[E3]** `docs.test.ts:190` — the row regex requires a capital first letter, so a row starting with a backtick is silently uncounted.

### test/kit-contract.test.tsx
- **[MEDIUM]** **[E3]** `kit-contract.test.tsx:377` — the RadioItem rule short-circuits with no assertion when a kit lacks either type, so removing the component turns the obligation off rather than failing it.
- **[MEDIUM]** **[E3]** `kit-contract.test.tsx:65` — cross-kit agreement compares `name` and `editor` only, not `localizable`, `computable`, `conditional`, `section`, `options` or `hint` — and `localizable` is what decides whether an `i18n` binding can be authored at all.
- **[LOW]** **[E3]** `kit-contract.test.tsx:316` — the `aria-describedby` rule inspects only the first matching descendant, so a multi-control component has the rest unchecked.
- **[LOW]** **[E5]** `kit-contract.test.tsx:39` — dialect-free fixture, so no contract rule runs against a document shaped the way the factory produces one.

### test/a11y.test.tsx
- **[MEDIUM]** **[E3]** `a11y.test.tsx:141` — the Style tab and the condition editor, the two most ARIA-dense panels, are never audited; no state sets a condition, so the editor's hidden labels and nested Remove buttons are never seen by axe.
- **[LOW]** **[E5]** `a11y.test.tsx:85` — one language in the fixture, so the toolbar's language select never exists in any audited state.
- **[NOTE]** **[E3]** `a11y.test.tsx:34` — of three rules disabled for want of layout, only `color-contrast` has a compensating check; `target-size` and `scrollable-region-focusable` are covered nowhere.

### test/setup.ts
- **[LOW]** **[E3]** `setup.ts:32` — `scrollIntoView` is stubbed to a no-op and nothing asserts it is called, so keeping a keyboard-selected row in view can break invisibly.
- **[NOTE]** **[E3]** `setup.ts:22` — the `ResizeObserver` stub records nothing, so an observer leak is undetectable; a counting stub would cost nothing.

### Designer and renderer component tests
- **[MEDIUM]** **[E4]** `Properties.test.tsx:258` — the colour-swatch test asserts a value jsdom produces on its own, so it cannot fail; delete the `hex` fallback and it stays green.
- **[MEDIUM]** **[E3]** `Properties.test.tsx:196` — the Key field is never exercised in this file at all, despite the skill naming it as the reference draft-and-commit shape.
- **[MEDIUM]** **[E4]** `Canvas.test.tsx:312` — "shows a label that follows the pointer" never asserts the position, which is an inline style jsdom *can* read.
- **[MEDIUM]** **[E4]** `Tree.test.tsx:378,390` — "names every button in the shell" and "labels every form control in the shell" inspect one state with nothing selected and only the Tree tab open, so they cover roughly the toolbar plus five rows. The Style tab's seven inputs and the condition editor are outside it.
- **[MEDIUM]** **[E4]** `Binding.test.tsx:205` — cannot distinguish a bundle keyed by BCP 47 tag from one keyed by bare code, which is the historical Trap 3 bug the source comment says it prevents; every fixture is dialect-free, so the mutation stays green.
- **[MEDIUM]** **[E3]** `Binding.test.tsx:245` — the right-to-left toggle, which rebuilds the whole language list, is never executed.
- **[MEDIUM]** **[E3]** `Rules.test.tsx:195` — "Validate while typing" has no test anywhere, and it is what decides which errors appear before a submit.
- **[MEDIUM]** **[E4]** `StyleTab.test.tsx:194` — the advanced-disclosure test never checks *which* properties are folded away; a closed `<details>` still renders its children and `getByLabelText` does not filter on visibility, so inverting the section routing keeps it green.
- **[MEDIUM]** **[E3]** `StyleTab.test.tsx:165` — asserts the warning and `aria-invalid` but nothing about the value, and `RawCss` commits the refused text anyway.
- **[MEDIUM]** **[E3]** `DocumentDialog.test.tsx:242` — the dialog's tab strip is never checked as a tab pattern, and it is not one.
- **[MEDIUM]** **[E4]** `Designer.test.tsx:206` — "hands the host the current document" asserts only the call count, so handing over a stale document would pass.
- **[MEDIUM]** **[E3]** `Designer.test.tsx:111` — Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z are executed by no test in any suite, including e2e.
- **[MEDIUM]** **[E3]** `store.test.ts:16` — `history.commit` is never called with a `label`, so the coalescing branch of the pure function is untested at the unit level.
- **[MEDIUM]** **[E4]** `dnd.test.ts:116` — `barFor` is never asserted for a non-empty container, so the drop indicator's position is unchecked in every suite; replacing the midpoint arithmetic with `rect.top` stays green.
- **[MEDIUM]** **[E4]** `dnd.test.ts:174` — `indexInParent`'s `before.index + 1` line never runs, which is the "one position too far" class the file's comments are about.
- **[MEDIUM]** **[E4]** `drag.test.ts:145` — "reports a real position at the very edge of the viewport" passes against the bug it names, because the helper sends the move and the release at the same coordinates.
- **[MEDIUM]** **[E3]** `drag.test.ts:45` — the Escape-cancel click suppression is untested, which is the behaviour the source comment says was fixed.
- **[MEDIUM]** **[E4]** `renderer.test.tsx:430` — inside a repeater the key/dataKey distinction this file exists to pin is not pinned: the fixture omits `dataKey`, so both spellings produce the same string and swapping them keeps the tests green.
- **[MEDIUM]** **[E3]** `renderer.test.tsx:1` — the renderer's translation path has no test in the renderer's own suite.
- **[LOW]** — a long tail of smaller gaps: Escape/Enter commit branches in `Properties.test.tsx`; the one-step switcher case in `Canvas.test.tsx`; `aria-labelledby` rejected by the labelling check in `Tree.test.tsx`; `modesFor`'s `conditional` arm in `Binding.test.tsx`; `pattern` and `custom` editors in `Rules.test.tsx`; the raw←control re-sync direction in `StyleTab.test.tsx`; `download`/`onFile` in `DocumentDialog.test.tsx`; icon `height` and empty-glyph detection in `Icon.test.tsx`; five `DesignerApi` writers with no hook-level test; `pointercancel` and the palette drag label in `drag.test.ts`; `describeMove`'s `down` arm.
- **[NOTE]** **[E5]** — **a dialect-free `languages` / `defaultLanguage` fixture recurs in at least seven test files**, none of which matches what `createDocument` produces. This is Trap 5, and it is the shape that made the language filter green for tests and broken for real documents.

## Area 11 — documentation checked against the code

*(Full findings retained from the documentation reviewer; the systemic pattern is summarised as theme 6.)*

### Verified false statuses
- **[HIGH]** `docs/spec/01-document-model.md:120-123` — "### css **Status: planned.** … Nothing writes it and nothing reads it." **Confirmed false**: written by `store.ts` (`setNodeCss`), read by `core/src/css.ts` (`styleSheetFor`), emitted by the renderer, edited by `StyleTab.tsx`.
- **[HIGH]** `docs/ROADMAP.md:40-41` — "**Steps.** _Decided, and the core is built._ No Step component, so no per-step validation, no branching, no progress." **Confirmed self-contradictory**: both kits declare a `Step`, `validateAcross` exists, and the demo server branches on steps. `CLAUDE.md` points readers here with "check before assuming a feature exists".
- **[HIGH]** `docs/spec/03-components.md:3-4` — "Eight of the twenty-six below are built … two of the six palette groups have no components at all." **Confirmed false**: all 27 rows read Built, both kits declare 27 components (`grep -c` on each `definitions.ts`), and all six groups are populated.
- **[HIGH]** `docs/spec/07-bindings.md:109-114` — the canvas language selector is marked planned; it ships in the toolbar and `04-shell.md` lists it as Built.
- **[HIGH]** `docs/spec/01-document-model.md:133-135` — `renderWhen` marked partial "there is no UI"; the picker exists and this same file says "Conditions **Status: built** … and a picker in the panel" thirteen lines later.
- **[HIGH]** `docs/spec/01-document-model.md:3-6` — the "five fields nothing reads" list, which is the file's whole justification for its status, is 40% wrong: `css` and `version` both have readers.
- **[HIGH]** `docs/spec/09-actions.md:209-214` — the stated reason actions are deprioritised is a gap that closed: conditions shipped with no sandbox and a picker.
- **[HIGH]** `docs/spec/09-actions.md:201-206` — three of four listed blockers are stale.
- **[HIGH]** `docs/spec/10-interchange.md:79-84` — describes the JSON Schema export as flat; it nests a repeater, and `ARCHITECTURE.md` states the corrected rule, so two documents contradict each other.
- **[HIGH]** `docs/spec/10-interchange.md:21-24` — `onSave` marked planned; it exists and is documented as Built in two other files.
- **[HIGH]** `docs/spec/12-api.md:3-4,106-107` — the preamble calls the key grammar an outstanding weakness and links to a section reading "**Status: built.**"; the `__proto__` reachability argument built on it no longer holds.

### Wrong signatures and examples a reader would copy
- **[MEDIUM]** `docs/spec/08-validation.md:131-135` — all three entry points documented with `evaluate?` as the third parameter; it is an `EvalOptions` bag. Passing an evaluator positionally is a type error, or in JavaScript silently drops every `custom` rule.
- **[MEDIUM]** `docs/spec/09-actions.md:21-26` — `Evaluator` shown as two arguments and called "the whole contract"; it takes a third (`context`).
- **[MEDIUM]** `docs/spec/12-api.md:76-87` — the worked `FormRenderer` example uses `{...d, [key]: value}`, but the first argument is an **address**; a host that copies it and later adds a repeater writes bogus flat keys silently. `03-components.md` states the correct answer (`applyChange`).
- **[MEDIUM]** `docs/spec/12-api.md:99` — `submittedData`'s third parameter documented as `Evaluator`; it is `EvalOptions`, and this is the function whose own comment warns that a different context strips answers the user was asked.
- **[MEDIUM]** `docs/spec/12-api.md:285` — the platform table cites `engines` as evidence for Node 22+; every published package declares `>=20`.
- **[MEDIUM]** `docs/spec/12-api.md:210-214` — "Still open: a row's own scope" is answered and built, and the cross-reference points at a section that no longer discusses repeaters.
- **[MEDIUM]** `docs/spec/02-kit-contract.md:135` — the HTML kit described as "around 620 lines"; the three named files total **1,877**.
- **[MEDIUM]** `docs/spec/03-components.md:207-208` — "sixteen obligations"; the per-kit block contains nineteen and the rule table twenty.
- **[MEDIUM]** `README.md:30-32` — advertises dragging from the palette into the tree, a route two spec files record as removed.

### Numbers and enforcement claims
- **[MEDIUM]** `docs/accessibility.md:31-36` — the "lowest measured value" table is wrong for both designer palettes: the real minima are 3.35:1 and 3.65:1 against a 3:1 floor, not the 5.25:1 / 5.05:1 quoted.
- **[MEDIUM]** `docs/spec/11-theming.md:82` — "the lowest measured value in any palette is 4.15:1"; the suite asserts pairs at 3.35:1.
- **[MEDIUM]** `docs/accessibility.md:111-112` — "No reduced-motion handling, because nothing currently animates"; the HTML kit animates and already has a `prefers-reduced-motion` block.
- **[MEDIUM]** `docs/accessibility.md:23,99-101` — "six states" enumerated; there are seven, the enumeration omits the collapsed-panes audit, and it names a "Form tab" that no longer exists.
- **[MEDIUM]** `CLAUDE.md:44-46` — invariant 3 is presented as machine-enforced; the test enforces only the negative half, permits the bare `.fs-shell` rule the invariant's wording forbids, and — per Area 10 — misses `.fs-canvas__frame` entirely.
- **[MEDIUM]** `docs/decisions.md:10,59` — the row-addressing entry says "not yet built"; it is built, and this is the newest and least-settled design in the file.
- **[MEDIUM]** `docs/ROADMAP.md:19-20` / `docs/spec/03-components.md:67` — three documents give three different component counts (25, 26, 27); the kits declare 27.
- **[MEDIUM]** `docs/ARCHITECTURE.md:142` — "exactly one deliberate exception" to CSS isolation; there are two, both allowlisted in the test.
- **[MEDIUM]** `docs/ARCHITECTURE.md:81-86` / `docs/spec/01-document-model.md:222-227` / `docs/spec/07-bindings.md:11-16` — `PropValue` shown with three members in three places; it has four, and the fourth is what `renderWhen` and rule guards depend on.
- **[MEDIUM]** `docs/spec/README.md:37,43` — the index marks `04-shell.md` and `10-interchange.md` Partial while both open "Status: built", and the reconciliation note covers only two other files.
- **[MEDIUM]** `docs/spec/04-shell.md:114-125` — Toolbar marked partial over a table in which all eight controls read Built, with nothing saying what is outstanding.
- **[MEDIUM]** `docs/spec/05-canvas.md:3-4` — denies a selection toolbar the same file specifies as built three sections later.
- **[MEDIUM]** `docs/spec/11-theming.md:133-135` — says the `icon` property editor "still does not exist"; it does.
- **[MEDIUM]** `docs/spec/08-validation.md:105-106` — says a guard needs an injected evaluator; only a `computed` guard does, and the `condition` kind is the whole no-sandbox story.
- **[MEDIUM]** `docs/spec/10-interchange.md:86-87` — says no component produces an `array` type; `Repeater` does in both kits.
- **[LOW]** — a tail of stale cross-references and retracted figures: the "four files, all build plumbing" number retracted in `00-product.md` and still live in `ARCHITECTURE.md:45` and `README.md:109`; "six states" for axe in four places; `07-bindings.md:95` pointing at a "Form tab" that no longer exists; `00-product.md:86` calling a deny list an allowlist; `09-actions.md:206` pointing at the wrong section for repeated scope; `06-inspector.md:234` marking a section Planned whose first bullet is Built.


---

## Addendum — found after the review, by a different method

Three steelman panels were run over the decisions this review handed back (the `sx` injection, the demo
store, and the row-frame namespace). Each pairs two agents arguing opposite sides against a neutral one
that runs experiments rather than making arguments. That method found things eleven file-by-file
reviewers did not, because the defects below only appear when two files are held against each other, or
when a claim is tested in a real browser rather than in jsdom.

Recorded here rather than folded into the areas above, because the reader should be able to tell which
findings came from reading files and which came from running experiments against them.

### packages/kit-mui/src/renderers.tsx — the radius bug

- **[HIGH]** **[E5]** `renderers.tsx:278` — **every corner radius in the MUI kit renders at half the
  authored value, and at half what the HTML kit draws.** The kit divides by 8; MUI multiplies
  `borderRadius` by `theme.shape.borderRadius`, which defaults to **4**, not by the spacing scale.
  Measured against the real theme system:

  | document | kit-mui renders | kit-html renders |
  | --- | --- | --- |
  | `radius: 8` | **4px** | 8px |
  | `radius: 24` | **12px** | 24px |

  The sibling line is correct for a different reason: `padding: n/8` *is* a spacing-scale value, so it
  round-trips — but only under the default `spacing: 8`, and it silently rescales under any host theme
  that changes it.

  Failure scenario: an author sets a 24px radius, approves it on the canvas, and ships a form with 12px
  corners; switching kits changes the geometry of the same document. This is the exact cross-kit
  divergence the `Grid` comment at `renderers.tsx:261` was written to prevent — *"made the same document
  lay out differently in the two kits"* — sitting undetected two functions below it. Nothing catches it
  because no test renders one document through both kits and compares computed style.

### packages/renderer/src/index.tsx — the `data-fs-row` collision

- **[MEDIUM]** **[E4]** `index.tsx:87` against `packages/designer/src/panels/Tree.tsx:337` — **one
  attribute name, two unrelated meanings, in the same DOM.** The renderer emits `data-fs-row` as a
  repeater row coordinate (`addresses[1]`); the designer's structure tree has emitted
  `data-fs-row={node.key}` for a tree row since before repeaters existed. `Tree.tsx:82` and `:127` select
  on it, as do six test files and `e2e/harness.ts:72`.

  Evidence: both are live in the designer shell, which renders the tree and the canvas together, so
  `document.querySelector('[data-fs-row="email"]')` can match either. Failure scenario: any future code
  that resolves a row coordinate document-wide rather than within the canvas surface silently matches a
  tree row instead.

  Neither the renderer reviewer nor the designer reviewer could see this, because each was assigned one
  side of it. It surfaced only when a debater held the two files against each other.

- **[NOTE]** **[E4]** `index.tsx:87` — the stated justification for `data-fs-row` in `docs/decisions.md`
  is that per-component CSS is authored once and must reach every row while a click must land on one.
  `packages/core/src/css.ts:110` scopes by `data-fs-key`, which already reaches every row, and no kit
  reads `data-fs-row` — both kits spread `nodeProps` opaquely. The attribute is close to write-only, and
  the reasoning recorded for it does not match what the code does.

### The test gap underneath the row-frame decision

- **[HIGH]** **[E5]** — **no fixture anywhere in the repository has a repeater whose `key` differs from
  its `dataKey`.** Verified: `grep -B10 -A10 "type: 'array'"` across every `*.test.ts(x)`, `test/`,
  `e2e/`, `apps/playground/src/sample.ts` and `factory.ts` returns **zero** hits for `dataKey`.

  Consequence: the two candidate row-addressing designs produce **byte-identical output across all 911
  unit tests and 65 end-to-end tests**. A neutral agent patched core to the opposite design and the whole
  suite stayed green. So the suite cannot distinguish the shipped behaviour from its alternative, and it
  could not have caught the `applyChange` defect that prompted the question.

  This is a distinct failure from "a fixture the product never builds": the fixture here is one the
  product builds readily — `Properties.tsx:72` offers the Data key editor on any node with a schema, and
  a `Repeater` has one — it just collapses the distinction under test. See the new trap 12 in
  `.claude/skills/write-tests/SKILL.md`.

### Two findings above are worse than this report first stated

- `Canvas.tsx:208-211` (Area 6, reported MEDIUM) — **upgrade to HIGH.** The report described this as
  losing writes inside a repeater. A neutral agent showed the designer's preview host is broken
  **even when `key === dataKey`**: it hand-rolls `{...d, [key]: value}` where `key` is an address, so
  editing any repeater row in Preview writes a literal top-level property:
  `{"addresses":[{"street":""}],"addresses[0].street":"NEW"}`. `renderer.test.tsx:417` names this exact
  failure in a comment as the host's migration burden — and the in-repo host never did the migration.
- `Canvas.tsx:198-204` (Area 6) — confirmed by execution rather than inference: `eager.has(key)` is
  `false` for every field inside a repeater, so eager validation is not merely unreliable there, it is
  dead. It survives either answer to the row-frame question and is therefore evidence for neither.

### A methodological correction to this report

Two of the CRITICAL/HIGH verifications in the log above used **jsdom**, and jsdom is the wrong instrument
for a CSS claim. Its `cssstyle` parser rejects `image-set()`, `data:` URLs and `!important` that Chromium
accepts. Re-run in real headless Chromium with request interception, the conclusions held — a React
`style` object does reject the brace payload, and `url(https://…)` does fire an outbound request from
both an inline attribute and an emotion class — but the *instrument* was not sound, and a test written
that way would go green while a browser stayed vulnerable.

Related, and it is why the `style`-object fix was rejected as the primary remedy: **React's server
renderer does not validate CSS at all.** `renderToStaticMarkup` emits the value verbatim, so
`background: 'red;position:fixed;inset:0;z-index:99999'` renders a full-viewport overlay on the server
pass and vanishes on hydration. Nothing in this repository server-renders, so this is latent rather than
live — but MUI's dominant deployment is Next.js.

---

## Tasks for you

Nothing below was applied. A deep review is an assessment; what gets fixed is your call.

1. **Decide on the MUI `sx` injection (CRITICAL).** The narrow fix is to route `background` through
   `safeDeclarations` — or to stop using `sx` for document-supplied values and use a React `style` object
   as `kit-html` already does, which is safe by construction. Worth checking whether any other kit prop
   reaches `sx`. This is the one finding I would not sit on.
2. **Decide whether `@formsmith/kit-mui` needs a release note.** Nothing is published yet, so there is no
   advisory to write today — but if that changes, this is the finding that would need one.
3. **`apps/demo-server/forms.json` is still untracked and unignored.** Anyone who has run the demo may
   have it in their working tree right now. Check `git status` before your next `git add -A`.
4. **Fix the MUI corner radius.** One character. Every form rendered through the MUI kit currently has
   half the corners it was authored with, and switching kits changes the geometry of the same document.
5. **Decide what `data-fs-row` means.** It has two meanings in one DOM today. Renaming the renderer's
   half is cheap now and will not be once anything depends on it.
6. **Three of the confirmed defects are in work from the last session** — `applyChange`'s key/dataKey
   divergence, `duplicateNode` against `defaultRenderWhen`, and the Style tab's structured controls — and
   the condition picker never writes the `scope` the decision log says it must. That is a coherent group,
   and it is the group I would fix first after the CRITICAL.

## Method notes

- Coverage was verified mechanically: 97 assigned, 97 in tree, no gaps, no overlaps.
- One reviewer per slice, all Opus 5, each reading its files in full rather than sampling.
- The lead re-derived every CRITICAL and the load-bearing HIGHs against the source; nine were confirmed by
  **executing** the code and observing output, not by reading it.
- Findings that did not survive that pass are listed in the verification log above, so the ones that did
  survive can be trusted.
- This report is deliberately outside git.

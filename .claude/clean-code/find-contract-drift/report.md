# Contract drift audit: willow-forms

**Second attempt; the first failed canary 4** (both are in `clean-code/ledger.jsonl`). The first judge called the planted copy of `PropSchema` DIFFERENT (`layer`), where `canaries.expected` said SAME_CONTRACT or PROJECTION. The plant's doc comment ("as the panel keeps it") invited that reading, so the comment was removed, once, at the user's request, and a fresh judge with the same frozen brief judged that group alone: SAME_CONTRACT, REAL. The expected file, the declaration and its hash did not change, the real inventory and its diff were rerun and are identical, and the other verdicts and proofs are carried over from the first attempt. It remains a warning: a comment can talk a judge into dropping a real copy.

**Added before merge, after an independent review.** The findings and line numbers below are from `b94443d`. Since then #211 fixed every item in #207: the decision below, the first two hints, the `translations` comment, and the docs-test guard. Not fixed and not in #207: the third hint and the `region` field. The verdict words `NOT_A_DIFFERENCE` and `NOT_RENAME` come from the calibrated judge brief, not from the skill's REAL/TRANSFORMED list, and the two TRANSFORMED cells cite a prose elision where the skill reserves the word for code. The verdicts are left as given.

```
Contract drift audit: willow-forms  commit b94443df0bb3fe76e673e2b753f0c6b5a814959c+dirty  2026-11-25
Dirty: only the first attempt's uncommitted files under .claude/clean-code/, which the inventory excludes
Catalog: .claude/clean-code/find-contract-drift/   Work folder: outside the repo (session scratchpad)
Routed: none (no spec versions, generated clients, protobuf or GraphQL). test/docs.test.ts already pins the field names of ComponentDef and ComponentNode only
Coverage: 1.0000 over 107 files (0 adjusted: none)   PASS
Shapes: 111 (client 64, server 1, shared 29, spec 17; hand 111)   Excluded: 30 (derived 6, tests 24)   Unparsed: none
Groups: 15; judged 0, reused 4, cut by cap 0
Cells: 0 breaking, 2 disagree, 5 unresolved, 0 latent, 0 loose
Unresolved causes: none by config; 5 local (3 refuted by proof, 2 confirmed)
Evidence: 2 confirmed, 3 refuted, 0 blocked (sample 0, documented-default 0)
Spend: $3.75 of $7.00 cap, both attempts (estimated from tokens)
Canaries: 7 of 7 as expected   PASS (canary 4 re-planted once)
Network off during proof: yes
Since last run: 4 verdicts reused, 0 accepts reopened (last run: the first attempt)
```

Spec shapes are the TypeScript fences in `docs/` and the two `| Prop | Type | Required |` tables in `docs/spec/12-api.md` (own count pattern `^\|\s*Prop\s*\|\s*Type\s*\|\s*Required\s*\|`). A union of object types is one shape: a field is required when every variant requires it, so differences inside a variant are only partly visible. Prose and other tables in `docs/` are not parsed. No serializer, interceptor or naming config exists in the repo, so no real `config` row was found and the two HTTP bindings (`GET /api/forms/{}` and `PUT /api/forms/{}`, both the core `FormDocument`) have one member each.

## Decision list

1. **`ValidationRule.message` in `docs/ARCHITECTURE.md`.** The architecture copy says `message?: string` (`docs/ARCHITECTURE.md:103-104`); the spec (`docs/spec/08-validation.md:48`) and the code (`packages/core/src/types.ts:122`) say `string | PropValue`. Default: change the architecture copy to `string | PropValue`, or cut it to a link to 08-validation.md.

## Top findings

```
G0022  ValidationRule   anchor docs/ARCHITECTURE.md:102 (peer mode: the spec copies outrank code, then smallest id)
  field     ARCHITECTURE.md   spec 08        core types.ts      cell
  message   string            string|PropValue  string|PropValue  TYPE (2 cells)  CONFIRMED typecheck, REAL
  value     number (1 variant)  number|string   number|string     TYPE (2 cells)  REFUTED: the shared minLength variant agrees
  key       2 values + "| ..."  14 values       14 values         ENUM_VALUES DISAGREE (2 cells) TRANSFORMED docs/ARCHITECTURE.md:105 (the "| ..." line elides the rest)
  if fixed onto the anchor: not applicable; the code and spec are right and the architecture page is the stale copy.
```

No BREAKING cell in real code. The demo server is the only HTTP producer, and no hand-written client copy of its payload exists.

## Findings 11 to 40

None. The other judged groups:
- G0018 `NodeRendererProps`, spec 02 and renderer: SAME_CONTRACT; `children` is `ReactNode` on both sides (REFUTED typecheck).
- G0015 `DesignerProps`, spec 12 and Designer.tsx: SAME_CONTRACT. The rename candidate `initialDocument` / `document` against `store.ts:97` `DesignerApi` is NOT a rename (different entity).
- G0021 `Snapshot` in Canvas.tsx and Tree.tsx: DIFFERENT (entity), no rename.
- Not judged because the diff has no cell (an unmatched field gives only a hint, as with `EvalOptions` below): G0008 to G0014, G0016, G0017, G0019, G0020 (Condition, FormDocument, ComponentNode, Effect, ActionRef, CodeAction, ComponentDef, EvalOptions, FormRendererProps, Operand, PropValue).

## Hints (unmatched fields between peers give no cell, so nobody judged them; read in source here)

- Spec 02 `NodeRendererProps` (`docs/spec/02-kit-contract.md:64`) has no `events` or `navigation`; the renderer (`packages/renderer/src/index.tsx`) has both.
- Spec 08 `EvalOptions` (`docs/spec/08-validation.md:195`) has no `messages`, though line 144 of the same file says validation receives the language bundle through `EvalOptions.messages`; the code has it (`packages/core/src/validation.ts:59`).
- Spec 02 and the renderer also differ in `required` and `itemLimits`, which the renderer types as `| undefined` on top of optional.

## Found in passing (outside the shapes compared)

- `apps/demo-server/src/index.ts:317` says `validateDocument` treats `translations` as optional; `packages/core/src/tree.ts:669` rejects a document without it.
- `e2e/harness.ts:37` and `e2e/document.spec.ts:95` (excluded: tests) declare a `region` field on a language; core's `Language` has `dialect`. Not a behaviour bug: the spec.ts fixture is meant to be malformed.

## Prevention drafts

- **Guard the copies that already exist:** extend the `docs.test.ts` `it.each` table to `['02-kit-contract.md', 'NodeRendererProps', 'packages/renderer/src/index.tsx']` and `['08-validation.md', 'EvalOptions', 'packages/core/src/validation.ts']` (it currently checks `ComponentDef` and `ComponentNode`). That would have caught the two hints above; it compares names only.
- **Cut the copy that has no guard:** replace the `ValidationRule` and `PropValue` blocks in `docs/ARCHITECTURE.md` with a link to 08-validation.md and 01-document-model.md. `PropValue` is written four times and agrees in all four (docs/ARCHITECTURE.md:86, spec 01:251, spec 07:12, types.ts:22).
- **Cause:** the architecture page abridges the union by hand (`| ...`), so no test can compare it.

## Appendix

- `verdicts.jsonl`: the four judged groups. `configs.jsonl`: empty (no real config row). Latent and loose counts per real group: 0. Accepts reopened: none.

# Contract drift audit: willow-forms

**No drift found.** Everything the last run confirmed was fixed by #211, and nothing new has drifted. The three differences the tool flagged were refuted by a type check.

```
Contract drift audit: willow-forms  commit 4ef2525a7e30856ceafe0d82ab7d5b725a469905  2026-11-25
Catalog: .claude/clean-code/find-contract-drift/   Work folder: outside the repo (session scratchpad)
Routed: none (no spec versions, generated clients, protobuf or GraphQL). test/docs.test.ts pins the field names of every interface in docs/spec; it does not cover type aliases, prop tables, docs/ARCHITECTURE.md, or any field's type
Coverage: 1.0000 over 109 files (0 adjusted: none)   PASS
Shapes: 111 (client 65, server 1, shared 29, spec 16; hand 111)   Excluded: 37 (derived 8, mixed_union 1, not_a_shape 1, tests 27)   Unparsed: none
Groups: 15; judged 4, reused 0, cut by cap 0
Cells: 0 breaking, 0 disagree, 3 unresolved, 0 latent, 0 loose
Unresolved causes: local: 3 cells, all refuted by a type check; no fix needed
Evidence: 0 confirmed, 3 refuted, 0 blocked (sample 0, documented-default 0)
Spend: $3.73 of $7.00 cap (estimated from tokens)
Canaries: 7 of 7 as expected   PASS
Network off during proof: yes
Since last run: 0 verdicts reused, 0 accepts reopened
```

How the run was set up, and its limits:

- **Reuse was 0 of 4.** Verdict reuse matches `path:line:name` and the source hash. Two groups' members changed or moved (`Snapshot` by one line, `ValidationRule` because #211 removed the architecture copy), one changed source (`NodeRendererProps` in spec 02), and one (`DesignerProps`) only because this run hashes the prop table's text and the last run did not.
- **What is a spec shape:** the TypeScript fences in tracked Markdown files and the two `| Prop | Type | Required |` tables in `docs/spec/12-api.md` (own count pattern `^\|\s*Prop\s*\|\s*Type\s*\|\s*Required\s*\|`). Prose and other tables are not parsed.
- **Unions:** a union of object types is one shape, and a field is required when every variant requires it. To cover what that hides, the compiler also compared every group's members both ways (see "Whole-type check").
- **Validators written as code are not shapes.** `storageFaults` (`apps/demo-server/src/index.ts`) checks all nine `FormDocument` fields by hand, and `validateDocument` (`packages/core/src/tree.ts`) checks them separately and accepts a document without `settings` or `actions`, as the server's comment says. The tool cannot see either.
- **Wire:** one HTTP producer, the demo server. Two bindings (`GET /api/forms/{}`, `PUT /api/forms/{}`), both core's `FormDocument`, with no hand-written client copy. No serializer, interceptor or naming config exists, so there are no real `config` rows.
- **Judge words:** `NOT_A_DIFFERENCE` and `NOT_RENAME` are this run's additions to the brief, not the skill's. Unlike last time, calibration tested both, twice, and both runs agreed with the settled answers.
- **Canaries:** the planted files got explicit config lines after the expected results were written and before the first pass over them; the expected results did not change. Their consumers have no validator library, so the basis is `typecheck` on real serializer output, and the 11 producer instances gave the same text through the installed Hono `c.json`.

## Decision list

None. No cell is REAL.

## Top findings

No BREAKING or DISAGREE cell. The judged groups:

```
G0008  DesignerProps   anchor docs/spec/12-api.md:46   Designer.tsx:29 SAME_CONTRACT; store.ts:97 DesignerApi DIFFERENT (entity)
  initialDocument / document   rename candidate   NOT_RENAME: the prop is read once at mount, the API field is the current document
G0011  NodeRendererProps   anchor docs/spec/02-kit-contract.md:64   renderer index.tsx:59 SAME_CONTRACT
  children   ReactNode on both sides   TYPE UNRESOLVED   REFUTED typecheck
G0014  Snapshot   Canvas.tsx:84 and Tree.tsx:33   DIFFERENT (entity): one holds drop candidates, the other tree rows
  candidates / rows   rename candidate   NOT_RENAME
G0015  ValidationRule   anchor docs/spec/08-validation.md:47   core types.ts:121 SAME_CONTRACT
  message   string | PropValue on both sides   TYPE UNRESOLVED   REFUTED typecheck
  value     number, or string for pattern, in the same variants on both sides   TYPE UNRESOLVED   REFUTED typecheck
```

Not judged because the diff has no cell: G0001 to G0007, G0009, G0010, G0012, G0013 (Condition, FormDocument, Effect, ActionRef, CodeAction, ComponentDef, ComponentNode, EvalOptions, FormRendererProps, Operand, PropValue). None has an unmatched field.

## Findings 11 to 40

None.

## Whole-type check (extra, not part of the skill)

The TypeScript compiler, with the repo's strictness, compared each group's members in both directions. It settles what merged unions hide.

- **Assignable both ways:** Condition, FormDocument, Effect, ActionRef, CodeAction, ComponentDef, ComponentNode, Operand, PropValue (all four copies), ValidationRule.
- **`EvalOptions` and `NodeRendererProps`:** spec to code passes, code to spec fails. The code writes `| undefined` on optional fields (`packages/core/src/validation.ts:53`; `required`, `itemLimits`, `events`, `navigation` in `packages/renderer/src/index.tsx:59`) and the spec shortens it to `?`. `validation.ts:50` gives the reason: callers forward their own optional prop under `exactOptionalPropertyTypes`. Not drift; a spec reader loses only that detail.
- **`DesignerProps` and `FormRendererProps`:** field names, presence and non-function types match. Callback signatures were not compared, because the prop tables write some of them without parameter names.

## Since the last run (b94443d)

- Fixed by #211: `ValidationRule.message` in `docs/ARCHITECTURE.md` (that copy is now a link), and the missing fields in spec 02 `NodeRendererProps` and spec 08 `EvalOptions`. `docs.test.ts` now fails when a spec interface misses a field.
- The `region` field noted last time is a test defect, not only a naming slip: the broken-draft case in `e2e/document.spec.ts:86` is refused for three reasons, so it would stay green if core accepted a bad `root`. Filed as #252.

## Prevention drafts

- **Unions have no guard.** `docs.test.ts` pins interfaces by field name, so `Condition`, `Operand`, `PropValue` (three doc copies), `Effect` and `ValidationRule` could drift unnoticed; they agree today because someone kept them in step. A guard would compile the spec's fences and assert each declaration is assignable to and from the exported type. This run's whole-type check did exactly that.
- **Fewer copies:** `PropValue` is written out four times (`docs/ARCHITECTURE.md:75`, `docs/spec/01-document-model.md:251`, `docs/spec/07-bindings.md:12`, `packages/core/src/types.ts:22`). Linking two of the doc copies to spec 01, as #211 did for `ValidationRule`, leaves one to keep true.

## Appendix

`verdicts.jsonl`: the four judged groups. `configs.jsonl`: empty (no real config row). LATENT and LOOSE counts per group: 0. Accepts reopened: none.

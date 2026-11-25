# Component reinvention audit

**This run FAILED its own check: canary 3 was not grouped with its source.** The name-blind rewrite of `RawCss` was classed `text-field` by its describe worker and `RawCss` was classed `form-field`, so the class-based `group` step kept them apart. Read it as a limit of the list below: a labelled input filed under the other of these two classes can be missing from its family. Every other canary and check behaved as planted, and the pixel evidence stands.

```
Component reinvention audit: willow-forms (whole repo)  commit 8e92d4cdbf476b77b614611d869ec24e35919337  2026-11-25
Catalog: .claude/clean-code/find-component-reinvention/   Work folder: session scratchpad, outside the repo
Since last run: first run
Coverage: 1.0000 over 36 files (0 adjusted)   PASS
Rows: 128 (75 eligible; feature 25, form-field 16, text-field 16, layout 11, other 11, choice 8, provider 5, button 4 and select 4)   Excluded: 35 (test 33, no-markup 2)
Groups: 16 judged of 16; 2 classes split; residuals judged 14 of 14
Visual proof: rendered   Locale en-US, zone America/New_York (effective), fonts system fallback (no hosted fonts)
Rendered: 155 of 225 cells (61 unreachable, 9 blocked adapter_inexpressible, 18 units cut)
Evidence: 25 CONFIRMED, 0 REFUTED, 90 BLOCKED (includes every member of a cut unit)
Spend: $36.51 of $45 cap (measured from usage records at list prices, up to this report)
Canaries: 3 of 4 behaved as planted   FAIL
Families implemented 2+ times: 22 (first run)
```

Cross-check against find-reinvention: 121 component rows as `old`, 128 as `new`, 0 removed. 7 rows exist only here (3 in `examples/usage.tsx`, `Heading` and `WithDefaults` in kit-html, `WithDefaults` in kit-mui, `NodeBoundary`).

**22 is not 22 problems.** 13 of the families are the same document node type drawn by `kit-html` and `kit-mui`, which CLAUDE.md describes as two reference kits. The judge measured them as VARIANT because they show the same thing and look different, so their copies are kit members, not strays. Two of them also hold a pair inside one kit (Checkbox and Switch, TextField and TextArea or NumberField), each a separate node type. Nine families are inside `designer` or `renderer` and are the real candidates (items 1, 3 and 5 to 11).

**Canaries.** 1 (colour variant): VARIANT, 1494 px noticeable in `invalid` and 0 px in the other three states, pass. 2 (twin): SAME, 0 px in all four shared states, pass. 3 (name-blind rewrite): fail, not grouped by class; a supplementary cross-class group judged it VARIANT and measured 971 px in `empty` and `value`, but that group is not a step of the skill. 4 (initials look-alike): classed `avatar`, in no badge or field group, pass. The package has no badge or empty-state group, so canaries 1 to 3 copy from the two largest groups as the skill allows; they were written after the first grouping because the largest groups were not known before it.

**Approval and spend.** The cost estimate was $20 with a $25 cap, approved in the launching brief. The judge share overran ($15.81 against $10) and measured spend reached the cap before I re-estimated. I stopped all workers and asked; the user raised the cap to $45 and the workers resumed. The skill's re-estimate after step 3 was skipped.

**Other departures.** Network for the build was off through Node's permission model (`--permission` without `--allow-net`; the same process denied fetch, TCP, DNS, UDP, child processes and writes outside the work folder; native addons had to be allowed and are not covered by it). One build repair: a missing package link. The seven adapter writers and the last residual judge were paused at the cap and resumed with their context. The first capture run was discarded: 10 cells failed on a clock race in my harness; the second captured all 179. Workers described the two `WithDefaults` rows from line ranges rather than whole files. Sheets are in the work folder's `sheets/` folder; no screenshot left the machine.

**The same limit on real code.** Importer counts leave out test files. The class boundary also separates widgets that look related by hand: `Repeater` is classed feature in kit-html and list in kit-mui, the playground's `ResetExample` is the only confirm-dialog beside three native `<dialog>` modals, and the splitter named the pairs RawCss with CodeEditor and JsonEditor and DeclarationField with KeyField and DataKeyField. Two supplementary groups (S0001, S0002, marked in `verdicts.jsonl`, not counted in any number above) judged those last two sets: RawCss is DIFFERENT from CodeEditor and JsonEditor, and DeclarationField and KeyField are VARIANTs of DataKeyField.

## Reading the evidence

Evidence counts are literal. CONFIRMED needs a group whose cells are more than three quarters `ok`. Eight of the 16 rendered units lost more than a quarter of their cells, nearly always because the states are unreachable, not because capture failed, so their members read BLOCKED even where pixels were measured. Nothing contradicted a prediction: 0 REFUTED. Member pixel differences are in `verdicts.jsonl` (`measured`, `pairs`).

## Decision list

Ordered by import sites to move, which are 0 for every family (each copy is private to its module), then by copies. "Keep" follows the skill's canonical rule; nothing here is a design-system component, because the designer may not import a component library (invariant 2).

1. Draft text input in the inspector (G0016.p2). 5 copies, no wrappers, up to 6 looks in `value` (predicted only), `invalid` unreachable in NumberField, LiteralField and TranslationKeyField, `empty` unreachable in NumberField, `disabled` in all. Default: keep DataKeyField (Properties.tsx:97, anchor; tie at 0 importers and 3 states). Same draft, blur/Enter commit and Escape revert logic in all six; DeclarationField (StyleTab.tsx:149) has it too (supplementary group S0002). Move 0 import sites in 5 files. Proof: predicted only (cut).
2. Text answer fields in the two kits (G0016.p1). 3 copies + 2 wrappers, 6 looks in `value`, `invalid` and `disabled`. Default: keep both kits (two published reference kits) and keep the field types separate. `kit-html` NumberFieldNode and TextFieldNode are identical in `empty` (0 px); `value` differs by the payload itself (a number input cannot show text). Proof: CONFIRMED in 4 of 4 states. Sheet: sheets/G0016.p1.png.
3. Typed value editor (G0008.p3). 2 copies, 3 looks predicted. Default: keep ValueField (ActionFields.tsx:236); PropRow is a superset of it and OptionValue a subset, so a merge needs a design decision rather than a deletion. Proof: predicted only (cut).
4. Boolean choices in kit-html (G0005). 1 copy + 2 wrappers, 4 looks in every state. Default: keep all four: Checkbox and Switch are different document node types. Proof: CONFIRMED in 5 of 5 states. Sheet: sheets/G0005.png.
5. Broken-node placeholder (G0007). 1 copy. Both draw the same box: identical `padding`, dashed border and `opacity` literals at renderer/src/index.tsx:251 and :322. Default: keep MissingType (reaches one state, NodeBoundary reaches none). Only 1 of 6 cells rendered: NodeBoundary needs a thrown error. Proof: unproven. Sheet: sheets/G0007.png.
6. Colour field (G0008.p1). 1 copy, 2 looks in `empty` and `value` (4291 and 3716 px). Default: keep Color (FriendlyStyle.tsx:339): it has a label, validation and an error; ColorEditor (Properties.tsx:675) has none and writes on every keystroke, so it cannot show `invalid` or `long`. Proof: measured; evidence BLOCKED by the quarter rule. Sheet: sheets/G0008.p1.png.
7. Condition mode row (G0008.p2). 1 copy, 2 looks in `empty` and `value` (57564 px in `value`; by source, RuleGuard has no control wrapper, so its editor lands in the grid's third column). Default: keep VisibilityRow (Properties.tsx:248). Before merging, settle a behaviour difference: RuleGuard (Rules.tsx:559) treats only a static `false` as never, VisibilityRow any static falsy value. Proof: measured; evidence BLOCKED by the quarter rule. Sheet: sheets/G0008.p2.png.
8. CSS declaration value (G0008.p1.r1). 1 copy, predicted only. Length (FriendlyStyle.tsx:244) is a length-only DeclarationField (StyleTab.tsx:149) with a unit select. Default: keep both unless a unit-aware DeclarationField is wanted; this is the weakest match here. Proof: predicted only (cut).
9. Bindable text row (G0008.p2.r1). 1 copy. RuleMessage's label is fixed, so by prediction no state's payload reaches it. Default: keep PropRow (Properties.tsx:424); RuleMessage is a different frame around the same value kinds. Proof: predicted only (cut).
10. JSON draft box (G0016.p3). 1 copy, 2 looks (964 px in `empty`, 1500 px in `value`). The `value` cell compared a string draft in DraftValue with JSON in JsonEditor, so that number includes the payload. Default: keep JsonEditor (Properties.tsx:618); DraftValue (ActionFields.tsx:351) uses the same 4-row JSON box and also draws text, number and date. `invalid` is blocked in both: its error is internal state. Proof: measured; evidence BLOCKED by the quarter rule. Sheet: sheets/G0016.p3.png.
11. Source textarea (G0016.p3.r1). 1 copy, 2 looks (4630 px in `empty`, 4345 px in `value`). Default: keep ComputedEditor by the importer rule (1 importer), although CodeEditor (Properties.tsx:739) is the plainer base; a shared base with `rows`, hint and line count as options would serve both. Proof: measured; evidence BLOCKED by the quarter rule. Sheet: sheets/G0016.p3.r1.png.
12. Kit pair: select (G0013). 1 copy. Keep both kits. Proof: measured in 4 states; evidence BLOCKED (its group also holds IconEditor and BindingMode, which no state reaches). Sheet: sheets/G0013.png.
13. Kit pair: step navigation (G0014). 1 copy. Keep both kits. Proof: CONFIRMED in 3 of 3 states. Sheet: sheets/G0014.png.
14. Kit pairs with a wrapper only (kit-mui member configures one library component; 0 copies): alert G0001, breadcrumb G0002, button G0003, card G0004, date picker G0006, link G0009, progress G0011, radio group G0005.r1, radio item G0005.r2. Keep both kits. Proof: CONFIRMED for G0002, G0004, G0006, G0009, G0011; measured but BLOCKED for G0001 and G0003; predicted only for the two radio families. Sheets: sheets/G0001.png to sheets/G0011.png.

## Top families

```
G0016.p1 text-field: text answers                 6 members  5 VARIANT  canonical kit-html TextFieldNode
  state      TextFieldNode  html TextArea     mui Number       html Number     mui Text         mui TextArea
  empty      look 1         look 2 1390 px    look 3 2848 px   look 1 0 px     look 3 2848 px   look 4 2964 px
  value      look 1         look 3 1390 px    look 5 3425 px   look 2 558 px   look 4 3752 px   look 6 3873 px
  invalid    look 1         look 3 1862 px    look 5 3878 px   look 2 558 px   look 4 4215 px   look 6 4367 px
  disabled   look 1         look 3 1380 px    look 5 3318 px   look 2 551 px   look 4 3581 px   look 6 3686 px
  wrappers   mui TextFieldNode and TextAreaNode configure MUI TextField; they count as consumers.
G0005 choice: boolean answers                      4 members  3 VARIANT  canonical kit-html CheckboxNode
  state      Checkbox   html Switch   mui Checkbox   mui Switch
  checked    look 1     look 2 1026 px   look 4 1539 px   look 5 1700 px
  invalid    look 1     look 2 1583 px   look 4 1725 px   look 5 1785 px
G0008.p1 form-field: colour value                  2 members  1 VARIANT  canonical Color
  empty      look 2     ColorEditor look 3, 4291 px (box 16,16-623,64)
  value      look 2     ColorEditor look 3, 3716 px (box 16,16-623,64)
  if merged onto Color: ColorEditor shows a label and the "Default" placeholder where it showed neither, in `empty` and `value`.
G0008.p2 form-field: condition mode                2 members  1 VARIANT  canonical VisibilityRow
  empty      look 3     RuleGuard look 6, 1721 px (box 16,16-615,34)
  value      look 3     RuleGuard look 6, 57564 px (box 16,16-623,164)
  if merged onto VisibilityRow: RuleGuard's row changes inside those boxes in `empty` and `value`; no other state was rendered.
G0016.p3 text-field: JSON draft                    2 members  1 VARIANT  canonical JsonEditor
  empty      look 4     DraftValue look 1, 964 px (box 16,16-219,81)
G0016.p3.r1 text-field: source text                2 members  1 VARIANT  canonical ComputedEditor
  empty      look 1     CodeEditor look 3, 4630 px (box 16,21-623,125)
  value      look 1     CodeEditor look 3, 4345 px (box 16,22-623,125)
G0016.p2 text-field: draft inputs (predicted)      6 members  5 VARIANT  canonical DataKeyField
  value      DataKeyField row-hint, KeyField row-plain, DraftValue stacked, LiteralField bare text, TranslationKeyField bare mono, NumberField bare number
G0014 stepper   html Step against mui StepNode: 1361, 1418 and 1334 px, CONFIRMED in 3 of 3
G0013 select    html SelectNode against mui SelectNode: 3285, 3330, 3784 and 3225 px
```

The pixel counts compare against the first member named on the row. Look numbers count every member of the group, so a family of two can use looks 2 and 3.

## Families 11 to 30

```
G0001 alert        kit pair     2759 and 8461 px       G0002 breadcrumb   kit pair     1259, 216 and 3123 px
G0003 button       kit pair     3030, 2935, 17974 px   G0004 card         kit pair     3332, 3021, 10377 px
G0006 date-picker  kit pair     3798 to 4213 px        G0009 link         kit pair     79, 236, 577 px
G0011 loading      kit pair     3282 px                G0005.r1, G0005.r2 radio group and item, kit pairs, predicted
G0008.p1.r1, G0008.p2.r1, G0008.p3 and G0007: items 8, 9, 3 and 5 above
```

Components classed `other` (11): the form thumbnail, the panel resizer, RenderNode, and the Heading, Text, Divider and Image pair of both kits. Four kit pairs have no class in the list; candidates to add: `heading`, `text`, `divider`, `image`.

## Prevention drafts

Drafts only; nothing here was applied.

- **Import rule.** `eslint.config.js` bans component libraries in `core` and `designer` (invariants 1 and 2) but not in `kit-html` or `renderer`. Copy that block: `files: ['packages/kit-html/src/**', 'packages/renderer/src/**']`, pattern `COMPONENT_LIBRARIES`, message "Import kit components only in packages/kit-mui".
- **Names.** The copies are private, so an import rule cannot reach them. Once items are settled, add the retired names (`ColorEditor`, `CodeEditor`, `RuleGuard`, `DraftValue`, as decided) to the repo's SHARED_HELPERS declaration rule.
- **Literal styling.** Only `MissingType` and `NodeBoundary` are `hardcoded`, with identical literals. No style linter is configured; a shared constant in `renderer` is enough.
- **Migration map** (from the frozen adapters). Color/ColorEditor: `value` and `onChange` carry over, `label` is new. VisibilityRow/RuleGuard: RuleGuard's `rule.when` becomes `value`, `dataKeys` and `onChange` carry over. JsonEditor/DraftValue: `value` and `onChange` carry over; JsonEditor also needs `onClear`, DraftValue `label` and `kind`.
- **Catalog lines** for CLAUDE.md's Shared helpers, valid only once the decision list is settled: `useDraft` (proposed) for the blur/Enter/Escape draft in DataKeyField, KeyField, LiteralField, NumberField, TranslationKeyField, DraftValue, DeclarationField; `Color` for every CSS colour field.

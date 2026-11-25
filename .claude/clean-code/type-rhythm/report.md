# Type rhythm audit

**The run FAILED one check: the `logged-out` canary.** The playground has no sign-in, so a signed-out capture of it is a normal, valid capture and nothing can reject it. No login marker was invented to make it pass; the user was told before capturing and chose to run and record the failure. Every other check passed, so the numbers below hold for the pages captured, but this run does not prove that the collector would notice a lost session.

```
Type rhythm audit: WillowForms playground  commit 8e92d4cdbf476b77b614611d869ec24e35919337  2026-11-25   Mode: browser
Environment: 127.0.0.1:5191 (test: the playground dev server, example data only)   Tier: full
Catalog: .claude/clean-code/type-rhythm/   Work folder: session scratchpad, outside the repo
Since last run: first run
Coverage: 44 of 44 captures, routes 11 of 11   PASS
Not measured: dark theme | dialogs (the example gallery and the rest), menus, toasts | Preview mode | the inspector with a component selected | the drawers below 960px wide | text typed into inputs, and placeholders | excluded routes: 0
Scale: none: distribution mode   Role fit: not graded
Fluid type: present in source (apps/playground/src/playground.css:211, the gallery dialog's title), not measured because the dialog has no URL
Canaries: 19 of 20   FAIL (logged-out: accepted)
Sizes: 13 in use, the scale has 0, 0 off-scale
Weights: 4 in use, scale 0, 0 off-scale
Spacing: 30 values in use, scale 0, 0 off-scale
Unassigned text: 0.0004   PASS
```

**Read "0 off-scale" as "not graded".** The repo declares one size token (`--fs-font-size: 14px`) and no type or spacing scale, so there was nothing to grade against. `sizes_off` can only become meaningful after decision 1.

What was captured: 11 screens (the default draft and the 10 examples, in the designer's editing view) at 1440 and 390 wide, with the Material UI kit (`base`) and the Plain HTML kit (`html`). Scope was `all`; the playground is the only thing in the repo that renders pages, so it stands for the whole repo. All 30 tool fixtures and both collector fixtures passed, and the collector holds no banned name.

Every page shows two things at once: WillowForms' own chrome (`pg-*`, `fs-*`) and an example form drawn by a kit (`Mui*`, `fsh-*`). `docs/spec/11-theming.md:43` says form type is independent of the chrome, so a difference between them is not a fault.

## Per role

Counts are elements over all 44 captures. Nothing is graded on or off.

**Heading**: 544 elements on 11 screens (tag 338, map 206)

```
size    12px 132 | 13.28px 4 | 16.8px 36 | 17px 112 (4 owners) | 20px 168 (3 owners) | 22px 24 | 24px 32 (3 owners) | 26px 4 | 32px 32
weight  400 on 4 | 500 on 60 | 600 on 396 | 700 on 84
line    16.6px 4 | 18px 132 | 21.25px 24 | 25px 132 | 25.2px 36 | 25.5px 88 | 27.5px 24 | 30px 28 | 32px 36 | 32.02px 4 | 32.5px 4 | 40px 32
example sites: h3.fs-palette__group-title, h1.fs-toolbar__title, h3.fsh-card__title
```

**Body**: 198 elements on 11 screens (tag 104, map 94)

```
size    12px 4 | 13px 38 (16 owners) | 14px 80 (5 owners) | 16px 76
weight  400 on 198
line    16.8px 4 | 18.2px 36 | 19.5px 2 | 20.02px 4 | 20.13px 52 | 21px 24 | 23px 40 | 24px 36
example sites: p.fs-empty, p.fsh-field__message, p.MuiTypography-root.MuiTypography-alignLeft
```

**Label**: 3,458 elements on 11 screens (tag 2,200, context 708, map 550)

```
size    11px 44 | 12px 60 | 13px 624 (60 owners) | 14px 2,020 (35 owners) | 16px 710
weight  400 on 2,366 | 500 on 70 | 600 on 1,022
line    normal 854 | 16.25px 220 | 16.5px 44 | 18px 12 | 19.5px 370 | 21px 1,366 | 22.75px 34 | 23px 440 | 24px 82 | 24.5px 36
example sites: label.fsh-field__label, label.MuiFormLabel-root.MuiInputLabel-root, button.fs-tabs__tab
```

**Caption**: 130 elements on 11 screens (map 130)

```
size    11px 44 | 12px 86 (19 owners)
weight  400 on 86 | 500 on 44
line    15.6px 22 | 16.5px 44 | 18px 44 | 19.92px 20
example sites: span.pg-beta, span.pg-kit-switch__note, p.MuiFormHelperText-root
```

**Unassigned**: 2 elements on 1 screen, 16px, weight 400, line 24px.

No element used the code role: nothing captured draws code. Owner counts are too high wherever an owner's key holds a React-generated id (`_r_1u_`); the 60 owners of 13px labels are a handful of components.

## Decisions

Distribution mode proposes a scale first. Rows 2 to 6 only matter once row 1 is settled.

1. **Declare a scale.** Proposed, from the values covering most text per role:
   - sizes: heading 12, 17, 20, 24, 32 (476 of 544 elements); body 13, 14, 16 (194 of 198); label 13, 14, 16 (3,354 of 3,458); caption 12 (86 of 130).
   - weights: 400, 500, 600 (4,248 of 4,332; row 5 covers the rest).
   - space: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40 (19,850 of the 23,424 positive values that are not auto margins).
   - line: not proposed. Line heights are unitless ratios (1.25, 1.4, 1.5, 1.66 and others) times the size, so a pixel scale would not describe them.
   - Choices: accept, edit, or say the kits and chrome each get their own scale. Default: accept for the chrome (`packages/designer`, `apps/playground`) and `packages/kit-html`; leave Material UI's defaults and the character sheet's authored sizes out as exceptions.
2. Heading 13.28px (4 elements, 1 owner). Fold to 17px or give `h5` its own size. Default: fold. Tracked as https://github.com/MichaelLeeHobbs/willowforms/issues/224.
3. Heading 16.8px (36 elements, 1 owner) sits 0.2px from 17px. Default: fold to 17px.
4. Heading 22px (24, 2 owners) and 26px (4, 2 owners), and 17px and 20px on the same screen, are authored on the character sheet. Add as exceptions or fold to 20px and 24px. Default: exceptions, because the sheet's design says 17 to 26px (`docs/reviews/design-direction.md:24`).
5. Weight 700 (84 elements, 3 owners, all headings). Add a step, or fold to 600. Default: add a step (3 owners), though all three inherit it from the browser's bold rather than declare it, so folding is the cheaper fix.
6. Label 11px (44, 1 owner), label 12px (60, 1 owner), caption 11px (44, 1 owner), body 12px (4, 2 owners). Default: fold 11px captions to 12px, and fold or except the rest.

## Findings by owner

The tool lists owners only for graded values, so it printed none. These are the owners behind the values above that the proposal leaves out or that differ between kits. Sizes are computed font sizes; a CSS transform is not included, so Material UI's floated labels look smaller on screen than the 16px or 13px counted here. The trace is a lead to check, not proof.

| # | Owner | Rendered | Trace |
| --- | --- | --- | --- |
| L1 | `h5.fsh-heading` (html) | 13.28px, weight 700, on the default draft and `contact-request`; the same heading is 24px, weight 400, in Material UI | located: `packages/kit-html/src/kit-html.css:125` sets no size, so the browser's 0.83em applies; level from `apps/playground/src/sample.ts:16` |
| L2 | `h3.fsh-card__title` (html) | 16.8px, weight 700, 36 elements on 8 screens; the same title is 20px, weight 500, in Material UI | located: `packages/kit-html/src/kit-html.css:330` (1.05rem, no weight); Material UI side is a library default, `packages/kit-mui/src/renderers.tsx` CardHeader `variant: 'h6'` |
| L3 | `strong.pg-brand` | 17px, weight 700, beside `h1.fs-toolbar__title` at 17px, weight 600 | located: `apps/playground/src/playground.css` `.pg-brand` (17px, no weight) and `packages/designer/src/designer.css:158` |
| L4 | `span.pg-beta`, and the count in `button.pg-examples-button` | 11px, the only two 11px texts captured | located: `apps/playground/src/playground.css` |
| L5 | `p.MuiFormHelperText-root` and `p.fsh-field__message` | 12px in Material UI, 13px in Plain HTML (12px in compact) | located: `packages/kit-mui/src/DensityTheme.tsx:66` and `packages/kit-html/src/kit-html.css:179` |
| L6 | field labels | Plain HTML 14px at normal density, Material UI 16px; both 13px in compact or inline | candidates: `packages/kit-html/src/kit-html.css:150`, `:195`, `:218`; `packages/kit-mui/src/renderers.tsx:92`; Material UI's label default |
| L7 | character sheet headings | 17, 20, 22 and 26px in both kits | located: `apps/playground/src/examples/character-play.ts:52`, `character-layout.ts:44` and `:78`, `character-sheet.ts:318` |

Size values are written as separate literals across `packages/designer/src/designer.css` (10 to 18px): see find-token-drift.

Spacing left out of the proposal, largest first:

| Value | Elements | Trace |
| --- | --- | --- |
| padding 7px | 828 | located: `packages/designer/src/designer.css:267` and `:297`, `apps/playground/src/playground.css:81` |
| padding 9px | 744 | candidates: `packages/designer/src/designer.css:533` (tabs), `packages/kit-html/src/kit-html.css:251` (buttons), Material UI's checkbox default |
| padding 8.5px | 728, one screen | library default: Material UI's small outlined input |
| margin 3px | 460 | candidates: the Plain HTML checkbox's browser margin, Material UI's helper text default, which `DensityTheme.tsx:66` replaces with 4px or 2px only inside a density theme |
| padding 16.5px | 368 | library default: Material UI's outlined input |
| padding 5px | 180 | candidates: Material UI's button defaults, `apps/playground/src/playground.css:145` |
| gap 18px | 56 | located: `apps/playground/src/examples/character-play.ts:116` and the step gap in `character-layout.ts` |

Not spacing choices, though they count among the 30 values: margins of 113.5, 202.78, 322.02 and 451.88px are one-sided `auto` margins (`designer.css:341` and `.pg-kit-switch__note`), which the collector recognises only when both sides are equal; margins of -346 and -778px are what is left over when a centred form is wider than its frame. That leaves 24 values in use.

## Prevention drafts

For CLAUDE.md, only after decision 1 is settled:

- Headings: 12, 17, 20, 24 or 32px, weight 600. Set a size and weight on every heading element; the browser's defaults are off the scale.
- Body and labels: 13, 14 or 16px, weight 400 (600 for field labels).
- Captions and help text: 12px, weight 400.
- Spacing: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32 or 40px.

No Material UI override is drafted: the kit is a reference kit, and its defaults are the host's to change.

## About this run

- Catalog files beside this one: `plan.jsonl`, `rolemap.jsonl`, `sources.md`, `exceptions.jsonl` (empty), `tally.jsonl`, `history.jsonl`. No `scale.jsonl`.
- `rolemap.jsonl` has 279 entries because each field's generated id makes its own key. Expect to redo the pilot when a screen's fields change.
- The canaries used the stand-in scale the skill gives for distribution mode. Every element canary passed at both widths.
- Skill gap: an app with no sign-in can never pass `logged-out`, so every run on this repo records `check: fail` until the skill has a way to say "no sign-in".

# Token drift audit

```
Token drift audit: willowforms (whole repo)  commit 96c28958bdb1187fa8f144d9a108fa7fb45ffdd0  2026-11-25
Catalog: .claude/clean-code/find-token-drift/   Work folder: session scratchpad, outside the repo
Since last run: first run
Syntaxes: css, embedded-css, inline-style, media-string, mui-sx, mui-theme, svg; lexed: none   Root: 16px (assumed)
Surfaces: --fs-bg-app, --fs-bg-panel, --fs-bg-well, --fsh-surface, --pg-surface, background.default, background.paper
Coverage: 0.9723 of 759 literals (0.0276 ignored)   PASS   Tripwire: PASS
Canaries: 29 of 29   PASS
Drifted values: 10
Judged: 26 clusters, 0.9634 of drifted uses (343 of 356); rejected plan rows: 0
```

Result: colour and shadow are in good shape; spacing has no token and font size has one, in the designer only. The judge planned no SNAP, so 0 were CONFIRMED and no swap is proven safe. The one place where a readable token holds the value in use is decision 1, and the tool cannot measure that token (`calc()`).

How to read the counts: zero, hairline, relative, full and local values are in use but not drift. `Drifted values` counts `snap`, `near` and `cluster` only (142 uses). The "drifted uses" in the Judged line and in Per scope also hold `lone` values (no token or neighbour within clustering distance) and off-ladder z-indexes.

**A match is not always reachable.** The tool compares every literal with every token in the repo, but the four packages cannot read each other's tokens. Of the 19 uses the tool calls matched, 17 match only another package's token: 8px radius in the playground (7, `--fs-radius`), 6px radius in the playground (2, `--fsh-radius`), 14px font size in kit-html (5), the playground (2) and kit-mui (1), all `--fs-font-size`. The other 2 are the fallback inside `var(--fs-backdrop, ...)` (designer.css:578) and `#fff` in an example document. Measured per package with each package's own tokens, drift uses are 373, not 356; the table gives both.

Extractor notes. Every syntax has a real parser: PostCSS for CSS and for the embedded CSS of the example documents, TypeScript for inline styles, `sx`, theme objects and media strings, parse5 for SVG. A hand-written tokenizer splits values inside declarations. The canary run first failed 2 of 29, a `-z-` token name and a hyphenated `sx` palette path that the extractor missed. Both were fixed generally and the canary file was not changed; the real run's output was identical before and after. The extractors and the judge ran in separate contexts; the coordinator wrote the tool, the canary file and the item 5 plan row.

Setup choices a later run must keep: the `[data-*-theme='dark']` and `prefers-color-scheme: dark` blocks are separate modes (`dark`, `dark-system`), because the tool rejects two records with one name and mode. They hold the same values. MUI's built-in theme defaults are not token sources: the repo declares no `spacing`, so 4 `sx` refs to it are unresolved. PR 219 (dark blocks wrapped in `:where()`) merged before the audited commit and is included.

## Headline

Greys: 4 values in use (21 uses, 0.0995 literal share); the theme defines 36; 2 are exact or within an imperceptible distance of a token. 18 of the 21 uses are `transparent`. After the CONFIRMED snaps: 4 (the measure summary has no neutral row; no snap was made).

Colours: 7 values in use (24 uses, 0.0851 literal share against 258 token uses); the themes define 64 token values; 2 match. After the CONFIRMED snaps: 7.

Spacing: 24 values in use and no theme scale; the largest 8 clusters cover 0.6761 of uses (238 of 352; 97 of the 352 are zero or hairline).

Radius: 9 values in use and no theme scale (2 measurable token values, `--fs-radius` and `--fsh-radius`; `--fs-radius-sm` is `calc()`); the largest 3 clusters cover 0.2500 of uses (7 of 28), because 9 uses equal a token and 12 are zero, full, hairline or relative.

Font size: 14 values in use and no theme scale (one token value, `--fs-font-size`, 14px); the largest 8 clusters cover 0.8421 of uses (64 of 76). ExamplePreview.tsx:27 and :35 (13 and 9) are SVG text in viewBox units, not CSS pixels.

Shadow: 1 hard-coded value (1 use) against 9 token values. After the CONFIRMED snaps: 1. z-index: 3 values in use, no token; the owner already decided not to name them.

Proposed scales, largest clusters first (`leader:uses`, whole repo). A value that equals a token is not a leader, so 14px text (8 uses), 8px radius (7) and 6px radius (2) are added in brackets. Each package needs its own declarations:

| Category | Leaders |
|---|---|
| spacing | 8px:73, 6px:35, 12px:32, 4px:29, 16px:23, 10px:22, 20px:15, 24px:9 |
| radius | 4px:4, 12px:2 (8px:7, 6px:2); 5px:1 is near `--fsh-radius` |
| font size | 12px:25, 11px:12, 13px:11, 16px:6, 17px:4, 10px:2, 18px:2, 20px:2 (14px:8) |

## Per scope

Drift uses of literal uses, from the tool's `scope` records; in brackets where the package's own tokens give another number. `apps/demo-server` and `packages/core` have none; `examples` has 0 of 2.

| Scope | Colour | Spacing | Radius | Font size | Shadow | z-index | Total |
|---|---|---|---|---|---|---|---|
| packages/designer | 13 of 14 | 142 of 199 | 2 of 7 | 35 of 35 | 0 of 0 | 3 of 4 | 195 of 259 |
| apps/playground | 4 of 5 | 79 of 101 | 5 (14) of 16 | 21 (23) of 23 | 1 of 1 | 0 of 0 | 110 (121) of 146 |
| packages/kit-html | 5 of 5 | 26 of 40 | 0 of 5 | 7 (12) of 12 | 0 of 0 | 0 of 0 | 38 (43) of 62 |
| packages/kit-mui | 0 of 0 | 6 of 8 | 0 of 0 | 5 (6) of 6 | 0 of 0 | 0 of 0 | 11 (12) of 14 |
| packages/renderer | 0 of 0 | 2 of 2 | 0 of 0 | 0 of 0 | 0 of 0 | 0 of 0 | 2 of 2 |

Colour drift here is nearly all `transparent` and a decorative banner.

## Decision list

1. Designer radius literals that ignore `--fs-radius` (4px at designer.css:1561 and :1586, 2px at :911; spec 11-theming.md:84 to :86 says overriding `--fs-radius` squares off the listed corners along with everything else). The judge SPLIT 4px by package; `--fs-radius-sm` is `calc()`, which the tool cannot measure. Default: none; pick `--fs-radius-sm` (keeps 4px) or `--fs-radius` (as at :744). Filed as [issue 229](https://github.com/MichaelLeeHobbs/willowforms/issues/229).
2. kit-html text in `rem` beside a px base (kit-html.css:32, :331, :337, :346, :351; 16.8px is 0.2px from the 17px in other packages). A host with `html { font-size: 62.5% }` shrinks the card title below the body text. Default: none; pick `em`, px, or a token. In issue 229.
3. A spacing scale. No value has a token. Default: none. If wanted, per package: `--fs-space-*` (4, 6, 8, 10, 12, 16, 20, 24), `--fsh-space-*` (4, 8, 12, 16), `--pg-space-*` (8, 12, 16, 20, 24). The 24 values include zero, three hairlines and three more negatives. 14px is one use in the designer, one in kit-html and three in the playground. Example-document strings, the renderer's fallbacks (index.tsx:251, :322) and kit-mui should stay literal.
4. A font-size scale. 76 uses, one token, 2 uses of it, both in the designer. No designer literal is 14px; the 8 literals that are sit in packages that cannot read it. Default: none. If wanted: designer `--fs-font-size-xs` (11px), `-sm` (12px), `-lg` (16px); kit-html and playground their own.
5. Control block padding 7px (3 uses: designer.css:267, :297, playground.css:81), 1px from the 8px step with no line saying why. Default: none; name it or fold it into 8px, which changes the height of every designer button and input that does not override the base padding (the playground select is not designer chrome).
6. Off-scale one-offs 3px (4 uses), 5px (2), 9px (2): no token and no stated intent. Default: none; fold into 4, 6 and 8 only where the 1px change is wanted.
7. Playground gallery gutter written two ways: 28px (playground.css:199, :300) and 32px (:233, :262, :390). The fourth 32px, :409, is block padding. Default: none; one `--pg-gallery-gutter` would move one side by 4px.
8. Playground radii 4px, 5px, 6px, 8px, 12px. The 5px chip (:371) sits 1px from `--fsh-radius`, which is inside the tool's 1px floor, but the playground cannot read that token. Default: none; the judge proposed `--pg-radius-sm` (4px and 5px), `--pg-radius` (6px and 8px) and `--pg-radius-lg` (12px).
9. Font sizes split by role: 17px (designer title :158, playground wordmark :94, example heading), 18px (designer close glyph :583, card heading :347), 20px (example heading, reset dialog :280). Default: none; the roles do not share a token even where one app holds two of them.

KEEP decisions, for copying into `decisions.jsonl` (check the scope first):

- colour `#00000000` KEEP `state`, packages/designer/src/designer.css:588: the border is reserved at rest so hover can colour it without moving layout. That holds at D:537, :588 and :832; six more transparent borders never change, and the rest are "no fill" or scrollbar parts. The value is the keyword `transparent` and no intent in the list fits all 18 uses, so do not copy this row for everywhere.
- z-index `4000` KEEP `local-layer`, packages/designer/src/designer.css:1160, and `5000` KEEP `local-layer`, :38 (`isolation: isolate` keeps them inside the shell). The owner decided against z tokens on 2026-11-25, in the CSS override census.

## Top clusters

Sites are up to five of each value's; all of them are in the work folder's `change-list.jsonl` (339 lines). It covers judged values only. Members not marked lone or near have status `cluster`; the first is the leader. Verdict is NONE for every row: NEW, SPLIT and KEEP are not measured. Short names: D is packages/designer/src/designer.css, K is packages/kit-html/src/kit-html.css, P is apps/playground/src/playground.css.

| Cluster | Members (uses, status, distance) | First sites | Plan |
|---|---|---|---|
| spacing 8px | 8px (68), 7px (3, 1px), 9px (2, 1px) | character-layout.ts:44, character-play.ts:66, P:68, P:92, D:166; 7px: P:81, D:267, D:297; 9px: D:533, K:252 | NEW |
| spacing 6px | 6px (33), 5px (2, 1px) | P:105, P:239, P:362, P:369, D:317; 5px: P:145, D:637 | NEW |
| spacing 12px | 12px (32, lone) | character-play.ts:101, P:52, P:127, P:139, D:145 | NEW |
| spacing 4px | 4px (25), 3px (4, 1px) | character-play.ts:66, :101, P:300, D:335, D:402; 3px: P:369, D:361, D:926, D:1199 | NEW |
| spacing 16px | 16px (23, lone) | character-play.ts:28, P:116, P:232, P:311, D:179 | NEW |
| spacing 10px | 10px (22, lone) | character-play.ts:66, P:81, P:116, D:297, D:353 | NEW |
| spacing 20px | 20px (15, lone) | P:55, P:198, P:284, D:146, D:308 | NEW |
| spacing 24px | 24px (9, lone) | character-sheet.ts:314, P:93, P:199, D:504, D:617 | NEW |
| spacing 14px, 32px, 28px, -16px | 14px (5), 32px (4), 28px (2), -16px (2, all lone) | D:253, P:55; P:233, P:262; P:199, P:300; P:326 | NEW |
| radius 4px | 4px (4, lone) | P:108, P:143, D:1561, D:1586 | SPLIT |
| radius 12px | 12px (2, lone) | P:174, P:424 | NEW |
| radius near --fsh-radius | 5px (1, 1px) | P:371 | NEW |
| font size 12px | 12px (25, lone) | P:76, P:241, D:309, D:429, K:223 | NEW |
| font size 11px | 11px (12, lone) | P:109, P:147, D:363, D:711, D:1227 | NEW |
| font size 13px | 13px (11, lone) | P:118, P:356, D:475, D:1281, K:180 | NEW |
| font size 16px | 16px (6, lone) | D:254, D:1065, D:1435, K:32, DensityTheme.tsx:43 | NEW |
| font size 17px | 17px (3), 16.8px (1, 0.2px) | P:94, D:158, character-play.ts:52; K:331 | SPLIT, NEW |
| font size 10px, 18px, 20px | 10px (2), 18px (2), 20px (2, all lone) | D:726, D:793; P:347, D:583; P:280, character-layout.ts:44 | NEW, SPLIT, SPLIT |
| colour transparent | `#00000000` (18, lone) | D:275, D:334, D:588, K:84, K:265 | KEEP |
| z-index | 4000 (1), 5000 (2), both off ladder | D:906, D:923, D:1161 | KEEP |

## Appendix

- Unresolved refs: `spacing` (4 uses: kit-mui/src/renderers.tsx:82, :115, :171, :215). MUI's default spacing, not declared in this repo.
- Bad tokens (defined with a function the tool does not evaluate): `--fs-radius-sm` (`calc(var(--fs-radius) / 2)`), `--sheet-line` and `--sheet-panel` (`color-mix()` on `currentColor`).
- Unparsed colour: `Canvas` (3), `CanvasText` (3), `Highlight` (2) in the kit's forced-colors block, `currentColor` (5), `background` (2) and `safeStyleValue(...)` (1), the last two author-provided. Spacing: `auto` (7), `num(props[...])` and `px(...)` (12, document values with a kit fallback such as `num(..., 16)`), `gap` (1), `8 + depth * 12` (1). Radius: `calc(var(--fs-radius) * 2)` (1), two document defaults. Font size: `clamp(24px, 3vw, 30px)` (1), one dynamic template (builders.ts:22). Shadow: 3 insets that embed a `var()`.
- z-index ladder: no token values; off ladder 4000 and 5000; local 1.
- Mirrored variables: every name set in both dark blocks agrees (the CSS blocks; the MUI theme has one dark block). Six of the seven `--pg-*` in playground.css equal an `--fs-*` in light and dark: accent (`--fs-primary`), text, border, surface (`--fs-bg-panel`), muted (`--fs-text-muted`) and field (`--fs-bg-field`). `--pg-soft` equals `--fs-bg-well` in light only (dark: `#18231f` against `#131d18`). Spec 11 keeps the kit's `--fsh-*` independent of both.
- Declared, with no direct use found: `primary.main`, `background.paper` and `text.secondary` (the MUI theme reads them), `--pg-accent-hover`, `--pg-selected` and `--pg-selected-text` (read only by `palettes.css`).
- Dynamic patterns, emitting nothing: 39, mostly runtime sizes (drag positions, frame widths, document widths, grid tracks) and keyword choices. Form-document props such as `gap: 12` are data, not style. The kits' own fallbacks are not counted either: `GAP = 16` (kit-mui/src/renderers.tsx:49), the `16` in `num(props[...], 16)`, and the compact-density `gap` of 12.
- Ignored literals: 21 of 759 (6 in comments; 15 not style: 11 placeholders, 2 hints, 2 `<input type="color">` fallbacks).
- Exclusions: test files, `apps/*/vite.config.ts`, e2e, scripts, docs. 89 files in scope, 1073 occurrences, 158 token records.
- Spec check: the property table and the sweep rules were followed as written. Two limits of the extractor: the TypeScript occurrences have no independent per-category count (the CSS ones do), and a const is followed only inside one file, except `backgroundImageStyle`.

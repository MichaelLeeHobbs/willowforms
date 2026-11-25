# Theme parity appendix: apps/playground

Commit 6c3b1bf70d442a22c8f882fafa277fd27ed0fe86. Every figure is tool output. Sources are written `token@scope`; `literal:user-agent:::placeholder` is the browser's own placeholder colour, and `literal:emotion:<class>` is a Material UI style with its generated hash removed (`.emotion` when it has no label).

## Clusters

| id | theme | text | background | pairs | screens | worst | need | status |
|---|---|---|---|---|---|---|---|---|
| C0001 | desert-dark | `literal:user-agent:::placeholder` | `--fs-bg-field@.fs-shell:where([data-fs-theme="dark"])` | 32 | 28 | 3.50 | 4.5 | PROVEN |
| C0002 | desert-light | `literal:user-agent:::placeholder` | `--fs-bg-field@.fs-shell` | 32 | 28 | 4.25 | 4.5 | PROVEN |
| C0003 | willow-dark | `literal:user-agent:::placeholder` | `--fs-bg-field@.fs-shell:where([data-fs-theme="dark"])` | 32 | 28 | 3.50 | 4.5 | PROVEN |
| C0004 | willow-light | `literal:user-agent:::placeholder` | `--fs-bg-field@.fs-shell` | 32 | 28 | 4.25 | 4.5 | PROVEN |
| C0005 | desert-dark | `literal:emotion:.MuiFormHelperText-root.Mui-error` | `literal:emotion:.emotion` | 1 | 1 | 4.26 | 4.5 | BLOCKED: no injection; predicted |
| C0006 | desert-dark | `literal:user-agent:::placeholder` | `--pg-surface@.pg-app[data-pg-theme="dark"]` | 1 | 1 | 3.07 | 4.5 | PROVEN |
| C0007 | desert-light | `literal:user-agent:::placeholder` | `--pg-surface@.pg-app` | 1 | 1 | 3.95 | 4.5 | PROVEN |
| C0008 | willow-dark | `literal:emotion:.MuiFormHelperText-root.Mui-error` | `literal:emotion:.emotion` | 1 | 1 | 4.26 | 4.5 | BLOCKED: no injection; predicted |
| C0009 | willow-dark | `literal:user-agent:::placeholder` | `--pg-surface@.pg-app[data-pg-theme="dark"]` | 1 | 1 | 3.07 | 4.5 | PROVEN |
| C0010 | willow-light | `literal:user-agent:::placeholder` | `--pg-surface@.pg-app` | 1 | 1 | 3.95 | 4.5 | PROVEN |

## Fix tables

The `candidates` run over every row of the theme, on the rows this run collected.

- willow-light, `literal:user-agent:::placeholder`: before, 33 of 33 fail, worst 3.95
  - --fs-text-muted and --pg-muted #58635c: fixed 33, regressed 0, still failing 0, worst 5.37
  - --fs-text and --pg-text #28312d: fixed 33, regressed 0, still failing 0, worst 11.49
- willow-dark, `literal:user-agent:::placeholder`: before, 33 of 33 fail, worst 3.07
  - --fs-text-muted and --pg-muted #b0bfb0: fixed 33, regressed 0, still failing 0, worst 7.37
  - --fs-text and --pg-text #e6eee2: fixed 33, regressed 0, still failing 0, worst 11.94
- willow-dark, `literal:emotion:.MuiFormHelperText-root.Mui-error`: before, 1 of 45 fail, worst 4.26
  - red[400] #ef5350: fixed 1, regressed 0, still failing 0, worst 4.50
  - red[300] (error.light) #e57373: fixed 1, regressed 0, still failing 0, worst 5.25
  - red[200] #ef9a9a: fixed 1, regressed 0, still failing 0, worst 7.29
- willow-dark, `literal:emotion:.MuiFormLabel-root-MuiInputLabel-root.Mui-error`: before, 0 of 40 fail, worst 5.08
  - red[400] #ef5350: fixed 0, regressed 0, still failing 0, worst 5.37
  - red[300] (error.light) #e57373: fixed 0, regressed 0, still failing 0, worst 6.27
  - red[200] #ef9a9a: fixed 0, regressed 0, still failing 0, worst 8.70
- desert-light, `literal:user-agent:::placeholder`: before, 33 of 33 fail, worst 3.95
  - --fs-text-muted and --pg-muted #58635c: fixed 33, regressed 0, still failing 0, worst 5.37
  - --fs-text and --pg-text #28312d: fixed 33, regressed 0, still failing 0, worst 11.49
- desert-dark, `literal:user-agent:::placeholder`: before, 33 of 33 fail, worst 3.07
  - --fs-text-muted and --pg-muted #b0bfb0: fixed 33, regressed 0, still failing 0, worst 7.37
  - --fs-text and --pg-text #e6eee2: fixed 33, regressed 0, still failing 0, worst 11.94
- desert-dark, `literal:emotion:.MuiFormHelperText-root.Mui-error`: before, 1 of 45 fail, worst 4.26
  - red[400] #ef5350: fixed 1, regressed 0, still failing 0, worst 4.50
  - red[300] (error.light) #e57373: fixed 1, regressed 0, still failing 0, worst 5.25
  - red[200] #ef9a9a: fixed 1, regressed 0, still failing 0, worst 7.29
- desert-dark, `literal:emotion:.MuiFormLabel-root-MuiInputLabel-root.Mui-error`: before, 0 of 40 fail, worst 5.08
  - red[400] #ef5350: fixed 0, regressed 0, still failing 0, worst 5.37
  - red[300] (error.light) #e57373: fixed 0, regressed 0, still failing 0, worst 6.27
  - red[200] #ef9a9a: fixed 0, regressed 0, still failing 0, worst 8.70

## Proof runs (seed 20261125)

| fix | pairs | now pass | failing screens | screens checked | screens using it | worst before | worst after | regressed | status |
|---|---|---|---|---|---|---|---|---|---|
| F1-willow-light | 32 | 32 | 28 | 33 | 33 | 4.25 | 5.77 | 0 | PROVEN |
| F2-willow-light | 1 | 1 | 1 | 1 | 1 | 3.95 | 5.37 | 0 | PROVEN |
| F1-willow-dark | 32 | 32 | 28 | 33 | 33 | 3.50 | 8.41 | 0 | PROVEN |
| F2-willow-dark | 1 | 1 | 1 | 1 | 1 | 3.07 | 7.37 | 0 | PROVEN |
| F1-desert-light | 32 | 32 | 28 | 33 | 33 | 4.25 | 5.77 | 0 | PROVEN |
| F2-desert-light | 1 | 1 | 1 | 1 | 1 | 3.95 | 5.37 | 0 | PROVEN |
| F1-desert-dark | 32 | 32 | 28 | 33 | 33 | 3.50 | 8.41 | 0 | PROVEN |
| F2-desert-dark | 1 | 1 | 1 | 1 | 1 | 3.07 | 7.37 | 0 | PROVEN |

Combined check (both fixes together on the screens they share): 4 renders, 0 regressions.

## Proof canary

```
willow-dark
{"t":"before","affected":1,"fail":1,"worst":"3.10"}
{"t":"candidate","name":"#9ca3af","color":"#9ca3af","fixed":1,"regressed":0,"still_failing":0,"worst":"5.92"}
{"t":"pair","id":"canary-token-willow-dark-proof","screen":"edit/draft/mui","theme":"willow-dark","key":"canary|token","bucket":"PASS","reason":"","ratio":"5.92","need":"4.5","large":false,"fg":"#9ca3af","bg":"#1e2735","fg_src":"--tp-canary-text@#tp-canaries","bg_src":"--tp-canary-card@#tp-canaries"}
desert-dark
{"t":"before","affected":1,"fail":1,"worst":"3.10"}
{"t":"candidate","name":"#9ca3af","color":"#9ca3af","fixed":1,"regressed":0,"still_failing":0,"worst":"5.92"}
{"t":"pair","id":"canary-token-desert-dark-proof","screen":"edit/draft/mui","theme":"desert-dark","key":"canary|token","bucket":"PASS","reason":"","ratio":"5.92","need":"4.5","large":false,"fg":"#9ca3af","bg":"#1e2735","fg_src":"--tp-canary-text@#tp-canaries","bg_src":"--tp-canary-card@#tp-canaries"}
```

## Fixed colours

All 33 are the same colour, `#757575`, on the text side, and all fail in every theme. No fixed colour passes in every theme.

- `edit/contact-request/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/contact-request/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/customer-feedback/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/customer-feedback/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/dnd-character-sheet/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/dnd-character-sheet/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/draft/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/draft/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/equipment-inspection/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/equipment-inspection/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/event-registration/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/event-registration/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/expense-report/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/expense-report/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/job-application/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/job-application/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/project-brief/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/project-brief/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/volunteer-signup/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/volunteer-signup/mui` `section:1>div:1>input:2::placeholder` #757575
- `edit/workshop-enrollment/html` `section:1>div:1>input:2::placeholder` #757575
- `edit/workshop-enrollment/mui` `section:1>div:1>input:2::placeholder` #757575
- `shell/gallery` `div:2>label:1>input:1::placeholder` #757575
- `shell/inspector-style` `div:4>span:2>input:1::placeholder` #757575
- `shell/inspector-style` `div:5>div:2>input:1::placeholder` #757575
- `shell/inspector-style` `div:6>span:2>input:1::placeholder` #757575
- `shell/presets` `section:1>div:1>input:2::placeholder` #757575
- `shell/save-error` `section:1>div:1>input:2::placeholder` #757575
- `shell/settings` `div:5>div:1>input:2::placeholder` #757575
- `shell/settings` `div:5>div:2>input:2::placeholder` #757575
- `shell/settings` `div:1>div:8>input:1::placeholder` #757575
- `shell/viewport-fixed` `section:1>div:1>input:2::placeholder` #757575
- `shell/viewport-mobile` `section:1>div:1>input:2::placeholder` #757575

## Undecided groups

| theme | reason | background | pairs | screens |
|---|---|---|---|---|
| desert-dark | overlap | `--fs-bg-panel@.fs-shell:where([data-fs-theme="dark"])` | 222 | 6 |
| desert-light | overlap | `--fs-bg-panel@.fs-shell` | 222 | 6 |
| willow-dark | overlap | `--fs-bg-panel@.fs-shell:where([data-fs-theme="dark"])` | 222 | 6 |
| willow-light | overlap | `--fs-bg-panel@.fs-shell` | 222 | 6 |
| desert-dark | transform | `literal:emotion:.emotion` | 164 | 11 |
| desert-light | transform | `literal:emotion:.emotion` | 164 | 11 |
| willow-dark | transform | `literal:emotion:.emotion` | 164 | 11 |
| willow-light | transform | `literal:emotion:.emotion` | 164 | 11 |
| desert-dark | overlap | `literal:emotion:.emotion` | 54 | 6 |
| desert-light | overlap | `literal:emotion:.emotion` | 54 | 6 |
| willow-dark | overlap | `literal:emotion:.emotion` | 54 | 6 |
| willow-light | overlap | `literal:emotion:.emotion` | 54 | 6 |
| desert-dark | overlap | `--pg-surface@.pg-app[data-pg-theme="dark"]` | 36 | 6 |
| desert-dark | transform | `--sheet-panel@[data-fs-scope][data-fs-key="root"]` | 36 | 3 |
| desert-light | overlap | `--pg-surface@.pg-app` | 36 | 6 |
| desert-light | transform | `--sheet-panel@[data-fs-scope][data-fs-key="root"]` | 36 | 3 |
| willow-dark | overlap | `--pg-surface@.pg-app[data-pg-theme="dark"]` | 36 | 6 |
| willow-dark | transform | `--sheet-panel@[data-fs-scope][data-fs-key="root"]` | 36 | 3 |
| willow-light | overlap | `--pg-surface@.pg-app` | 36 | 6 |
| willow-light | transform | `--sheet-panel@[data-fs-scope][data-fs-key="root"]` | 36 | 3 |
| desert-dark | overlap | `--pg-soft@.pg-app[data-pg-theme="dark"]` | 12 | 6 |
| desert-light | overlap | `--pg-soft@.pg-app` | 12 | 6 |
| willow-dark | overlap | `--pg-soft@.pg-app[data-pg-theme="dark"]` | 12 | 6 |
| willow-light | overlap | `--pg-soft@.pg-app` | 12 | 6 |
| desert-dark | transform | `literal:emotion:.MuiPaper-root-MuiCard-root` | 9 | 8 |
| desert-light | transform | `literal:emotion:.MuiPaper-root-MuiCard-root` | 9 | 8 |
| willow-dark | transform | `literal:emotion:.MuiPaper-root-MuiCard-root` | 9 | 8 |
| willow-light | transform | `literal:emotion:.MuiPaper-root-MuiCard-root` | 9 | 8 |
| desert-dark | gradient | `--fsh-surface@.fsh-screen:where([data-fsh-theme="dark"])` | 6 | 3 |
| desert-dark | gradient | `literal:emotion:.emotion` | 6 | 3 |
| desert-dark | overlap | `--variant-containedBg@.MuiButtonBase-root-MuiButton-root` | 6 | 6 |
| desert-light | gradient | `--fsh-surface@.fsh-screen` | 6 | 3 |
| desert-light | gradient | `literal:emotion:.emotion` | 6 | 3 |
| desert-light | overlap | `--variant-containedBg@.MuiButtonBase-root-MuiButton-root` | 6 | 6 |
| willow-dark | gradient | `--fsh-surface@.fsh-screen:where([data-fsh-theme="dark"])` | 6 | 3 |
| willow-dark | gradient | `literal:emotion:.emotion` | 6 | 3 |
| willow-dark | overlap | `--variant-containedBg@.MuiButtonBase-root-MuiButton-root` | 6 | 6 |
| willow-light | gradient | `--fsh-surface@.fsh-screen` | 6 | 3 |
| willow-light | gradient | `literal:emotion:.emotion` | 6 | 3 |
| willow-light | overlap | `--variant-containedBg@.MuiButtonBase-root-MuiButton-root` | 6 | 6 |
| desert-dark | overlap | `--fs-bg-field@.fs-shell:where([data-fs-theme="dark"])` | 5 | 5 |
| desert-dark | overlap | `--fs-primary@.pg-app[data-pg-palette="desert"] .fs-shell` | 5 | 5 |
| desert-light | overlap | `--fs-bg-field@.fs-shell` | 5 | 5 |
| desert-light | overlap | `--fs-primary@.pg-app[data-pg-palette="desert"] .fs-shell` | 5 | 5 |
| willow-dark | overlap | `--fs-bg-field@.fs-shell:where([data-fs-theme="dark"])` | 5 | 5 |
| willow-dark | overlap | `--fs-primary@.fs-shell:where([data-fs-theme="dark"])` | 5 | 5 |
| willow-light | overlap | `--fs-bg-field@.fs-shell` | 5 | 5 |
| willow-light | overlap | `--fs-primary@.fs-shell` | 5 | 5 |
| desert-dark | gradient | `literal:emotion:.MuiPaper-root-MuiAlert-root` | 1 | 1 |
| willow-dark | gradient | `literal:emotion:.MuiPaper-root-MuiAlert-root` | 1 | 1 |

## Supplementary `measure` summaries

The last summary is the main rows read by the plain hit test, with no opacity-0 skip. None of these is the run's result.

```
without the 6 open-dialog screens {"t":"summary","nodes":100144,"PASS":20156,"FAIL":130,"UNDECIDED":886,"SKIPPED":78080,"EXEMPT":892,"undecided_by_reason":{"gradient":50,"transform":836},"undecided_share":"0.0418","colour_share":"0.0000","result":"PASS"}
only the 6 open-dialog screens {"t":"summary","nodes":5092,"PASS":676,"FAIL":4,"UNDECIDED":1360,"SKIPPED":3004,"EXEMPT":48,"undecided_by_reason":{"overlap":1360},"undecided_share":"0.6666","colour_share":"0.0000","result":"FAIL"}
without the D&D screens and dialogs {"t":"summary","nodes":77976,"PASS":14718,"FAIL":120,"UNDECIDED":102,"SKIPPED":62296,"EXEMPT":740,"undecided_by_reason":{"gradient":50,"transform":52},"undecided_share":"0.0068","colour_share":"0.0000","result":"PASS"}
plain reading {"t":"summary","nodes":105236,"PASS":19736,"FAIL":134,"UNDECIDED":6026,"SKIPPED":78400,"EXEMPT":940,"undecided_by_reason":{"gradient":50,"overlap":5140,"transform":836},"undecided_share":"0.2327","colour_share":"0.0000","result":"FAIL"}
```

## Blocked screens and routes not rendered

None blocked. Every planned screen was collected in every theme.

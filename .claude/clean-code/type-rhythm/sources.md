# Where the scale, markers and role map came from

## Scale

None declared, so there is no `scale.jsonl`: distribution mode. What was read at commit 8e92d4c:

- `packages/designer/src/designer.css:27` declares one size token, `--fs-font-size: 14px`. One step is a base size, not a scale. No weight, line or space token exists there.
- `packages/kit-html/src/kit-html.css:8` to `:25` declares colour, radius, shadow and font-family tokens only.
- `apps/playground/src/playground.css` and `palettes.css` declare colour tokens only.
- `apps/playground/src/App.tsx:86` and `character-theme.ts:3` call `createTheme` without `typography` or `spacing`. Material UI's defaults apply, and they are the library's scale, not this repo's.
- `docs/spec/11-theming.md:43` states a 14px chrome base and says rendered form typography is independent. `docs/reviews/design-direction.md:24` names 17 to 26px headings and 13 to 14px control text for the character sheet only. Neither is a scale.

## Markers

The playground has no sign-in and no not-found page, so none of these could be read from source as a real marker:

- `auth`: `.pg-app` (`apps/playground/src/App.tsx:171`). It is present on every page, so it cannot tell a signed-in page from a signed-out one. This is why the `logged-out` canary fails.
- `login`: `input[type="password"]`. No source file renders one.
- `notfound`: `[data-not-found]`. No source file renders it. A wrong path is caught by the path test (`wrong_page`) instead.

## Screens

- Routes: the app has one page file (`apps/playground/index.html`) and reads `?example=` (`apps/playground/src/App.tsx:63`) against the ids in `apps/playground/src/examples/index.ts`.
- Second count: 10 links in `apps/playground/EXAMPLES.md`, plus the one page file, is 11.
- `apps/demo-server` is an HTTP API with no pages.
- Variants: `base` is the Material UI kit, the app's default. `html` is the Plain HTML kit, set through the app's own saved-choice key (`apps/playground/src/App.tsx:26`) before the page loads.

## Role map seeds

Written from class names only, never from sizes. Every rule reads the element's own part of the site key:

| Class | Role | From |
| --- | --- | --- |
| `MuiTypography-h1` to `-h6` | heading | Material UI variant class |
| `MuiTypography-body1`, `-body2`, `MuiAlert-message`, `MuiSelect-select` and its `span.notranslate` | body | Material UI variant class; an alert and a select value use body typography |
| `MuiTypography-caption`, `MuiFormHelperText-root` | caption | Material UI variant class; helper text uses caption typography |
| `MuiInputLabel-root`, `MuiFormLabel-root` | label | Material UI class |
| `strong.pg-brand` | heading | `apps/playground/src/App.tsx:173`, the product name |
| `span.pg-beta`, `span.pg-kit-switch__note` | caption | `apps/playground/src/App.tsx`, a badge and a status note |

`span.notranslate` holds a zero-width placeholder, which the collector counts as text. It carries the size the select's value would have.

Many keys hold a React-generated id (`_r_1u_`), which the collector does not normalise. They can change when a screen's field order changes, so expect this file to need the pilot again on a re-run.

## Unassigned after the pilot

One key, 2 elements on 2 captures: `div[data-testid=willowforms-designer].fs-shell span` with no context.

# CSS override census: appendix

## Every !important with its cause

None in a stylesheet or an object style. Document CSS is data and is not counted; see the report's "What this run did not see".

## Heads with no prefix

| Head | Rules | Reason |
|---|---|---|
| `fs-` | 223 | This repo's own classes, defined in packages/designer/src/designer.css. `@willowforms/designer` is a workspace package, not an outside dependency. |
| `fsh-` | 91 | This repo's own classes, defined in packages/kit-html/src/kit-html.css, a workspace package. |
| `pg-` | 64 | This repo's own classes, defined in apps/playground/src/playground.css and palettes.css. |
| `is-` | 20 | This repo's own state classes, used in designer.css and kit-html.css. Material UI's state classes start with `Mui-`. |

No head matches `Mui`, `css-` or any other class an installed UI dependency (`@mui/material`, `@emotion/react`, `@emotion/styled`) generates.

## File table

No file holds an `!important`, an internal class, a deep chain or an ID selector.

## Unparsed files

None.

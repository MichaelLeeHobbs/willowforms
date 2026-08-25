# Prior art

## What is here

`formengine-teardown.md` is a black-box UX study of the FormEngine public demo
(`formbuilder.formengine.io`, v10.2.0), produced by driving the page in a browser and recording what it
does. It is the reason this project exists and it doubles as a feature checklist.

Read it for two things:

1. **The feature surface.** What a top-tier form designer is expected to do: the palette, the structure
   tree, per-type property schemas, computed values, localization, validation rules, viewport simulation,
   preview with live data and errors.
2. **The gap list.** Its sections 6, 8, 9 and 12 record where that product falls short, and those are the
   things worth beating rather than copying:
   - Empty-name submits are blocked silently with no error copy.
   - No confirmation on any destructive action: clear, remove component, delete form.
   - 30 buttons with no accessible name; no `role="tablist"` wrappers; no landmarks; no headings.
   - Primary button label at 3.03:1 contrast, failing WCAG AA.
   - A field declaring only a `url` rule still reports "Required" when blank.
   - No loading or network-error state anywhere; a failed fetch leaves selects silently empty.

The last one already has a test named after it in `packages/core/src/validation.test.ts`.

## Ground rules for using it

**Use it for behaviour and capability. Do not clone its look or its copy.**

Reimplementing a feature set from a black-box study is ordinary competitive engineering, and no code
from that product is in this repo. But the teardown also records its exact colour palette, its measured
pixel metrics, and its verbatim UI strings. Reproducing those wholesale would move the work from
"same capability" toward copying a product's distinctive appearance, which is a different and worse
argument to have.

So:

- Do not lift the hex values in section 10. Formsmith has its own tokens in `designer.css`.
- Do not lift verbatim UI strings. Write our own copy, and write it better where section 6 shows theirs
  is missing.
- Feature ideas, information architecture, and the data-model shape are fair game and are why this
  document is checked in.

## Refreshing it

The teardown was captured 2026-08-24 against v10.2.0. Re-running it means driving the public demo in a
browser and recording what it does, section by section, against the same outline: layout, component
inventory, interactions, validation, data model, content states, accessibility, and theme.

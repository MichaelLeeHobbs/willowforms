# @willowforms/core

The document model, tree operations, and validation engine behind
[WillowForms](https://github.com/MichaelLeeHobbs/willowforms).

No React, no component library. That is deliberate: the same validation runs in the browser during
preview and in Node on a server, so a form's rules are written once and cannot drift between the two.

```bash
npm install @willowforms/core
```

```ts
import { validateForm } from '@willowforms/core'
import type { FormData, FormDocument } from '@willowforms/core'

declare const form: FormDocument
declare const answers: FormData

export const errors = validateForm(form.root, answers)
```

## What is in here

- `FormDocument` and `ComponentNode`, the recursive tree that is the source of truth
- Immutable tree operations (`insertNode`, `moveNode`, `removeNode`, `updateNode`), each returning a
  new tree that shares structure with the old one
- `validateForm` and `validateField`, plus the rule set
- The `Kit` metadata contract that palettes and property panels are built from

## Two behaviours worth knowing

**Only `required` fails on an empty value.** Every other rule passes when the value is empty, so a field
declaring only `url` stays valid while blank.

**A missing evaluator degrades permissively.** `custom` rules and `computed` guards need a JS sandbox, which core does not provide. With none injected, a rule with a `computed` guard is skipped and `custom` rules pass. Code execution is the host's privilege boundary to own, not a convenience for this package to hand out.

MIT.

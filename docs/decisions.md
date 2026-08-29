# Decisions

Choices made under delegated design authority that would otherwise have been questions. Newest first.

The field that earns this file is **Reversal**: it says which entries deserve a second look.

### The key grammar is the JavaScript identifier subset

- **Decided:** `^[A-Za-z_][A-Za-z0-9_]*$`, plus `__proto__`, `constructor` and `prototype` refused by
  name. Enforced by `keyProblem`, called from both `validateDocument` and the panel's rename, so a paste
  and a rename are judged the same way. Applies to `dataKey` too.
- **Why:** A hyphen is the tempting addition — real forms are full of `first-name` — and it is exactly
  the one that breaks. `computed` bindings are host-evaluated JavaScript, so `first-name` in an
  expression is a subtraction, silently and with no error anywhere. A key namespace expressions can name
  has to be an identifier namespace. `.`, `[` and `]` stay free because row addressing will need them.
- **Rejected:** Allowing hyphens, which reads friendlier and hands every author a silent wrong answer the
  first time they write an expression. Also rejected: reporting a bad key as a warning rather than an
  error, which is how a document that cannot round-trip through JSON Schema ends up in a database.
- **Reversal:** Loosening later is easy and tightening later is not, so this is deliberately the strict
  end. It is a breaking change for a document holding a key outside the grammar, which is free while
  nothing is published and would not be afterwards. That asymmetry is the argument for doing it now.
- **When:** 2026-08-28, on `feat/steps`.

### `missingContext` is checked against the scopes, not the bare context

- **Decided:** A host that evaluates under several environments runs the boot-time check against those
  environments, not against its base context. `apps/demo-server` unions `missingContext` over its scopes.
- **Why:** Found by running it. `step` is a path the server fills in itself, once per scope, so against
  the base session context it reads as missing and every multi-step form is refused for a path that was
  never missing. The question the check is actually asking is whether every path a document reads can be
  read in the environments it will be evaluated in.
- **Rejected:** Teaching `missingContext` about steps, which would put a feature core deliberately does
  not know about into the function that checks wiring. Also rejected: dropping the check for documents
  that read `step`, which trades a false alarm for a silent hole.
- **Reversal:** Trivial, and confined to the host. Core is unchanged.
- **When:** 2026-08-28, on `feat/context`.

### Steps next, then the key grammar, then repeated scope

- **Decided:** Keep the approved order. Build steps, then the key grammar `12-api.md` already calls
  planned, then repeated scope. Settled by a steelman: two briefs arguing opposite sides at full
  strength, tested against an agent with no stake that surveyed six libraries and ran the naive Repeater
  against this core.
- **Why:** The evidence points away from the reversal's central claim. Across react-hook-form, Formik,
  JSON Schema, JSONForms, SurveyJS and Form.io, **four of six needed a breaking change to their row
  addressing after shipping and none ever needed one to add pages.** The mechanism is why: paging
  partitions a form along an axis the data model does not have, so it is a view transform, while
  repetition adds a coordinate to every path beneath it and the setter, getter, validator, error
  reporter, condition evaluator and reconciliation key must all learn it at once. Steps here add
  `validateAcross(root, data, EvalOptions[])`, a container definition and a canvas prop — none of which
  names, addresses or stores a value — so there is no addressing vocabulary for rows to inherit. Five of
  the six libraries also implemented steps exactly as this repo already does, a display flag over an
  existing container, so the shape is convergent rather than naive.
- **Rejected:** Repeated scope first. Its strongest claim, that whoever is second inherits the other's
  idea of scope, is untestable for this repo, and the ground-truth agent warned explicitly against
  reading the library corpus as evidence about ordering: those projects never chose, they all ended up
  with both. What the corpus constrains is risk _within_ the addressing layer, which is orthogonal to
  which feature ships first.
- **The losing case's strongest surviving point**, which changes what repeated scope must include:
  repetition breaks this codebase **silently**, and not only in the DOM. Measured against core with one
  row subtree present three times — `findNode` returns row 3 while `pathTo` returns row 1, `updateNode`
  edits every row, `removeNode` deletes every row, `moveNode` collapses three into one. So repeated
  scope is not "add a component"; it is a node-identity change in `tree.ts` first. Form.io ended with
  eight path flavours because they kept finding they had the wrong one, and JSONForms' maintainer states
  that pointer-style addressing cannot express row-relative and root references at once without a
  special enhancement — and Formsmith's `Operand` is exactly pointer-style. The key grammar goes between
  the two features for that reason: a path grammar on top of a key grammar that does not exist is how
  that mistake gets made here.
- **Reversal:** Cheap, and asymmetric on purpose. Steps add no type, no addressing and no public-API
  change, so if this order is wrong the work is not thrown away — it is a container definition and one
  validation helper that repeated scope neither uses nor contradicts.
- **What would change my mind:** if the goal shifts to publishing the document format and freezing it
  soon, breaking `FormData` and `onChange` before first publish dominates and repeated scope goes first.
  Or a real user needing "add another" before a wizard.
- **When:** 2026-08-28, on `feat/context`.

### Edit mode draws what a condition hides; preview does not

- **Decided:** `FormRenderer` takes `revealHidden`, and the designer passes it while editing and never
  in preview. A revealed node carries `data-fs-hidden="true"`. Validation is untouched: `validateForm`
  calls the same `isVisible`, so this changes what is drawn and never what is checked.
- **Why:** A component with `renderWhen` set was absent from the canvas DOM, so it could not be seen,
  selected there, or dropped into — the tree was the only way to reach it. Arranging a form means
  arranging every component in it, including the ones a given user will not see. Showing what a user
  sees is what Preview is for.
- **Rejected:** A sample-data box on the canvas bar, which makes an author simulate a user to reach
  their own components and cannot help at all with a condition reading host context. Also rejected:
  dimming the revealed node from `designer.css`, which invariant 3's test forbids — its bar is that an
  exception gives a component back something the designer took, never an appearance decision on the
  kit's behalf. The marker is an attribute; what to draw with it is still open.
- **Reversal:** Cheap. One prop, one branch in `RenderNode`, one optional attribute on `NodeAttributes`.
  Kits spread `nodeProps`, so none of them had to change.
- **When:** 2026-08-28, on `feat/context`.

### The context an effect writes is the browser's, never the server's

- **Decided:** `setContext` writes to the browser's copy of `FormContext` only. The server builds its own
  context from its own session and never reads one out of a request body. A rule guarding anything that
  matters must read a path the server can derive for itself.
- **Why:** The spec had said the same rule "evaluates on the server, where the context is whatever the
  request supplied", which reads as an instruction to trust the payload and contradicts the security
  model two files over. An effect is authored in a document, and a document must not be able to grant
  itself privilege on the server.
- **Rejected:** Letting an effect's context travel with the submit. It is convenient and it makes a
  document able to tell the server what to believe about the person filling it in.
- **Reversal:** Free today. `setContext` is a sketch in `09-actions.md`, not code. It gets expensive the
  moment an action vocabulary ships against the looser reading.
- **When:** 2026-08-28, on `feat/context`.

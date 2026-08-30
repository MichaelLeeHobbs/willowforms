# Decisions

Choices made under delegated design authority that would otherwise have been questions. Newest first.

The field that earns this file is **Reversal**: it says which entries deserve a second look.

### The value refusal also refuses a backslash

A refinement to the entry below rather than a reversal of it, recorded because it widens a refusal set
that was settled by measurement.

- **Decided:** `safeStyleValue` refuses `\` alongside the decided set.
- **Why:** the steelman checked backslash escapes against _escaping the class block_, and they did not.
  It did not check them against the fetch refusal, and `\75 rl(https://…)` is a valid CSS escape for
  `url(` in which the three letters never appear, so a substring check for `url(` alone does not see it.
  Nothing legitimate on a prop whose declared editor is `color` needs a backslash.
- **Rejected:** decoding CSS escapes before testing, which is a second parser to get wrong for a value
  that has no use for the syntax.
- **Reversal:** one character in one regex.
- **When:** 2026-08-30.

### A document's CSS values are refused in core, not made safe by the rendering shape

Settled by a steelman: two briefs at full strength against a neutral agent that ran the real
React 19 + MUI + emotion + stylis pipeline, real headless Chromium with request interception, and a
17-payload bypass battery.

- **Decided:** add a value-level refusal to core — a sibling of `safeDeclarations` — and call it from
  both kits at the one sink each has. Refuse `{ } < @ ; !`, `/*`, control characters, and
  `url(` / `image-set(` / `element(` / `cross-fade(`. Keep `sx`.
- **Why the rendering shape is not enough:** a React `style` object is safe only on the client. React's
  server renderer does not validate CSS at all — `renderToStaticMarkup` emits the string verbatim, and
  Chromium renders `red;position:fixed;inset:0;z-index:99999` as a full-viewport overlay that then
  vanishes on hydration. Nothing here server-renders today, but MUI's dominant deployment is Next.js.
  And a `style` object accepts `url(https://…)`, `image-set(…)` and `var(--x, url(…))`: measured with
  request interception, the outbound fetch fires identically from an inline attribute and from an emotion
  class. So the shape closes the injection and leaves the exfiltration untouched, in **both** kits.
- **The refusal set is checked, not assumed:** CSS-escaped braces, backslash escapes, fullwidth `｝`,
  braces inside quoted strings and inside `url()`, unbalanced parens, NUL, tab, CRLF, form feed — none
  escaped the class block, and all ten legitimate colour values passed. `CSS.supports` was rejected as
  the validator: it is browser-only, and core must run in Node.
- **A correction to my own reasoning.** I argued a denylist was impossible because banning `;` would break
  `url(data:image/svg+xml;base64,…)`, which `css.ts` was rewritten to protect. That holds for
  `safeDeclarations`, which validates a declaration _list_. It does not hold for a single **value** on a
  prop whose declared editor is `color` — `url()` is not a colour, so refusing it matches the prop's own
  declared domain. Two sinks, two grammars; I applied one proof to both.
- **The losing case's surviving point, and it should still be done:** `sx` buys almost nothing here.
  Across all five `sx` blocks there are zero theme tokens, zero pseudo-selectors and zero breakpoints —
  only the spacing scale, `shape.borderRadius`, and stylis autoprefixing. The `/8` conversions exist
  purely to undo a theme transform the kit does not want, and one of them undoes the wrong one (see
  below). Moving `Box` to `style` is the right refactor on its own merits; it is just not the security
  fix.
- **Exposure is one prop, not a class.** `background` on `Box` is the only string-typed style value in
  either kit — the same single line in both. Everything else is already `num()` or an enum.
- **A sanitiser must sit at the sink or at resolve time**, not at document load: `resolveProp` evaluates
  a `computed` binding through the host's evaluator at render time.
- **Reversal:** one function in core and one call site per kit.
- **What would change my mind:** a legitimate authored value that needs `url()` on a prop declared as a
  colour. The Style tab remains the channel for real CSS.
- **When:** 2026-08-30.

### The MUI kit halves every corner radius

- **Decided:** `borderRadius` in `kit-mui`'s `Box` must not be divided by 8.
- **Why:** MUI multiplies `borderRadius` by `theme.shape.borderRadius`, which defaults to **4**, while the
  kit divides by 8. Measured: `radius: 8` renders 4px and `radius: 24` renders 12px, against 8px and 24px
  in `kit-html`. `padding: n/8` is separately fragile — it round-trips only under the default
  `spacing: 8` and silently rescales under any host theme.
- **Why it matters beyond the arithmetic:** this is the cross-kit divergence the `Grid` comment two
  functions above it was written to prevent, sitting undetected below it. Nothing catches it because no
  test renders the same document through both kits and compares computed style.
- **Reversal:** trivial. Found by the Q1 ground-truth agent while measuring something else.
- **When:** 2026-08-30.

### A row frame carries the repeater's data key, not its node key

Settled by a steelman: two briefs arguing opposite sides at full strength, against a neutral agent that
built a patched copy of core and ran both designs.

- **Decided:** `RowFrame.key` holds `dataKeyOf(node)`. Three one-token edits — `validation.ts:250`,
  `validation.ts:361`, `renderer/index.tsx:263` — after which `applyChange` is correct as written and
  `rowValue` can be deleted. The **leaf** of an error key stays `node.key`, unchanged.
- **Why:** the coordinate is dereferenced in exactly one place, `applyChange`, and it is dereferenced as
  data. Everywhere else it is a label. `validateForm`, `submittedData` and the renderer all already
  descend with `dataKeyOf(node)`, so the address was the odd one out, not the data path. Under the node
  key, a repeater whose `key` differs from its `dataKey` silently discards every row edit — and worse,
  can write an answer into an _unrelated_ list that happens to share the name, which is the opposite of
  what the "a write that cannot be placed returns the input unchanged" comment promises.
- **The strongest argument against, and why it fell:** data keys may repeat, so an error coordinate built
  from them looked ambiguous. Run against a document with two repeaters legally sharing `dataKey`, both
  visible: four error keys, four distinct, no collision. It is impossible rather than merely unobserved —
  node keys are globally unique, `validateDocument` enforces that with one `seen` set over the tree, so a
  node's chain of enclosing repeaters is fixed and only the indices vary. The prefix disambiguates rows;
  the leaf carries identity. The objection conflated the two.
- **The losing case's surviving point:** `dataKeyOf` is total from identity to name and has no inverse,
  so a data-keyed frame cannot recover which repeater it came from. That is real. It costs
  `data-fs-row` uniqueness when two visible repeaters share a data key — measured as near-worthless: no
  kit reads the attribute, `css.ts` scopes by `data-fs-key` rather than by it, and the one e2e assertion
  passes either way. Note the stated justification for `data-fs-row` in this file was that per-component
  CSS must reach every row; `css.ts` shows `data-fs-key` already does that, so the attribute is close to
  write-only.
- **Rejected:** giving `applyChange` the tree, or a `dataKeyOfRepeater` mapper. `rowValue` already has
  that signature and has been dead since it landed — it has no caller because the caller that needs it
  structurally cannot accept it. `applyChange(data, address, value)` is the signature promised to hosts
  precisely so that no host implements array descent.
- **Prior art:** five of five libraries surveyed name a row coordinate by the storage name, never by a
  component id. The two that maintain parallel identity and data systems (JSONForms, SurveyJS) keep
  identity out of the path and pay a translation cost anyway; SurveyJS, whose `name`/`valueName` split is
  nearly identical to this one, resolved value-addressing toward the data name.
- **Reversal:** three tokens, and nothing persisted changes — no address string appears in a document.
- **What would change my mind:** a consumer that must recover _which repeater_ a coordinate came from
  using only the string. None exists today; `FormErrors` keys have exactly two readers in the repo.
- **When:** 2026-08-30.

### The demo store stays in the repo; the ignore line has to land on main

- **Decided:** keep `apps/demo-server/forms.json` where it is and commit the `.gitignore` hunk from
  `c559676` to `main`. Do not relocate the store.
- **Why:** the repo already ignores eight runtime-generated in-tree paths, and all three commented
  `.gitignore` blocks are "a tool wrote here" — there is no precedent for relocating one. Prior art
  agrees: Strapi's `.tmp/data.db`, Prisma's `dev.db`, json-server's `db.json` are all in-tree and
  ignored, and no widely-used example server moves its store to a temp directory. Two facts retire the
  strongest framing against: `forms.json` has never been committed on any ref, and the submit route never
  persists, so the worst content is a form definition the developer wrote themselves.
- **The losing case's surviving point, and it sets the real task:** a `.gitignore` line is branch-local
  state, and this one is stranded. `git log --all -S` finds it in exactly one commit, on
  `origin/docs/steps-decision` — the only one of twenty-one branches with no PR. `main` does not have it.
  And the accident it prevents already happened here: `.vscode/terminals.json.9516.tmp` was swept in by a
  `git add -A` and pushed to the public remote, with the `.vscode/` ignore line landing only afterwards.
  So the durability objection is answered by _where the line lives_, not by where the store lives.
- **Rejected:** `os.tmpdir()`. The Windows-cleanup counter-argument turned out to be unsupported —
  `%TEMP%` on this machine still holds files from 2018 — but relocation buys nothing the precedent does
  not already cover, and costs the demo the legibility that is most of its job.
- **Reversal:** one line either way.
- **What would change my mind:** the submit route persisting answers. Then the file holds someone else's
  data rather than the developer's own, and it leaves the repository the same day.
- **When:** 2026-08-30.

### Row addressing: rows are a projection, not nodes

Designed four ways in parallel under different constraints — minimal interface, maximal flexibility,
common-case-trivial, ports-and-adapters — then judged. Not yet built; this is the shape the build follows.

- **Decided, and unanimous across all four designs:** **rows never mint keys.** The authored subtree
  exists once in the document; rows exist in the DOM, in `FormData` and in `FormErrors`, and never in the
  tree. A `Repeater` is a node whose `schema.type` is `array` and which has children.
- **Decided: the data is nested**, and this was _forced_ rather than chosen. `toJsonSchema` projects for a
  validator that never runs this code, and JSON Schema expresses `{type:'array', items:{type:'object'}}`
  natively while it cannot express an unbounded family of `addresses[0].street` keys without
  `patternProperties`. The same choice keeps `onChange(key, value)` unchanged, because adding a row is one
  write to one top-level key. Flat encoding would have forced a new port on every host.
- **Decided: no path string ever appears in a document.** Addresses are formed at the boundary and
  consumed at the boundary — the DOM, error keys, and the host's writer. An author never types an index.
- **Decided: `Operand.ref` gains an explicit scope discriminant** rather than a path grammar. Absent means
  the form, which is what every existing `ref` already means, so no document migrates.
- **Decided: `data-fs-row` is a separate attribute from `data-fs-key`.** They are wanted in opposite
  directions and one attribute cannot do both: per-component CSS is authored once and must reach every
  row, while a click must land on exactly one. That also leaves `css.ts` and every kit untouched.

**This corrects an entry above.** The steelman recorded, from a measurement, that repeated scope "is a
node-identity change in `tree.ts` first" — `findNode` returning row 3 while `pathTo` returned row 1,
`updateNode` editing every row. That measurement was real but the conclusion does not follow: every one
of those failures needs the same key at three places in the tree, and it never is one. `tree.ts` needs no
changes at all. The finding it did produce was genuine and is fixed separately — the two lookups
disagreeing was a live bug with unique keys too.

A second correction: I repeated JSONForms' maintainer's point that pointer-style addressing cannot
express row-relative and root references at once, and applied it to `Operand`. `Operand` is not
pointer-style. It is a tagged union whose tag _is_ the namespace, and `types.ts` says so. The enhancement
JSONForms had to bolt on is, here, one optional field on one member.

- **Rejected: leading-dot anchoring** in `ref.dataKey` (`.country` for this row). It is the smallest
  possible grammar and it makes the most common authoring mistake silent — writing `country` inside a row
  and getting the root field. That ambiguity is what left Form.io with eight path flavours.
- **Rejected: refusing root access from inside a row entirely.** Safe, and it loses a case every real
  forms product has: "show the VAT field on each line only for a business order". The refusal is cheaper
  than the ambiguity, but an explicit discriminant is cheaper than both.
- **Rejected: a stable row id.** It puts a non-answer inside `data`, which
  [12-api.md](spec/12-api.md#state-that-is-not-an-answer) already refused by name. Rows are addressed by
  index; a reorder rewrites held error keys explicitly at the moment it happens.
- **The risk this carries, and it must be built with the mitigation, not after it:** a condition authored
  inside a row and left at the default scope reads a key that only exists in the row, resolves to
  `undefined`, hides the field, and `validateForm` skips it. That is exactly the quiet failure
  `missingContext` exists to catch — a required answer silently becoming advisory on the server — so it
  takes the same boot-time answer. `validateDocument` must report a form-scoped `ref` naming a data key
  that exists only inside a repeater, and the picker must write the row scope when authoring inside one.
- **Reversal:** the frame-list shape supports nested repeaters and can be narrowed to a single integer if
  nesting is refused, which is a narrowing rather than a rewrite. Everything cut for a first version —
  outward anchors, row offsets, row facts beyond the index — is an additive union member that the
  compiler will point at.
- **When:** 2026-08-29, designed on `feat/steps`, not yet built.

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

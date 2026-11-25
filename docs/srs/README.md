# WillowForms Software Requirements Specification

## Purpose

WillowForms lets an application offer its own users a visual form designer, and lets other users complete the forms they make. It serves form authors, respondents, translators, and the developers who embed it. This SRS is the contract agents and people build toward: a requirement here is the definition of done for the work that meets it. It is allowed to change, and the product's developer decides what gets in.

Where an Accepted row disagrees with the contracts in [docs/spec](../spec/README.md), the row wins. `docs/spec` holds the shapes and the reasoning, and governs whatever no Accepted row covers.

## Scope

Proposed, awaiting the developer's confirmation.

- Build a form by dragging, or by keyboard, from a palette of components onto a canvas and a structure tree.
- Configure components: properties, choices, conditions, styling and answer names.
- Complete a form in a host application, with one set of validation rules enforced in the browser and on a server.
- Translate a form into several languages, left to right and right to left.
- Repeat groups of fields as rows, and split a form into steps.
- Raise events and effects for the host to act on.
- Preview a form before it is used.
- Load, import, export and migrate form documents, and project a JSON Schema from one.
- Draw the same document with interchangeable component kits, including kits other people write.
- Meet the project's accessibility target in the designer and in rendered forms.

The host application supplies storage, accounts, permissions, networking, submission processing and any code evaluator. WillowForms talks to no other system.

## Out of scope

Proposed, awaiting the developer's confirmation. Each line names the document it was drawn from.

- Storing forms or answers, accounts, sessions, permissions, publishing, and submission endpoints: the host owns the application (`docs/spec/00-product.md`).
- File inputs, uploads, and attachment storage or viewing in the standard kits: host-configured components own them (`docs/COMPATIBILITY.md`, `docs/spec/03-components.md`).
- A bundled evaluator for author-controlled code: the host owns code execution (`docs/spec/00-product.md`, `docs/THREAT_MODEL.md`).
- Richer expression tooling, such as completion, syntax services, debugging and in-panel evaluation (`docs/spec/07-bindings.md`).
- A generic HTML, `data-*` or ARIA attribute editor: ordinary properties carry accessibility intent (`docs/spec/02-kit-contract.md`).
- Keyboard selection of rendered components on the canvas: the tree and panels are the keyboard authoring path (`docs/spec/05-canvas.md`).
- JSON Schema import, forms generated from a schema, and form archives (`docs/spec/10-interchange.md`).
- Several forms in one document (`docs/spec/01-document-model.md`).
- A router or a branching workflow engine: step state belongs to the host (`docs/spec/03-components.md`).
- Modal and dialog layout, application navigation, and a Wizard component type (`docs/spec/03-components.md`).
- A plugin marketplace, runtime package installer, or plugin sandbox (`docs/spec/02-kit-contract.md`).
- A proprietary designer, enterprise tier, or paid package (`docs/spec/00-product.md`).
- Making a malicious host or component kit safe (`docs/THREAT_MODEL.md`).
- A configurable designer pane arrangement (`docs/spec/11-theming.md`).

## User classes

| Class      | Who they are                                                        | What they need most                                                                            |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Author     | Creates and edits forms inside a host application; not a programmer | Understandable controls for questions, choices, conditions and validation, without JSON        |
| Respondent | Completes a form someone else made                                  | Clear labels and errors, keyboard and screen reader access, answers that are not lost          |
| Translator | Supplies localized labels, instructions and messages                | Translation beside the property it belongs to, without JSON                                    |
| Embedder   | Developer integrating the designer, the renderer, or both           | Stable documented boundaries, a renderer without the designer, the same validation on a server |
| Kit author | Developer writing a component kit or a single custom component      | An interface that fits their design system, and obligations they can check                     |

## Conventions

These rules govern every file in this folder. Skills and agents that read or write the SRS follow them.

**Files.** `README.md` (this file), one `<area>.md` per area with nested headings for sub-areas, `interfaces/<name>.md` for contracts other code builds against (each with its own semver in its header), and `trace.md`, which only the verifier writes.

**Requirement rows.** Every requirement is one row of a table with exactly these columns:

| ID  | Requirement | Pri | Verify | Status |
| --- | ----------- | --- | ------ | ------ |

- **ID** `AREA-SUB-NN`: capitals, then a sub-area, then two or more digits. Never reused. A changed requirement gets a new ID; the old row's Status becomes `Superseded by <new ID>`.
- **Pri** `P1` required for the end state, `P2` expected, `P3` nice to have.
- **Verify** how proof is obtained (ISO/IEC/IEEE 29148): `Test` (an automated test asserts it), `Demonstration` (steps run and observed), `Inspection` (a file and line show it), `Analysis` (reasoning written out).
- **Status** `Proposed`, `Accepted`, `Deferred`, `Rejected`, or `Superseded by <ID>`. Anyone may add a Proposed row. Only the developer moves a row to Accepted, Deferred or Rejected, in their own words, and each such decision gets a dated line in the change log naming every ID it moved, with the word Accepted before the IDs it accepts.

**Wording.** `shall` is mandatory, `should` is expected, `may` is permitted. Each requirement is necessary, singular (one behaviour per row), unambiguous, verifiable, and says what the product does, not how it is built. Interface specs are the exception: there the exact shape is the requirement.

**Source notes.** A Proposed row discovered during a build or drafted from existing material carries its source in a note under the table: `AUTH-USR-07: source: discovered while building the login screen, PR 214`.

**Tests.** A test that proves a requirement carries its ID in its name, for example `AUTH-USR-03: locks the account after 5 failed logins`. Where a language forbids hyphens in names, use underscores (`test_auth_usr_03_locks_account`).

**Verdicts.** `trace.md` records, per Accepted requirement, one of `Met`, `Partial`, `Not met`, `Regressed`, or `Cannot verify` (with the reason), and the evidence. Whoever built the work never marks it Met.

## Areas

Proposed, awaiting the developer's confirmation. No area file is written until the list is confirmed.

| Area                                 | File               | What it covers                                                                                           |
| ------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------- |
| Completing a form (`FILL`)           | `filling.md`       | Answers (`ANS`), errors shown (`ERR`), what is submitted (`SUB`), components that fail (`RES`)           |
| Validation (`VAL`)                   | `validation.md`    | Rules (`RULE`), when rules apply (`WHEN`), messages (`MSG`), server parity (`SRV`)                       |
| Form documents (`DOC`)               | `documents.md`     | Loading and migration (`LOAD`), import and export (`JSON`), schema export (`SCH`), handing over (`SAVE`) |
| Security (`SEC`)                     | `security.md`      | Untrusted documents (`DOCS`), author code (`CODE`), submitted data (`DATA`), limits (`LIM`)              |
| Building a form (`BUILD`)            | `building.md`      | Palette (`PAL`), selection (`SEL`), drag and drop (`DND`), tree (`TREE`), undo (`UNDO`)                  |
| Configuring components (`CONF`)      | `configuring.md`   | Properties (`PROP`), choices (`OPT`), conditions (`COND`), styling (`STYLE`), names (`KEY`)              |
| Component catalogue (`CAT`)          | `catalogue.md`     | Layout (`LAY`), display and feedback (`DISP`), inputs (`INP`), selection (`CHO`), navigation (`NAV`)     |
| Repeated groups and steps (`FLOW`)   | `flow.md`          | Repeaters (`REP`), steps (`STEP`)                                                                        |
| Localization (`LOC`)                 | `localization.md`  | Languages (`LANG`), translations (`TRN`), writing direction (`DIR`)                                      |
| Actions (`ACT`)                      | `actions.md`       | Events (`EVT`), effects (`EFF`), code actions (`CODE`), authoring them (`AUTH`)                          |
| Preview (`PREV`)                     | `preview.md`       | Using the form (`RUN`), simulated sizes (`VIEW`), answer output (`DATA`)                                 |
| Designer workspace (`WORK`)          | `workspace.md`     | Panes (`PANE`), toolbar (`BAR`), narrow layouts (`NARR`)                                                 |
| Accessibility (`A11Y`)               | `accessibility.md` | Keyboard (`KBD`), screen readers (`SR`), vision and motion (`VIS`), rendered forms (`FORM`)              |
| Embedding and compatibility (`HOST`) | `embedding.md`     | Designer (`DSGN`), renderer (`REND`), theming (`THM`), platforms (`PLAT`), packages (`PKG`)              |
| Kits (`KIT`)                         | `kits.md`          | Obligations (`OBL`), switching kits (`SWAP`), custom components (`CUST`)                                 |

Interfaces: none proposed yet. The document format, the kit interface and the public API are candidates.

## Completeness summary

Written by the coverage script. Do not edit between the markers.

<!-- srs-summary:start -->

Not generated yet.

<!-- srs-summary:end -->

## Change log

Newest first. One line per decision: the date, what moved, and the developer's words.

- 2026-11-25: Decided that where an SRS row and `docs/spec` disagree, the SRS row decides. "SRS wins"
- 2026-11-25: Created. Scope, Out of scope and Areas are proposals; no requirement rows yet.

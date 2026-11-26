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
- Tooltip, embedded form and slot components, and a raw typography wrapper (`docs/spec/03-components.md`).

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

An area without a link has no file yet.

| Area                                 | File                               | What it covers                                                                                                                             |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Completing a form (`FILL`)           | [filling.md](filling.md)           | Answers (`ANS`), errors shown (`ERR`), what is submitted (`SUB`), components that fail (`RES`)                                             |
| Validation (`VAL`)                   | [validation.md](validation.md)     | Rules (`RULE`), when rules apply (`WHEN`), messages (`MSG`), server parity (`SRV`)                                                         |
| Form documents (`DOC`)               | [documents.md](documents.md)       | Loading and migration (`LOAD`), import and export (`JSON`), schema export (`SCH`), handing over (`SAVE`)                                   |
| Security (`SEC`)                     | [security.md](security.md)         | Untrusted documents (`DOCS`), author code (`CODE`), submitted data (`DATA`), limits (`LIM`)                                                |
| Building a form (`BUILD`)            | [building.md](building.md)         | Palette (`PAL`), selection and its toolbar (`SEL`), drag and drop (`DND`), tree (`TREE`), undo (`UNDO`), the canvas while editing (`CANV`) |
| Configuring components (`CONF`)      | [configuring.md](configuring.md)   | Properties (`PROP`), choices (`OPT`), conditions (`COND`), styling (`STYLE`), names (`KEY`), authoring rules (`RULE`)                      |
| Component catalogue (`CAT`)          | [catalogue.md](catalogue.md)       | Layout (`LAY`), display and feedback (`DISP`), inputs (`INP`), selection (`CHO`), navigation (`NAV`)                                       |
| Repeated groups and steps (`FLOW`)   | [flow.md](flow.md)                 | Repeaters (`REP`), steps (`STEP`)                                                                                                          |
| Localization (`LOC`)                 | [localization.md](localization.md) | Languages (`LANG`), translations (`TRN`), writing direction (`DIR`)                                                                        |
| Actions (`ACT`)                      | `actions.md`                       | Events (`EVT`), effects (`EFF`), code actions (`CODE`), authoring them (`AUTH`)                                                            |
| Preview (`PREV`)                     | `preview.md`                       | Using the form (`RUN`), simulated sizes (`VIEW`), answer output (`DATA`)                                                                   |
| Designer workspace (`WORK`)          | `workspace.md`                     | Panes (`PANE`), toolbar (`BAR`), narrow layouts (`NARR`)                                                                                   |
| Accessibility (`A11Y`)               | `accessibility.md`                 | Keyboard (`KBD`), screen readers (`SR`), vision and motion (`VIS`), rendered forms (`FORM`)                                                |
| Embedding and compatibility (`HOST`) | `embedding.md`                     | Designer (`DSGN`), renderer (`REND`), theming (`THM`), platforms (`PLAT`), packages (`PKG`)                                                |
| Kits (`KIT`)                         | `kits.md`                          | Obligations (`OBL`), switching kits (`SWAP`), custom components (`CUST`)                                                                   |

Interfaces: none proposed yet. The document format, the kit interface and the public API are candidates.

## Completeness summary

Written by the coverage script. Do not edit between the markers.

<!-- srs-summary:start -->

Not generated yet.

<!-- srs-summary:end -->

## Change log

Newest first. One line per decision: the date, what moved, and the developer's words.

- 2026-11-25: Proposed VAL-RULE-19, VAL-RULE-20 and CONF-KEY-16, and added tooltip, embedded form, slot and raw typography to Out of scope. Corrected docs/spec/06-inspector.md and docs/accessibility.md to match CONF-COND-13 and BUILD-TREE-05. "Yes, as you picked"
- 2026-11-25: Deferred BUILD-DND-21 until a test drives touch, and CAT-CHO-02, CAT-CHO-04 until the spec decides the Select and Radio group data type. "Yes, as you picked"
- 2026-11-25: Accepted BUILD-PAL-01, BUILD-PAL-02, BUILD-PAL-03, BUILD-PAL-04, BUILD-PAL-05, BUILD-PAL-06, BUILD-PAL-07, BUILD-PAL-08, BUILD-PAL-09, BUILD-PAL-10, BUILD-PAL-11, BUILD-PAL-12, BUILD-PAL-13, BUILD-SEL-01, BUILD-SEL-02, BUILD-SEL-03, BUILD-SEL-04, BUILD-SEL-05, BUILD-SEL-06, BUILD-SEL-07, BUILD-SEL-08, BUILD-SEL-09, BUILD-SEL-10, BUILD-SEL-11, BUILD-SEL-12, BUILD-SEL-13, BUILD-SEL-14, BUILD-SEL-15, BUILD-SEL-16, BUILD-SEL-17, BUILD-SEL-18, BUILD-SEL-19, BUILD-SEL-20, BUILD-SEL-21, BUILD-SEL-22, BUILD-DND-01, BUILD-DND-02, BUILD-DND-03, BUILD-DND-04, BUILD-DND-05, BUILD-DND-06, BUILD-DND-07, BUILD-DND-08, BUILD-DND-09, BUILD-DND-10, BUILD-DND-11, BUILD-DND-12, BUILD-DND-13, BUILD-DND-14, BUILD-DND-15, BUILD-DND-16, BUILD-DND-17, BUILD-DND-18, BUILD-DND-19, BUILD-DND-20, BUILD-TREE-01, BUILD-TREE-02, BUILD-TREE-03, BUILD-TREE-04, BUILD-TREE-05, BUILD-TREE-06, BUILD-TREE-07, BUILD-TREE-08, BUILD-TREE-09, BUILD-TREE-10, BUILD-TREE-11, BUILD-TREE-12, BUILD-TREE-13, BUILD-TREE-14, BUILD-TREE-15, BUILD-UNDO-01, BUILD-UNDO-02, BUILD-UNDO-03, BUILD-UNDO-04, BUILD-UNDO-05, BUILD-UNDO-06, BUILD-UNDO-07, BUILD-UNDO-08, BUILD-UNDO-09, BUILD-UNDO-10, BUILD-UNDO-11, BUILD-UNDO-12, BUILD-UNDO-13, BUILD-UNDO-14, BUILD-UNDO-15, BUILD-CANV-01, BUILD-CANV-02, BUILD-CANV-03, BUILD-CANV-04, BUILD-CANV-05, BUILD-CANV-06, BUILD-CANV-07, BUILD-CANV-08, BUILD-CANV-09, BUILD-CANV-10, BUILD-CANV-11, CONF-PROP-01, CONF-PROP-02, CONF-PROP-03, CONF-PROP-04, CONF-PROP-05, CONF-PROP-06, CONF-PROP-07, CONF-PROP-08, CONF-PROP-09, CONF-PROP-10, CONF-PROP-11, CONF-PROP-12, CONF-PROP-13, CONF-PROP-14, CONF-PROP-15, CONF-PROP-16, CONF-PROP-17, CONF-PROP-18, CONF-PROP-19, CONF-PROP-20, CONF-PROP-21, CONF-PROP-22, CONF-PROP-23, CONF-OPT-01, CONF-OPT-02, CONF-OPT-03, CONF-OPT-04, CONF-OPT-05, CONF-OPT-06, CONF-OPT-07, CONF-OPT-08, CONF-COND-01, CONF-COND-02, CONF-COND-03, CONF-COND-04, CONF-COND-05, CONF-COND-06, CONF-COND-07, CONF-COND-08, CONF-COND-09, CONF-COND-10, CONF-COND-11, CONF-COND-12, CONF-COND-13, CONF-STYLE-01, CONF-STYLE-02, CONF-STYLE-03, CONF-STYLE-04, CONF-STYLE-05, CONF-STYLE-06, CONF-STYLE-07, CONF-STYLE-08, CONF-STYLE-09, CONF-STYLE-10, CONF-STYLE-11, CONF-STYLE-12, CONF-STYLE-13, CONF-STYLE-14, CONF-STYLE-15, CONF-STYLE-16, CONF-KEY-01, CONF-KEY-02, CONF-KEY-03, CONF-KEY-04, CONF-KEY-05, CONF-KEY-06, CONF-KEY-07, CONF-KEY-08, CONF-KEY-09, CONF-KEY-10, CONF-KEY-11, CONF-KEY-12, CONF-KEY-13, CONF-KEY-14, CONF-KEY-15, CONF-RULE-01, CONF-RULE-02, CONF-RULE-03, CONF-RULE-04, CONF-RULE-05, CONF-RULE-06, CONF-RULE-07, CONF-RULE-08, CONF-RULE-09, CONF-RULE-10, CONF-RULE-11, CONF-RULE-12, CONF-RULE-13, CONF-RULE-14, CAT-LAY-01, CAT-LAY-02, CAT-LAY-03, CAT-LAY-04, CAT-LAY-05, CAT-LAY-06, CAT-LAY-07, CAT-LAY-08, CAT-LAY-09, CAT-LAY-10, CAT-LAY-11, CAT-LAY-12, CAT-LAY-13, CAT-LAY-14, CAT-LAY-15, CAT-LAY-16, CAT-LAY-17, CAT-LAY-18, CAT-DISP-01, CAT-DISP-02, CAT-DISP-03, CAT-DISP-04, CAT-DISP-05, CAT-DISP-06, CAT-DISP-07, CAT-DISP-08, CAT-DISP-09, CAT-DISP-10, CAT-DISP-11, CAT-DISP-12, CAT-DISP-13, CAT-DISP-14, CAT-DISP-15, CAT-INP-01, CAT-INP-02, CAT-INP-03, CAT-INP-04, CAT-INP-05, CAT-INP-06, CAT-INP-07, CAT-INP-08, CAT-INP-09, CAT-INP-10, CAT-INP-11, CAT-INP-12, CAT-INP-13, CAT-INP-14, CAT-INP-15, CAT-CHO-01, CAT-CHO-03, CAT-CHO-05, CAT-CHO-06, CAT-CHO-07, CAT-CHO-08, CAT-CHO-09, CAT-CHO-10, CAT-CHO-11, CAT-CHO-12, CAT-NAV-01, CAT-NAV-02, CAT-NAV-03, CAT-NAV-04, CAT-NAV-05, CAT-NAV-06, FLOW-REP-01, FLOW-REP-02, FLOW-REP-03, FLOW-REP-04, FLOW-REP-05, FLOW-REP-06, FLOW-REP-07, FLOW-REP-08, FLOW-REP-09, FLOW-REP-10, FLOW-REP-11, FLOW-REP-12, FLOW-REP-13, FLOW-REP-14, FLOW-REP-15, FLOW-REP-16, FLOW-REP-17, FLOW-REP-18, FLOW-REP-19, FLOW-REP-20, FLOW-REP-21, FLOW-REP-22, FLOW-REP-23, FLOW-REP-24, FLOW-REP-25, FLOW-REP-26, FLOW-REP-27, FLOW-REP-28, FLOW-REP-29, FLOW-REP-30, FLOW-STEP-01, FLOW-STEP-02, FLOW-STEP-03, FLOW-STEP-04, FLOW-STEP-05, FLOW-STEP-06, FLOW-STEP-07, FLOW-STEP-08, FLOW-STEP-09, FLOW-STEP-10, FLOW-STEP-11, FLOW-STEP-12, FLOW-STEP-13, FLOW-STEP-14, FLOW-STEP-15, FLOW-STEP-16, FLOW-STEP-17, FLOW-STEP-18, FLOW-STEP-19, FLOW-STEP-20, FLOW-STEP-21, FLOW-STEP-22, FLOW-STEP-23, FLOW-STEP-24, FLOW-STEP-25, LOC-LANG-01, LOC-LANG-02, LOC-LANG-03, LOC-LANG-04, LOC-LANG-05, LOC-LANG-06, LOC-LANG-07, LOC-LANG-08, LOC-LANG-09, LOC-LANG-10, LOC-LANG-11, LOC-LANG-12, LOC-LANG-13, LOC-LANG-14, LOC-LANG-15, LOC-LANG-16, LOC-LANG-17, LOC-LANG-18, LOC-LANG-19, LOC-LANG-20, LOC-LANG-21, LOC-LANG-22, LOC-TRN-01, LOC-TRN-02, LOC-TRN-03, LOC-TRN-04, LOC-TRN-05, LOC-TRN-06, LOC-TRN-07, LOC-TRN-08, LOC-TRN-09, LOC-TRN-10, LOC-TRN-11, LOC-TRN-12, LOC-TRN-13, LOC-TRN-14, LOC-TRN-15, LOC-TRN-16, LOC-TRN-17, LOC-DIR-01, LOC-DIR-02, LOC-DIR-03, LOC-DIR-04, LOC-DIR-05, LOC-DIR-06, LOC-DIR-07. LOC-TRN-09 was reworded before acceptance. "Yes, as you picked"
- 2026-11-25: Deferred DOC-LOAD-03 until a second document version exists and SEC-CODE-06 until a document states the limit. "Yes, accept those"
- 2026-11-25: Accepted FILL-ANS-01, FILL-ANS-02, FILL-ANS-03, FILL-ANS-04, FILL-ANS-05, FILL-ANS-06, FILL-ANS-07, FILL-ANS-08, FILL-ERR-01, FILL-ERR-02, FILL-ERR-03, FILL-ERR-04, FILL-ERR-05, FILL-SUB-01, FILL-SUB-02, FILL-SUB-03, FILL-SUB-04, FILL-SUB-05, FILL-SUB-06, FILL-SUB-07, FILL-SUB-08, FILL-RES-01, FILL-RES-02, FILL-RES-03, FILL-RES-04, FILL-RES-05, FILL-RES-06, FILL-RES-07, FILL-RES-08, VAL-RULE-01, VAL-RULE-02, VAL-RULE-03, VAL-RULE-04, VAL-RULE-05, VAL-RULE-06, VAL-RULE-07, VAL-RULE-08, VAL-RULE-09, VAL-RULE-10, VAL-RULE-11, VAL-RULE-12, VAL-RULE-13, VAL-RULE-14, VAL-RULE-15, VAL-RULE-16, VAL-RULE-17, VAL-RULE-18, VAL-WHEN-01, VAL-WHEN-02, VAL-WHEN-03, VAL-WHEN-04, VAL-WHEN-05, VAL-WHEN-06, VAL-WHEN-07, VAL-WHEN-08, VAL-WHEN-09, VAL-WHEN-10, VAL-WHEN-11, VAL-WHEN-12, VAL-WHEN-13, VAL-MSG-01, VAL-MSG-02, VAL-MSG-03, VAL-MSG-04, VAL-MSG-05, VAL-MSG-06, VAL-MSG-07, VAL-SRV-01, VAL-SRV-02, VAL-SRV-03, VAL-SRV-04, VAL-SRV-05, VAL-SRV-06, VAL-SRV-07, VAL-SRV-08, VAL-SRV-09, DOC-LOAD-01, DOC-LOAD-02, DOC-LOAD-04, DOC-LOAD-05, DOC-LOAD-06, DOC-LOAD-07, DOC-LOAD-08, DOC-LOAD-09, DOC-LOAD-10, DOC-LOAD-11, DOC-LOAD-12, DOC-LOAD-13, DOC-LOAD-14, DOC-LOAD-15, DOC-LOAD-16, DOC-JSON-01, DOC-JSON-02, DOC-JSON-03, DOC-JSON-04, DOC-JSON-05, DOC-JSON-06, DOC-JSON-07, DOC-JSON-08, DOC-JSON-09, DOC-JSON-10, DOC-JSON-11, DOC-JSON-12, DOC-JSON-13, DOC-SCH-01, DOC-SCH-02, DOC-SCH-03, DOC-SCH-04, DOC-SCH-05, DOC-SCH-06, DOC-SCH-07, DOC-SCH-08, DOC-SCH-09, DOC-SAVE-01, DOC-SAVE-02, DOC-SAVE-03, DOC-SAVE-04, SEC-DOCS-01, SEC-DOCS-02, SEC-DOCS-03, SEC-DOCS-04, SEC-DOCS-05, SEC-DOCS-06, SEC-DOCS-07, SEC-DOCS-08, SEC-DOCS-09, SEC-DOCS-10, SEC-DOCS-11, SEC-DOCS-12, SEC-CODE-01, SEC-CODE-02, SEC-CODE-03, SEC-CODE-04, SEC-CODE-05, SEC-DATA-01, SEC-DATA-02, SEC-DATA-03, SEC-DATA-04, SEC-DATA-05, SEC-DATA-06, SEC-DATA-07, SEC-DATA-08, SEC-LIM-01, SEC-LIM-02, SEC-LIM-03, SEC-LIM-04, SEC-LIM-05, SEC-LIM-06, SEC-LIM-07, SEC-LIM-08, SEC-LIM-09. "Yes, accept those"
- 2026-11-25: Confirmed the list of 15 areas and asked for the first four to be drafted (FILL, VAL, DOC, SEC). "Yes, draft them"
- 2026-11-25: Decided that where an SRS row and `docs/spec` disagree, the SRS row decides. "SRS wins"
- 2026-11-25: Created. Scope, Out of scope and Areas were proposals.
